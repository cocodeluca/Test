import { IDBFactory } from 'fake-indexeddb';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureDemoLocalAccount,
  finalizeLegacyAuthenticationMigration,
  findLegacyLocalAccountForEnrollment,
  loadUserPortfolio,
  loadUserPortfolioHydrationSnapshot,
  loadUserSettings,
  makeUserSettingsStorageKey,
  normalizeDemoAccountState,
  restoreDemoLocalSession,
  saveUserPortfolio,
  saveUserSettings,
  startDemoLocalSession,
} from '../src/platforms/web/services/localAccountStore';
import { emptyPortfolioData } from '../src/platforms/web/services/localAccountStore';
import { DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';
import { makeSelectedUseCaseIdStorageKey, makeUseCaseSelectionStorageKey } from '../src/common/utils/settingsStore';

const LEGACY_SESSION_STORAGE_KEY = 're-portfolio-local-session';
const USERS_STORAGE_KEY = 're-portfolio-local-users';
const LEGACY_USER_ID = 'b7bd7adb-b4cf-4ec7-a51c-438c8d32c3a7';

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

const installWindow = () => {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage } as unknown as Window & typeof globalThis,
  });
  return localStorage;
};

const seedLegacyAccount = () => {
  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify([{
    id: LEGACY_USER_ID,
    name: 'Legacy User',
    email: 'legacy@example.com',
    password: 'legacy-password',
    createdAt: '2026-01-01T00:00:00.000Z',
  }]));
  window.localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, JSON.stringify({
    userId: LEGACY_USER_ID,
    accessToken: 'legacy-fake-access',
    refreshToken: 'legacy-fake-refresh',
  }));
};

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  installWindow();
});

test('legacy account is eligible for enrollment only after explicit password re-entry', () => {
  seedLegacyAccount();
  assert.equal(findLegacyLocalAccountForEnrollment({
    email: 'legacy@example.com',
    password: 'wrong-password',
  }), null);
  assert.equal(findLegacyLocalAccountForEnrollment({
    email: 'legacy@example.com',
    password: 'legacy-password',
  })?.id, LEGACY_USER_ID);
});

test('verified server identity and hydration remove only legacy authentication secrets', async () => {
  seedLegacyAccount();
  const portfolio = { ...structuredClone(emptyPortfolioData), properties: [{ id: 'property-1' }] } as never;
  await saveUserPortfolio(LEGACY_USER_ID, portfolio);
  const hydration = await loadUserPortfolioHydrationSnapshot(LEGACY_USER_ID);

  finalizeLegacyAuthenticationMigration({
    expectedUserId: LEGACY_USER_ID,
    authenticatedUserId: LEGACY_USER_ID,
    hydration,
  });

  const accounts = window.localStorage.getItem(USERS_STORAGE_KEY) ?? '';
  assert.equal(accounts.includes('legacy-password'), false);
  assert.equal(window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY), null);
  assert.equal((await loadUserPortfolio(LEGACY_USER_ID)).properties[0].id, 'property-1');
});

test('migration verification failure preserves plaintext credential, fake session, and portfolio', async () => {
  seedLegacyAccount();
  await saveUserPortfolio(LEGACY_USER_ID, structuredClone(emptyPortfolioData));
  const hydration = await loadUserPortfolioHydrationSnapshot(LEGACY_USER_ID);

  assert.throws(() => finalizeLegacyAuthenticationMigration({
    expectedUserId: LEGACY_USER_ID,
    authenticatedUserId: '7ec308d2-b615-4ace-bc47-7acaa2cc5f14',
    hydration,
  }));
  assert.match(window.localStorage.getItem(USERS_STORAGE_KEY) ?? '', /legacy-password/);
  assert.ok(window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY));
  assert.equal((await loadUserPortfolioHydrationSnapshot(LEGACY_USER_ID)).userId, LEGACY_USER_ID);
});

test('demo session is isolated metadata without a password or fake auth tokens', async () => {
  const user = await startDemoLocalSession();
  assert.equal(restoreDemoLocalSession()?.id, user.id);
  const serializedUsers = window.localStorage.getItem(USERS_STORAGE_KEY) ?? '';
  assert.equal(serializedUsers.includes('"password"'), false);
  assert.equal(serializedUsers.includes('accessToken'), false);
  assert.equal(serializedUsers.includes('refreshToken'), false);
});

test('demo account normalization rewrites stale full-portfolio state back to properties-only', async () => {
  const { user } = await ensureDemoLocalAccount();
  const settingsKey = makeUserSettingsStorageKey(user.id);

  saveUserSettings(user, {
    ...loadUserSettings(user),
    userMode: 'advanced',
    onboardingCompleted: true,
    onboardingStep: null,
    onboarding: {
      ...loadUserSettings(user).onboarding,
      completed: true,
      basicModeSetupCompleted: true,
      trackingPreference: 'full-portfolio',
    },
    workspaceConfig: {
      ...DEFAULT_SETTINGS.workspaceConfig,
      enabledModules: ['dashboard', 'cash-accounts', 'mortgages', 'reports', 'settings'],
      sidebarOrder: ['dashboard', 'cash-accounts', 'mortgages', 'reports', 'settings'],
      hiddenModules: [],
      pinnedKpis: ['total-debt', 'total-equity'],
      secondaryKpis: ['monthly-rent'],
      kpiOrder: ['total-debt', 'total-equity', 'monthly-rent'],
      preferredDashboardCards: ['portfolio-overview', 'equity-debt'],
      preferredCards: ['portfolio-overview', 'equity-debt'],
      dashboardSections: [],
      dashboardLayout: {
        highlightedSections: [],
        quickActionModules: [],
        prioritizedAlerts: [],
      },
    },
  });

  window.localStorage.setItem(makeUseCaseSelectionStorageKey(settingsKey), 'true');
  window.localStorage.setItem(makeSelectedUseCaseIdStorageKey(settingsKey), 'full-portfolio');
  await normalizeDemoAccountState(user);

  const normalizedSettings = loadUserSettings(user);
  const normalizedPortfolio = await loadUserPortfolio(user.id);
  assert.equal(normalizedSettings.userMode, 'basic');
  assert.equal(normalizedSettings.onboarding.trackingPreference, 'properties-only');
  assert.deepEqual(normalizedSettings.workspaceConfig.enabledModules, ['dashboard', 'rent-collection', 'properties', 'settings']);
  assert.deepEqual(normalizedSettings.workspaceConfig.sidebarOrder, ['dashboard', 'rent-collection', 'properties', 'settings']);
  assert.equal(normalizedPortfolio.properties.length, 0);
  assert.equal(window.localStorage.getItem(makeSelectedUseCaseIdStorageKey(settingsKey)), null);
});
