import { useEffect, useState } from 'react';
import type { AppLanguage } from '../../../common/types/settings';
import {
  DEFAULT_SETTINGS_STORAGE_KEY,
  hasStoredLanguageSelection,
  safeLocalStorageGet,
  setStoredLanguageSelection,
} from '../../../common/utils/settingsStore';
import {
  ensureDemoLocalAccount,
  ensureLocalAccountPassword,
  getLocalSessionDebugInfo,
  loadUserSettings,
  loginLocalAccount,
  logoutLocalAccount,
  makeUserSettingsStorageKey,
  normalizeDemoAccountState,
  registerLocalAccount,
  restoreLocalSession,
  restoreUserRecoverySnapshotIfNeeded,
  saveUserSettings,
  UserAccountBackup,
  LocalAccountUser,
  DEMO_ACCOUNT_EMAIL,
  safeJsonParse,
} from '../services/localAccountStore';
import { flushBackupToServer, saveBackupToServer } from '../services/accountBackupApi';
import { useAccountWorkspaceHydration } from './useAccountWorkspaceHydration';

type LoginPayload = { email: string; password: string };
type RegisterPayload = { name: string; email: string; password: string };

export const useAuthBootstrapController = () => {
  const [currentUser, setCurrentUser] = useState<LocalAccountUser | null>(null);
  const [isAuthBootstrapLoading, setIsAuthBootstrapLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);
  const { hydrateAccountWorkspace } = useAccountWorkspaceHydration();

  useEffect(() => {
    ensureLocalAccountPassword('cocodeluca97@gmail.com', 'cocococo97', 'Coco Deluca');
    ensureDemoLocalAccount();

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
      setIsAuthBootstrapLoading(false);
      return;
    }

    let isCancelled = false;
    setIsAuthBootstrapLoading(true);
    void hydrateAccountWorkspace(currentUser).then(({ shouldRefreshSession }) => {
      if (isCancelled) {
        return;
      }

      if (shouldRefreshSession) {
        setSessionKey((currentKey) => currentKey + 1);
      }

      setIsAuthBootstrapLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [currentUser, hydrateAccountWorkspace]);

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
      normalizeDemoAccountState(user);
    }

    restoreUserRecoverySnapshotIfNeeded(user);
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

    setIsAuthBootstrapLoading(true);
    setCurrentUser(user);
    setSessionKey((currentKey) => currentKey + 1);
  };

  const handleLogout = (backup: UserAccountBackup) => {
    const flushed = flushBackupToServer(backup);

    if (!flushed) {
      void saveBackupToServer(backup).catch(() => {
        // Keep local state if the final sync cannot complete.
      });
    }

    logoutLocalAccount();
    setCurrentUser(null);
    setSessionKey((currentKey) => currentKey + 1);
  };

  return {
    currentUser,
    isAuthBootstrapLoading,
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
