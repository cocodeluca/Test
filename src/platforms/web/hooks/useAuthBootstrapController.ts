import { useEffect, useState } from 'react';
import type { AppLanguage } from '../../../common/types/settings';
import {
  DEFAULT_SETTINGS_STORAGE_KEY,
  hasStoredLanguageSelection,
  safeLocalStorageGet,
  setStoredLanguageSelection,
} from '../../../common/utils/settingsStore';
import {
  clearDemoLocalSession,
  demoAccountCredentials,
  DEMO_ACCOUNT_EMAIL,
  finalizeLegacyAuthenticationMigration,
  findLegacyLocalAccountForEnrollment,
  initializeRegisteredServerAccount,
  loadUserPortfolioHydrationSnapshot,
  loadUserSettings,
  makeUserSettingsStorageKey,
  normalizeDemoAccountState,
  persistAuthenticatedServerUser,
  restoreDemoLocalSession,
  safeJsonParse,
  saveUserPortfolio,
  saveUserSettings,
  startDemoLocalSession,
  type LocalAccountUser,
  type UserAccountBackup,
  type UserPortfolioHydrationSnapshot,
} from '../services/localAccountStore';
import {
  enrollExistingServerAccount,
  loadServerSession,
  loginServerAccount,
  logoutServerAccount,
  registerServerAccount,
  ServerAuthApiError,
} from '../services/serverAuthApi';
import { saveBackupToServer } from '../services/accountBackupApi';
import { useAccountWorkspaceHydration } from './useAccountWorkspaceHydration';
import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from '../services/portfolioPersistenceTrace';

type LoginPayload = { email: string; password: string };
type RegisterPayload = { name: string; email: string; password: string };
type AuthenticationAuthority = 'server' | 'demo' | null;

export const useAuthBootstrapController = () => {
  const [currentUser, setCurrentUser] = useState<LocalAccountUser | null>(null);
  const [authenticationAuthority, setAuthenticationAuthority] =
    useState<AuthenticationAuthority>(null);
  const [isAuthBootstrapLoading, setIsAuthBootstrapLoading] = useState(true);
  const [portfolioHydration, setPortfolioHydration] =
    useState<UserPortfolioHydrationSnapshot | null>(null);
  const [hydrationError, setHydrationError] = useState<unknown>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const { hydrateAccountWorkspace } = useAccountWorkspaceHydration();

  useEffect(() => {
    let cancelled = false;
    tracePortfolioPersistence('bootstrap:start', {});
    void loadServerSession().then((serverUser) => {
      if (cancelled) return;
      const user = serverUser ?? restoreDemoLocalSession();
      setCurrentUser(user);
      setAuthenticationAuthority(serverUser ? 'server' : user ? 'demo' : null);
      setIsAuthBootstrapLoading(user !== null);
    }).catch(() => {
      if (cancelled) return;
      setCurrentUser(null);
      setAuthenticationAuthority(null);
      setIsAuthBootstrapLoading(false);
    });
    return () => {
      cancelled = true;
    };
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
      if (isCancelled) return;

      if (authenticationAuthority === 'server') {
        finalizeLegacyAuthenticationMigration({
          expectedUserId: currentUser.id,
          authenticatedUserId: currentUser.id,
          hydration,
        });
        persistAuthenticatedServerUser(currentUser);
      }

      if (shouldRefreshSession) setSessionKey((currentKey) => currentKey + 1);
      setPortfolioHydration(hydration);
      tracePortfolioPersistence('bootstrap:hydrated', getPortfolioSnapshotTraceMetadata(currentUser.id, hydration.portfolio, {
        accountId: currentUser.id,
        indexedDbKey: currentUser.id,
      }));
      setIsAuthBootstrapLoading(false);
    }).catch((error) => {
      if (!isCancelled) {
        setHydrationError(error);
        setIsAuthBootstrapLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentUser, authenticationAuthority, hydrateAccountWorkspace, hydrationAttempt]);

  const acceptServerUser = async (user: LocalAccountUser) => {
    const verified = await loadServerSession();
    if (!verified || verified.id !== user.id) {
      throw new Error('Server session identity verification failed.');
    }
    clearDemoLocalSession();
    setPortfolioHydration(null);
    setIsAuthBootstrapLoading(true);
    setAuthenticationAuthority('server');
    setCurrentUser(verified);
    setSessionKey((currentKey) => currentKey + 1);
    return verified;
  };

  const applyPendingLanguage = (user: LocalAccountUser) => {
    const pendingLanguage = getPendingAnonymousLanguagePreference();
    if (!pendingLanguage) return;
    saveUserSettings(user, {
      ...loadUserSettings(user),
      language: pendingLanguage,
    });
    setStoredLanguageSelection(makeUserSettingsStorageKey(user.id), true);
  };

  const handleLogin = async (payload: LoginPayload) => {
    const normalizedEmail = payload.email.trim().toLowerCase();
    if (
      normalizedEmail === DEMO_ACCOUNT_EMAIL &&
      payload.password === demoAccountCredentials.password
    ) {
      // Demo mode is local-only and must never inherit a server session capable of Banking.
      await logoutServerAccount();
      const user = await startDemoLocalSession();
      await normalizeDemoAccountState(user);
      setPortfolioHydration(null);
      setIsAuthBootstrapLoading(true);
      setAuthenticationAuthority('demo');
      setCurrentUser(user);
      setSessionKey((currentKey) => currentKey + 1);
      return;
    }

    clearDemoLocalSession();
    let user: LocalAccountUser;
    try {
      user = (await loginServerAccount(payload)).user;
    } catch (error) {
      if (!(error instanceof ServerAuthApiError) || error.status !== 401) throw error;
      const legacyUser = findLegacyLocalAccountForEnrollment(payload);
      if (!legacyUser) throw error;
      const enrolled = await enrollExistingServerAccount({
        userId: legacyUser.id,
        name: legacyUser.name,
        email: legacyUser.email,
        password: payload.password,
      });
      if (enrolled.user.id !== legacyUser.id) {
        throw new Error('Existing account enrollment changed the local user identity.');
      }
      user = enrolled.user;
    }

    const verified = await acceptServerUser(user);
    applyPendingLanguage(verified);
  };

  const handleRegister = async (payload: RegisterPayload) => {
    clearDemoLocalSession();
    const registered = await registerServerAccount(payload);
    const verified = await acceptServerUser(registered.user);
    initializeRegisteredServerAccount(verified);
    applyPendingLanguage(verified);
  };

  const handleLogout = async (backup: UserAccountBackup) => {
    if (currentUser) await saveUserPortfolio(currentUser.id, backup.portfolio);
    await saveBackupToServer(backup).catch(() => undefined);

    if (authenticationAuthority === 'server') await logoutServerAccount();
    clearDemoLocalSession();
    setPortfolioHydration(null);
    setCurrentUser(null);
    setAuthenticationAuthority(null);
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
  if (!storedValue) return null;
  const parsedValue = safeJsonParse<{ language?: AppLanguage } | null>(storedValue, null);
  return parsedValue?.language ?? null;
};
