import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureLocalAccountPassword,
  getCurrentLocalAccount,
  loginLocalAccount,
  logoutLocalAccount,
  loadUserSettings,
  normalizeDemoAccountState,
  registerLocalAccount,
  normalizeUserOnboardingState,
  saveUserSettings,
  restoreLocalSession,
  makeUserSettingsStorageKey,
  loadUserPortfolio,
  ensureDemoLocalAccount,
} from '../src/platforms/web/services/localAccountStore';
import { DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';
import { makeSelectedUseCaseIdStorageKey, makeUseCaseSelectionStorageKey } from '../src/common/utils/settingsStore';
import { defaultWorkspaceConfig } from '../src/common/utils/workspace';

const SESSION_STORAGE_KEY = 're-portfolio-local-session';
const USERS_STORAGE_KEY = 're-portfolio-local-users';

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
  const windowObject = { localStorage } as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: windowObject,
  });
  return localStorage;
};

const resetAuthState = () => {
  const storage = installWindow();
  storage.clear();
  return storage;
};

const seedAccountAndLogin = (email = 'persist@example.com', password = 'secret123') => {
  ensureLocalAccountPassword(email, password, 'Persist User');
  return loginLocalAccount({ email, password }).user;
};

test.beforeEach(() => {
  resetAuthState();
});

test('login persists after refresh and restores the same user', () => {
  const user = seedAccountAndLogin();

  const storedSession = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null');
  assert.equal(storedSession.userId, user.id);
  assert.ok(storedSession.accessToken);
  assert.ok(storedSession.refreshToken);

  const restored = restoreLocalSession();

  assert.equal(restored.user?.id, user.id);
  assert.equal(restored.debug.reason, 'session-restored');
  assert.equal(restored.debug.restored, true);
});

test('protected route state remains authenticated after reload bootstrap', () => {
  const user = seedAccountAndLogin('route@example.com', 'route-pass');

  const restored = restoreLocalSession();

  assert.equal(restored.user?.email, user.email);
  assert.equal(getCurrentLocalAccount()?.id, user.id);
});

test('expired access token with valid refresh token restores the session', () => {
  const user = seedAccountAndLogin('refresh@example.com', 'refresh-pass');
  const session = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null');
  const now = new Date('2026-04-14T12:00:00.000Z');

  session.accessTokenExpiresAt = new Date(now.getTime() - 60_000).toISOString();
  session.refreshTokenExpiresAt = new Date(now.getTime() + 60_000).toISOString();
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  const restored = restoreLocalSession(now);
  const refreshedSession = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null');

  assert.equal(restored.user?.id, user.id);
  assert.equal(restored.debug.reason, 'session-refreshed');
  assert.equal(restored.debug.refreshed, true);
  assert.notEqual(refreshedSession.accessToken, session.accessToken);
  assert.ok(new Date(refreshedSession.accessTokenExpiresAt).getTime() > now.getTime());
});

test('invalid expired session clears persistence and falls back to anonymous state', () => {
  seedAccountAndLogin('expired@example.com', 'expired-pass');
  const session = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null');
  const now = new Date('2026-04-14T12:00:00.000Z');

  session.accessTokenExpiresAt = new Date(now.getTime() - 60_000).toISOString();
  session.refreshTokenExpiresAt = new Date(now.getTime() - 30_000).toISOString();
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  const restored = restoreLocalSession(now);

  assert.equal(restored.user, null);
  assert.equal(restored.debug.reason, 'expired-session');
  assert.equal(window.localStorage.getItem(SESSION_STORAGE_KEY), null);
});

test('logout clears persisted session correctly', () => {
  seedAccountAndLogin('logout@example.com', 'logout-pass');
  assert.ok(window.localStorage.getItem(SESSION_STORAGE_KEY));

  logoutLocalAccount();

  assert.equal(window.localStorage.getItem(SESSION_STORAGE_KEY), null);
  assert.equal(getCurrentLocalAccount(), null);
});

test('legacy userId-only sessions are upgraded during restore', () => {
  const user = seedAccountAndLogin('legacy@example.com', 'legacy-pass');
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: user.id }));

  const restored = restoreLocalSession(new Date('2026-04-14T12:00:00.000Z'));
  const upgradedSession = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null');

  assert.equal(restored.user?.id, user.id);
  assert.equal(restored.debug.reason, 'session-refreshed');
  assert.ok(upgradedSession.accessToken);
  assert.ok(upgradedSession.refreshToken);
});

test('account persistence lives in localStorage for the current stack', () => {
  seedAccountAndLogin('storage@example.com', 'storage-pass');

  assert.ok(window.localStorage.getItem(USERS_STORAGE_KEY));
  assert.ok(window.localStorage.getItem(SESSION_STORAGE_KEY));
});

test('demo account normalization rewrites stale full-portfolio state back to properties-only', () => {
  const { user } = ensureDemoLocalAccount();
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

  normalizeDemoAccountState(user);

  const normalizedSettings = loadUserSettings(user);
  const normalizedPortfolio = loadUserPortfolio(user.id);

  assert.equal(normalizedSettings.userMode, 'basic');
  assert.equal(normalizedSettings.onboarding.trackingPreference, 'properties-only');
  assert.deepEqual(normalizedSettings.workspaceConfig.enabledModules, ['dashboard', 'properties', 'settings']);
  assert.deepEqual(normalizedSettings.workspaceConfig.sidebarOrder, ['dashboard', 'properties', 'settings']);
  assert.equal(normalizedPortfolio.properties.length, 0);
  assert.equal(window.localStorage.getItem(makeSelectedUseCaseIdStorageKey(settingsKey)), null);
});

test('normalizeUserOnboardingState keeps a fresh account pending when only starter sections exist', () => {
  const { user } = registerLocalAccount({
    name: 'Fresh User',
    email: 'fresh@example.com',
    password: 'fresh-pass',
  });
  const freshPortfolio = loadUserPortfolio(user.id);
  const freshSettings = loadUserSettings(user);

  const normalized = normalizeUserOnboardingState(user, freshPortfolio, freshSettings);

  assert.equal(normalized.onboardingCompleted, false);
  assert.equal(normalized.onboarding.completed, false);
  assert.equal(normalized.onboardingStep, 'welcome');
});

test('normalizeUserOnboardingState treats genuinely customized workspace sections as initialized', () => {
  const user = {
    id: 'custom-user',
    name: 'Custom User',
    email: 'custom@example.com',
  };
  const freshPortfolio = loadUserPortfolio(user.id);
  const customizedSettings = saveUserSettings(user, {
    ...loadUserSettings(user),
    workspaceConfig: {
      ...defaultWorkspaceConfig,
      dashboardSections: [
        ...defaultWorkspaceConfig.dashboardSections,
        {
          id: 'custom-section',
          title: 'Custom',
          cards: ['portfolio-overview'],
        },
      ],
    },
  });

  const normalized = normalizeUserOnboardingState(user, freshPortfolio, customizedSettings);

  assert.equal(normalized.onboardingCompleted, true);
  assert.equal(normalized.onboarding.completed, true);
  assert.equal(normalized.onboardingStep, null);
});

test('normalizeUserOnboardingState preserves an already completed onboarding state', () => {
  const user = {
    id: 'completed-user',
    name: 'Completed User',
    email: 'completed@example.com',
  };
  const freshPortfolio = loadUserPortfolio(user.id);
  const completedSettings = saveUserSettings(user, {
    ...loadUserSettings(user),
    onboardingCompleted: true,
    onboardingStep: null,
    onboarding: {
      ...loadUserSettings(user).onboarding,
      completed: true,
      basicModeSetupCompleted: true,
    },
  });

  const normalized = normalizeUserOnboardingState(user, freshPortfolio, completedSettings);

  assert.equal(normalized.onboardingCompleted, true);
  assert.equal(normalized.onboarding.completed, true);
  assert.equal(normalized.onboardingStep, null);
  assert.equal(normalized.onboarding.basicModeSetupCompleted, true);
});
