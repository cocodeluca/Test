import type { TrackingPreference, UserMode, WorkspaceModule } from '../../../common/types/settings';

export interface UseCaseOption {
  id: string;
  title: string;
  description: string;
  helper?: string;
  badge?: string;
  modules: string[];
  trackingPreference: TrackingPreference;
  userMode: UserMode;
  enabledModules: WorkspaceModule[];
}

export const buildUseCaseOptions = (
  t: (key: string) => string
): UseCaseOption[] => [
  {
    id: 'properties-and-rent',
    title: t('tutorial.useCasePrompt.propertyRentalTitle'),
    description: t('tutorial.useCasePrompt.propertyRentalDescription'),
    helper: t('tutorial.useCasePrompt.propertyRentalHelper'),
    badge: t('tutorial.useCasePrompt.propertyRentalBadge'),
    modules: [t('nav.dashboard'), t('nav.properties'), t('nav.settings')],
    trackingPreference: 'properties-and-rent',
    userMode: 'basic',
    enabledModules: ['dashboard', 'properties', 'settings'],
  },
  {
    id: 'properties-and-mortgages',
    title: t('tutorial.useCasePrompt.propertyMortgageTitle'),
    description: t('tutorial.useCasePrompt.propertyMortgageDescription'),
    helper: t('tutorial.useCasePrompt.propertyMortgageHelper'),
    modules: [t('nav.dashboard'), t('nav.properties'), t('nav.mortgages'), t('nav.settings')],
    trackingPreference: 'properties-and-mortgages',
    userMode: 'basic',
    enabledModules: ['dashboard', 'properties', 'mortgages', 'settings'],
  },
  {
    id: 'properties-mortgages-cash',
    title: t('tutorial.useCasePrompt.propertyMortgageCashTitle'),
    description: t('tutorial.useCasePrompt.propertyMortgageCashDescription'),
    helper: t('tutorial.useCasePrompt.propertyMortgageCashHelper'),
    modules: [t('nav.dashboard'), t('nav.properties'), t('nav.mortgages'), t('nav.cashAccounts'), t('nav.settings')],
    trackingPreference: 'full-portfolio',
    userMode: 'basic',
    enabledModules: ['dashboard', 'properties', 'mortgages', 'cash-accounts', 'settings'],
  },
  {
    id: 'full-portfolio',
    title: t('tutorial.useCasePrompt.fullPortfolioTitle'),
    description: t('tutorial.useCasePrompt.fullPortfolioDescription'),
    helper: t('tutorial.useCasePrompt.fullPortfolioHelper'),
    badge: t('tutorial.useCasePrompt.fullPortfolioBadge'),
    modules: [t('nav.dashboard'), t('nav.properties'), t('nav.mortgages'), t('nav.cashAccounts'), t('nav.reports'), t('nav.settings')],
    trackingPreference: 'full-portfolio',
    userMode: 'advanced',
    enabledModules: ['dashboard', 'properties', 'mortgages', 'cash-accounts', 'reports', 'settings'],
  },
];

export const resolveUseCaseOptionById = (
  options: UseCaseOption[],
  optionId: string | null | undefined
): UseCaseOption | null => options.find((option) => option.id === optionId) ?? null;

export const getAdvancedDemoUseCaseOption = (options: UseCaseOption[]): UseCaseOption =>
  options.find((option) => option.id === 'full-portfolio') ??
  options.find((option) => option.userMode === 'advanced') ??
  options[0];
