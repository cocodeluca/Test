import { accountSnapshotTransaction, serializeAccountOperation } from './portfolioDatabase';
import { AppSettings } from '../../../common/types/settings';
import {
  BankConnection,
  BankTransaction,
  BankTransactionReconciliation,
  BankTransactionSyncState,
  CashAccount,
  InvestmentAccount,
  Mortgage,
  Opportunity,
  Property,
  RehabProject,
  InvestmentReport,
  InvestmentReportTemplate,
  ReportBrandingConfig,
  RentPayment,
  RentReceivable,
  PropertyExpenseRule,
  ExpenseObligation,
  ExpensePayment,
} from '../../../common/types';
import { DEFAULT_SETTINGS } from '../../../common/utils/settingsStore';
import { defaultReportBranding, defaultReportTemplates } from '../../../common/utils/reports';
import { normalizeTrackingPreference } from '../../../common/utils/appModes';
import { createDemoPropertiesOnlyWorkspaceConfig } from '../../../common/utils/workspace';
import { setStoredSelectedUseCaseId, setStoredUseCaseSelection } from '../../../common/utils/settingsStore';
import { normalizeBankConnection, normalizeCashAccount } from '../../../common/utils/cashAccounts';
import { initializeRentTrackingStartDates } from '../../../common/utils/rentCollection';
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
const DEMO_SESSION_STORAGE_KEY = 're-portfolio-demo-session';
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
  /** Legacy-only plaintext credential removed after verified server enrollment and hydration. */
  password?: string;
  createdAt: string;
}

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
  bankTransactions?: BankTransaction[];
  bankTransactionReconciliations?: BankTransactionReconciliation[];
  bankTransactionSyncStates?: BankTransactionSyncState[];
  investmentAccounts: InvestmentAccount[];
  opportunities: Opportunity[];
  rehabProjects: RehabProject[];
  reports: InvestmentReport[];
  reportTemplates: InvestmentReportTemplate[];
  reportBranding: ReportBrandingConfig;
  rentReceivables?: RentReceivable[];
  rentPayments?: RentPayment[];
  propertyExpenseRules?: PropertyExpenseRule[];
  expenseObligations?: ExpenseObligation[];
  expensePayments?: ExpensePayment[];
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
  bankTransactions: [],
  bankTransactionReconciliations: [],
  bankTransactionSyncStates: [],
  investmentAccounts: [],
  opportunities: [],
  rehabProjects: [],
  reports: [],
  reportTemplates: defaultReportTemplates,
  reportBranding: defaultReportBranding,
  rentReceivables: [],
  rentPayments: [],
  propertyExpenseRules: [],
  expenseObligations: [],
  expensePayments: [],
};

const toPersistedUserPortfolio = (data: UserPortfolioData): UserPortfolioData => ({
  properties: data.properties,
  mortgages: data.mortgages,
  cashAccounts: data.cashAccounts,
  bankConnections: data.bankConnections,
  bankTransactions: data.bankTransactions ?? [],
  bankTransactionReconciliations: data.bankTransactionReconciliations ?? [],
  bankTransactionSyncStates: (data.bankTransactionSyncStates ?? []).map((state) => {
    const { cursor: _legacyCursor, ...displayState } = state as BankTransactionSyncState & {
      cursor?: string | null;
    };
    return displayState;
  }),
  investmentAccounts: data.investmentAccounts,
  opportunities: data.opportunities,
  rehabProjects: data.rehabProjects,
  reports: data.reports,
  reportTemplates: data.reportTemplates,
  reportBranding: data.reportBranding,
  rentReceivables: data.rentReceivables ?? [],
  rentPayments: data.rentPayments ?? [],
  propertyExpenseRules: data.propertyExpenseRules ?? [],
  expenseObligations: data.expenseObligations ?? [],
  expensePayments: data.expensePayments ?? [],
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
  (data.bankTransactions?.length ?? 0) === 0 &&
  (data.bankTransactionReconciliations?.length ?? 0) === 0 &&
  (data.bankTransactionSyncStates?.length ?? 0) === 0 &&
  data.investmentAccounts.length === 0 &&
  data.opportunities.length === 0 &&
  data.rehabProjects.length === 0 &&
  data.reports.length === 0 &&
  (data.rentReceivables?.length ?? 0) === 0 &&
  (data.rentPayments?.length ?? 0) === 0 &&
  (data.propertyExpenseRules?.length ?? 0) === 0 &&
  (data.expenseObligations?.length ?? 0) === 0 &&
  (data.expensePayments?.length ?? 0) === 0;

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

export const findLegacyLocalAccountForEnrollment = (
  credentials: AccountCredentials
): LocalAccountUser | null => {
  const email = normalizeEmail(credentials.email);
  const account = readStoredAccounts().find((candidate) =>
    candidate.email === email &&
    candidate.email !== DEMO_ACCOUNT_EMAIL &&
    typeof candidate.password === 'string' &&
    candidate.password === credentials.password
  );
  return account ? toPublicUser(account) : null;
};

export const persistAuthenticatedServerUser = (user: LocalAccountUser) => {
  const accounts = readStoredAccounts();
  const existing = accounts.find((account) => account.id === user.id);
  const record: StoredAccountRecord = {
    id: user.id,
    name: user.name,
    email: normalizeEmail(user.email),
    createdAt: existing?.createdAt ?? user.createdAt,
  };
  const next = existing
    ? accounts.map((account) => account.id === user.id ? record : account)
    : [...accounts, record];
  writeStoredAccounts(next);
};

export const finalizeLegacyAuthenticationMigration = (input: {
  expectedUserId: string;
  authenticatedUserId: string;
  hydration: Pick<UserPortfolioHydrationSnapshot, 'userId' | 'storageState'>;
}) => {
  if (
    input.expectedUserId !== input.authenticatedUserId ||
    input.hydration.userId !== input.expectedUserId ||
    input.hydration.storageState === 'invalid'
  ) {
    throw new Error('Authentication migration identity or hydration verification failed.');
  }

  const accounts = readStoredAccounts();
  writeStoredAccounts(accounts.map((account) => {
    if (account.id !== input.expectedUserId) return account;
    const { password: _legacyPassword, ...safeAccount } = account;
    return safeAccount;
  }));
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  }
};

export const startDemoLocalSession = async (): Promise<LocalAccountUser> => {
  const { user } = await ensureDemoLocalAccount();
  writeJson(DEMO_SESSION_STORAGE_KEY, { userId: user.id });
  return user;
};

export const restoreDemoLocalSession = (): LocalAccountUser | null => {
  const session = readJson<{ userId?: string } | null>(DEMO_SESSION_STORAGE_KEY, null);
  if (!session?.userId) return null;
  const account = readStoredAccounts().find((candidate) =>
    candidate.id === session.userId && candidate.email === DEMO_ACCOUNT_EMAIL
  );
  return account ? toPublicUser(account) : null;
};

export const clearDemoLocalSession = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
};

export const initializeRegisteredServerAccount = (
  user: LocalAccountUser,
  payload?: Omit<AccountRegistration, 'name' | 'email' | 'password'>
) => {
  persistAuthenticatedServerUser(user);
  const userMode = payload?.userMode ?? DEFAULT_SETTINGS.userMode;
  const onboardingCompleted =
    payload?.onboardingCompleted ?? payload?.onboarding?.completed ?? DEFAULT_SETTINGS.onboardingCompleted;
  const onboarding = payload?.onboarding ?? DEFAULT_SETTINGS.onboarding;
  const workspaceConfig = payload?.workspaceConfig ?? DEFAULT_SETTINGS.workspaceConfig;
  saveUserSettings(user, {
    userMode,
    onboardingCompleted,
    onboardingStep: onboardingCompleted ? null : 'welcome',
    dashboardSetupMode: payload?.dashboardSetupMode ?? DEFAULT_SETTINGS.dashboardSetupMode,
    onboarding,
    workspaceConfig: {
      ...workspaceConfig,
      userId: user.id,
      updatedAt: new Date().toISOString(),
      createdAt: workspaceConfig.createdAt || new Date().toISOString(),
    },
    profile: {
      ...DEFAULT_SETTINGS.profile,
      name: user.name,
      email: user.email,
    },
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasRecognizedPortfolioShape = (value: unknown): value is Partial<UserPortfolioData> =>
  isRecord(value) &&
  ['properties', 'mortgages', 'cashAccounts', 'bankConnections', 'bankTransactions', 'bankTransactionReconciliations', 'bankTransactionSyncStates', 'investmentAccounts', 'opportunities', 'rehabProjects', 'reports', 'reportTemplates', 'rentReceivables', 'rentPayments', 'propertyExpenseRules', 'expenseObligations', 'expensePayments'].every(key => value[key] === undefined || (Array.isArray(value[key]) && (value[key] as unknown[]).every(isRecord))) &&
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
): UserPortfolioData => {
  const rentReceivables = storedValue.rentReceivables ?? [];
  const rentPayments = storedValue.rentPayments ?? [];
  const bankConnections = (storedValue.bankConnections ?? []).map((connection) =>
    normalizeBankConnection(connection)
  );
  const environmentByConnection = new Map(
    bankConnections.map((connection) => [connection.id, connection.providerEnvironment] as const)
  );
  return {
    properties: initializeRentTrackingStartDates(storedValue.properties ?? [], rentReceivables, rentPayments),
    mortgages: storedValue.mortgages ?? [],
    cashAccounts: (storedValue.cashAccounts ?? []).map((account) => normalizeCashAccount(account)),
    bankConnections,
    bankTransactions: (storedValue.bankTransactions ?? []).map((transaction) => ({
      ...transaction,
      ...(transaction.providerName === 'plaid' ||
      Object.prototype.hasOwnProperty.call(transaction, 'providerEnvironment')
        ? {
            providerEnvironment:
              transaction.providerName === 'plaid'
                ? transaction.providerEnvironment ??
                  environmentByConnection.get(transaction.connectionId) ??
                  'sandbox'
                : transaction.providerEnvironment,
          }
        : {}),
    })),
    bankTransactionReconciliations: storedValue.bankTransactionReconciliations ?? [],
    bankTransactionSyncStates: (storedValue.bankTransactionSyncStates ?? []).map((state) => {
      const { cursor: _legacyCursor, ...displayState } = state as BankTransactionSyncState & {
        cursor?: string | null;
      };
      return {
        ...displayState,
        ...(displayState.providerName === 'plaid' ||
        Object.prototype.hasOwnProperty.call(displayState, 'providerEnvironment')
          ? {
              providerEnvironment:
                displayState.providerName === 'plaid'
                  ? displayState.providerEnvironment ??
                    environmentByConnection.get(displayState.connectionId) ??
                    'sandbox'
                  : displayState.providerEnvironment,
            }
          : {}),
      };
    }),
    investmentAccounts: storedValue.investmentAccounts ?? [],
    opportunities: storedValue.opportunities ?? [],
    rehabProjects: storedValue.rehabProjects ?? [],
    reports: storedValue.reports ?? [],
    reportTemplates: storedValue.reportTemplates ?? defaultReportTemplates,
    reportBranding: storedValue.reportBranding ?? defaultReportBranding,
    rentReceivables,
    rentPayments,
    propertyExpenseRules: storedValue.propertyExpenseRules ?? [],
    expenseObligations: storedValue.expenseObligations ?? [],
    expensePayments: storedValue.expensePayments ?? [],
  };
};

const needsRentTrackingMigration = (storedValue: Partial<UserPortfolioData>): boolean =>
  (storedValue.properties ?? []).some((property) =>
    (property.leases ?? []).some((lease) => lease.active && Number.isInteger(lease.rentDueDay) && !lease.rentTrackingStartDate)
  );

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
  if (needsRentTrackingMigration(stored)) {
    await accountSnapshotTransaction('portfolios', userId, portfolio);
  }
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
    cashAccounts: (backup.portfolio.cashAccounts ?? []).map((account) =>
      account.providerName === 'plaid'
        ? { ...account, syncStatus: 'needs-reauth' as const }
        : account
    ),
    bankConnections: (backup.portfolio.bankConnections ?? []).map((connection) =>
      connection.providerName === 'plaid'
        ? {
            ...connection,
            connectionStatus: 'needs-reauthentication' as const,
            syncStatus: 'needs-reauth' as const,
            needsReauth: true,
          }
        : connection
    ),
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
    rentReceivables: [],
    rentPayments: [],
    propertyExpenseRules: [],
    expenseObligations: [],
    expensePayments: [],
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
    rentReceivables: [],
    rentPayments: [],
    propertyExpenseRules: [],
    expenseObligations: [],
    expensePayments: [],
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
  const accounts = readStoredAccounts();
  const existing = accounts.find((account) => account.email === DEMO_ACCOUNT_EMAIL);
  const safeAccount: StoredAccountRecord = existing
    ? {
        id: existing.id,
        name: DEMO_ACCOUNT_NAME,
        email: DEMO_ACCOUNT_EMAIL,
        createdAt: existing.createdAt,
      }
    : {
        id: makeUserId(),
        name: DEMO_ACCOUNT_NAME,
        email: DEMO_ACCOUNT_EMAIL,
        createdAt: new Date().toISOString(),
      };
  writeStoredAccounts(existing
    ? accounts.map((account) => account.id === existing.id ? safeAccount : account)
    : [...accounts, safeAccount]);
  const user = toPublicUser(safeAccount);
  await normalizeDemoAccountState(user);
  return { user };
};

export const demoAccountCredentials = {
  email: DEMO_ACCOUNT_EMAIL,
  password: DEMO_ACCOUNT_PASSWORD,
  name: DEMO_ACCOUNT_NAME,
};
