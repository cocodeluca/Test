import type { AppSettings, TrackingPreference, WorkspaceModule } from '../types/settings';
import { getModulesForTrackingPreference, normalizeTrackingPreference } from './appModes';
import { getVisibleWorkspaceModules } from './workspace';

export type WorkspaceDashboardVariant = 'properties-only' | 'portfolio';

export interface WorkspaceModeState {
  trackingPreference: TrackingPreference;
  visibleModules: WorkspaceModule[];
  dashboardVariant: WorkspaceDashboardVariant;
  isPropertiesOnlyMode: boolean;
  isBasicPropertyFlow: boolean;
}

export type WorkspacePageId = WorkspaceModule;

export const deriveWorkspaceModeState = (settings: AppSettings): WorkspaceModeState => {
  const trackingPreference = normalizeTrackingPreference(settings.onboarding.trackingPreference);
  const visibleModules = getVisibleWorkspaceModules(settings);

  return {
    trackingPreference,
    visibleModules,
    dashboardVariant: trackingPreference === 'properties-only' ? 'properties-only' : 'portfolio',
    isPropertiesOnlyMode: trackingPreference === 'properties-only',
    isBasicPropertyFlow:
      settings.userMode === 'basic' && trackingPreference !== 'full-portfolio',
  };
};

export const isWorkspacePageVisible = (
  page: WorkspacePageId,
  modeState: WorkspaceModeState
): boolean => page === 'settings' || modeState.visibleModules.includes(page);

export const getVisibleWorkspacePages = (modeState: WorkspaceModeState): WorkspacePageId[] =>
  modeState.visibleModules.filter((moduleId) => isWorkspacePageVisible(moduleId, modeState));

export const getWorkspaceDashboardVariant = (modeState: WorkspaceModeState): WorkspaceDashboardVariant =>
  modeState.dashboardVariant;

export const getWorkspaceModulesForTrackingPreference = (
  trackingPreference: TrackingPreference,
  userMode: 'basic' | 'advanced'
): WorkspaceModule[] => getModulesForTrackingPreference(trackingPreference, userMode);
