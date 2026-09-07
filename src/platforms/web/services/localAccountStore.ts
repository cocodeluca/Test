import { accountSnapshotTransaction, serializeAccountOperation } from './portfolioDatabase';
import { AppSettings } from '../../../common/types/settings';
import {
  BankConnection,
  CashAccount,
  InvestmentAccount,
  Mortgage,
  Opportunity,
  Property,
  RehabProject,
  InvestmentReport,
  InvestmentReportTemplate,
  ReportBrandingConfig,
} from '../../../common/types';
import { DEFAULT_SETTINGS } from '../../../common/utils/settingsStore';
import { defaultReportBranding, defaultReportTemplates } from '../../../common/utils/reports';
import { normalizeTrackingPreference } from '../../../common/utils/appModes';
import { createDemoPropertiesOnlyWorkspaceConfig } from '../../../common/utils/workspace';
import { setStoredSelectedUseCaseId, setStoredUseCaseSelection } from '../../../common/utils/settingsStore';
import { normalizeBankConnection, normalizeCashAccount } from '../../../common/utils/cashAccounts';
import {
  mockCashAccounts,
  mockInvestmentAccounts,
  mockMortgages,
  mockProperties,
} from '../../../common/data/mockData';
import { commitGalleryMediaRefs, isGalleryMediaRef } from './galleryMediaStore';
import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from './portfolioPersistenceTrace';

const LOCAL_USERS_STORAGE_KEY = 're-portfolio-local-users';
const LOCAL_SESSION_STORAGE_KEY = 're-portfolio-local-session';
const USER_PORTFOLIO_STORAGE_KEY_PREFIX = 're-portfolio-user-data';
const USER_RECOVERY_SNAPSHOT_KEY_PREFIX = 're-portfolio-user-recovery';
const LEGACY_CASH_ACCOUNTS_STORAGE_KEY = 're-portfolio-cash-accounts';
const LEGACY_INVESTMENT_ACCOUNTS_STORAGE_KEY = 're-portfolio-investment-accounts';
const LEGACY_SETTINGS_STORAGE_KEY = 're-portfolio-settings';
const LEGACY_RECOVERY_MARKER_KEY = 're-portfolio-legacy-recovered';
const RECOVERY_SNAPSHOT_LOG_PREFIX = '[recovery-snapshot]';
const BOOTSTRAP_STORAGE_LOG_PREFIX = '[bootstrap-storage]';
const MAX_RECOVERY_SNAPSHOT_BYTES = 512 * 1024;

interface StoredAccountRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: string;
}

interface StoredSessionRecord {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  createdAt: string;
  refreshedAt: string;
}

export interface LocalSessionDebugInfo {
  sessionExists: boolean;
  accessTokenExists: boolean;
  accessTokenExpired: boolean;
  refreshTokenExists: boolean;
  refreshTokenExpired: boolean;
  restored: boolean;
  refreshed: boolean;
  reason:
    | 'session-restored'
    | 'session-refreshed'
    | 'missing-session'
    | 'missing-user'
    | 'missing-access-token'
    | 'expired-session'
    | 'window-unavailable';
}

export interface LocalSessionRestoreResult {
  user: LocalAccountUser | null;
  debug: LocalSessionDebugInfo;
}

const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const AUTH_DEBUG_PREFIX = '[auth]';

export interface LocalAccountUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface UserPortfolioData {
  properties: Property[];
  mortgages: Mortgage[];
  cashAccounts: CashAccount[];
  bankConnections: BankConnection[];
  investmentAccounts: InvestmentAccount[];
  opportunities: Opportunity[];
  rehabProjects: RehabProject[];
  reports: InvestmentReport[];
  reportTemplates: InvestmentReportTemplate[];
  reportBranding: ReportBrandingConfig;
}

export type UserPortfolioStorageState = 'missing' | 'empty' | 'meaningful' | 'invalid';

export interface UserPortfolioHydrationSnapshot {
  userId: string;
  portfolio: UserPortfolioData;
  storageState: UserPortfolioStorageState;
  storageExists: boolean;
  hasMeaningfulData: boolean;
  canonicalSignature: string;
}

export type PortfolioAutosaveDecision =
  | 'blocked'
  | 'accept-hydrated'
  | 'unchanged'
  | 'persist';

export interface AccountCredentials {
  email: string;
  password: string;
}

export interface AccountRegistration extends AccountCredentials {
  name: string;
  userMode?: AppSettings['userMode'];
  dashboardSetupMode?: AppSettings['dashboardSetupMode'];
  onboardingCompleted?: AppSettings['onboardingCompleted'];
  onboarding?: AppSettings['onboarding'];
  workspaceConfig?: AppSettings['workspaceConfig'];
}

export interface UserAccountBackup {
  version: 1;
  exportedAt: string;
  user: {
    name: string;
    email: string;
  };
  portfolio: UserPortfolioData;
  settings: AppSettings;
}

const mergeUserSettings = (
  user: Pick<LocalAccountUser, 'id' | 'name' | 'email'>,
  storedSettings?: Partial<AppSettings> | null
): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...storedSettings,
  onboardingCompleted:
    storedSettings?.onboardingCompleted ?? storedSettings?.onboarding?.completed ?? false,
  onboardingStep:
    storedSettings?.onboardingStep ??
    ((storedSettings?.onboardingCompleted ?? storedSettings?.onboarding?.completed ?? false)
      ? null
      : DEFAULT_SETTINGS.onboardingStep),
  profile: {
    ...DEFAULT_SETTINGS.profile,
    ...storedSettings?.profile,
    name: user.name,
    email: user.email,
  },
  taxProfile: {
    ...DEFAULT_SETTINGS.taxProfile,
    ...storedSettings?.taxProfile,
  },
  onboarding: {
    ...DEFAULT_SETTINGS.onboarding,
    ...storedSettings?.onboarding,
    trackingPreference: normalizeTrackingPreference(storedSettings?.onboarding?.trackingPreference),
  },
  workspaceConfig: {
    ...DEFAULT_SETTINGS.workspaceConfig,
    ...storedSettings?.workspaceConfig,
  },
});

export const emptyPortfolioData: UserPortfolioData = {
  properties: [],
  mortgages: [],
  cashAccounts: [],
  bankConnections: [],
  investmentAccounts: [],
  opportunities: [],
  rehabProjects: [],
  reports: [],
  reportTemplates: defaultReportTemplates,
  reportBranding: defaultReportBranding,
};

const toPersistedUserPortfolio = (data: UserPortfolioData): UserPortfolioData => ({
  properties: data.properties,
  mortgages: data.mortgages,
  cashAccounts: data.cashAccounts,
  bankConnections: data.bankConnections,
  investmentAccounts: data.investmentAccounts,
  opportunities: data.opportunities,
  rehabProjects: data.rehabProjects,
  reports: data.reports,
  reportTemplates: data.reportTemplates,
  reportBranding: data.reportBranding,
});

const canonicalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalizeJsonValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
};

export const serializeUserPortfolioForPersistence = (data: UserPortfolioData): string =>
  JSON.stringify(canonicalizeJsonValue(toPersistedUserPortfolio(data)));

const toPublicUser = (account: StoredAccountRecord): LocalAccountUser => ({
  id: account.id,
  name: account.name,
  email: account.email,
  createdAt: account.createdAt,
});

const makeUserPortfolioStorageKey = (userId: string) =>
  `${USER_PORTFOLIO_STORAGE_KEY_PREFIX}:${userId}`;

const makeUserRecoverySnapshotKey = (userId: string) =>
  `${USER_RECOVERY_SNAPSHOT_KEY_PREFIX}:${userId}`;

export const makeUserSettingsStorageKey = (userId: string) =>
  `re-portfolio-settings:${userId}`;

const readJson = <T,>(key: string, fallbackValue: T): T => {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return fallbackValue;
    }

    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.warn(`${BOOTSTRAP_STORAGE_LOG_PREFIX} JSON read failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackValue;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const serialized = safeJsonStringify(value);
    if (!serialized) {
      return;
    }
    window.localStorage.setItem(key, serialized);
  } catch (error) {
    console.warn(`${BOOTSTRAP_STORAGE_LOG_PREFIX} JSON write failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const safeJsonParse = <T,>(value: string | null | undefined, fallbackValue: T): T => {
  if (typeof value !== 'string' || value.length === 0) {
    return fallbackValue;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} JSON parse failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackValue;
  }
};

export const safeJsonStringify = (value: unknown): string | null => {
  try {
    const serialized = JSON.stringify(value);

    if (typeof serialized !== 'string') {
      return null;
    }

    if (new Blob([serialized]).size > MAX_RECOVERY_SNAPSHOT_BYTES) {
      console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} snapshot too large, skipping write`);
      return null;
    }

    return serialized;
  } catch (error) {
    console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} JSON stringify failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const safeLocalStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} localStorage get failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} localStorage set failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const readStoredAccounts = (): StoredAccountRecord[] =>
  readJson<StoredAccountRecord[]>(LOCAL_USERS_STORAGE_KEY, []);

const writeStoredAccounts = (accounts: StoredAccountRecord[]) => {
  writeJson(LOCAL_USERS_STORAGE_KEY, accounts);
};

const createStoredSession = (userId: string, now = new Date()): StoredSessionRecord => ({
  userId,
  accessToken: `access-${userId}-${now.getTime()}`,
  accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS).toISOString(),
  refreshToken: `refresh-${userId}-${now.getTime()}`,
  refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString(),
  createdAt: now.toISOString(),
  refreshedAt: now.toISOString(),
});

const debugAuth = (message: string, details?: unknown) => {
  if (typeof console === 'undefined') {
    return;
  }

  if (details) {
    console.info(`${AUTH_DEBUG_PREFIX} ${message}`, details);
    return;
  }

  console.info(`${AUTH_DEBUG_PREFIX} ${message}`);
};

const isIsoTimestampExpired = (value: string | null | undefined, now = new Date()): boolean => {
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || timestamp <= now.getTime();
};

const writeStoredSessionRecord = (session: StoredSessionRecord | null) => {
  if (session) {
    writeJson(LOCAL_SESSION_STORAGE_KEY, session);
    return;
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    } catch (error) {
      console.warn(`${BOOTSTRAP_STORAGE_LOG_PREFIX} localStorage remove failed`, {
        key: LOCAL_SESSION_STORAGE_KEY,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

const writeStoredSession = (userId: string | null, now = new Date()) => {
  writeStoredSessionRecord(userId ? createStoredSession(userId, now) : null);
};

const readStoredSession = (): StoredSessionRecord | null =>
  readJson<StoredSessionRecord | null>(LOCAL_SESSION_STORAGE_KEY, null);

const refreshStoredSession = (
  session: StoredSessionRecord,
  now = new Date()
): StoredSessionRecord => ({
  ...session,
  accessToken: `access-${session.userId}-${now.getTime()}`,
  accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS).toISOString(),
  refreshedAt: now.toISOString(),
});

const makeUserId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `user-${Date.now()}`;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export const DEMO_ACCOUNT_EMAIL = 'admin';
const DEMO_ACCOUNT_PASSWORD = 'admin';
const DEMO_ACCOUNT_NAME = 'Demo Account';
const DEMO_TRACKING_PREFERENCE: AppSettings['onboarding']['trackingPreference'] = 'properties-only';

const isDemoLocalAccount = (user: Pick<LocalAccountUser, 'email'>): boolean =>
  normalizeEmail(user.email) === DEMO_ACCOUNT_EMAIL;

const getDemoSettingsStorageKey = (userId: string) => makeUserSettingsStorageKey(userId);

const clearDemoAccountSelectionState = (user: Pick<LocalAccountUser, 'id'>) => {
  if (typeof window === 'undefined') {
    return;
  }

  const settingsStorageKey = getDemoSettingsStorageKey(user.id);
  setStoredUseCaseSelection(settingsStorageKey, false);
  setStoredSelectedUseCaseId(settingsStorageKey, null);
};

export const normalizeDemoAccountState = async (
  user: LocalAccountUser,
  portfolio: UserPortfolioData | null = null
): Promise<{ normalized: boolean }> => {
  if (!isDemoLocalAccount(user)) {
    return { normalized: false };
  }

  const currentSettings = loadUserSettings(user);

  if (portfolio) await saveUserPortfolio(user.id, portfolio);
  saveUserSettings(user, {
    ...currentSettings,
    userMode: 'basic',
    onboardingCompleted: true,
    onboardingStep: null,
    onboarding: {
      ...currentSettings.onboarding,
      completed: true,
      basicModeSetupCompleted: true,
      trackingPreference: DEMO_TRACKING_PREFERENCE,
    },
    workspaceConfig: createDemoPropertiesOnlyWorkspaceConfig(user.id),
    profile: {
      ...currentSettings.profile,
      name: user.name,
      email: user.email,
      role: '',
      notes: '',
    },
  });

  clearDemoAccountSelectionState(user);
  return { normalized: true };
};

const isPortfolioEmpty = (data: UserPortfolioData): boolean =>
  data.properties.length === 0 &&
  data.mortgages.length === 0 &&
  data.cashAccounts.length === 0 &&
  data.bankConnections.length === 0 &&
  data.investmentAccounts.length === 0 &&
  data.opportunities.length === 0 &&
  data.rehabProjects.length === 0 &&
  data.reports.length === 0;

export const hasMeaningfulPortfolioData = (data: UserPortfolioData): boolean => !isPortfolioEmpty(data);

const hasMeaningfulWorkspaceConfig = (settings: AppSettings): boolean => {
  const currentWorkspace = settings.workspaceConfig;
  const defaultWorkspace = DEFAULT_SETTINGS.workspaceConfig;

  return Boolean(
    currentWorkspace.userId ||
      currentWorkspace.primaryStrategy !== defaultWorkspace.primaryStrategy ||
      currentWorkspace.secondaryStrategies.length > 0 ||
      currentWorkspace.detectedProfile !== defaultWorkspace.detectedProfile ||
      currentWorkspace.detectedProfileConfidence !== defaultWorkspace.detectedProfileConfidence ||
      currentWorkspace.enabledModules.join('|') !== defaultWorkspace.enabledModules.join('|') ||
      currentWorkspace.sidebarOrder.join('|') !== defaultWorkspace.sidebarOrder.join('|') ||
      currentWorkspace.hiddenModules.join('|') !== defaultWorkspace.hiddenModules.join('|') ||
      currentWorkspace.defaultLandingModule !== defaultWorkspace.defaultLandingModule ||
      currentWorkspace.pinnedKpis.join('|') !== defaultWorkspace.pinnedKpis.join('|') ||
      currentWorkspace.secondaryKpis.join('|') !== defaultWorkspace.secondaryKpis.join('|') ||
      currentWorkspace.kpiOrder.join('|') !== defaultWorkspace.kpiOrder.join('|') ||
      currentWorkspace.preferredDashboardCards.join('|') !==
        defaultWorkspace.preferredDashboardCards.join('|') ||
      currentWorkspace.preferredCards.join('|') !== defaultWorkspace.preferredCards.join('|') ||
      currentWorkspace.dashboardSections.length > 0 ||
      currentWorkspace.dashboardLayout.highlightedSections.length > 0 ||
      currentWorkspace.dashboardLayout.quickActionModules.length > 0 ||
      currentWorkspace.dashboardLayout.prioritizedAlerts.length > 0 ||
      currentWorkspace.budgetCategories.length > 0 ||
      currentWorkspace.customCategories.length > 0 ||
      currentWorkspace.suggestedBudgetCategories.length > 0 ||
      currentWorkspace.customFields.length > 0 ||
      currentWorkspace.suggestedCustomFields.length > 0 ||
      currentWorkspace.recommendedReportTemplates.join('|') !==
        defaultWorkspace.recommendedReportTemplates.join('|') ||
      currentWorkspace.recommendedTemplates.join('|') !==
        defaultWorkspace.recommendedTemplates.join('|') ||
      currentWorkspace.defaultReportTemplate !== defaultWorkspace.defaultReportTemplate ||
      currentWorkspace.recommendedAnalysisType !== defaultWorkspace.recommendedAnalysisType ||
      currentWorkspace.detectedMissingFields.length > 0 ||
      currentWorkspace.missingDataFlags.length > 0 ||
      currentWorkspace.uploadedFileReferences.length > 0 ||
      currentWorkspace.extractedEntitiesSummary.length > 0 ||
      currentWorkspace.aiRecommendationSummary !== defaultWorkspace.aiRecommendationSummary ||
      currentWorkspace.syncStatus !== defaultWorkspace.syncStatus ||
      currentWorkspace.confidenceScore !== defaultWorkspace.confidenceScore ||
      Object.values(currentWorkspace.userOverrides).some(Boolean) ||
      currentWorkspace.lastAiRecommendation !== null
  );
};

const hasMeaningfulOnboardingState = (settings: AppSettings): boolean =>
  Boolean(
    settings.onboarding.completed ||
      settings.onboarding.basicModeSetupCompleted ||
      settings.onboarding.strategies.length > 0 ||
      settings.onboarding.goals.length > 0 ||
      settings.onboarding.detectedProfiles.length > 0 ||
      settings.onboarding.uploadedFiles.length > 0 ||
      settings.onboarding.ingestionConflicts?.length ||
      settings.onboarding.trackingPreference !== DEFAULT_SETTINGS.onboarding.trackingPreference ||
      (settings.onboardingStep && settings.onboardingStep !== 'welcome')
  );

const hasMeaningfulSettings = (settings: AppSettings, user: Pick<LocalAccountUser, 'name' | 'email'>): boolean =>
  Boolean(
    settings.onboardingCompleted ??
      settings.onboarding.completed ??
      false
  ) ||
  hasMeaningfulOnboardingState(settings) ||
  hasMeaningfulWorkspaceConfig(settings) ||
  settings.userMode !== DEFAULT_SETTINGS.userMode ||
  settings.dashboardSetupMode !== DEFAULT_SETTINGS.dashboardSetupMode ||
  settings.currency !== DEFAULT_SETTINGS.currency ||
  settings.language !== DEFAULT_SETTINGS.language ||
  settings.theme !== DEFAULT_SETTINGS.theme ||
  settings.dateFormat !== DEFAULT_SETTINGS.dateFormat ||
  settings.numberFormat !== DEFAULT_SETTINGS.numberFormat ||
  settings.density !== DEFAULT_SETTINGS.density ||
  settings.defaultDashboardView !== DEFAULT_SETTINGS.defaultDashboardView ||
  settings.taxProfile.taxResidencyCountry !== DEFAULT_SETTINGS.taxProfile.taxResidencyCountry ||
  settings.taxProfile.annualEmploymentIncome !== DEFAULT_SETTINGS.taxProfile.annualEmploymentIncome ||
  settings.taxProfile.annualOtherIncome !== DEFAULT_SETTINGS.taxProfile.annualOtherIncome ||
  settings.taxProfile.estimatedMarginalTaxRate !== DEFAULT_SETTINGS.taxProfile.estimatedMarginalTaxRate ||
  settings.profile.name !== user.name ||
  settings.profile.email !== user.email ||
  settings.profile.role !== DEFAULT_SETTINGS.profile.role ||
  settings.profile.notes !== DEFAULT_SETTINGS.profile.notes;

const isBackupUsableForUser = (
  backup: UserAccountBackup | null,
  user: Pick<LocalAccountUser, 'name' | 'email'>
): backup is UserAccountBackup =>
  Boolean(
    backup &&
      backup.version === 1 &&
      backup.user && typeof backup.user.email === 'string' &&
      normalizeEmail(backup.user.email) === normalizeEmail(user.email) &&
      backup.settings &&
      backup.portfolio
  );

export const getCurrentLocalAccount = (): LocalAccountUser | null => {
  return restoreLocalSession().user;
};

export const getLocalSessionDebugInfo = (
  now = new Date()
): Omit<LocalSessionDebugInfo, 'restored' | 'refreshed' | 'reason'> => {
  if (typeof window === 'undefined') {
    return {
      sessionExists: false,
      accessTokenExists: false,
      accessTokenExpired: true,
      refreshTokenExists: false,
      refreshTokenExpired: true,
    };
  }

  const session = readStoredSession();

  return {
    sessionExists: Boolean(session),
    accessTokenExists: Boolean(session?.accessToken),
    accessTokenExpired: isIsoTimestampExpired(session?.accessTokenExpiresAt, now),
    refreshTokenExists: Boolean(session?.refreshToken),
    refreshTokenExpired: isIsoTimestampExpired(session?.refreshTokenExpiresAt, now),
  };
};

export const restoreLocalSession = (now = new Date()): LocalSessionRestoreResult => {
  if (typeof window === 'undefined') {
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: false,
      refreshed: false,
      reason: 'window-unavailable',
    };
    return { user: null, debug };
  }

  const session = readStoredSession();

  if (!session?.userId) {
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: false,
      refreshed: false,
      reason: 'missing-session',
    };
    debugAuth('No persisted session found during app bootstrap.', debug);
    return { user: null, debug };
  }

  const account = readStoredAccounts().find((candidate) => candidate.id === session.userId);

  if (!account) {
    writeStoredSessionRecord(null);
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: false,
      refreshed: false,
      reason: 'missing-user',
    };
    debugAuth('Stored session user no longer exists. Clearing session.', debug);
    return { user: null, debug };
  }

  if (!session.accessToken || !session.refreshToken) {
    const migratedSession = createStoredSession(session.userId, now);
    writeStoredSessionRecord(migratedSession);
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: true,
      refreshed: true,
      reason: 'session-refreshed',
    };
    debugAuth('Legacy session record upgraded during restore.', debug);
    return { user: toPublicUser(account), debug };
  }

  const accessExpired = isIsoTimestampExpired(session.accessTokenExpiresAt, now);
  const refreshExpired = isIsoTimestampExpired(session.refreshTokenExpiresAt, now);

  if (!accessExpired) {
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: true,
      refreshed: false,
      reason: 'session-restored',
    };
    debugAuth('Persisted session restored from localStorage.', debug);
    return { user: toPublicUser(account), debug };
  }

  if (!refreshExpired && session.refreshToken) {
    const refreshedSession = refreshStoredSession(session, now);
    writeStoredSessionRecord(refreshedSession);
    const debug: LocalSessionDebugInfo = {
      ...getLocalSessionDebugInfo(now),
      restored: true,
      refreshed: true,
      reason: 'session-refreshed',
    };
    debugAuth('Access token expired. Session restored via refresh token.', debug);
    return { user: toPublicUser(account), debug };
  }

  writeStoredSessionRecord(null);
  const debug: LocalSessionDebugInfo = {
    ...getLocalSessionDebugInfo(now),
    restored: false,
    refreshed: false,
    reason: 'expired-session',
  };
  debugAuth('Persisted session expired and could not be refreshed. Redirecting to login.', debug);
  return { user: null, debug };
};

export const ensureLocalAccountPassword = (
  emailAddress: string,
  password: string,
  fallbackName = 'Coco Deluca'
): { user: LocalAccountUser } => {
  const email = normalizeEmail(emailAddress);
  const accounts = readStoredAccounts();
  const existingAccount = accounts.find((account) => account.email === email);

  if (existingAccount) {
    const updatedAccount: StoredAccountRecord = {
      ...existingAccount,
      password,
    };

    writeStoredAccounts(
      accounts.map((account) => (account.id === existingAccount.id ? updatedAccount : account))
    );

    return { user: toPublicUser(updatedAccount) };
  }

  const newAccount: StoredAccountRecord = {
    id: makeUserId(),
    name: fallbackName,
    email,
    password,
    createdAt: new Date().toISOString(),
  };

  writeStoredAccounts([...accounts, newAccount]);
  saveUserSettings(
    { id: newAccount.id, name: fallbackName, email },
    {
      profile: {
        ...DEFAULT_SETTINGS.profile,
        name: fallbackName,
        email,
      },
    }
  );

  return { user: toPublicUser(newAccount) };
};

export const registerLocalAccount = (
  payload: AccountRegistration
): { user: LocalAccountUser } => {
  const email = normalizeEmail(payload.email);
  const name = payload.name.trim();
  const password = payload.password;
  const userMode = payload.userMode ?? DEFAULT_SETTINGS.userMode;
  const dashboardSetupMode = payload.dashboardSetupMode ?? DEFAULT_SETTINGS.dashboardSetupMode;
  const onboardingCompleted =
    payload.onboardingCompleted ?? payload.onboarding?.completed ?? DEFAULT_SETTINGS.onboardingCompleted;
  const onboarding = payload.onboarding ?? DEFAULT_SETTINGS.onboarding;
  const workspaceConfig = payload.workspaceConfig ?? DEFAULT_SETTINGS.workspaceConfig;

  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required.');
  }

  const accounts = readStoredAccounts();
  const existingAccount = accounts.find((account) => account.email === email);

  if (existingAccount) {
    throw new Error('An account with this email already exists.');
  }

  const account: StoredAccountRecord = {
    id: makeUserId(),
    name,
    email,
    password,
    createdAt: new Date().toISOString(),
  };

  writeStoredAccounts([...accounts, account]);
  saveUserSettings(
    { id: account.id, name, email },
    {
      userMode,
      onboardingCompleted,
      onboardingStep: onboardingCompleted ? null : 'welcome',
      dashboardSetupMode,
      onboarding,
      workspaceConfig: {
        ...workspaceConfig,
        userId: account.id,
        updatedAt: new Date().toISOString(),
        createdAt: workspaceConfig.createdAt || new Date().toISOString(),
      },
      profile: {
        ...DEFAULT_SETTINGS.profile,
        name,
        email,
      },
    }
  );
  writeStoredSession(account.id);
  debugAuth('Registered local account and persisted session.', {
    userId: account.id,
    email,
    session: getLocalSessionDebugInfo(),
  });

  return { user: toPublicUser(account) };
};

export const loginLocalAccount = (
  credentials: AccountCredentials
): { user: LocalAccountUser } => {
  const email = normalizeEmail(credentials.email);
  const password = credentials.password;

  const account = readStoredAccounts().find(
    (candidate) => candidate.email === email && candidate.password === password
  );

  if (!account) {
    throw new Error('Incorrect email or password.');
  }

  writeStoredSession(account.id);
  debugAuth('Login succeeded and session was persisted.', {
    userId: account.id,
    email,
    session: getLocalSessionDebugInfo(),
  });
  return { user: toPublicUser(account) };
};

export const logoutLocalAccount = () => {
  writeStoredSession(null);
  debugAuth('Logout cleared persisted session.', {
    session: getLocalSessionDebugInfo(),
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasRecognizedPortfolioShape = (value: unknown): value is Partial<UserPortfolioData> =>
  isRecord(value) &&
  ['properties', 'mortgages', 'cashAccounts', 'bankConnections', 'investmentAccounts', 'opportunities', 'rehabProjects', 'reports', 'reportTemplates'].every(key => value[key] === undefined || (Array.isArray(value[key]) && (value[key] as unknown[]).every(isRecord))) &&
  ['properties', 'mortgages', 'cashAccounts', 'investmentAccounts'].some((key) =>
    Array.isArray(value[key])
  );

const unwrapStoredPortfolio = (value: unknown): Partial<UserPortfolioData> | null => {
  if (hasRecognizedPortfolioShape(value)) {
    return value;
  }

  if (
    isRecord(value) &&
    value.version === 2 &&
    hasRecognizedPortfolioShape(value.portfolio)
  ) {
    return value.portfolio;
  }

  return null;
};

const normalizeLoadedPortfolio = (
  storedValue: Partial<UserPortfolioData> = emptyPortfolioData
): UserPortfolioData => ({
    properties: storedValue.properties ?? [],
    mortgages: storedValue.mortgages ?? [],
    cashAccounts: (storedValue.cashAccounts ?? []).map((account) => normalizeCashAccount(account)),
    bankConnections: (storedValue.bankConnections ?? []).map((connection) => normalizeBankConnection(connection)),
    investmentAccounts: storedValue.investmentAccounts ?? [],
    opportunities: storedValue.opportunities ?? [],
    rehabProjects: storedValue.rehabProjects ?? [],
    reports: storedValue.reports ?? [],
    reportTemplates: storedValue.reportTemplates ?? defaultReportTemplates,
    reportBranding: storedValue.reportBranding ?? defaultReportBranding,
  });

const readUserPortfolioStorage = async (userId: string): Promise<{ portfolio: UserPortfolioData; storageState: UserPortfolioStorageState }> => {
  const record = await accountSnapshotTransaction('portfolios', userId);
  let stored: Partial<UserPortfolioData> | null;
  if (record !== undefined) {
    if (record.userId !== userId || record.schemaVersion !== 1) throw new Error('Invalid account snapshot');
    stored = unwrapStoredPortfolio(record.portfolio);
    if (!stored) throw new Error('Corrupt IndexedDB portfolio; recovery required');
  } else {
    // Do not turn storage access or parsing failures into an empty account.
    const raw = window.localStorage.getItem(makeUserPortfolioStorageKey(userId));
    if (raw === null) {
      const portfolio = normalizeLoadedPortfolio();
      tracePortfolioPersistence('load:raw', getPortfolioSnapshotTraceMetadata(userId, portfolio, {
        accountId: userId,
        indexedDbKey: userId,
      }));
      return { portfolio, storageState: 'missing' };
    }
    stored = unwrapStoredPortfolio(JSON.parse(raw));
    if (!stored) throw new Error('Corrupt legacy portfolio; recovery required');
    const portfolio = normalizeLoadedPortfolio(stored);
    const migrated = await accountSnapshotTransaction('portfolios', userId, portfolio, true);
    if (migrated?.portfolio !== portfolio) {
      const authoritative = unwrapStoredPortfolio(migrated?.portfolio);
      if (!authoritative) throw new Error('Invalid concurrent account snapshot');
      const resolved = normalizeLoadedPortfolio(authoritative);
      tracePortfolioPersistence('load:raw', getPortfolioSnapshotTraceMetadata(userId, resolved, {
        accountId: userId,
        indexedDbKey: userId,
        snapshotUpdatedAt: migrated?.updatedAt,
        snapshotVersion: migrated?.schemaVersion,
      }));
      return { portfolio: resolved, storageState: hasMeaningfulPortfolioData(resolved) ? 'meaningful' : 'empty' };
    }
    // Legacy is retained unchanged; transaction completion confirms migration.
    tracePortfolioPersistence('load:raw', getPortfolioSnapshotTraceMetadata(userId, portfolio, {
      accountId: userId,
      indexedDbKey: userId,
      snapshotUpdatedAt: migrated?.updatedAt,
      snapshotVersion: migrated?.schemaVersion,
    }));
    return { portfolio, storageState: hasMeaningfulPortfolioData(portfolio) ? 'meaningful' : 'empty' };
  }
  const portfolio = normalizeLoadedPortfolio(stored);
  tracePortfolioPersistence('load:raw', getPortfolioSnapshotTraceMetadata(userId, portfolio, {
    accountId: userId,
    indexedDbKey: userId,
    snapshotUpdatedAt: record?.updatedAt,
    snapshotVersion: record?.schemaVersion,
  }));
  return { portfolio, storageState: hasMeaningfulPortfolioData(portfolio) ? 'meaningful' : 'empty' };
};

export const loadUserPortfolioHydrationSnapshot = (userId: string): Promise<UserPortfolioHydrationSnapshot> =>
  serializeAccountOperation(userId, async () => {
    const stored = await readUserPortfolioStorage(userId);
    return { userId, ...stored, storageExists: stored.storageState !== 'missing',
      hasMeaningfulData: stored.storageState === 'meaningful',
      canonicalSignature: serializeUserPortfolioForPersistence(stored.portfolio) };
  });

export const loadUserPortfolio = async (userId: string): Promise<UserPortfolioData> =>
  (await loadUserPortfolioHydrationSnapshot(userId)).portfolio;

export const getPortfolioAutosaveDecision = (args: {
  isBootSettled: boolean;
  isHydrationComplete: boolean;
  activeUserId: string;
  hydratedUserId: string | null;
  authoritativeSignature: string | null;
  currentSignature: string | null;
  acceptedHydrationSignature: string | null;
  lastPersistedSignature: string | null;
}): PortfolioAutosaveDecision => {
  if (
    !args.isBootSettled ||
    !args.isHydrationComplete ||
    !args.hydratedUserId ||
    args.hydratedUserId !== args.activeUserId ||
    !args.authoritativeSignature ||
    !args.currentSignature
  ) {
    return 'blocked';
  }

  if (args.acceptedHydrationSignature !== args.authoritativeSignature) {
    return args.currentSignature === args.authoritativeSignature
      ? 'accept-hydrated'
      : 'blocked';
  }

  if (args.currentSignature === args.lastPersistedSignature) {
    return 'unchanged';
  }

  return 'persist';
};

export const loadUserSettings = (
  user: Pick<LocalAccountUser, 'id' | 'name' | 'email'>
): AppSettings =>
  mergeUserSettings(
    user,
    readJson<Partial<AppSettings> | null>(makeUserSettingsStorageKey(user.id), null)
  );

export const saveUserSettings = (
  user: Pick<LocalAccountUser, 'id' | 'name' | 'email'>,
  settings?: Partial<AppSettings> | AppSettings | null
): AppSettings => {
  const normalizedSettings = mergeUserSettings(user, settings);
  writeJson(makeUserSettingsStorageKey(user.id), normalizedSettings);
  return normalizedSettings;
};

export const normalizeUserOnboardingState = (
  user: Pick<LocalAccountUser, 'id' | 'name' | 'email'>,
  portfolio: UserPortfolioData,
  settings: AppSettings
): AppSettings => {
  const hasExistingAccountData =
    hasMeaningfulPortfolioData(portfolio) || hasMeaningfulSettings(settings, user);
  const alreadyCompleted = Boolean(settings.onboardingCompleted ?? settings.onboarding.completed);
  const shouldAutoComplete = hasExistingAccountData || alreadyCompleted;
  const basicModeSetupCompleted =
    settings.onboarding.basicModeSetupCompleted || portfolio.properties.length > 0;
  const requiresBasicModeStep =
    !hasExistingAccountData &&
    shouldAutoComplete &&
    settings.userMode === 'basic' &&
    !basicModeSetupCompleted &&
    portfolio.properties.length === 0;

  return mergeUserSettings(user, {
    ...settings,
    onboardingCompleted: shouldAutoComplete,
    onboardingStep: requiresBasicModeStep
      ? 'basic-mode-setup'
      : shouldAutoComplete
      ? null
      : settings.onboardingStep ?? 'welcome',
    onboarding: {
      ...settings.onboarding,
      completed: shouldAutoComplete,
      basicModeSetupCompleted,
      trackingPreference: normalizeTrackingPreference(settings.onboarding.trackingPreference),
    },
  });
};

export const saveUserPortfolio = (userId: string, data: UserPortfolioData): Promise<void> => {
  // Capture at invocation, before entering the queue; callers may mutate their input later.
  let snapshot: UserPortfolioData;
  let galleryRefs: string[];
  try {
    if (!userId || !hasRecognizedPortfolioShape(data)) throw new Error('Invalid portfolio snapshot');
    snapshot = JSON.parse(serializeUserPortfolioForPersistence(data));
    if (!Array.isArray(snapshot.properties) || snapshot.properties.some(property => !isRecord(property))) throw new Error('Invalid properties');
    galleryRefs = snapshot.properties.flatMap(property =>
      [...(property.imageUrls ?? []), ...(property.imageThumbnailUrls ?? []), property.imageUrl ?? ''].filter(isGalleryMediaRef));
  }
  catch (error) { return Promise.reject(error); }
  tracePortfolioPersistence('save:input', getPortfolioSnapshotTraceMetadata(userId, snapshot, {
    accountId: userId,
    indexedDbKey: userId,
    snapshotVersion: 1,
  }));
  return serializeAccountOperation(userId, async () => {
    await accountSnapshotTransaction('portfolios', userId, snapshot);
    commitGalleryMediaRefs(galleryRefs);
    // Retain removed blobs: legacy/recovery snapshots or another account may still reference them.
    // Failed writes also retain pending blobs so retry never saves dangling references.
  });
};

export const saveUserRecoverySnapshot = (user: LocalAccountUser, backup: UserAccountBackup): Promise<void> => {
  if (!isBackupUsableForUser(backup, user)) return Promise.reject(new Error('Invalid recovery snapshot'));
  const snapshot = JSON.parse(JSON.stringify(backup));
  return serializeAccountOperation(user.id, async () => { await accountSnapshotTransaction('recovery', user.id, snapshot); });
};

export const loadUserRecoverySnapshot = (user: LocalAccountUser): Promise<UserAccountBackup | null> =>
  serializeAccountOperation(user.id, async () => {
    const record = await accountSnapshotTransaction('recovery', user.id);
    const raw = record ? null : window.localStorage.getItem(makeUserRecoverySnapshotKey(user.id));
    if (!record && raw === null) return null;
    const snapshot = record ? record.portfolio as UserAccountBackup : JSON.parse(raw!);
    if (!isBackupUsableForUser(snapshot, user) || !unwrapStoredPortfolio(snapshot.portfolio)) throw new Error('Invalid recovery snapshot');
    return snapshot;
  });

export const restoreUserRecoverySnapshotIfNeeded = async (
  user: LocalAccountUser
): Promise<{ restored: boolean }> => {
  const current = await loadUserPortfolioHydrationSnapshot(user.id);
  if (current.storageExists) return { restored: false };
  const snapshot = await loadUserRecoverySnapshot(user);
  if (!snapshot) return { restored: false };
  await importUserAccountBackup(user, snapshot);
  return { restored: true };
};

export const exportUserAccountBackup = async (
  user: LocalAccountUser
): Promise<UserAccountBackup> => {
  const portfolio = await loadUserPortfolio(user.id);
  const settings = loadUserSettings(user);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: {
      name: user.name,
      email: user.email,
    },
    portfolio,
    settings,
  };
};

export const importUserAccountBackup = async (
  user: LocalAccountUser,
  backup: UserAccountBackup
) => {
  if (!isBackupUsableForUser(backup, user) || !unwrapStoredPortfolio(backup.portfolio)) {
    throw new Error('Invalid backup file.');
  }

  tracePortfolioPersistence('hydration:remote-import', getPortfolioSnapshotTraceMetadata(user.id, backup.portfolio, {
    accountId: user.id,
    indexedDbKey: user.id,
    snapshotVersion: backup.version,
    snapshotUpdatedAt: backup.exportedAt,
  }));

  await saveUserPortfolio(user.id, normalizeLoadedPortfolio({
    properties: backup.portfolio.properties ?? [],
    mortgages: backup.portfolio.mortgages ?? [],
    cashAccounts: backup.portfolio.cashAccounts ?? [],
    bankConnections: backup.portfolio.bankConnections ?? [],
    investmentAccounts: backup.portfolio.investmentAccounts ?? [],
    opportunities: backup.portfolio.opportunities ?? [],
    rehabProjects: backup.portfolio.rehabProjects ?? [],
    reports: backup.portfolio.reports ?? [],
    reportTemplates: backup.portfolio.reportTemplates ?? defaultReportTemplates,
    reportBranding: backup.portfolio.reportBranding ?? defaultReportBranding,
  }));

  window.localStorage.setItem(makeUserSettingsStorageKey(user.id), JSON.stringify(mergeUserSettings(user, backup.settings)));
  await loadUserPortfolio(user.id); // Confirm normalization and readback before caller reloads.

};

export const recoverLegacyPortfolioForUser = async (
  user: LocalAccountUser
): Promise<{ recovered: boolean }> => {
  if (typeof window === 'undefined') {
    return { recovered: false };
  }

  if (isDemoLocalAccount(user)) {
    return { recovered: false };
  }

  const recoveryMarkerKey = `${LEGACY_RECOVERY_MARKER_KEY}:${user.id}`;
  const alreadyRecovered = safeLocalStorageGet(recoveryMarkerKey);

  if (alreadyRecovered) {
    return { recovered: false };
  }

  const currentData = await loadUserPortfolio(user.id);

  if (!isPortfolioEmpty(currentData)) {
    return { recovered: false };
  }

  const legacyCashAccounts = readJson<CashAccount[]>(
    LEGACY_CASH_ACCOUNTS_STORAGE_KEY,
    mockCashAccounts
  );
  const legacyInvestmentAccounts = readJson<InvestmentAccount[]>(
    LEGACY_INVESTMENT_ACCOUNTS_STORAGE_KEY,
    mockInvestmentAccounts
  );
  const legacySettings = readJson<AppSettings | null>(LEGACY_SETTINGS_STORAGE_KEY, null);

  const hasLegacySignals =
    safeLocalStorageGet(LEGACY_CASH_ACCOUNTS_STORAGE_KEY) !== null ||
    safeLocalStorageGet(LEGACY_INVESTMENT_ACCOUNTS_STORAGE_KEY) !== null ||
    safeLocalStorageGet(LEGACY_SETTINGS_STORAGE_KEY) !== null;

  if (!hasLegacySignals) {
    return { recovered: false };
  }

  await saveUserPortfolio(user.id, {
    properties: mockProperties,
    mortgages: mockMortgages,
    cashAccounts: legacyCashAccounts,
    bankConnections: [],
    investmentAccounts: legacyInvestmentAccounts,
    opportunities: [],
    rehabProjects: [],
    reports: [],
    reportTemplates: defaultReportTemplates,
    reportBranding: defaultReportBranding,
  });

  saveUserSettings(user, legacySettings ?? undefined);

  safeLocalStorageSet(recoveryMarkerKey, new Date().toISOString());

  return { recovered: true };
};

export const seedLegacyPortfolioForUserIfEmpty = async (
  user: LocalAccountUser
): Promise<{ seeded: boolean }> => {
  const currentData = await loadUserPortfolio(user.id);

  if (!isPortfolioEmpty(currentData)) {
    return { seeded: false };
  }

  await saveUserPortfolio(user.id, {
    properties: mockProperties,
    mortgages: mockMortgages,
    cashAccounts: mockCashAccounts,
    bankConnections: [],
    investmentAccounts: mockInvestmentAccounts,
    opportunities: [],
    rehabProjects: [],
    reports: [],
    reportTemplates: defaultReportTemplates,
    reportBranding: defaultReportBranding,
  });

  const currentSettings = loadUserSettings(user);
  saveUserSettings(user, currentSettings);

  return { seeded: true };
};

export const seedDemoPortfolioForUser = async (
  user: LocalAccountUser,
  overwrite = false
): Promise<{ seeded: boolean }> => {
  if (!isDemoLocalAccount(user)) {
    return { seeded: false };
  }

  const currentData = await loadUserPortfolio(user.id);

  if (!overwrite && !isPortfolioEmpty(currentData)) {
    return { seeded: false };
  }

  await normalizeDemoAccountState(user, emptyPortfolioData);

  return { seeded: true };
};

export const resetDemoAccountData = async (
  user: LocalAccountUser,
  seedPortfolio: UserPortfolioData
): Promise<{ reset: boolean }> => {
  if (!isDemoLocalAccount(user)) {
    return { reset: false };
  }

  await normalizeDemoAccountState(user, seedPortfolio);

  return { reset: true };
};

export const ensureDemoLocalAccount = async (): Promise<{ user: LocalAccountUser }> => {
  const { user } = ensureLocalAccountPassword(DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_PASSWORD, DEMO_ACCOUNT_NAME);
  await normalizeDemoAccountState(user);
  return { user };
};

export const demoAccountCredentials = {
  email: DEMO_ACCOUNT_EMAIL,
  password: DEMO_ACCOUNT_PASSWORD,
  name: DEMO_ACCOUNT_NAME,
};
