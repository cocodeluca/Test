import { IDBFactory } from 'fake-indexeddb';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockCashAccounts, mockProperties } from '../src/common/data/mockData';
import {
  ensureLocalAccountPassword,
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
  type UserPortfolioData,
} from '../src/platforms/web/services/localAccountStore';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  setItem(key: string, value: string) {
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

const makePortfolio = (
  overrides: Partial<UserPortfolioData> = {}
): UserPortfolioData => ({
  ...structuredClone(emptyPortfolioData),
  ...overrides,
});

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  installWindow();
});

test('an edited property valuation persists in account storage and reloads without changing other fields', async () => {
  const { user } = ensureLocalAccountPassword(
    'local-property-persistence@example.com',
    'test-password',
    'Local Property Test'
  );
  const originalProperty = {
    ...mockProperties[0],
    notes: 'Keep this unrelated property note.',
  };
  const initialPortfolio = makePortfolio({ properties: [originalProperty] });
  await saveUserPortfolio(user.id, initialPortfolio);

  const newValuation = originalProperty.currentEstimatedValue + 47_500;
  const editedPortfolio: UserPortfolioData = {
    ...initialPortfolio,
    properties: initialPortfolio.properties.map((property) =>
      property.id === originalProperty.id
        ? { ...property, currentEstimatedValue: newValuation }
        : property
    ),
  };
  await saveUserPortfolio(user.id, editedPortfolio);

  const storage = window.localStorage as unknown as MemoryStorage;
  const storedPortfolio = await loadUserPortfolio(user.id);
  assert.ok(storedPortfolio);
  assert.equal(storedPortfolio.properties[0].currentEstimatedValue, newValuation);
  assert.deepEqual(storedPortfolio.properties[0], editedPortfolio.properties[0]);
  assert.equal(storedPortfolio.properties.length, 1);

  installWindow(storage);
  const reloadedPortfolio = (await loadUserPortfolio(user.id));
  assert.equal(reloadedPortfolio.properties[0].currentEstimatedValue, newValuation);
  assert.equal(reloadedPortfolio.properties[0].id, originalProperty.id);
  assert.equal(reloadedPortfolio.properties[0].monthlyRent, originalProperty.monthlyRent);
  assert.equal(reloadedPortfolio.properties[0].notes, originalProperty.notes);
  assert.deepEqual(reloadedPortfolio.properties[0], editedPortfolio.properties[0]);
  assert.equal(reloadedPortfolio.properties.length, 1);
});

test('an edited cash balance uses the same account save/load path without duplicating accounts', async () => {
  const { user } = ensureLocalAccountPassword(
    'local-cash-persistence@example.com',
    'test-password',
    'Local Cash Test'
  );
  const originalAccount = {
    ...mockCashAccounts[0],
    notes: 'Keep this unrelated cash-account note.',
  };
  const initialPortfolio = makePortfolio({ cashAccounts: [originalAccount] });
  await saveUserPortfolio(user.id, initialPortfolio);

  const newBalance = originalAccount.currentBalance + 12_345;
  const editedPortfolio: UserPortfolioData = {
    ...initialPortfolio,
    cashAccounts: initialPortfolio.cashAccounts.map((account) =>
      account.id === originalAccount.id
        ? { ...account, currentBalance: newBalance, balance: newBalance }
        : account
    ),
  };
  await saveUserPortfolio(user.id, editedPortfolio);

  const storage = window.localStorage as unknown as MemoryStorage;
  installWindow(storage);
  const reloadedPortfolio = (await loadUserPortfolio(user.id));
  assert.equal(reloadedPortfolio.cashAccounts[0].currentBalance, newBalance);
  assert.equal(reloadedPortfolio.cashAccounts[0].id, originalAccount.id);
  assert.equal(reloadedPortfolio.cashAccounts[0].notes, originalAccount.notes);
  assert.equal(reloadedPortfolio.cashAccounts.length, 1);
  assert.deepEqual(
    reloadedPortfolio.cashAccounts.map((account) => account.id),
    [originalAccount.id]
  );
});

test('gallery persistence keeps lightweight full and thumbnail references without embedding image bytes', async () => {
  const portfolio = makePortfolio({
    properties: [{
      ...mockProperties[0],
      imageUrl: 'gallery-media:full-1',
      imageUrls: ['gallery-media:full-1', 'gallery-media:full-2'],
      imageThumbnailUrls: ['gallery-media:thumb-1', 'gallery-media:thumb-2'],
      primaryImageIndex: 1,
    }],
  });
  await saveUserPortfolio('gallery-ref-persistence', portfolio);

  const stored = JSON.stringify(await loadUserPortfolio('gallery-ref-persistence'));
  assert.match(stored, /gallery-media:full-1/);
  assert.match(stored, /gallery-media:thumb-2/);
  assert.doesNotMatch(stored, /data:image\//);

  const reloaded = (await loadUserPortfolio('gallery-ref-persistence'));
  assert.deepEqual(reloaded.properties[0].imageUrls, ['gallery-media:full-1', 'gallery-media:full-2']);
  assert.deepEqual(reloaded.properties[0].imageThumbnailUrls, ['gallery-media:thumb-1', 'gallery-media:thumb-2']);
  assert.equal(reloaded.properties[0].imageUrl, 'gallery-media:full-1');
});

const makePortfolioAtSize = (targetBytes: number): UserPortfolioData => {
  const property = { ...mockProperties[0], notes: '' };
  const portfolio = makePortfolio({ properties: [property] });
  const baseSize = Buffer.byteLength(JSON.stringify(portfolio), 'utf8');
  property.notes = 'x'.repeat(targetBytes - baseSize);
  return portfolio;
};

test('a portfolio just below 512 KiB saves and loads correctly', async () => {
  const userId = 'portfolio-size-below-limit';
  const portfolio = makePortfolioAtSize(512 * 1024 - 16);

  await saveUserPortfolio(userId, portfolio);

  const storage = window.localStorage as unknown as MemoryStorage;
  assert.equal(storage.getItem(`re-portfolio-user-data:${userId}`), null);
  assert.deepEqual((await loadUserPortfolio(userId)), portfolio);
});

test('portfolio above 512 KiB persists the new complete snapshot in the canonical store', async () => {
  const userId = 'portfolio-size-limit';
  await saveUserPortfolio(userId, makePortfolio({ properties: [mockProperties[0]] }));
  const oversized = makePortfolioAtSize(1024 * 1024);
  await saveUserPortfolio(userId, oversized);
  assert.deepEqual(await loadUserPortfolio(userId), oversized);
  assert.equal(window.localStorage.getItem('re-portfolio-user-data:' + userId), null);
});
