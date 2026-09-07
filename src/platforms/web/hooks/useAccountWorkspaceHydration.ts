import { useCallback } from 'react';
import type { WorkspaceConfig } from '../../../common/types/settings';
import {
  DEMO_ACCOUNT_EMAIL,
  loadUserPortfolioHydrationSnapshot,
  LocalAccountUser,
  UserAccountBackup,
  exportUserAccountBackup,
  importUserAccountBackup,
  normalizeDemoAccountState,
  normalizeUserOnboardingState,
  restoreUserRecoverySnapshotIfNeeded,
  saveUserSettings,
} from '../services/localAccountStore';
import { loadBackupFromServer } from '../services/accountBackupApi';
import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from '../services/portfolioPersistenceTrace';

type HydrationResult = {
  shouldRefreshSession: boolean;
};


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

export const hydrateAccountWorkspace = async (currentUser: LocalAccountUser): Promise<HydrationResult> => {
      tracePortfolioPersistence('hydration:start', { userId: currentUser.id, accountId: currentUser.id, indexedDbKey: currentUser.id });
      // Resolve local authority before any recovery or server writeback. Errors block bootstrap.
      const initial = await loadUserPortfolioHydrationSnapshot(currentUser.id);
      let shouldRefreshSession = false;
      if (currentUser.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL) {
        await normalizeDemoAccountState(currentUser);
        return { shouldRefreshSession: true };
      }
      if (!initial.storageExists) {
        const restored = await restoreUserRecoverySnapshotIfNeeded(currentUser);
        shouldRefreshSession = restored.restored;
      }
      let localBackup = await exportUserAccountBackup(currentUser);
      const resolved = await loadUserPortfolioHydrationSnapshot(currentUser.id);
      // Existing local snapshots, including intentional empty ones, win over remote copies.
      if (!resolved.storageExists) {
        let payload: UserAccountBackup | null = null;
        try {
          tracePortfolioPersistence('hydration:remote-load', { userId: currentUser.id, accountId: currentUser.id, indexedDbKey: currentUser.id });
          const response = await loadBackupFromServer(currentUser.email);
          if (!hasValidBackupShape(response.payload)) throw new Error('Invalid server backup');
          payload = response.payload;
        } catch (error) {
          // Only an explicit missing backup allows a new empty workspace.
          if (!(error instanceof Error) || !error.message.includes('No server backup found')) throw error;
        }
        if (payload) {
          if (payload.user.email.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()) throw new Error('Backup account mismatch');
          await importUserAccountBackup(currentUser, payload);
          localBackup = await exportUserAccountBackup(currentUser);
          shouldRefreshSession = true;
        }
      }
      const normalizedSettings = normalizeUserOnboardingState(currentUser, localBackup.portfolio, localBackup.settings);
      if (JSON.stringify(normalizedSettings) !== JSON.stringify(localBackup.settings)) {
        saveUserSettings(currentUser, normalizedSettings);
        shouldRefreshSession = true;
      }

      const completed = await loadUserPortfolioHydrationSnapshot(currentUser.id);
      tracePortfolioPersistence('hydration:complete', getPortfolioSnapshotTraceMetadata(currentUser.id, completed.portfolio, {
        accountId: currentUser.id,
        indexedDbKey: currentUser.id,
      }));
      return { shouldRefreshSession };
};

export const useAccountWorkspaceHydration = () => ({
  hydrateAccountWorkspace: useCallback(hydrateAccountWorkspace, []),
});
