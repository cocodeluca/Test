import { useEffect, useRef, useState } from 'react';
import type { AppLanguage } from '../../../common/types/settings';
import {
  DEFAULT_SETTINGS_STORAGE_KEY,
  hasStoredLanguageSelection,
  safeLocalStorageGet,
  setStoredLanguageSelection,
} from '../../../common/utils/settingsStore';
import {
  clearDemoSessionState,
  clearDemoAccountSessionPointers,
  clearDemoAuthArtifacts,
  ensureDemoLocalAccount,
  ensureLocalAccountPassword,
  hasActiveDemoSession,
  getLocalSessionDebugInfo,
  isValidDemoSessionBackup,
  loadDemoSessionBackup,
  loadUserSettings,
  loginLocalAccount,
  logoutLocalAccount,
  makeUserSettingsStorageKey,
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
import type { AccountBootstrapMode } from './useAccountWorkspaceHydration';

type LoginPayload = { email: string; password: string };
type RegisterPayload = { name: string; email: string; password: string };

export const useAuthBootstrapController = () => {
  const [currentUser, setCurrentUser] = useState<LocalAccountUser | null>(null);
  const [isAuthBootstrapLoading, setIsAuthBootstrapLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);
  const [bootstrapMode, setBootstrapMode] = useState<AccountBootstrapMode>('session-restore');
  const { hydrateAccountWorkspace } = useAccountWorkspaceHydration();
  const loginAttemptRef = useRef(0);
  const suppressDemoRestoreRef = useRef(false);

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
    console.info('[auth] App bootstrap state snapshot.', {
      bootstrapMode,
      loginAttemptCount: loginAttemptRef.current,
      hasActiveDemoSession: hasActiveDemoSession(),
      restoredUser: restoredSession.user
        ? {
          id: restoredSession.user.id,
          email: restoredSession.user.email,
        }
        : null,
    });

    if (!restoredSession.user && persistedSessionBeforeRestore.sessionExists && hasActiveDemoSession()) {
      if (suppressDemoRestoreRef.current) {
        console.info('[auth] demo bootstrap restore skipped after real login.');
        return;
      }

      const demoSnapshot = loadDemoSessionBackup();

      if (isValidDemoSessionBackup(demoSnapshot)) {
        console.info('[auth] demo bootstrap restore attempted.', {
          persistedSessionBeforeRestore,
          demoSnapshotUser: demoSnapshot.user,
          loginAttemptCount: loginAttemptRef.current,
        });
        const { user } = loginLocalAccount({
          email: DEMO_ACCOUNT_EMAIL,
          password: 'admin',
        });
        setCurrentUser(user);
        setIsAuthBootstrapLoading(true);
        return;
      }

      clearDemoSessionState();
    }

    if (restoredSession.user) {
      clearDemoAuthArtifacts(restoredSession.user.email);
    }

    setCurrentUser(restoredSession.user);
    setIsAuthBootstrapLoading(restoredSession.user !== null);
  }, [bootstrapMode]);

  useEffect(() => {
    if (!currentUser) {
      setIsAuthBootstrapLoading(false);
      return;
    }

    let isCancelled = false;
    setIsAuthBootstrapLoading(true);
    void hydrateAccountWorkspace(currentUser, {
      allowExternalRestore: bootstrapMode !== 'register',
    }).then(({ shouldRefreshSession }) => {
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
  }, [bootstrapMode, currentUser, hydrateAccountWorkspace]);

  const handleLogin = async (payload: LoginPayload) => {
    const attemptToken = loginAttemptRef.current + 1;
    loginAttemptRef.current = attemptToken;
    suppressDemoRestoreRef.current = true;
    console.info('[auth] handleLogin entered.', {
      attemptToken,
      email: payload.email,
      passwordProvided: Boolean(payload.password),
      localSessionBefore: getLocalSessionDebugInfo(),
      currentUserBefore: currentUser
        ? {
            id: currentUser.id,
            email: currentUser.email,
          }
        : null,
    });

    clearDemoAuthArtifacts(payload.email);

    try {
      const result = loginLocalAccount(payload);
      const user = result.user;
      console.info('[auth] loginLocalAccount result.', {
        attemptToken,
        user: {
          id: user.id,
          email: user.email,
          isDemoUser: user.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL,
        },
      });
      clearDemoAccountSessionPointers();
      clearDemoAuthArtifacts(user.email);
      const restoredAfterLogin = restoreLocalSession(new Date(), user, { skipDemoRestore: true });
      console.info('[auth] post-login restore check.', {
        attemptToken,
        restoredUser: restoredAfterLogin.user
          ? {
              id: restoredAfterLogin.user.id,
              email: restoredAfterLogin.user.email,
            }
          : null,
        localSessionAfter: getLocalSessionDebugInfo(),
        demoRestoreAttempted: false,
      });

      const restoredUser = restoredAfterLogin.user;
      const restoredMatchesLogin =
        restoredUser !== null &&
        restoredUser.id === user.id &&
        restoredUser.email === user.email;

      if (!restoredMatchesLogin) {
        console.warn('[auth] real login mismatch detected. forcing real user and clearing demo markers.', {
          attemptToken,
          expectedUser: {
            id: user.id,
            email: user.email,
          },
          actualUser: restoredAfterLogin.user
            ? {
                id: restoredAfterLogin.user.id,
                email: restoredAfterLogin.user.email,
              }
            : null,
        });
        clearDemoAuthArtifacts(user.email);
      }

      const pendingLanguage = getPendingAnonymousLanguagePreference();

      if (pendingLanguage) {
        saveUserSettings(user, {
          ...loadUserSettings(user),
          language: pendingLanguage,
        });
        setStoredLanguageSelection(makeUserSettingsStorageKey(user.id), true);
      }

      restoreUserRecoverySnapshotIfNeeded(user);
      setIsAuthBootstrapLoading(true);
      setBootstrapMode('login');
      setCurrentUser(user);
      setSessionKey((currentKey) => currentKey + 1);
    } catch (error) {
      suppressDemoRestoreRef.current = false;
      console.info('[auth] loginLocalAccount failed.', {
        attemptToken,
        error: error instanceof Error ? error.message : String(error),
        localSessionAfterFailure: getLocalSessionDebugInfo(),
      });
      throw error;
    }

    suppressDemoRestoreRef.current = false;
  };

  const handleRegister = async (payload: RegisterPayload) => {
    clearDemoSessionState();
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
    setBootstrapMode('register');
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
    setBootstrapMode('session-restore');
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
