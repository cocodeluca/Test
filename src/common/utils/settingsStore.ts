import { AppSettings } from '../types/settings';
import { defaultWorkspaceConfig } from './workspace';

export const DEFAULT_SETTINGS_STORAGE_KEY = 're-portfolio-settings';
export const makeLanguageSelectionStorageKey = (storageKey: string) =>
  `${storageKey}:language-selected`;
export const makeUseCaseSelectionStorageKey = (storageKey: string) =>
  `${storageKey}:use-case-selected`;
export const makeSelectedUseCaseIdStorageKey = (storageKey: string) =>
  `${storageKey}:selected-use-case-id`;

const SETTINGS_STORAGE_LOG_PREFIX = '[settings-hydration]';

export const safeLocalStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`${SETTINGS_STORAGE_LOG_PREFIX} localStorage get failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`${SETTINGS_STORAGE_LOG_PREFIX} localStorage set failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const safeLocalStorageRemove = (key: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`${SETTINGS_STORAGE_LOG_PREFIX} localStorage remove failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const DEFAULT_SETTINGS: AppSettings = {
  profile: {
    name: 'Portfolio Owner',
    email: '',
    role: 'Private Investor',
    notes: '',
  },
  taxProfile: {
    taxResidencyCountry: 'Spain',
    annualEmploymentIncome: 0,
    annualOtherIncome: 0,
    estimatedMarginalTaxRate: 24,
  },
  userMode: 'advanced',
  onboardingCompleted: false,
  onboardingStep: 'welcome',
  showAdvancedBasicModeFeatures: false,
  currency: 'EUR',
  displayMode: 'single-reporting-currency',
  valueCurrency: undefined,
  operatingCurrency: undefined,
  reportingCurrency: undefined,
  usdToEurRate: 0.92,
  arsToEurRate: 0.00092,
  usdToEurRateSource: 'manual',
  usdToEurRateUpdatedAt: null,
  arsToEurRateSource: 'manual',
  arsToEurRateUpdatedAt: null,
  fxRatesFetchedAt: null,
  fxSnapshot: null,
  language: 'es',
  theme: 'light',
  dateFormat: 'en-GB',
  numberFormat: 'en-US',
  defaultDashboardView: 'overview',
  dashboardSetupMode: 'connected',
  density: 'comfortable',
  onboarding: {
    completed: false,
    basicModeSetupCompleted: false,
    strategies: [],
    goals: [],
    detectedProfiles: [],
    uploadedFiles: [],
    trackingPreference: 'full-portfolio',
  },
  workspaceConfig: defaultWorkspaceConfig,
};

let currentSettings: AppSettings = DEFAULT_SETTINGS;

export const setCurrentSettings = (settings: AppSettings) => {
  currentSettings = settings;
};

export const getCurrentSettings = (): AppSettings => currentSettings;

export const resolveLegacyCurrencyDefaults = (settings: Partial<AppSettings>): Partial<AppSettings> => {
  const legacyCurrency = settings.currency;

  return {
    ...settings,
    reportingCurrency: settings.reportingCurrency ?? legacyCurrency,
    valueCurrency: settings.valueCurrency ?? legacyCurrency,
    operatingCurrency: settings.operatingCurrency ?? legacyCurrency,
    displayMode: settings.displayMode ?? DEFAULT_SETTINGS.displayMode,
  };
};

export const hasStoredLanguageSelection = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY
): boolean => {
  return safeLocalStorageGet(makeLanguageSelectionStorageKey(storageKey)) === 'true';
};

export const setStoredLanguageSelection = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY,
  selected = true
) => {
  safeLocalStorageSet(makeLanguageSelectionStorageKey(storageKey), selected ? 'true' : 'false');
};

export const hasStoredUseCaseSelection = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY
): boolean => {
  return safeLocalStorageGet(makeUseCaseSelectionStorageKey(storageKey)) === 'true';
};

export const setStoredUseCaseSelection = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY,
  selected = true
) => {
  safeLocalStorageSet(makeUseCaseSelectionStorageKey(storageKey), selected ? 'true' : 'false');
};

export const getStoredSelectedUseCaseId = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY
): string | null => {
  return safeLocalStorageGet(makeSelectedUseCaseIdStorageKey(storageKey));
};

export const setStoredSelectedUseCaseId = (
  storageKey: string = DEFAULT_SETTINGS_STORAGE_KEY,
  useCaseId: string | null
) => {
  if (!useCaseId) {
    safeLocalStorageRemove(makeSelectedUseCaseIdStorageKey(storageKey));
    return;
  }

  safeLocalStorageSet(makeSelectedUseCaseIdStorageKey(storageKey), useCaseId);
};
