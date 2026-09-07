import { IDBFactory } from 'fake-indexeddb';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockCashAccounts, mockMortgages, mockProperties } from '../src/common/data/mockData';
import {
  getPortfolioAutosaveDecision,
  emptyPortfolioData,
  loadUserPortfolio,
  loadUserPortfolioHydrationSnapshot,
  saveUserPortfolio,
  serializeUserPortfolioForPersistence,
  type UserPortfolioData,
} from '../src/platforms/web/services/localAccountStore';

class MemoryStorage {
  private store = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const installWindow = (localStorage = new MemoryStorage()) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage } as unknown as Window & typeof globalThis,
  });
  return localStorage;
};

const makePortfolio = (overrides: Partial<UserPortfolioData> = {}): UserPortfolioData => ({
  ...structuredClone(emptyPortfolioData),
  ...overrides,
});

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  installWindow();
});

test('stored meaningful portfolio survives an empty startup candidate', async () => {
  const storage = window.localStorage as unknown as MemoryStorage;
  const userId = 'existing-user';
  const key = `re-portfolio-user-data:${userId}`;
  const storedPortfolio = makePortfolio({
    properties: mockProperties,
    mortgages: mockMortgages,
    cashAccounts: mockCashAccounts,
  });
  storage.setItem(key, JSON.stringify(storedPortfolio));
  const rawBeforeHydration = storage.getItem(key);

  const hydration = (await loadUserPortfolioHydrationSnapshot(userId));
  const emptyCandidate = makePortfolio();
  const decision = getPortfolioAutosaveDecision({
    isBootSettled: true,
    isHydrationComplete: true,
    activeUserId: userId,
    hydratedUserId: hydration.userId,
    authoritativeSignature: hydration.canonicalSignature,
    currentSignature: serializeUserPortfolioForPersistence(emptyCandidate),
    acceptedHydrationSignature: null,
    lastPersistedSignature: null,
  });

  assert.equal(decision, 'blocked');
  assert.equal(storage.getItem(key), rawBeforeHydration);
  assert.equal(hydration.storageState, 'meaningful');
  assert.equal(hydration.portfolio.properties.length, 3);
});

test('autosave remains blocked until hydration completes for the active user', async () => {
  const portfolio = makePortfolio({ properties: mockProperties });
  const signature = serializeUserPortfolioForPersistence(portfolio);
  const base = {
    isBootSettled: true,
    activeUserId: 'active-user',
    hydratedUserId: 'active-user',
    authoritativeSignature: signature,
    currentSignature: signature,
    acceptedHydrationSignature: null,
    lastPersistedSignature: null,
  };

  assert.equal(
    getPortfolioAutosaveDecision({ ...base, isHydrationComplete: false }),
    'blocked'
  );
  assert.equal(
    getPortfolioAutosaveDecision({
      ...base,
      isHydrationComplete: true,
      hydratedUserId: 'different-user',
    }),
    'blocked'
  );
});

test('hydrated baseline skips its initial write and a later property edit persists once', async () => {
  const storage = window.localStorage as unknown as MemoryStorage;
  const userId = 'edit-user';
  const portfolio = makePortfolio({
    properties: mockProperties,
    mortgages: mockMortgages,
    cashAccounts: mockCashAccounts,
  });
  await saveUserPortfolio(userId, portfolio);
  const hydration = (await loadUserPortfolioHydrationSnapshot(userId));
  const baseline = hydration.canonicalSignature;

  assert.equal(
    getPortfolioAutosaveDecision({
      isBootSettled: true,
      isHydrationComplete: true,
      activeUserId: userId,
      hydratedUserId: hydration.userId,
      authoritativeSignature: baseline,
      currentSignature: baseline,
      acceptedHydrationSignature: null,
      lastPersistedSignature: null,
    }),
    'accept-hydrated'
  );

  const writesAfterHydration = storage.writes;
  const editedPortfolio = {
    ...portfolio,
    properties: portfolio.properties.map((property) =>
      property.id === portfolio.properties[0].id
        ? { ...property, currentEstimatedValue: property.currentEstimatedValue + 10_000 }
        : property
    ),
  };
  const editedSignature = serializeUserPortfolioForPersistence(editedPortfolio);
  assert.equal(
    getPortfolioAutosaveDecision({
      isBootSettled: true,
      isHydrationComplete: true,
      activeUserId: userId,
      hydratedUserId: hydration.userId,
      authoritativeSignature: baseline,
      currentSignature: editedSignature,
      acceptedHydrationSignature: baseline,
      lastPersistedSignature: baseline,
    }),
    'persist'
  );
  await saveUserPortfolio(userId, editedPortfolio);

  const reloaded = (await loadUserPortfolio(userId));
  assert.equal(storage.writes, writesAfterHydration);
  assert.equal(reloaded.properties[0].currentEstimatedValue, editedPortfolio.properties[0].currentEstimatedValue);
  assert.deepEqual(reloaded.properties.map((property) => property.id), mockProperties.map((property) => property.id));
  assert.deepEqual(reloaded.mortgages.map((mortgage) => mortgage.id), mockMortgages.map((mortgage) => mortgage.id));
  assert.equal(new Set(reloaded.properties.map((property) => property.id)).size, reloaded.properties.length);
  assert.equal(new Set(reloaded.mortgages.map((mortgage) => mortgage.id)).size, reloaded.mortgages.length);
  assert.equal(new Set(reloaded.cashAccounts.map((account) => account.id)).size, reloaded.cashAccounts.length);
});

test('genuinely empty account accepts hydration and persists its first portfolio edit', async () => {
  const userId = 'new-empty-user';
  const emptyPortfolio = makePortfolio();
  await saveUserPortfolio(userId, emptyPortfolio);
  const hydration = (await loadUserPortfolioHydrationSnapshot(userId));
  const baseline = hydration.canonicalSignature;

  assert.equal(hydration.storageState, 'empty');
  assert.equal(
    getPortfolioAutosaveDecision({
      isBootSettled: true,
      isHydrationComplete: true,
      activeUserId: userId,
      hydratedUserId: hydration.userId,
      authoritativeSignature: baseline,
      currentSignature: baseline,
      acceptedHydrationSignature: null,
      lastPersistedSignature: null,
    }),
    'accept-hydrated'
  );

  const firstEdit = { ...emptyPortfolio, properties: [mockProperties[0]] };
  const firstEditSignature = serializeUserPortfolioForPersistence(firstEdit);
  assert.equal(
    getPortfolioAutosaveDecision({
      isBootSettled: true,
      isHydrationComplete: true,
      activeUserId: userId,
      hydratedUserId: hydration.userId,
      authoritativeSignature: baseline,
      currentSignature: firstEditSignature,
      acceptedHydrationSignature: baseline,
      lastPersistedSignature: baseline,
    }),
    'persist'
  );
  await saveUserPortfolio(userId, firstEdit);
  assert.deepEqual((await loadUserPortfolio(userId)).properties.map((property) => property.id), [mockProperties[0].id]);
});

test('version-2 wrapper is read-compatible and hydration performs no migration write', async () => {
  const storage = window.localStorage as unknown as MemoryStorage;
  const userId = 'wrapped-user';
  const key = `re-portfolio-user-data:${userId}`;
  const portfolio = makePortfolio({
    properties: mockProperties,
    mortgages: mockMortgages,
    cashAccounts: mockCashAccounts,
  });
  const wrapped = JSON.stringify({ version: 2, portfolio });
  storage.setItem(key, wrapped);
  const writesBeforeHydration = storage.writes;

  const hydration = (await loadUserPortfolioHydrationSnapshot(userId));

  assert.equal(hydration.storageState, 'meaningful');
  assert.equal(hydration.portfolio.properties.length, 3);
  assert.equal(storage.writes, writesBeforeHydration);
  assert.equal(storage.getItem(key), wrapped);
});

test('canonical persistence signature ignores object key insertion order', async () => {
  const portfolio = makePortfolio({ properties: [mockProperties[0]] });
  const reorderedProperty = Object.fromEntries(
    Object.entries(mockProperties[0]).reverse()
  ) as unknown as UserPortfolioData['properties'][number];
  const reorderedPortfolio = { ...portfolio, properties: [reorderedProperty] };

  assert.equal(
    serializeUserPortfolioForPersistence(portfolio),
    serializeUserPortfolioForPersistence(reorderedPortfolio)
  );
});
