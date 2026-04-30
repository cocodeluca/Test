import { useCallback } from 'react';
import { useAppSafety } from '../context/AppSafetyContext';
import type { AppSettings, WorkspaceConfig } from '../../../common/types/settings';
import { normalizeTrackingPreference } from '../../../common/utils/appModes';
import {
  DEMO_ACCOUNT_EMAIL,
  LocalAccountUser,
  UserAccountBackup,
  clearDemoSessionState,
  exportUserAccountBackup,
  hasMeaningfulPortfolioData,
  hasActiveDemoSession,
  importUserAccountBackup,
  isValidDemoSessionBackup,
  loadDemoSessionBackup,
  normalizeDemoAccountState,
  normalizeUserOnboardingState,
  recoverLegacyPortfolioForUser,
  restoreUserRecoverySnapshotIfNeeded,
  saveUserSettings,
} from '../services/localAccountStore';
import { loadBackupFromServer, saveBackupToServer } from '../services/accountBackupApi';

type HydrationResult = {
  shouldRefreshSession: boolean;
};

export type AccountBootstrapMode = 'session-restore' | 'login' | 'register';

const WORKSPACE_HYDRATION_LOG_PREFIX = '[workspace-hydration]';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const hasValidWorkspaceConfigShape = (workspaceConfig: unknown): workspaceConfig is WorkspaceConfig =>
  isRecord(workspaceConfig) &&
  isStringArray(workspaceConfig.enabledModules) &&
  isStringArray(workspaceConfig.hiddenModules) &&
  isStringArray(workspaceConfig.sidebarOrder) &&
  isStringArray(workspaceConfig.pinnedKpis) &&
  isStringArray(workspaceConfig.secondaryKpis) &&
  isStringArray(workspaceConfig.kpiOrder);

const hasValidPortfolioShape = (portfolio: unknown): portfolio is UserAccountBackup['portfolio'] =>
  isRecord(portfolio) &&
  Array.isArray(portfolio.properties) &&
  Array.isArray(portfolio.mortgages) &&
  Array.isArray(portfolio.cashAccounts) &&
  Array.isArray(portfolio.bankConnections) &&
  Array.isArray(portfolio.investmentAccounts) &&
  Array.isArray(portfolio.opportunities) &&
  Array.isArray(portfolio.rehabProjects) &&
  Array.isArray(portfolio.reports) &&
  Array.isArray(portfolio.reportTemplates) &&
  isRecord(portfolio.reportBranding);

const hasValidBackupShape = (backup: unknown): backup is UserAccountBackup =>
  isRecord(backup) &&
  backup.version === 1 &&
  isRecord(backup.user) &&
  typeof backup.user.name === 'string' &&
  typeof backup.user.email === 'string' &&
  hasValidPortfolioShape(backup.portfolio) &&
  isRecord(backup.settings) &&
  hasValidWorkspaceConfigShape(backup.settings.workspaceConfig);

const logWorkspaceHydration = (
  outcome: 'restored' | 'skipped' | 'fallback' | 'corrupted' | 'migration-failed',
  details?: Record<string, unknown>
) => {
  console.warn(`${WORKSPACE_HYDRATION_LOG_PREFIX} ${outcome}`, details ? { outcome, ...details } : { outcome });
};

export const useAccountWorkspaceHydration = () => {
  const { canAutoWrite } = useAppSafety();
  const hydrateAccountWorkspace = useCallback(
    async (
      currentUser: LocalAccountUser,
      options?: { allowExternalRestore?: boolean }
    ): Promise<HydrationResult> => {
      const normalizedEmail = currentUser.email.trim().toLowerCase();
      const allowExternalRestore = options?.allowExternalRestore ?? true;

      if (normalizedEmail === DEMO_ACCOUNT_EMAIL) {
        try {
          if (hasActiveDemoSession()) {
            const demoSnapshot = loadDemoSessionBackup();
            if (isValidDemoSessionBackup(demoSnapshot)) {
              importUserAccountBackup(currentUser, demoSnapshot);
              logWorkspaceHydration('restored', { source: 'demo-session-snapshot' });
            } else {
              clearDemoSessionState();
              normalizeDemoAccountState(currentUser);
              logWorkspaceHydration('restored', { source: 'demo-account' });
            }
          } else {
            normalizeDemoAccountState(currentUser);
            logWorkspaceHydration('restored', { source: 'demo-account' });
          }
        } catch (error) {
          logWorkspaceHydration('fallback', {
            source: 'demo-account',
            reason: error instanceof Error ? error.message : String(error),
          });
        }

        return { shouldRefreshSession: true };
      }

      let shouldRefreshSession = false;
      let localBackup: UserAccountBackup | null = null;

      if (allowExternalRestore) {
        try {
          const restored = restoreUserRecoverySnapshotIfNeeded(currentUser);
          if (restored.restored) {
            shouldRefreshSession = true;
            logWorkspaceHydration('restored', { source: 'recovery-snapshot' });
          }
        } catch (error) {
          logWorkspaceHydration('corrupted', {
            source: 'recovery-snapshot',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        localBackup = exportUserAccountBackup(currentUser);
      } catch (error) {
        logWorkspaceHydration('fallback', {
          source: 'local-backup',
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      if (!localBackup) {
        return { shouldRefreshSession };
      }

      if (allowExternalRestore) {
        try {
          const serverBackup = await loadBackupFromServer(currentUser.email);
          const payload = serverBackup.payload;

          if (!hasValidBackupShape(payload)) {
            logWorkspaceHydration('corrupted', { source: 'server-backup' });
          } else {
            const localPortfolioItemCount =
              localBackup.portfolio.properties.length +
              localBackup.portfolio.mortgages.length +
              localBackup.portfolio.cashAccounts.length +
              localBackup.portfolio.bankConnections.length +
              localBackup.portfolio.investmentAccounts.length +
              localBackup.portfolio.opportunities.length +
              localBackup.portfolio.rehabProjects.length +
              localBackup.portfolio.reports.length;
            const serverPortfolioItemCount =
              payload.portfolio.properties.length +
              payload.portfolio.mortgages.length +
              payload.portfolio.cashAccounts.length +
              payload.portfolio.bankConnections.length +
              payload.portfolio.investmentAccounts.length +
              payload.portfolio.opportunities.length +
              payload.portfolio.rehabProjects.length +
              payload.portfolio.reports.length;
            const localHasMeaningfulState =
              hasMeaningfulPortfolioData(localBackup.portfolio) ||
              Boolean(localBackup.settings.onboardingCompleted ?? localBackup.settings.onboarding.completed);
            const serverHasMeaningfulState =
              hasMeaningfulPortfolioData(payload.portfolio) ||
              Boolean(payload.settings.onboardingCompleted ?? payload.settings.onboarding.completed);
            const shouldImportServerBackup =
              (!localHasMeaningfulState && serverHasMeaningfulState) ||
              serverPortfolioItemCount > localPortfolioItemCount ||
              (!(localBackup.settings.onboardingCompleted ?? localBackup.settings.onboarding.completed) &&
                Boolean(payload.settings.onboardingCompleted ?? payload.settings.onboarding.completed));

            if (shouldImportServerBackup) {
              try {
                const mergedPayload = mergeImportedBackupWithLocalMode({
                  localSettings: localBackup.settings,
                  serverBackup: payload,
                });

                importUserAccountBackup(currentUser, mergedPayload);
                shouldRefreshSession = true;
                localBackup = exportUserAccountBackup(currentUser);
                logWorkspaceHydration('restored', { source: 'server-backup' });
              } catch (error) {
                logWorkspaceHydration('fallback', {
                  source: 'server-backup',
                  reason: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        } catch (error) {
          logWorkspaceHydration('fallback', {
            source: 'server-backup',
            reason: error instanceof Error ? error.message : String(error),
          });
        }

        try {
          const { recovered } = recoverLegacyPortfolioForUser(currentUser);
          if (recovered) {
            shouldRefreshSession = true;
            localBackup = exportUserAccountBackup(currentUser);
            logWorkspaceHydration('restored', { source: 'legacy-portfolio' });
          }
        } catch (error) {
          logWorkspaceHydration('migration-failed', {
            source: 'legacy-portfolio',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      let normalizedSettings: AppSettings;
      try {
        normalizedSettings = normalizeUserOnboardingState(
          currentUser,
          localBackup.portfolio,
          localBackup.settings
        );
      } catch (error) {
        logWorkspaceHydration('fallback', {
          source: 'normalize-onboarding',
          reason: error instanceof Error ? error.message : String(error),
        });
        return { shouldRefreshSession };
      }

      try {
        if (JSON.stringify(normalizedSettings) !== JSON.stringify(localBackup.settings)) {
          saveUserSettings(currentUser, normalizedSettings);
          shouldRefreshSession = true;
          localBackup = exportUserAccountBackup(currentUser);
        }
      } catch (error) {
        logWorkspaceHydration('fallback', {
          source: 'settings-sync',
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      if (canAutoWrite) {
        try {
          await saveBackupToServer(localBackup);
        } catch {
          logWorkspaceHydration('skipped', { source: 'server-writeback' });
        }
      }

      return { shouldRefreshSession };
    },
    [canAutoWrite]
  );

  return { hydrateAccountWorkspace };
};

const mergeImportedBackupWithLocalMode = (args: {
  localSettings: AppSettings;
  serverBackup: UserAccountBackup;
}): UserAccountBackup => {
  const localSettings = args.localSettings;
  const serverBackup = args.serverBackup;

  return {
    ...serverBackup,
    settings: {
      ...serverBackup.settings,
      userMode: localSettings.userMode,
      dashboardSetupMode: localSettings.dashboardSetupMode,
      onboardingCompleted:
        localSettings.onboardingCompleted ??
        localSettings.onboarding.completed ??
        serverBackup.settings.onboardingCompleted,
      onboardingStep: localSettings.onboardingStep ?? serverBackup.settings.onboardingStep,
      onboarding: {
        ...serverBackup.settings.onboarding,
        ...localSettings.onboarding,
        trackingPreference: normalizeTrackingPreference(localSettings.onboarding.trackingPreference),
      },
      workspaceConfig: {
        ...serverBackup.settings.workspaceConfig,
        ...localSettings.workspaceConfig,
      },
    },
  };
};
