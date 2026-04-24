import type { TrackingPreference, WorkspaceModule } from '../types/settings';

const VALID_TRACKING_PREFERENCES: TrackingPreference[] = [
  'properties-only',
  'properties-and-rent',
  'properties-and-mortgages',
  'full-portfolio',
];

export const normalizeTrackingPreference = (
  trackingPreference: string | null | undefined
): TrackingPreference => {
  if (trackingPreference && VALID_TRACKING_PREFERENCES.includes(trackingPreference as TrackingPreference)) {
    return trackingPreference as TrackingPreference;
  }

  return 'properties-only';
};

export const getModulesForTrackingPreference = (
  trackingPreference: TrackingPreference,
  userMode: 'basic' | 'advanced'
): WorkspaceModule[] => {
  if (userMode === 'advanced') {
    return [
      'dashboard',
      'cash-accounts',
      'opportunities',
      'properties',
      'projects',
      'budgets',
      'mortgages',
      'documents',
      'reports',
      'tasks',
      'settings',
    ];
  }

  switch (trackingPreference) {
    case 'properties-only':
      return ['dashboard', 'properties', 'settings'];
    case 'properties-and-rent':
      return ['dashboard', 'properties', 'settings'];
    case 'properties-and-mortgages':
      return ['dashboard', 'properties', 'mortgages', 'settings'];
    case 'full-portfolio':
    default:
      return ['dashboard', 'properties', 'mortgages', 'cash-accounts', 'settings'];
  }
};

export const usesBasicPropertyFlow = (
  userMode: 'basic' | 'advanced',
  trackingPreference: TrackingPreference
) => userMode === 'basic' && trackingPreference !== 'full-portfolio';
