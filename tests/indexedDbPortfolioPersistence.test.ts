import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { mockProperties } from '../src/common/data/mockData';
import { DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';
import {
  emptyPortfolioData, saveUserPortfolio, loadUserPortfolio, loadUserPortfolioHydrationSnapshot,
  importUserAccountBackup, saveUserRecoverySnapshot, loadUserRecoverySnapshot,
  type UserAccountBackup, type UserPortfolioData,
} from '../src/platforms/web/services/localAccountStore';
import { accountSnapshotTransaction } from '../src/platforms/web/services/portfolioDatabase';
import { createPortfolioPersistence, type PersistenceStatus } from '../src/platforms/web/services/portfolioPersistence';
import { loadBackupFromServer, saveBackupToServer } from '../src/platforms/web/services/accountBackupApi';
import { hydrateAccountWorkspace } from '../src/platforms/web/hooks/useAccountWorkspaceHydration';
import { createGalleryMediaRef, verifyGalleryMediaRefs } from '../src/platforms/web/services/galleryMediaStore';
import { APP_RECOVERY_MODE } from '../src/platforms/web/utils/appRecoveryMode';
import { normalizePropertyRecord } from '../src/common/utils/calculations';
import { type PortfolioPersistenceTraceEntry } from '../src/platforms/web/services/portfolioPersistenceTrace';

const user = { id: 'synthetic-a', email: 'synthetic-a@example.test', name: 'Synthetic', createdAt: '2026-01-01' };
const makePortfolio = (bytes = 100): UserPortfolioData => ({
  ...structuredClone(emptyPortfolioData), properties: [{ ...mockProperties[0], notes: 'x'.repeat(bytes) }],
});
const backup = (portfolio = makePortfolio()): UserAccountBackup => ({
  version: 1, exportedAt: '2026-01-01', user, portfolio, settings: structuredClone(DEFAULT_SETTINGS),
});
let storage: Map<string, string>;
const originalFetch = globalThis.fetch;
test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  storage = new Map();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } });
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

for (const bytes of [100, 1024 * 1024, 4 * 1024 * 1024]) {
  test(`canonical capacity ${bytes} payload bytes survives close/reopen`, async () => {
    const portfolio = makePortfolio(bytes);
    await saveUserPortfolio(user.id, portfolio);
    assert.deepEqual(await loadUserPortfolio(user.id), portfolio);
    assert.equal(storage.size, 0);
  });
}

test('account A and B remain isolated', async () => {
  const a = makePortfolio(100), b = makePortfolio(200);
  await Promise.all([saveUserPortfolio('a', a), saveUserPortfolio('b', b)]);
  assert.deepEqual(await loadUserPortfolio('a'), a);
  assert.deepEqual(await loadUserPortfolio('b'), b);
  assert.equal((await loadUserPortfolio('c')).properties.length, 0);
});

test('large legacy migrates completely and original legacy remains intact', async () => {
  const portfolio = makePortfolio(1024 * 1024);
  const raw = JSON.stringify({ version: 2, portfolio });
  storage.set('re-portfolio-user-data:' + user.id, raw);
  assert.deepEqual(await loadUserPortfolio(user.id), portfolio);
  assert.deepEqual((await accountSnapshotTransaction('portfolios', user.id))?.portfolio, portfolio);
  assert.equal(storage.get('re-portfolio-user-data:' + user.id), raw);
});

const abortWrites = () => {
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
    const result = original.apply(this, args);
    this.transaction.abort();
    return result;
  };
  return () => { IDBObjectStore.prototype.put = original; };
};

test('migration abort preserves legacy and rejects hydration', async () => {
  const raw = JSON.stringify(makePortfolio());
  storage.set('re-portfolio-user-data:' + user.id, raw);
  const restore = abortWrites();
  try { await assert.rejects(loadUserPortfolioHydrationSnapshot(user.id)); }
  finally { restore(); }
  assert.equal(storage.get('re-portfolio-user-data:' + user.id), raw);
  assert.equal(await accountSnapshotTransaction('portfolios', user.id), undefined);
  assert.deepEqual(await loadUserPortfolio(user.id), JSON.parse(raw));
});

test('aborted overwrite preserves the previously committed complete snapshot', async () => {
  const initial = makePortfolio();
  await saveUserPortfolio(user.id, initial);
  const restore = abortWrites();
  try { await assert.rejects(saveUserPortfolio(user.id, makePortfolio(200))); }
  finally { restore(); }
  assert.deepEqual(await loadUserPortfolio(user.id), initial);
});

test('rapid A/B writes preserve invocation order and capture inputs before queue execution', async () => {
  const a = makePortfolio(1024 * 1024), b = makePortfolio(200);
  const expected = structuredClone(b);
  const first = saveUserPortfolio(user.id, a);
  const second = saveUserPortfolio(user.id, b);
  b.properties[0].notes = 'mutation after save';
  await Promise.all([first, second]);
  assert.deepEqual(await loadUserPortfolio(user.id), expected);
});

test('remote large backup save/load/import/readback/hydration uses canonical IndexedDB', async () => {
  const payload = backup(makePortfolio(1024 * 1024));
  let serverPayload: UserAccountBackup | undefined;
  globalThis.fetch = async (url, init) => {
    assert.notEqual(init?.keepalive, true);
    if (String(url).endsWith('/save')) serverPayload = JSON.parse(String(init?.body)).backup;
    return new Response(JSON.stringify({ ok: true, payload: serverPayload }), { status: 200 });
  };
  await saveBackupToServer(payload);
  const loaded = await loadBackupFromServer(user.email);
  await importUserAccountBackup(user, loaded.payload);
  assert.deepEqual(await loadUserPortfolio(user.id), payload.portfolio);
  await hydrateAccountWorkspace(user);
  assert.deepEqual((await loadUserPortfolioHydrationSnapshot(user.id)).portfolio, payload.portfolio);
});

test('remote-only bootstrap imports large snapshot before publishing authoritative hydration', async () => {
  const payload = backup(makePortfolio(1024 * 1024));
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, payload }));
  await hydrateAccountWorkspace(user);
  assert.deepEqual((await loadUserPortfolioHydrationSnapshot(user.id)).portfolio, payload.portfolio);
});

test('legacy Base64 exceeding 512 KiB persists without image migration prerequisite', async () => {
  const portfolio = makePortfolio();
  portfolio.properties[0].imageUrl = 'data:image/png;base64,' + 'A'.repeat(1024 * 1024);
  portfolio.properties[0].imageUrls = [portfolio.properties[0].imageUrl];
  await saveUserPortfolio(user.id, portfolio);
  assert.deepEqual(await loadUserPortfolio(user.id), portfolio);
});

test('canonical valid data wins over different legacy and larger remote snapshots', async () => {
  const portfolio = makePortfolio();
  storage.set('re-portfolio-user-data:' + user.id, JSON.stringify(makePortfolio(200)));
  await saveUserPortfolio(user.id, portfolio);
  globalThis.fetch = async () => { throw new Error('Existing local authority must not require remote'); };
  await hydrateAccountWorkspace(user);
  assert.deepEqual(await loadUserPortfolio(user.id), portfolio);
});

test('corrupt canonical data blocks bootstrap without overwriting legacy or canonical', async () => {
  await accountSnapshotTransaction('portfolios', user.id, { broken: true });
  const raw = JSON.stringify(makePortfolio());
  storage.set('re-portfolio-user-data:' + user.id, raw);
  await assert.rejects(hydrateAccountWorkspace(user), /Corrupt/);
  assert.equal(storage.get('re-portfolio-user-data:' + user.id), raw);
  assert.deepEqual((await accountSnapshotTransaction('portfolios', user.id))?.portfolio, { broken: true });
});

test('corrupt legacy and unavailable storage block hydration', async () => {
  storage.set('re-portfolio-user-data:' + user.id, '{bad');
  await assert.rejects(hydrateAccountWorkspace(user));
  storage.clear();
  const factory = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: undefined });
  await assert.rejects(hydrateAccountWorkspace(user), /unavailable/);
  globalThis.indexedDB = factory;
  window.localStorage.getItem = () => { throw new Error('storage denied'); };
  await assert.rejects(hydrateAccountWorkspace(user), /storage denied/);
});

test('new account hydrates only after server explicitly reports no backup', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'No server backup found for this email.' }), { status: 400 });
  await hydrateAccountWorkspace(user);
  assert.equal((await loadUserPortfolioHydrationSnapshot(user.id)).storageState, 'missing');
});

test('remote outage with no local authority blocks empty bootstrap', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(hydrateAccountWorkspace(user), /offline/);
  assert.equal(await accountSnapshotTransaction('portfolios', user.id), undefined);
});

test('application flow: add Oviedo autosaves durably before a fresh bootstrap', async () => {
  const existing = makePortfolio();
  await importUserAccountBackup(user, backup(existing));

  // Bootstrap the existing account, as WebAppContent does before mounting the shell.
  await hydrateAccountWorkspace(user);
  {
    const hydrated = await loadUserPortfolioHydrationSnapshot(user.id);
    const oviedo = { ...mockProperties[0], id: 'oviedo-property', name: 'Oviedo' };
    const reactPortfolio = {
      ...hydrated.portfolio,
      properties: [...hydrated.portfolio.properties, oviedo],
    };
    const states: PersistenceStatus[] = [];
    const autosave = createPortfolioPersistence(user.id, status => states.push(status));

    // This is the normal App autosave boundary after handleAddProperty updates React state.
    const normalPersistence = autosave.save(reactPortfolio);
    assert.deepEqual(states, ['saving']);
    assert.equal(states.includes('saved'), false);
    await normalPersistence;
    assert.deepEqual(states, ['saving', 'saved']);
  } // Application state is destroyed here, before the next bootstrap.

  const indexedDbRecord = await accountSnapshotTransaction('portfolios', user.id);
  assert.equal(indexedDbRecord?.userId, user.id);
  assert.equal(
    (indexedDbRecord?.portfolio as UserPortfolioData).properties.some(property => property.name === 'Oviedo'),
    true
  );

  // A stale remote backup is not allowed to replace the committed local authority.
  let staleRemoteReadCount = 0;
  globalThis.fetch = async () => {
    staleRemoteReadCount += 1;
    return new Response(JSON.stringify({ ok: true, payload: backup(existing) }));
  };
  await hydrateAccountWorkspace(user);
  const bootstrappedAgain = await loadUserPortfolioHydrationSnapshot(user.id);
  assert.equal(bootstrappedAgain.userId, user.id);
  assert.equal(staleRemoteReadCount, 0);
  assert.equal(bootstrappedAgain.portfolio.properties.some(property => property.name === 'Oviedo'), true);
});

test('production autosave gate: Add Oviedo -> Saved -> raw IndexedDB -> fresh bootstrap retains Oviedo', async () => {
  const existing = makePortfolio();
  await importUserAccountBackup(user, backup(existing));
  globalThis.__RE_PORTFOLIO_PERSISTENCE_TRACE_ENABLED__ = true;
  globalThis.__RE_PORTFOLIO_PERSISTENCE_TRACE__ = [];
  try {
    // This is the resolved AppSafetyProvider gate after its first paint.
    const isBootSettled = true;
    const canAutoWrite = isBootSettled && !APP_RECOVERY_MODE;
    assert.equal(canAutoWrite, true, 'the production autosave gate must not silently disable writes');

    await hydrateAccountWorkspace(user);
    const hydrated = await loadUserPortfolioHydrationSnapshot(user.id);
    const oviedo = normalizePropertyRecord({ ...mockProperties[0], id: 'oviedo-production-gate', name: 'Oviedo' });
    // Same state transition as handleAddProperty: add a normalized property to React B.
    const reactB = { ...hydrated.portfolio, properties: [...hydrated.portfolio.properties, oviedo] };
    const states: PersistenceStatus[] = [];
    const persistence = createPortfolioPersistence(user.id, status => states.push(status));
    await persistence.save(reactB);
    assert.deepEqual(states, ['saving', 'saved']);

    const canonicalAfterSaved = await accountSnapshotTransaction('portfolios', user.id);
    const savedPortfolio = canonicalAfterSaved?.portfolio as UserPortfolioData;
    assert.equal(savedPortfolio.properties.some(property => property.id === oviedo.id), true);

    // All in-memory app state above is discarded. This is a new auth/hydration bootstrap.
    let staleRemoteLoadCalls = 0;
    globalThis.fetch = async () => {
      staleRemoteLoadCalls += 1;
      return new Response(JSON.stringify({ ok: true, payload: backup(existing) }));
    };
    await hydrateAccountWorkspace(user);
    const afterReload = await loadUserPortfolioHydrationSnapshot(user.id);
    assert.equal(staleRemoteLoadCalls, 0, 'an existing local B must prevent a stale remote A import');
    assert.equal(afterReload.portfolio.properties.some(property => property.id === oviedo.id), true);

    const trace = globalThis.__RE_PORTFOLIO_PERSISTENCE_TRACE__ as PortfolioPersistenceTraceEntry[];
    assert.equal(trace.some(event => event.event === 'save:input' && event.propertyCount === 2), true);
    assert.equal(trace.some(event => event.event === 'idb:write' && event.propertyCount === 2), true);
    assert.equal(trace.some(event => event.event === 'load:raw' && event.propertyCount === 2), true);
    assert.equal(trace.some(event => event.event === 'hydration:complete' && event.propertyCount === 2), true);
  } finally {
    delete globalThis.__RE_PORTFOLIO_PERSISTENCE_TRACE_ENABLED__;
    delete globalThis.__RE_PORTFOLIO_PERSISTENCE_TRACE__;
  }
});

test('failed save is observable as error; retry reaches saved only after commit', async () => {
  const states: PersistenceStatus[] = [];
  const persistence = createPortfolioPersistence(user.id, status => states.push(status));
  const portfolio = makePortfolio();
  const restore = abortWrites();
  try { await assert.rejects(persistence.save(portfolio)); }
  finally { restore(); }
  assert.deepEqual(states, ['saving', 'error']);
  assert.equal(persistence.getSavedSignature(), null);
  await persistence.save(portfolio);
  assert.deepEqual(states, ['saving', 'error', 'saving', 'saved']);
  assert.deepEqual(await loadUserPortfolio(user.id), portfolio);
});

test('earlier save completion cannot display saved for a newer pending revision', async () => {
  const states: PersistenceStatus[] = [];
  const persistence = createPortfolioPersistence(user.id, status => states.push(status));
  await Promise.all([persistence.save(makePortfolio(100)), persistence.save(makePortfolio(200))]);
  assert.deepEqual(states, ['saving', 'saving', 'saved']);
});

test('large recovery copy persists in separate IndexedDB store', async () => {
  const payload = backup(makePortfolio(1024 * 1024));
  await saveUserRecoverySnapshot(user, payload);
  assert.deepEqual(await loadUserRecoverySnapshot(user), payload);
  assert.equal(storage.size, 0);
});

test('gallery blobs survive failed canonical writes and remain usable on retry', async () => {
  const ref = await createGalleryMediaRef(new Blob(['synthetic-image']));
  const portfolio = makePortfolio(); portfolio.properties[0].imageUrls = [ref];
  const restore = abortWrites();
  try { await assert.rejects(saveUserPortfolio(user.id, portfolio)); }
  finally { restore(); }
  assert.equal(await verifyGalleryMediaRefs([ref]), true);
  await saveUserPortfolio(user.id, portfolio);
  assert.deepEqual((await loadUserPortfolio(user.id)).properties[0].imageUrls, [ref]);
});

test('migration insert cannot overwrite a canonical snapshot created concurrently', async () => {
  const canonical = makePortfolio(200);
  await accountSnapshotTransaction('portfolios', user.id, canonical);
  await accountSnapshotTransaction('portfolios', user.id, makePortfolio(100), true);
  assert.deepEqual(await loadUserPortfolio(user.id), canonical);
});

test('reverting while a write is pending persists the original state last', async () => {
  const original = makePortfolio(100);
  await saveUserPortfolio(user.id, original);
  const persistence = createPortfolioPersistence(user.id, () => undefined);
  await Promise.all([persistence.save(makePortfolio(200)), persistence.save(original)]);
  assert.deepEqual(await loadUserPortfolio(user.id), original);
});

test('backup from a different account is rejected before any write', async () => {
  const payload = backup(); payload.user = { name: 'Other', email: 'other@example.test' };
  await assert.rejects(importUserAccountBackup(user, payload), /Invalid/);
  assert.equal(await accountSnapshotTransaction('portfolios', user.id), undefined);
});

test('invalid recovery data blocks an empty bootstrap rather than silently discarding it', async () => {
  storage.set('re-portfolio-user-recovery:' + user.id, '{bad');
  await assert.rejects(hydrateAccountWorkspace(user));
  assert.equal(await accountSnapshotTransaction('portfolios', user.id), undefined);
});

test('gallery legacy migration remains readable after canonical save', async () => {
  const { migrateLegacyGalleryPayload } = await import('../src/platforms/web/services/galleryMediaStore');
  const ref = await migrateLegacyGalleryPayload('data:image/png;base64,aGVsbG8=');
  assert.equal(await verifyGalleryMediaRefs([ref]), true);
  const portfolio = makePortfolio(); portfolio.properties[0].imageUrl = ref;
  await saveUserPortfolio(user.id, portfolio);
  assert.equal((await loadUserPortfolio(user.id)).properties[0].imageUrl, ref);
});

test('serialization failure reaches the observable UI error state', async () => {
  const states: PersistenceStatus[] = [];
  const persistence = createPortfolioPersistence(user.id, status => states.push(status));
  const portfolio = makePortfolio();
  (portfolio.properties[0] as unknown as Record<string, unknown>).cycle = portfolio;
  await assert.rejects(persistence.save(portfolio));
  assert.deepEqual(states, ['saving', 'error']);
  assert.equal(await accountSnapshotTransaction('portfolios', user.id), undefined);
});

test('remote writes are serialized and retain the last invocation', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  let started = 0;
  const bodies: UserAccountBackup[] = [];
  globalThis.fetch = async (_url, init) => {
    started += 1;
    if (started === 1) await firstGate;
    bodies.push(JSON.parse(String(init?.body)).backup);
    return new Response(JSON.stringify({ ok: true }));
  };
  const first = saveBackupToServer(backup(makePortfolio(100)));
  const second = saveBackupToServer(backup(makePortfolio(200)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(bodies[1].portfolio.properties[0].notes?.length, 200);
});
