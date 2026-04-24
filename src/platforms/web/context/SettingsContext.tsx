import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate, formatNumber } from '../../../common/utils/formatting';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SETTINGS_STORAGE_KEY,
  hasStoredLanguageSelection,
  safeLocalStorageGet,
  safeLocalStorageSet,
  setCurrentSettings,
  setStoredLanguageSelection,
} from '../../../common/utils/settingsStore';
import { AppSettings } from '../../../common/types/settings';
import { normalizeWorkspaceConfig } from '../../../common/utils/workspace';
import {
  areFxRatesStale,
  buildFxSnapshotFromSettings,
  buildFxSyncResult,
  hasValidFxRates,
  hydrateSettingsFxSnapshot,
} from '../../../common/utils/fxRates';
import { translate } from '../i18n/translations';
import { fetchLatestFxRates } from '../services/fx';
import { useAppSafety } from './AppSafetyContext';

interface FxSyncStatus {
  isRefreshing: boolean;
  warning: string | null;
  usingCachedRates: boolean;
  lastResolvedAt: string | null;
}

interface SettingsContextValue {
  settings: AppSettings;
  hasExplicitLanguageSelection: boolean;
  i18nReady: boolean;
  resolvedTheme: 'light' | 'dark';
  fxSyncStatus: FxSyncStatus;
  updateSettings: (updates: Partial<AppSettings>) => void;
  updateProfile: (updates: Partial<AppSettings['profile']>) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  formatPreviewCurrency: (value: number) => string;
  formatPreviewNumber: (value: number, decimals?: number) => string;
  formatPreviewDate: (value: string) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);
const SETTINGS_HYDRATION_LOG_PREFIX = '[settings-hydration]';

const logFxEvent = (event: string, payload: Record<string, unknown>) => {
  console.info('[fx]', {
    event,
    ...payload,
  });
};

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialSettings = (storageKey: string): AppSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  const storedValue = safeLocalStorageGet(storageKey);

  if (!storedValue) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<AppSettings> | null;
    if (!parsedValue || typeof parsedValue !== 'object') {
      console.warn(`${SETTINGS_HYDRATION_LOG_PREFIX} skipped invalid settings payload`, {
        outcome: 'fallback',
      });
      return DEFAULT_SETTINGS;
    }
    const workspaceConfig = parsedValue.workspaceConfig;
    const normalizedWorkspaceConfig =
      workspaceConfig && typeof workspaceConfig === 'object'
        ? normalizeWorkspaceConfig({
            ...DEFAULT_SETTINGS.workspaceConfig,
            ...workspaceConfig,
            enabledModules: Array.isArray(workspaceConfig.enabledModules)
              ? workspaceConfig.enabledModules
              : DEFAULT_SETTINGS.workspaceConfig.enabledModules,
            hiddenModules: Array.isArray(workspaceConfig.hiddenModules)
              ? workspaceConfig.hiddenModules
              : DEFAULT_SETTINGS.workspaceConfig.hiddenModules,
            sidebarOrder: Array.isArray(workspaceConfig.sidebarOrder)
              ? workspaceConfig.sidebarOrder
              : DEFAULT_SETTINGS.workspaceConfig.sidebarOrder,
            pinnedKpis: Array.isArray(workspaceConfig.pinnedKpis)
              ? workspaceConfig.pinnedKpis
              : DEFAULT_SETTINGS.workspaceConfig.pinnedKpis,
            secondaryKpis: Array.isArray(workspaceConfig.secondaryKpis)
              ? workspaceConfig.secondaryKpis
              : DEFAULT_SETTINGS.workspaceConfig.secondaryKpis,
            kpiOrder: Array.isArray(workspaceConfig.kpiOrder)
              ? workspaceConfig.kpiOrder
              : DEFAULT_SETTINGS.workspaceConfig.kpiOrder,
          })
        : DEFAULT_SETTINGS.workspaceConfig;
    const mergedSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsedValue,
      theme: parsedValue.theme ?? DEFAULT_SETTINGS.theme,
      onboardingCompleted:
        parsedValue.onboardingCompleted ?? parsedValue.onboarding?.completed ?? false,
      onboardingStep:
        parsedValue.onboardingStep ??
        ((parsedValue.onboardingCompleted ?? parsedValue.onboarding?.completed ?? false)
          ? null
          : DEFAULT_SETTINGS.onboardingStep),
      profile: {
        ...DEFAULT_SETTINGS.profile,
        ...parsedValue.profile,
      },
      taxProfile: {
        ...DEFAULT_SETTINGS.taxProfile,
        ...parsedValue.taxProfile,
      },
      onboarding: {
        ...DEFAULT_SETTINGS.onboarding,
        ...parsedValue.onboarding,
      },
      workspaceConfig: {
        ...normalizedWorkspaceConfig,
        suggestedBudgetCategories:
          Array.isArray(workspaceConfig?.suggestedBudgetCategories)
            ? workspaceConfig.suggestedBudgetCategories
            : DEFAULT_SETTINGS.workspaceConfig.suggestedBudgetCategories,
        suggestedCustomFields:
          Array.isArray(workspaceConfig?.suggestedCustomFields)
            ? workspaceConfig.suggestedCustomFields
            : DEFAULT_SETTINGS.workspaceConfig.suggestedCustomFields,
      },
    };

    const hydratedSettings = hydrateSettingsFxSnapshot(mergedSettings);
    logFxEvent('cache-load-success', {
      storageKey,
      hasSnapshot: Boolean(hydratedSettings.fxSnapshot),
      fetchedAt: hydratedSettings.fxSnapshot?.fetchedAt ?? hydratedSettings.fxRatesFetchedAt ?? null,
      lastSuccessfulUpdateAt: hydratedSettings.fxSnapshot?.lastSuccessfulUpdateAt ?? null,
      status: hydratedSettings.fxSnapshot?.status ?? null,
    });

    return hydratedSettings;
  } catch {
    console.warn(`${SETTINGS_HYDRATION_LOG_PREFIX} cache-load-failure`, { outcome: 'fallback' });
    return DEFAULT_SETTINGS;
  }
};

export const SettingsProvider: React.FC<{
  children: React.ReactNode;
  storageKey?: string;
}> = ({ children, storageKey = 're-portfolio-settings' }) => {
  const { canAutoWrite } = useAppSafety();
  const [settings, setSettings] = useState<AppSettings>(() => getInitialSettings(storageKey));
  const [hasExplicitLanguageSelectionState, setHasExplicitLanguageSelectionState] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    if (hasStoredLanguageSelection(storageKey)) {
      return true;
    }

    if (storageKey !== DEFAULT_SETTINGS_STORAGE_KEY) {
      const storedValue = safeLocalStorageGet(storageKey);

      if (!storedValue) {
        return false;
      }

      try {
        const parsedValue = JSON.parse(storedValue) as Partial<AppSettings>;
        return Object.prototype.hasOwnProperty.call(parsedValue, 'language');
      } catch {
        return false;
      }
    }

    return false;
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
  const [fxSyncStatus, setFxSyncStatus] = useState<FxSyncStatus>(() => ({
    isRefreshing: false,
    warning: null,
    usingCachedRates: hasValidFxRates(settings),
    lastResolvedAt:
      settings.fxSnapshot?.lastSuccessfulUpdateAt ?? settings.fxRatesFetchedAt ?? null,
  }));

  useEffect(() => {
    safeLocalStorageSet(storageKey, JSON.stringify(settings));
  }, [settings, storageKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    handleThemeChange();
    mediaQuery.addEventListener('change', handleThemeChange);

    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, [storageKey]);

  const resolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = resolvedTheme;
    document.documentElement.lang = settings.language;
  }, [resolvedTheme, settings.language]);

  useEffect(() => {
    setCurrentSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!canAutoWrite) {
      return;
    }

    let isCancelled = false;
    const initialSettings = settings;

    const syncDailyFxRate = async () => {
      const stale = areFxRatesStale(initialSettings);
      const cachedSnapshot = buildFxSnapshotFromSettings(initialSettings);
      const hasCachedRates = hasValidFxRates(initialSettings);

      logFxEvent('refresh-start', {
        stale,
        cachedSnapshot,
      });

      setFxSyncStatus((currentStatus) => ({
        ...currentStatus,
        isRefreshing: stale,
        warning: null,
        usingCachedRates: hasCachedRates,
      }));

      if (!stale && hasCachedRates) {
        return;
      }

      try {
        const snapshot = await fetchLatestFxRates();

        if (isCancelled) {
          return;
        }

        const result = buildFxSyncResult(initialSettings, snapshot);
        logFxEvent('refresh-success', {
          provider: snapshot.provider,
          fetchedAt: snapshot.fetchedAt,
          lastSuccessfulUpdateAt: snapshot.lastSuccessfulUpdateAt,
          status: snapshot.status,
        });
        setSettings(result.nextSettings);
        setFxSyncStatus({
          isRefreshing: false,
          warning: null,
          usingCachedRates: false,
          lastResolvedAt: snapshot.lastSuccessfulUpdateAt,
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const errorObject = error instanceof Error ? error : new Error('Unexpected FX sync error');
        const result = buildFxSyncResult(initialSettings, null, errorObject);

        console.warn('[fx]', {
          event: 'refresh-failure',
          reason: errorObject.message,
          cachedSnapshot,
          fallbackTimestamp:
            result.activeSnapshot?.lastSuccessfulUpdateAt ?? initialSettings.fxRatesFetchedAt ?? null,
          warning: result.warning,
        });

        setSettings(result.nextSettings);
        setFxSyncStatus({
          isRefreshing: false,
          warning: result.warning,
          usingCachedRates: result.usedCachedRates,
          lastResolvedAt: result.activeSnapshot?.lastSuccessfulUpdateAt ?? null,
        });
      }
    };

    void syncDailyFxRate();

    return () => {
      isCancelled = true;
    };
  }, []);

  const updateSettings = (updates: Partial<AppSettings>) => {
    if (updates.language) {
      setStoredLanguageSelection(storageKey, true);
      setHasExplicitLanguageSelectionState(true);
    }

    setSettings((currentSettings) => ({
      ...currentSettings,
      ...updates,
      onboardingCompleted:
        updates.onboardingCompleted ??
        updates.onboarding?.completed ??
        currentSettings.onboardingCompleted ??
        currentSettings.onboarding.completed,
      onboardingStep:
        updates.onboardingStep !== undefined
          ? updates.onboardingStep
          : updates.onboardingCompleted === true || updates.onboarding?.completed === true
          ? null
          : currentSettings.onboardingStep,
      profile: {
        ...currentSettings.profile,
        ...updates.profile,
      },
      taxProfile: {
        ...currentSettings.taxProfile,
        ...updates.taxProfile,
      },
      onboarding: {
        ...currentSettings.onboarding,
        ...updates.onboarding,
      },
      workspaceConfig: {
        ...normalizeWorkspaceConfig({
          ...currentSettings.workspaceConfig,
          ...updates.workspaceConfig,
          suggestedBudgetCategories:
            updates.workspaceConfig?.suggestedBudgetCategories ??
            currentSettings.workspaceConfig.suggestedBudgetCategories,
          suggestedCustomFields:
            updates.workspaceConfig?.suggestedCustomFields ??
            currentSettings.workspaceConfig.suggestedCustomFields,
        }),
      },
    }));
  };

  const updateProfile = (updates: Partial<AppSettings['profile']>) => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      profile: {
        ...currentSettings.profile,
        ...updates,
      },
    }));
  };

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hasExplicitLanguageSelection: hasExplicitLanguageSelectionState,
      i18nReady: true,
      resolvedTheme,
      fxSyncStatus,
      updateSettings,
      updateProfile,
      t: (key, replacements) => translate(settings.language, key, replacements),
      formatPreviewCurrency: (amount) => formatCurrency(amount, 'EUR'),
      formatPreviewNumber: (amount, decimals = 0) => formatNumber(amount, decimals),
      formatPreviewDate: (dateString) => formatDate(dateString),
    }),
    [fxSyncStatus, hasExplicitLanguageSelectionState, resolvedTheme, settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }

  return context;
};
