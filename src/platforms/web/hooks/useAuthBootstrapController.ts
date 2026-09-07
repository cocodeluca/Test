import { useEffect, useState } from 'react';
import type { AppLanguage } from '../../../common/types/settings';
import {
  DEFAULT_SETTINGS_STORAGE_KEY,
  hasStoredLanguageSelection,
  safeLocalStorageGet,
  setStoredLanguageSelection,
} from '../../../common/utils/settingsStore';
import {
  ensureLocalAccountPassword,
  getLocalSessionDebugInfo,
  loadUserPortfolioHydrationSnapshot,
  loadUserSettings,
  loginLocalAccount,
  logoutLocalAccount,
  makeUserSettingsStorageKey,
  normalizeDemoAccountState,
  registerLocalAccount,
  restoreLocalSession,
  saveUserSettings,
  saveUserPortfolio,
  UserAccountBackup,
  UserPortfolioHydrationSnapshot,
  LocalAccountUser,
  DEMO_ACCOUNT_EMAIL,
  demoAccountCredentials,
  safeJsonParse,
} from '../services/localAccountStore';
import { saveBackupToServer } from '../services/accountBackupApi';
import { useAccountWorkspaceHydration } from './useAccountWorkspaceHydration';
import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from '../services/portfolioPersistenceTrace';

type LoginPayload = { email: string; password: string };
type RegisterPayload = { name: string; email: string; password: string };

export const useAuthBootstrapController = () => {
  const [currentUser, setCurrentUser] = useState<LocalAccountUser | null>(null);
  const [isAuthBootstrapLoading, setIsAuthBootstrapLoading] = useState(true);
  const [portfolioHydration, setPortfolioHydration] =
    useState<UserPortfolioHydrationSnapshot | null>(null);
  const [hydrationError, setHydrationError] = useState<unknown>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const { hydrateAccountWorkspace } = useAccountWorkspaceHydration();

  useEffect(() => {
    tracePortfolioPersistence('bootstrap:start', {});
    ensureLocalAccountPassword('cocodeluca97@gmail.com', 'cocococo97', 'Coco Deluca');
    ensureLocalAccountPassword(demoAccountCredentials.email, demoAccountCredentials.password, demoAccountCredentials.name);
    // Demo settings are normalized only when that account is hydrated.

    const persistedSessionBeforeRestore = getLocalSessionDebugInfo();
    console.info('[auth] App bootstrap started.', {
      persistedSessionBeforeRestore,
      sessionValidation: 'local persisted session',
      refreshStrategy: 'local refresh token rotation',
    });

    const restoredSession = restoreLocalSession();
    console.info('[auth] App bootstrap restore result.', restoredSession.debug);

    setCurrentUser(restoredSession.user);
    setIsAuthBootstrapLoading(restoredSession.user !== null);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setPortfolioHydration(null);
      setIsAuthBootstrapLoading(false);
      return;
    }

    let isCancelled = false;
    setPortfolioHydration(null);
    setHydrationError(null);
    setIsAuthBootstrapLoading(true);
    void hydrateAccountWorkspace(currentUser).then(async ({ shouldRefreshSession }) => {
      const hydration = await loadUserPortfolioHydrationSnapshot(currentUser.id);
      if (isCancelled) {
        return;
      }

      if (shouldRefreshSession) {
        setSessionKey((currentKey) => currentKey + 1);
      }

      setPortfolioHydration(hydration);
      tracePortfolioPersistence('bootstrap:hydrated', getPortfolioSnapshotTraceMetadata(currentUser.id, hydration.portfolio, {
        accountId: currentUser.id,
        indexedDbKey: currentUser.id,
      }));
      setIsAuthBootstrapLoading(false);
    }).catch(error => { if (!isCancelled) { setHydrationError(error); setIsAuthBootstrapLoading(false); } });

    return () => {
      isCancelled = true;
    };
  }, [currentUser, hydrateAccountWorkspace, hydrationAttempt]);

  const handleLogin = async (payload: LoginPayload) => {
    const { user } = loginLocalAccount(payload);
    const pendingLanguage = getPendingAnonymousLanguagePreference();
    const normalizedEmail = user.email.trim().toLowerCase();
    const isDemoLogin = normalizedEmail === DEMO_ACCOUNT_EMAIL;

    if (pendingLanguage) {
      saveUserSettings(user, {
        ...loadUserSettings(user),
        language: pendingLanguage,
      });
      setStoredLanguageSelection(makeUserSettingsStorageKey(user.id), true);
    }

    if (typeof window !== 'undefined' && isDemoLogin) {
      const dismissedStorageKey = `re-portfolio-demo-tutorial-dismissed:${normalizedEmail}`;
      const restartRequestStorageKey = `re-portfolio-demo-tutorial-restart-request:${normalizedEmail}`;
      const advancedSessionStorageKey = `re-portfolio-demo-advanced-session:${normalizedEmail}`;

      try {
        window.localStorage.removeItem(dismissedStorageKey);
        window.localStorage.setItem(restartRequestStorageKey, new Date().toISOString());
        window.localStorage.removeItem(advancedSessionStorageKey);
      } catch (error) {
        console.warn('[demo-restore] localStorage update failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (isDemoLogin) {
      await normalizeDemoAccountState(user);
    }


    setPortfolioHydration(null);
    setIsAuthBootstrapLoading(true);
    setCurrentUser(user);
    setSessionKey((currentKey) => currentKey + 1);
  };

  const handleRegister = async (payload: RegisterPayload) => {
    const { user } = registerLocalAccount(payload);
    const pendingLanguage = getPendingAnonymousLanguagePreference();

    if (pendingLanguage) {
      saveUserSettings(user, {
        ...loadUserSettings(user),
        language: pendingLanguage,
      });
      setStoredLanguageSelection(makeUserSettingsStorageKey(user.id), true);
    }

    setPortfolioHydration(null);
    setIsAuthBootstrapLoading(true);
    setCurrentUser(user);
    setSessionKey((currentKey) => currentKey + 1);
  };

  const handleLogout = async (backup: UserAccountBackup) => {
    if (currentUser) await saveUserPortfolio(currentUser.id, backup.portfolio);
    // Local commit above is mandatory; remote availability does not prevent logout.
    await saveBackupToServer(backup).catch(() => undefined);

    logoutLocalAccount();
    setPortfolioHydration(null);
    setCurrentUser(null);
    setSessionKey((currentKey) => currentKey + 1);
  };

  return {
    currentUser,
    hydrationError,
    retryHydration: () => setHydrationAttempt(value => value + 1),
    isAuthBootstrapLoading,
    portfolioHydration,
    sessionKey,
    handleLogin,
    handleRegister,
    handleLogout,
  };
};

const getPendingAnonymousLanguagePreference = (): AppLanguage | null => {
  if (typeof window === 'undefined' || !hasStoredLanguageSelection(DEFAULT_SETTINGS_STORAGE_KEY)) {
    return null;
  }

  const storedValue = safeLocalStorageGet(DEFAULT_SETTINGS_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  const parsedValue = safeJsonParse<{ language?: AppLanguage } | null>(storedValue, null);

  if (!parsedValue) {
    return null;
  }

  return parsedValue.language ?? null;
};
