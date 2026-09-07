import { createPortfolioPersistence, type PersistenceStatus } from './services/portfolioPersistence';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DemoGuidedTutorial, DemoTutorialStep } from '../web/components/DemoGuidedTutorial';
import { AppPageRenderer } from '../web/components/AppPageRenderer';
import { AppSafetyProvider, useAppSafety } from './context/AppSafetyContext';
import { useAuthBootstrapController } from './hooks/useAuthBootstrapController';
import { LanguageSelectionStep } from '../web/components/LanguageSelectionStep';
import { UseCaseSelectionStep } from '../web/components/UseCaseSelectionStep';
import { SettingsProvider } from '../web/context/SettingsContext';
import { useSettings } from '../web/context/SettingsContext';
import { AppErrorBoundary } from '../web/components/AppErrorBoundary';
import { SectionCrashBoundary } from '../web/components/SectionCrashBoundary';
import {
  CashAccount,
  BankConnection,
  InvestmentReport,
  InvestmentReportTemplate,
  InvestmentAccount,
  Mortgage,
  Opportunity,
  Property,
  ReportBrandingConfig,
  RehabProject,
} from '../../common/types';
import type {
  AppLanguage,
  DisplayCurrency,
  OnboardingStep,
  UserOnboardingProfile,
  WorkspaceConfig,
  WorkspaceModule,
} from '../../common/types/settings';
import { normalizeProperties, normalizePropertyRecord } from '../../common/utils/calculations';
import { createManualProperty } from '../../common/utils/manualProperty';
import { assertValidPropertyFinancialValues } from '../../common/utils/financialValidation';
import {
  addMortgageRelationship,
  deleteMortgageRelationship,
  editMortgageRelationship,
  synchronizeMortgageProperties,
} from '../../common/utils/mortgageRelationships';
import {
  mergeChangedPropertyFields,
  replacePropertyRecord,
} from '../../common/utils/propertyEdits';
import { getPendingOnboardingStep } from '../../common/utils/onboarding';
import { enrichOpportunity } from '../../common/utils/opportunities';
import { enrichRehabProject } from '../../common/utils/rehabProjects';
import {
  createReportFromSource,
  defaultReportBranding,
  defaultReportTemplates,
} from '../../common/utils/reports';
import {
  mockCashAccounts,
  mockMortgages,
  mockProperties,
} from '../../common/data/mockData';
import {
  createMinimalWorkspaceConfig,
} from '../../common/utils/workspace';
import {
  deriveWorkspaceModeState,
  isWorkspacePageVisible,
  type WorkspaceModeState,
} from '../../common/utils/workspaceMode';
import {
  buildUseCaseOptions,
  getAdvancedDemoUseCaseOption,
  resolveUseCaseOptionById,
  type UseCaseOption,
} from './utils/useCaseCatalog';
import { fetchEtoroAccountSnapshot } from './services/brokers';
import {
  getPortfolioAutosaveDecision,
  LocalAccountUser,
  makeUserSettingsStorageKey,
  resetDemoAccountData,
  importUserAccountBackup,
  saveUserRecoverySnapshot,
  DEMO_ACCOUNT_EMAIL,
  UserPortfolioData,
  UserPortfolioHydrationSnapshot,
  serializeUserPortfolioForPersistence,
  safeJsonParse,
  safeJsonStringify,
} from './services/localAccountStore';
import {
  hasStoredUseCaseSelection,
  getStoredSelectedUseCaseId,
  setStoredUseCaseSelection,
  setStoredSelectedUseCaseId,
} from '../../common/utils/settingsStore';
import { loadBackupFromServer, saveBackupToServer } from './services/accountBackupApi';
import '../web/styles/index.css';
import { translateCurrentLanguage } from '../web/i18n/translations';
import { GALLERY_SAFE_MODE } from './utils/gallerySafeMode';
import { APP_RECOVERY_MODE } from './utils/appRecoveryMode';
import { migrateLegacyGalleryUrls } from './services/galleryMediaStore';
import { getPortfolioSnapshotTraceMetadata, tracePortfolioPersistence } from './services/portfolioPersistenceTrace';

const Layout = lazy(() => import('../web/components/Layout').then((module) => ({ default: module.Layout })));
const AuthScreen = lazy(() =>
  import('../web/components/AuthScreen').then((module) => ({ default: module.AuthScreen }))
);
const PostSignupWorkspaceSetup = lazy(() =>
  import('../web/components/PostSignupWorkspaceSetup').then((module) => ({
    default: module.PostSignupWorkspaceSetup,
  }))
);
const BasicModeSetupWizard = lazy(() =>
  import('../web/components/BasicModeSetupWizard').then((module) => ({
    default: module.BasicModeSetupWizard,
  }))
);

type PageType =
  | 'dashboard'
  | 'cash-accounts'
  | 'properties'
  | 'mortgages'
  | 'opportunities'
  | 'projects'
  | 'budgets'
  | 'documents'
  | 'tasks'
  | 'reports'
  | 'settings';

const createEtoroInvestmentAccount = (id = 'investment-etoro'): InvestmentAccount => ({
  id,
  name: 'Broker account',
  balance: 0,
  currency: 'USD',
  isManual: false,
  type: 'broker',
  provider: 'etoro',
  syncStatus: 'idle',
  dailyChangePct: null,
  lastSyncedAt: null,
  lastSuccessfulBalance: null,
  syncError: null,
});

const isLegacyManualInvestmentPlaceholder = (account: InvestmentAccount): boolean =>
  account.provider !== 'etoro' &&
  account.isManual &&
  account.id === 'inv-1' &&
  account.name === 'Investments';

const DEMO_TUTORIAL_DISMISSED_KEY = 're-portfolio-demo-tutorial-dismissed';
const DEMO_TUTORIAL_RESTART_REQUEST_KEY = 're-portfolio-demo-tutorial-restart-request';
const DEMO_TUTORIAL_ADVANCED_SESSION_KEY = 're-portfolio-demo-advanced-session';
const EMERGENCY_SAFE_MODE = false;
const NORMAL_MODE_LOG_PREFIX = '[normal-mode]';
interface DemoTutorialContext {
  modeState: WorkspaceModeState;
}

interface DemoSessionSettingsSnapshot {
  userMode: 'basic' | 'advanced';
  dashboardSetupMode: 'simple' | 'connected';
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep | null;
  onboarding: UserOnboardingProfile;
  workspaceConfig: WorkspaceConfig;
}

interface TutorialUiState {
  page: PageType;
  propertyTab:
    | 'summary'
    | 'overview'
    | 'finances'
    | 'mortgage'
    | 'documents'
    | 'tax'
    | 'taxes'
    | 'notes'
    | 'gallery'
    | null;
  quickCreateOpen: boolean | null;
  quickCreateStep: number | null;
}

interface TutorialTargetResolution {
  status: 'pending' | 'ready' | 'timed-out';
  attempts: number;
}

interface ActiveDemoTutorialStep extends DemoTutorialStep {
  masterIndex: number;
  visibleIndex: number;
}

interface OnboardingDemoFlowState {
  shouldShowLanguageSelection: boolean;
  shouldShowUseCaseSelection: boolean;
  shouldShowPersonalization: boolean;
  shouldShowTutorial: boolean;
  shouldStartGuidedDemoPreview: boolean;
}

const DEMO_TUTORIAL_TARGET_RETRY_LIMIT = 12;
const DEMO_TUTORIAL_TARGET_RETRY_DELAY_MS = 250;
const ENABLE_LOCAL_RECOVERY_SNAPSHOT_WRITEBACK = false;
const DEMO_SESSION_LOG_PREFIX = '[demo-restore]';
const USECASE_RESTORE_LOG_PREFIX = '[usecase-restore]';
const BOOT_LOG_PREFIX = '[boot]';

const safeDemoStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} localStorage get failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const safeDemoStorageSet = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} localStorage set failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const safeDemoStorageRemove = (key: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} localStorage remove failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const safeUseCaseStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`${USECASE_RESTORE_LOG_PREFIX} localStorage get failed`, {
      outcome: 'fallback',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const safeUseCaseStorageRemove = (key: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`${USECASE_RESTORE_LOG_PREFIX} localStorage remove failed`, {
      outcome: 'fallback',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const readPersistedUseCaseId = (storageKey: string): string | null => {
  const rawValue = safeUseCaseStorageGet(storageKey);

  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return typeof parsedValue === 'string' && parsedValue.trim().length > 0 ? parsedValue : null;
  } catch (error) {
    console.warn(`${USECASE_RESTORE_LOG_PREFIX} invalid`, {
      outcome: 'invalid',
      error: error instanceof Error ? error.message : String(error),
    });
    safeUseCaseStorageRemove(storageKey);
    return null;
  }
};

const isCompatibleUseCaseOption = (
  candidateId: string,
  useCaseOptions: UseCaseOption[],
  isDemoUser: boolean
): boolean => {
  const option = resolveUseCaseOptionById(useCaseOptions, candidateId);
  if (!option) {
    return false;
  }

  if (isDemoUser && option.userMode !== 'advanced') {
    return false;
  }

  return true;
};

const deriveOnboardingDemoFlowState = (args: {
  isDemoUser: boolean;
  hasExplicitLanguageSelection: boolean;
  hasStoredUseCaseSelection: boolean;
  personalizationCompletedThisSession: boolean;
  showLanguageSelectionStep: boolean;
  showUseCaseSelectionStep: boolean;
  demoTutorialDismissed: boolean;
  demoPreviewState: DemoPreviewState | null;
  activeTutorialStepId: string | null;
}): OnboardingDemoFlowState => {
  const isPersonalizationVisible =
    args.showLanguageSelectionStep || args.showUseCaseSelectionStep;
  const shouldShowPersonalization =
    args.isDemoUser &&
    !args.personalizationCompletedThisSession &&
    !args.demoTutorialDismissed &&
    (!args.hasExplicitLanguageSelection || !args.hasStoredUseCaseSelection || isPersonalizationVisible);

  const shouldShowLanguageSelection =
    shouldShowPersonalization &&
    (!args.hasExplicitLanguageSelection || !args.hasStoredUseCaseSelection || args.showLanguageSelectionStep);

  const shouldShowUseCaseSelection =
    shouldShowPersonalization &&
    (args.hasExplicitLanguageSelection || args.hasStoredUseCaseSelection || args.showUseCaseSelectionStep);

  const shouldShowTutorial =
    Boolean(args.activeTutorialStepId) && !shouldShowPersonalization && !shouldShowLanguageSelection;

  const shouldStartGuidedDemoPreview =
    args.isDemoUser &&
    args.demoPreviewState?.mode === 'guided' &&
    !shouldShowPersonalization &&
    !shouldShowTutorial;

  return {
    shouldShowLanguageSelection,
    shouldShowUseCaseSelection,
    shouldShowPersonalization,
    shouldShowTutorial,
    shouldStartGuidedDemoPreview,
  };
};

const cloneDemoValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const buildDemoTutorialStepGroups = (
  t: (key: string, replacements?: Record<string, string | number>) => string
) => ({
  dashboard: [
    {
      id: 'intro',
      title: t('tutorial.steps.introTitle'),
      description: t('tutorial.steps.introDescription'),
    },
  ],
  properties: [
    {
      id: 'open-properties',
      title: t('tutorial.steps.openPropertiesTitle'),
      description: t('tutorial.steps.openPropertiesDescription'),
      targetId: 'nav-properties',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickProperties'),
    },
  ],
  propertySummary: [
    {
      id: 'review-property-summary',
      title: t('tutorial.steps.reviewPropertySummaryTitle'),
      description: t('tutorial.steps.reviewPropertySummaryDescription'),
      targetId: 'property-summary-overview',
    },
  ],
  propertyForm: [
    {
      id: 'open-add-property',
      title: t('tutorial.steps.openAddPropertyTitle'),
      description: t('tutorial.steps.openAddPropertyDescription'),
      targetId: 'properties-add',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickAddProperty'),
    },
    {
      id: 'example-name',
      title: t('tutorial.steps.exampleNameTitle'),
      description: t('tutorial.steps.exampleNameDescription'),
      targetId: 'form-property-name',
      example: t('tutorial.examples.propertyName'),
    },
    {
      id: 'example-rent',
      title: t('tutorial.steps.exampleRentTitle'),
      description: t('tutorial.steps.exampleRentDescription'),
      targetId: 'form-monthly-rent',
      example: t('tutorial.examples.monthlyRent'),
    },
    {
      id: 'example-expenses',
      title: t('tutorial.steps.exampleExpensesTitle'),
      description: t('tutorial.steps.exampleExpensesDescription'),
      targetId: 'form-monthly-expenses',
      example: t('tutorial.examples.monthlyExpenses'),
    },
    {
      id: 'example-results',
      title: t('tutorial.steps.exampleResultsTitle'),
      description: t('tutorial.steps.exampleResultsDescription'),
      targetId: 'form-live-results',
      example: t('tutorial.examples.liveResults'),
    },
  ],
  mortgages: [
    {
      id: 'open-mortgages',
      title: t('tutorial.steps.openMortgagesTitle'),
      description: t('tutorial.steps.openMortgagesDescription'),
      targetId: 'nav-mortgages',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickMortgages'),
    },
    {
      id: 'review-mortgage-link',
      title: t('tutorial.steps.reviewMortgageLinkTitle'),
      description: t('tutorial.steps.reviewMortgageLinkDescription'),
      targetId: 'mortgages-add',
    },
  ],
  cash: [
    {
      id: 'open-cash-accounts',
      title: t('tutorial.steps.openCashAccountsTitle'),
      description: t('tutorial.steps.openCashAccountsDescription'),
      targetId: 'nav-cash-accounts',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickCashAccounts'),
    },
  ],
  reports: [
    {
      id: 'open-reports',
      title: t('tutorial.steps.openReportsTitle'),
      description: t('tutorial.steps.openReportsDescription'),
      targetId: 'nav-reports',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickReports'),
    },
  ],
  settings: [
    {
      id: 'open-settings',
      title: t('tutorial.steps.openSettingsTitle'),
      description: t('tutorial.steps.openSettingsDescription'),
      targetId: 'nav-settings',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickSettings'),
    },
  ],
  returns: [
    {
      id: 'return-properties',
      title: t('tutorial.steps.returnPropertiesTitle'),
      description: t('tutorial.steps.returnPropertiesDescription'),
      targetId: 'nav-properties',
      requiresAction: true,
      actionLabel: t('tutorial.actions.clickPropertiesAgain'),
    },
  ],
  finish: [
    {
      id: 'finish',
      title: t('tutorial.steps.finishTitle'),
      description: t('tutorial.steps.finishDescription'),
    },
  ],
});

const getDemoTutorialMasterSteps = (
  t: (key: string, replacements?: Record<string, string | number>) => string
) => {
  const groups = buildDemoTutorialStepGroups(t);
  return [
    ...groups.dashboard,
    ...groups.properties,
    ...groups.propertyForm,
    ...groups.mortgages,
    ...groups.cash,
    ...groups.reports,
    ...groups.returns,
    ...groups.propertySummary,
    ...groups.settings,
    ...groups.finish,
  ];
};

const isDemoTutorialStepVisible = (
  step: DemoTutorialStep,
  context: DemoTutorialContext
) => {
  const hasModule = (moduleId: WorkspaceModule) => context.modeState.visibleModules.includes(moduleId);
  const isSimpleTracking = context.modeState.isBasicPropertyFlow;
  const includesMortgages = hasModule('mortgages');
  const includesCash = hasModule('cash-accounts');
  const includesReports = hasModule('reports');
  const hasProperties = hasModule('properties');

  switch (step.id) {
    case 'intro':
      return true;
    case 'open-properties':
    case 'review-property-summary':
      return hasProperties;
    case 'open-add-property':
    case 'example-name':
    case 'example-rent':
    case 'example-expenses':
    case 'example-results':
      return isSimpleTracking && hasProperties;
    case 'open-mortgages':
    case 'review-mortgage-link':
      return includesMortgages;
    case 'open-cash-accounts':
      return includesCash;
    case 'open-reports':
      return includesReports;
    case 'return-properties':
      return !isSimpleTracking && hasProperties && (includesMortgages || includesCash || includesReports);
    case 'open-settings':
      return hasModule('settings');
    case 'finish':
      return true;
    default:
      return true;
  }
};

const resolveTutorialStepUiState = (
  step: DemoTutorialStep | null,
  context: DemoTutorialContext
): TutorialUiState | null => {
  if (!step) {
    return null;
  }

  const includesCash = context.modeState.visibleModules.includes('cash-accounts');
  const includesReports = context.modeState.visibleModules.includes('reports');

  switch (step.id) {
    case 'intro':
      return { page: 'dashboard', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'open-properties':
      return { page: 'dashboard', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'open-add-property':
      return { page: 'properties', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'example-name':
      return { page: 'properties', propertyTab: null, quickCreateOpen: true, quickCreateStep: 1 };
    case 'example-rent':
      return { page: 'properties', propertyTab: null, quickCreateOpen: true, quickCreateStep: 2 };
    case 'example-expenses':
      return { page: 'properties', propertyTab: null, quickCreateOpen: true, quickCreateStep: 3 };
    case 'example-results':
      return { page: 'properties', propertyTab: null, quickCreateOpen: true, quickCreateStep: 4 };
    case 'open-mortgages':
      return { page: 'properties', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'review-mortgage-link':
      return { page: 'mortgages', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'open-cash-accounts':
      return { page: 'mortgages', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    case 'open-reports':
      return {
        page: includesCash ? 'cash-accounts' : 'mortgages',
        propertyTab: null,
        quickCreateOpen: false,
        quickCreateStep: null,
      };
    case 'return-properties':
      return {
        page: includesReports ? 'reports' : includesCash ? 'cash-accounts' : 'mortgages',
        propertyTab: null,
        quickCreateOpen: false,
        quickCreateStep: null,
      };
    case 'review-property-summary':
      return { page: 'properties', propertyTab: 'summary', quickCreateOpen: false, quickCreateStep: null };
    case 'open-settings':
      return { page: 'properties', propertyTab: 'summary', quickCreateOpen: false, quickCreateStep: null };
    case 'finish':
      return { page: 'settings', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
    default:
      return { page: 'dashboard', propertyTab: null, quickCreateOpen: false, quickCreateStep: null };
  }
};

interface WebAppShellProps {
  user: LocalAccountUser;
  portfolioHydration: UserPortfolioHydrationSnapshot;
  onLogout: (backup: import('./services/localAccountStore').UserAccountBackup) => Promise<void>;
}

interface DemoPreviewState {
  portfolio: UserPortfolioData;
  mode: 'guided' | 'explore';
}

type StarterPath = 'manual-property' | 'import-file' | 'explore-demo';

const createStarterDemoProperty = (): Property =>
  createManualProperty(
    {
      operatingCurrency: 'EUR',
      propertyValueCurrency: 'EUR',
      name: 'Starter Rental Demo',
      address: 'Calle del Sol 18',
      city: 'Valencia',
      country: 'Spain',
      propertyType: 'Apartment',
      estimatedPropertyValue: 148000,
      monthlyRent: 910,
      monthlyExpenses: 95,
      monthlyInsurance: 18,
      monthlyTaxes: 22,
      notes:
        'A simple sample property to explore the manual landlord flow without mortgages or uploaded files.',
    },
    {
      id: 'starter-demo-property',
      builtAreaSqm: 68,
      bedrooms: 2,
      bathrooms: 1,
      imageUrl: '',
      imageUrls: [],
    }
  );

const createDemoInvestmentAccount = (): InvestmentAccount => ({
  id: 'demo-investment-account',
  name: 'Global ETF Portfolio',
  balance: 24500,
  currency: 'USD',
  isManual: true,
  type: 'etf',
  provider: 'manual',
  syncStatus: 'idle',
  dailyChangePct: 1.8,
  lastSyncedAt: null,
  lastSuccessfulBalance: 24500,
  syncError: null,
});

const createDemoPortfolioForUseCase = (
  option: UseCaseOption,
  createdBy: string
): UserPortfolioData => {
  const includesMortgages = option.enabledModules.includes('mortgages');
  const includesCash = option.enabledModules.includes('cash-accounts');
  const includesReports = option.enabledModules.includes('reports');
  const baseProperties = includesMortgages
    ? cloneDemoValue(mockProperties.slice(0, includesReports ? 2 : 1)).map((property) =>
        normalizePropertyRecord(property)
      )
    : [normalizePropertyRecord(createStarterDemoProperty())];
  const propertyIds = new Set(baseProperties.map((property) => property.id));
  const mortgages = includesMortgages
    ? cloneDemoValue(
        mockMortgages.filter((mortgage) => propertyIds.has(mortgage.propertyId))
      )
    : [];
  const cashAccounts = includesCash ? cloneDemoValue(mockCashAccounts) : [];
  const investmentAccounts = includesReports ? [createDemoInvestmentAccount()] : [];
  const reportTemplates = cloneDemoValue(defaultReportTemplates);
  const reportBranding = cloneDemoValue(defaultReportBranding);
  const reports =
    includesReports && baseProperties[0]
      ? [
          createReportFromSource(
            'property',
            baseProperties[0],
            createdBy,
            reportTemplates,
            reportBranding
          ),
        ]
      : [];

  return {
    properties: baseProperties,
    mortgages,
    cashAccounts,
    bankConnections: [],
    investmentAccounts,
    opportunities: [],
    rehabProjects: [],
    reports,
    reportTemplates,
    reportBranding,
  };
};

const createOnboardingWorkspaceConfig = (
  userId: string,
  userMode: 'basic' | 'advanced',
  enabledModules: WorkspaceModule[]
): WorkspaceConfig => {
  const baseConfig = createMinimalWorkspaceConfig(userId, 'portfolio-tracking');

  return {
    ...baseConfig,
    enabledModules,
    sidebarOrder: enabledModules,
    hiddenModules: [],
    dashboardSections: [
      {
        id: 'starter',
        title: 'Starter',
        cards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
      },
    ],
    preferredDashboardCards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
    preferredCards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
    pinnedKpis: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
    secondaryKpis: [],
    kpiOrder: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
    defaultLandingModule: 'dashboard',
    primaryStrategy: userMode === 'advanced' ? 'portfolio-tracking' : baseConfig.primaryStrategy,
    userOverrides: {
      ...baseConfig.userOverrides,
      modulesChanged: true,
      landingPageChanged: true,
    },
  };
};

const WebAppShell = ({ user, portfolioHydration, onLogout }: WebAppShellProps) => {
  const { canAutoWrite, isBootSettled, appRecoveryMode } = useAppSafety();
  const { settings, hasExplicitLanguageSelection, updateSettings, t } = useSettings();
  const initialPortfolioData = portfolioHydration.portfolio;
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [pendingStarterPath, setPendingStarterPath] = useState<StarterPath | null>(null);
  const [demoPreviewState, setDemoPreviewState] = useState<DemoPreviewState | null>(null);
  const [activeTutorialStepId, setActiveTutorialStepId] = useState<string | null>(null);
  const [isPreparingDemoSession, setIsPreparingDemoSession] = useState(false);
  const [tutorialTargetResolution, setTutorialTargetResolution] = useState<TutorialTargetResolution>({
    status: 'pending',
    attempts: 0,
  });
  const [properties, setProperties] = useState<Property[]>(initialPortfolioData.properties);
  const [mortgages, setMortgages] = useState<Mortgage[]>(initialPortfolioData.mortgages);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>(initialPortfolioData.cashAccounts);
  const [bankConnections, setBankConnections] = useState<BankConnection[]>(
    initialPortfolioData.bankConnections ?? []
  );
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>(
    initialPortfolioData.investmentAccounts
  );
  const [opportunities, setOpportunities] = useState<Opportunity[]>(
    initialPortfolioData.opportunities ?? []
  );
  const [rehabProjects, setRehabProjects] = useState<RehabProject[]>(
    initialPortfolioData.rehabProjects ?? []
  );
  const [reports, setReports] = useState<InvestmentReport[]>(
    initialPortfolioData.reports ?? []
  );
  const [reportTemplates, setReportTemplates] = useState<InvestmentReportTemplate[]>(
    initialPortfolioData.reportTemplates ?? defaultReportTemplates
  );
  const [reportBranding, setReportBranding] = useState<ReportBrandingConfig>(
    initialPortfolioData.reportBranding ?? defaultReportBranding
  );
  useEffect(() => {
    console.info(`${BOOT_LOG_PREFIX} router mounted`);
  }, []);
  useEffect(() => {
    console.info(`${BOOT_LOG_PREFIX} app shell rendered`);
  }, []);
  const isDemoUser = user.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
  const isDemoPreviewActive = demoPreviewState !== null;
  const workspaceModeState = useMemo(() => deriveWorkspaceModeState(settings), [settings]);
  const { visibleModules, trackingPreference, isPropertiesOnlyMode } = workspaceModeState;
  const demoTutorialMasterSteps = useMemo(() => getDemoTutorialMasterSteps(t), [t]);
  const activeDemoTutorialSteps = useMemo<ActiveDemoTutorialStep[]>(
    () =>
      demoTutorialMasterSteps.reduce<ActiveDemoTutorialStep[]>((steps, step, masterIndex) => {
        if (
          !isDemoTutorialStepVisible(step, {
            modeState: workspaceModeState,
          })
        ) {
          return steps;
        }

        steps.push({
          ...step,
          masterIndex,
          visibleIndex: steps.length,
        });

        return steps;
      }, []),
    [demoTutorialMasterSteps, workspaceModeState]
  );
  const [showLanguageSelectionStep, setShowLanguageSelectionStep] = useState(false);
  const [showUseCaseSelectionStep, setShowUseCaseSelectionStep] = useState(false);
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string | null>(null);
  const [personalizationCompletedThisSession, setPersonalizationCompletedThisSession] =
    useState(false);
  const personalizationCompletedThisSessionRef = useRef(false);
  const demoTutorialDismissedStorageKey = `${DEMO_TUTORIAL_DISMISSED_KEY}:${user.email.toLowerCase()}`;
  const demoTutorialRestartRequestStorageKey = `${DEMO_TUTORIAL_RESTART_REQUEST_KEY}:${user.email.toLowerCase()}`;
  const demoTutorialAdvancedSessionStorageKey = `${DEMO_TUTORIAL_ADVANCED_SESSION_KEY}:${user.email.toLowerCase()}`;
  const firstDemoTutorialStepId = activeDemoTutorialSteps[0]?.id ?? null;
  const useCaseOptions = useMemo(() => buildUseCaseOptions(t), [t]);
  useEffect(() => {
    if (GALLERY_SAFE_MODE) {
      return;
    }
  }, [
    bankConnections,
    cashAccounts,
    investmentAccounts,
    mortgages,
    opportunities,
    properties,
    rehabProjects,
    reportBranding,
    reportTemplates,
    reports,
    user.id,
  ]);
  const selectedUseCaseOption = useMemo(
    () => resolveUseCaseOptionById(useCaseOptions, selectedUseCaseId),
    [selectedUseCaseId, useCaseOptions]
  );
  const advancedDemoOption = useMemo(
    () => getAdvancedDemoUseCaseOption(useCaseOptions),
    [useCaseOptions]
  );
  const demoTutorialDismissed = useMemo(() => {
    return safeDemoStorageGet(demoTutorialDismissedStorageKey) !== null;
  }, [demoTutorialDismissedStorageKey]);
  const markPersonalizationCompletedThisSession = useCallback(() => {
    personalizationCompletedThisSessionRef.current = true;
    setPersonalizationCompletedThisSession(true);
  }, []);
  const resetPersonalizationSessionGate = useCallback(() => {
    personalizationCompletedThisSessionRef.current = false;
    setPersonalizationCompletedThisSession(false);
  }, []);
  const onboardingDemoFlow = useMemo(
    () =>
      deriveOnboardingDemoFlowState({
        isDemoUser,
        hasExplicitLanguageSelection,
        hasStoredUseCaseSelection: hasStoredUseCaseSelection(makeUserSettingsStorageKey(user.id)),
        personalizationCompletedThisSession,
        showLanguageSelectionStep,
        showUseCaseSelectionStep,
        demoTutorialDismissed,
        demoPreviewState,
        activeTutorialStepId,
      }),
    [
      activeTutorialStepId,
      demoPreviewState,
      demoTutorialDismissed,
      hasExplicitLanguageSelection,
      isDemoUser,
      personalizationCompletedThisSession,
      showLanguageSelectionStep,
      showUseCaseSelectionStep,
      user.id,
    ]
  );
  const tutorialTargetRetryRef = useRef<{ stepId: string | null; attempts: number; timer: number | null }>(
    { stepId: null, attempts: 0, timer: null }
  );
  const isAdvancedDemoLayoutReady =
    settings.userMode === 'advanced' &&
    settings.dashboardSetupMode === 'connected' &&
    trackingPreference === advancedDemoOption.trackingPreference;
  const beginForcedAdvancedDemoSession = useCallback(
    (persistUseCaseSelection = true) => {
      const hasSnapshot = safeDemoStorageGet(demoTutorialAdvancedSessionStorageKey);

      if (!hasSnapshot) {
          const snapshot: DemoSessionSettingsSnapshot = {
            userMode: settings.userMode,
            dashboardSetupMode: settings.dashboardSetupMode,
            onboardingCompleted: settings.onboardingCompleted ?? settings.onboarding.completed,
            onboardingStep: settings.onboardingStep ?? null,
            onboarding: settings.onboarding,
            workspaceConfig: settings.workspaceConfig,
          };

          const serializedSnapshot = safeJsonStringify(snapshot);
          if (serializedSnapshot) {
            safeDemoStorageSet(demoTutorialAdvancedSessionStorageKey, serializedSnapshot);
          }
        }

      updateSettings({
        userMode: 'advanced',
        dashboardSetupMode: 'connected',
        onboardingCompleted: true,
        onboardingStep: null,
        onboarding: {
          ...settings.onboarding,
          completed: true,
          trackingPreference: advancedDemoOption.trackingPreference,
        },
        workspaceConfig: createOnboardingWorkspaceConfig(
          user.id,
          'advanced',
          advancedDemoOption.enabledModules
        ),
      });

      if (persistUseCaseSelection) {
        setStoredUseCaseSelection(makeUserSettingsStorageKey(user.id), true);
      }
    },
    [
      advancedDemoOption.enabledModules,
      advancedDemoOption.trackingPreference,
      demoTutorialAdvancedSessionStorageKey,
      settings.dashboardSetupMode,
      settings.onboarding,
      settings.onboardingCompleted,
      settings.onboardingStep,
      settings.userMode,
      settings.workspaceConfig,
      updateSettings,
      user.id,
    ]
  );
  const endForcedAdvancedDemoSession = useCallback(() => {
    const storedSnapshot = safeDemoStorageGet(demoTutorialAdvancedSessionStorageKey);

    if (!storedSnapshot) {
      return;
    }

    safeDemoStorageRemove(demoTutorialAdvancedSessionStorageKey);

    if (isDemoUser) {
      return;
    }

    try {
      const snapshot = safeJsonParse<DemoSessionSettingsSnapshot | null>(storedSnapshot, null);

      if (
        !snapshot ||
        !snapshot.userMode ||
        !snapshot.dashboardSetupMode ||
        !snapshot.onboarding ||
        !snapshot.workspaceConfig
      ) {
        console.warn(`${DEMO_SESSION_LOG_PREFIX} ignored malformed demo session snapshot`);
        return;
      }

      updateSettings({
        userMode: snapshot.userMode,
        dashboardSetupMode: snapshot.dashboardSetupMode,
        onboardingCompleted: snapshot.onboardingCompleted,
        onboardingStep: snapshot.onboardingStep,
        onboarding: snapshot.onboarding,
        workspaceConfig: snapshot.workspaceConfig,
      });
    } catch (error) {
      console.warn(`${DEMO_SESSION_LOG_PREFIX} failed to restore demo session snapshot`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [demoTutorialAdvancedSessionStorageKey, isDemoUser, updateSettings]);
  const startDemoPreview = useCallback(
    (option: UseCaseOption, mode: DemoPreviewState['mode']) => {
      setDemoPreviewState({
        portfolio: createDemoPortfolioForUseCase(option, user.name),
        mode,
      });
      setCurrentPage('dashboard');
    },
    [user.name]
  );
  const startAdvancedDemoPreview = useCallback(
    (mode: DemoPreviewState['mode'], persistUseCaseSelection = true) => {
      setIsPreparingDemoSession(true);
      beginForcedAdvancedDemoSession(persistUseCaseSelection);
      setDemoPreviewState({
        portfolio: createDemoPortfolioForUseCase(advancedDemoOption, user.name),
        mode,
      });
      setCurrentPage('dashboard');
    },
    [advancedDemoOption, beginForcedAdvancedDemoSession, user.name]
  );
  const clearTutorialTargetRetry = useCallback(() => {
    const retryState = tutorialTargetRetryRef.current;

    if (retryState.timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryState.timer);
    }

    tutorialTargetRetryRef.current = { stepId: null, attempts: 0, timer: null };
    setTutorialTargetResolution({ status: 'pending', attempts: 0 });
  }, []);
  const stopDemoPreview = useCallback(() => {
    clearTutorialTargetRetry();
    setDemoPreviewState(null);
    setPendingStarterPath(null);
    setCurrentPage('dashboard');
    endForcedAdvancedDemoSession();
  }, [clearTutorialTargetRetry, endForcedAdvancedDemoSession]);
  const resolveDemoStartStepId = useCallback(
    (preferredStepId: string | null = firstDemoTutorialStepId) => {
      if (preferredStepId && activeDemoTutorialSteps.some((step) => step.id === preferredStepId)) {
        return preferredStepId;
      }

      return activeDemoTutorialSteps[0]?.id ?? preferredStepId ?? null;
    },
    [activeDemoTutorialSteps, firstDemoTutorialStepId]
  );

  const resolveNextVisibleTutorialStepId = useCallback(
    (currentStepId: string | null) => {
      if (!currentStepId) {
        return firstDemoTutorialStepId;
      }

      const currentIndex = activeDemoTutorialSteps.findIndex((step) => step.id === currentStepId);

      if (currentIndex < 0) {
        return firstDemoTutorialStepId;
      }

      return activeDemoTutorialSteps[currentIndex + 1]?.id ?? null;
    },
    [activeDemoTutorialSteps, firstDemoTutorialStepId]
  );

  const effectivePortfolio = demoPreviewState?.portfolio ?? null;
  const effectiveProperties = effectivePortfolio?.properties ?? properties;
  const effectiveMortgages = effectivePortfolio?.mortgages ?? mortgages;
  const effectiveCashAccounts = effectivePortfolio?.cashAccounts ?? cashAccounts;
  const effectiveBankConnections = effectivePortfolio?.bankConnections ?? bankConnections;
  const effectiveInvestmentAccounts =
    effectivePortfolio?.investmentAccounts ?? investmentAccounts;
  const effectiveOpportunities = effectivePortfolio?.opportunities ?? opportunities;
  const effectiveRehabProjects = effectivePortfolio?.rehabProjects ?? rehabProjects;
  const effectiveReports = effectivePortfolio?.reports ?? reports;
  const effectiveReportTemplates = effectivePortfolio?.reportTemplates ?? reportTemplates;
  const effectiveReportBranding = effectivePortfolio?.reportBranding ?? reportBranding;
  const syncedProperties = useMemo(
    () =>
      normalizeProperties(
        synchronizeMortgageProperties(effectiveProperties, effectiveMortgages),
        effectiveMortgages
      ),
    [effectiveMortgages, effectiveProperties]
  );
  const migratedGalleryPropertyIdsRef = useRef(new Set<string>());
  useEffect(() => {
    let cancelled = false;
    const migrate = async () => {
      const candidates = properties.filter((property) => {
        const urls = property.imageUrls?.length ? property.imageUrls : property.imageUrl ? [property.imageUrl] : [];
        return !migratedGalleryPropertyIdsRef.current.has(property.id) && urls.some((url) => url.startsWith('data:image/'));
      });
      if (candidates.length === 0) return;

      const migrated = await Promise.all(candidates.map(async (property) => {
        const sourceUrls = property.imageUrls?.length ? property.imageUrls : property.imageUrl ? [property.imageUrl] : [];
        const result = await migrateLegacyGalleryUrls(sourceUrls, `${property.id}-legacy-image`);
        migratedGalleryPropertyIdsRef.current.add(property.id);
        if (result.migratedCount === 0 || result.failedCount > 0) return null;
        const primaryIndex = Math.min(property.primaryImageIndex ?? 0, Math.max(result.urls.length - 1, 0));
        return { id: property.id, imageUrls: result.urls, imageUrl: result.urls[primaryIndex] ?? '', primaryImageIndex: primaryIndex };
      }));

      if (!cancelled && migrated.some(Boolean)) {
        setProperties((current) => current.map((property) => {
          const next = migrated.find((item) => item?.id === property.id);
          return next ? { ...property, ...next } : property;
        }));
      }
    };
    void migrate();
    return () => { cancelled = true; };
  }, [properties]);
  const currentPortfolioData = useMemo<UserPortfolioData>(
    () => ({
      properties,
      mortgages,
      cashAccounts,
      bankConnections,
      investmentAccounts,
      opportunities,
      rehabProjects,
      reports,
      reportTemplates,
      reportBranding,
    }),
    [
      bankConnections,
      cashAccounts,
      investmentAccounts,
      mortgages,
      opportunities,
      properties,
      rehabProjects,
      reportBranding,
      reportTemplates,
      reports,
    ]
  );
  const currentPortfolioSignature = useMemo(
    () => serializeUserPortfolioForPersistence(currentPortfolioData),
    [currentPortfolioData]
  );
  const acceptedHydrationSignatureRef = useRef<string | null>(null);
  const [isPortfolioTransition, setIsPortfolioTransition] = useState(false);
  const portfolioTransitionRef = useRef(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('saved');
  const persistence = useMemo(() => createPortfolioPersistence(user.id, setPersistenceStatus), [user.id]);
  const lastScheduledPortfolioSignatureRef = useRef<string | null>(null);
  const backupExportedAtRef = useRef(new Date().toISOString());
  const currentBackup = useMemo(
    () => ({
      version: 1 as const,
      exportedAt: backupExportedAtRef.current,
      user: {
        name: user.name,
        email: user.email,
      },
      portfolio: currentPortfolioData,
      settings,
    }),
    [
      currentPortfolioData,
      settings,
      user.email,
      user.name,
    ]
  );

  const handleAddProperty = (property: Property) => {
    assertValidPropertyFinancialValues(property);
    tracePortfolioPersistence('react:add-property', getPortfolioSnapshotTraceMetadata(user.id, {
      properties: [...properties, property],
    }, { accountId: user.id, indexedDbKey: user.id }));
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                properties: [
                  ...currentPreview.portfolio.properties,
                  normalizePropertyRecord(property),
                ],
              },
            }
          : currentPreview
      );
      return;
    }

    setProperties((currentProperties) => [
      ...currentProperties,
      normalizePropertyRecord(property),
    ]);
  };

  const handleEditProperty = (property: Property) => {
    assertValidPropertyFinancialValues(property);
    const editingBaseline = syncedProperties.find(
      (candidate) => candidate.id === property.id
    );
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                properties: replacePropertyRecord(
                  currentPreview.portfolio.properties,
                  editingBaseline
                    ? mergeChangedPropertyFields(
                        currentPreview.portfolio.properties.find(
                          (candidate) => candidate.id === property.id
                        ) ?? property,
                        editingBaseline,
                        property
                      )
                    : property
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setProperties((currentProperties) => {
      const currentProperty = currentProperties.find(
        (candidate) => candidate.id === property.id
      );
      const persistedProperty =
        currentProperty && editingBaseline
          ? mergeChangedPropertyFields(
              currentProperty,
              editingBaseline,
              property
            )
          : property;
      return replacePropertyRecord(currentProperties, persistedProperty);
    });
  };

  const handleDeleteProperty = (propertyId: string) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                properties: currentPreview.portfolio.properties.filter(
                  (property) => property.id !== propertyId
                ),
                mortgages: currentPreview.portfolio.mortgages.filter(
                  (mortgage) => mortgage.propertyId !== propertyId
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setProperties((currentProperties) =>
      currentProperties.filter((property) => property.id !== propertyId)
    );
    setMortgages((currentMortgages) =>
      currentMortgages.filter((mortgage) => mortgage.propertyId !== propertyId)
    );
  };

  const handleAddMortgage = (mortgage: Mortgage) => {
    if (isDemoPreviewActive) {
      if (!demoPreviewState) {
        return;
      }
      const nextRelationship = addMortgageRelationship(
        demoPreviewState.portfolio.properties,
        demoPreviewState.portfolio.mortgages,
        mortgage
      );
      setDemoPreviewState({
        ...demoPreviewState,
        portfolio: {
          ...demoPreviewState.portfolio,
          ...nextRelationship,
        },
      });
      return;
    }

    const nextRelationship = addMortgageRelationship(properties, mortgages, mortgage);
    setProperties(nextRelationship.properties);
    setMortgages(nextRelationship.mortgages);
  };

  const handleEditMortgage = (mortgage: Mortgage) => {
    if (isDemoPreviewActive) {
      if (!demoPreviewState) {
        return;
      }
      const nextRelationship = editMortgageRelationship(
        demoPreviewState.portfolio.properties,
        demoPreviewState.portfolio.mortgages,
        mortgage
      );
      setDemoPreviewState({
        ...demoPreviewState,
        portfolio: {
          ...demoPreviewState.portfolio,
          ...nextRelationship,
        },
      });
      return;
    }

    const nextRelationship = editMortgageRelationship(properties, mortgages, mortgage);
    setProperties(nextRelationship.properties);
    setMortgages(nextRelationship.mortgages);
  };

  const handleDeleteMortgage = (mortgageId: string) => {
    if (isDemoPreviewActive) {
      if (!demoPreviewState) {
        return;
      }
      const nextRelationship = deleteMortgageRelationship(
        demoPreviewState.portfolio.properties,
        demoPreviewState.portfolio.mortgages,
        mortgageId
      );
      setDemoPreviewState({
        ...demoPreviewState,
        portfolio: {
          ...demoPreviewState.portfolio,
          ...nextRelationship,
        },
      });
      return;
    }

    const nextRelationship = deleteMortgageRelationship(properties, mortgages, mortgageId);
    setProperties(nextRelationship.properties);
    setMortgages(nextRelationship.mortgages);
  };

  const handleAddOpportunity = (opportunity: Opportunity) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                opportunities: [
                  ...currentPreview.portfolio.opportunities,
                  enrichOpportunity(opportunity),
                ],
              },
            }
          : currentPreview
      );
      return;
    }

    setOpportunities((current) => [...current, enrichOpportunity(opportunity)]);
  };

  const handleUpdateOpportunity = (opportunity: Opportunity) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                opportunities: currentPreview.portfolio.opportunities.map((item) =>
                  item.id === opportunity.id ? enrichOpportunity(opportunity) : item
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setOpportunities((current) =>
      current.map((item) => (item.id === opportunity.id ? enrichOpportunity(opportunity) : item))
    );
  };

  const handleDeleteOpportunity = (opportunityId: string) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                opportunities: currentPreview.portfolio.opportunities.filter(
                  (item) => item.id !== opportunityId
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setOpportunities((current) => current.filter((item) => item.id !== opportunityId));
  };

  const handleConvertOpportunity = (opportunity: Opportunity) => {
    setOpportunities((current) =>
      current.map((item) =>
        item.id === opportunity.id
          ? enrichOpportunity({
              ...item,
              status: 'purchased',
              linkedPropertyId: item.linkedPropertyId ?? `planned-property-${item.id}`,
            })
          : item
      )
    );
  };

  const handleAddRehabProject = (project: RehabProject) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                rehabProjects: [
                  ...currentPreview.portfolio.rehabProjects,
                  enrichRehabProject(project),
                ],
              },
            }
          : currentPreview
      );
      return;
    }

    setRehabProjects((current) => [...current, enrichRehabProject(project)]);
  };

  const handleUpdateRehabProject = (project: RehabProject) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                rehabProjects: currentPreview.portfolio.rehabProjects.map((item) =>
                  item.id === project.id ? enrichRehabProject(project) : item
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setRehabProjects((current) =>
      current.map((item) => (item.id === project.id ? enrichRehabProject(project) : item))
    );
  };

  const handleDeleteRehabProject = (projectId: string) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                rehabProjects: currentPreview.portfolio.rehabProjects.filter(
                  (item) => item.id !== projectId
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setRehabProjects((current) => current.filter((item) => item.id !== projectId));
  };

  const handleAddReport = (report: InvestmentReport) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                reports: [...currentPreview.portfolio.reports, report],
              },
            }
          : currentPreview
      );
      return;
    }

    setReports((current) => [...current, report]);
  };

  const handleUpdateReport = (report: InvestmentReport) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                reports: currentPreview.portfolio.reports.map((item) =>
                  item.id === report.id ? report : item
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setReports((current) => current.map((item) => (item.id === report.id ? report : item)));
  };

  const handleAddReportTemplate = (template: InvestmentReportTemplate) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                reportTemplates: [...currentPreview.portfolio.reportTemplates, template],
              },
            }
          : currentPreview
      );
      return;
    }

    setReportTemplates((current) => [...current, template]);
  };

  const handleUpdateCashAccounts = (accounts: CashAccount[]) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                cashAccounts: accounts,
              },
            }
          : currentPreview
      );
      return;
    }

    setCashAccounts(accounts);
  };

  const handleUpdateInvestmentAccounts = (accounts: InvestmentAccount[]) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                investmentAccounts: accounts,
              },
            }
          : currentPreview
      );
      return;
    }

    setInvestmentAccounts(accounts);
  };

  const handleUpdateBankConnections = (connections: BankConnection[]) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                bankConnections: connections,
              },
            }
          : currentPreview
      );
      return;
    }

    setBankConnections(connections);
  };

  const handleUpdateReportBranding = (branding: ReportBrandingConfig) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                reportBranding: branding,
              },
            }
          : currentPreview
      );
      return;
    }

    setReportBranding(branding);
  };

  const handleGenerateReportFromSource = (
    sourceType: 'opportunity' | 'property' | 'rehab',
    sourceId: string
  ) => {
    const source =
      sourceType === 'opportunity'
        ? effectiveOpportunities.find((item) => item.id === sourceId)
        : sourceType === 'property'
        ? syncedProperties.find((item) => item.id === sourceId)
        : effectiveRehabProjects.find((item) => item.id === sourceId);

    if (!source) {
      return;
    }

    const report = createReportFromSource(
      sourceType,
      source,
      user.name,
      effectiveReportTemplates,
      effectiveReportBranding
    );

    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                reports: [...currentPreview.portfolio.reports, report],
              },
            }
          : currentPreview
      );
    } else {
      setReports((current) => [...current, report]);
    }
    setCurrentPage('reports');
  };

  const handleExportBackup = () => {
    const backup = currentBackup;
    const fileName = `re-portfolio-backup-${user.email.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
  };

  const runPortfolioTransition = async (action: () => Promise<void>) => {
    if (portfolioTransitionRef.current) throw new Error('Portfolio operation already in progress');
    portfolioTransitionRef.current = true;
    setIsPortfolioTransition(true);
    try { await action(); }
    finally { portfolioTransitionRef.current = false; setIsPortfolioTransition(false); }
  };

  const handleImportBackup = async (backup: import('./services/localAccountStore').UserAccountBackup) => {
    await runPortfolioTransition(async () => {
      await importUserAccountBackup(user, backup);
      window.location.reload();
    });
  };

  const handleSyncBackupToServer = async () => {
    await saveBackupToServer(currentBackup);
  };

  const handleRestoreBackupFromServer = async () => {
    await runPortfolioTransition(async () => {
      const result = await loadBackupFromServer(user.email);
      await importUserAccountBackup(user, result.payload);
      window.location.reload();
    });
  };

  const handleResetDemoData = async () => {
    const result = await resetDemoAccountData(user, {
      properties: [],
      mortgages: [],
      cashAccounts: [],
      bankConnections: [],
      investmentAccounts: [],
      opportunities: [],
      rehabProjects: [],
      reports: [],
      reportTemplates: cloneDemoValue(defaultReportTemplates),
      reportBranding: cloneDemoValue(defaultReportBranding),
    });

    if (result.reset) {
      window.location.reload();
    }
  };

  const handleLogoutWithDebug = () => {
    setPersistenceStatus('saving');
    void runPortfolioTransition(() => onLogout(currentBackup)).catch(() => setPersistenceStatus('error'));
  };

  const syncInvestmentAccount = useCallback(async (accountId: string) => {
    if (isDemoPreviewActive) {
      return;
    }

    setInvestmentAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              syncStatus: 'syncing',
              syncError: null,
              provider: 'etoro',
            }
          : account
      )
    );

    try {
      const snapshot = await fetchEtoroAccountSnapshot();

      setInvestmentAccounts((currentAccounts) =>
        currentAccounts
          .filter((account) => account.id === accountId || !isLegacyManualInvestmentPlaceholder(account))
          .map((account) => {
            if (account.id !== accountId) {
              return account;
            }

            const referenceBalance = account.lastSuccessfulBalance ?? account.balance;
            const dailyChangePct =
              referenceBalance > 0
                ? ((snapshot.totalAccountValue - referenceBalance) / referenceBalance) * 100
                : null;

            return {
              ...account,
              name: snapshot.providerLabel,
              provider: 'etoro',
              type: 'broker',
              currency: snapshot.currency,
              isManual: false,
              balance: snapshot.totalAccountValue,
              lastSuccessfulBalance: snapshot.totalAccountValue,
              dailyChangePct,
              lastSyncedAt: snapshot.fetchedAt,
              syncStatus: 'success',
              syncError: null,
            };
          })
      );
    } catch (error) {
      const syncError =
        error instanceof Error ? error.message : 'Unexpected investment synchronization error';

      setInvestmentAccounts((currentAccounts) =>
        currentAccounts.map((account) => {
          if (account.id !== accountId) {
            return account;
          }

          return {
            ...account,
            provider: 'etoro',
            syncStatus: 'error',
            syncError,
            balance: account.lastSuccessfulBalance ?? account.balance,
          };
        })
      );
    }
  }, [isDemoPreviewActive]);

  const connectEtoroAccount = useCallback(async () => {
    if (isDemoPreviewActive) {
      return;
    }

    let targetId = 'investment-etoro';

    setInvestmentAccounts((currentAccounts) => {
      const existingAccount = currentAccounts.find((account) => account.provider === 'etoro');

      if (existingAccount) {
        targetId = existingAccount.id;
        return currentAccounts;
      }

      return [...currentAccounts, createEtoroInvestmentAccount(targetId)];
    });

    await syncInvestmentAccount(targetId);
  }, [isDemoPreviewActive, syncInvestmentAccount]);

  // Start the durable write before the updated portfolio can be painted as Saved.
  // A passive effect leaves a refresh-sized gap where React has the property but
  // IndexedDB still has the previous snapshot.
  useLayoutEffect(() => {
    if (!canAutoWrite || portfolioTransitionRef.current) {
      tracePortfolioPersistence('autosave:blocked', {
        userId: user.id,
        accountId: user.id,
        indexedDbKey: user.id,
        details: { canAutoWrite, portfolioTransition: portfolioTransitionRef.current, appRecoveryMode },
      });
      return;
    }
    const decision = getPortfolioAutosaveDecision({
      isBootSettled,
      isHydrationComplete: portfolioHydration.storageState !== 'invalid',
      activeUserId: user.id,
      hydratedUserId: portfolioHydration.userId,
      authoritativeSignature: portfolioHydration.canonicalSignature,
      currentSignature: currentPortfolioSignature,
      acceptedHydrationSignature: acceptedHydrationSignatureRef.current,
      lastPersistedSignature: lastScheduledPortfolioSignatureRef.current,
    });

    if (decision === 'blocked') {
      console.debug('[portfolio-save] blocked until authoritative hydration is accepted');
      return;
    }

    if (decision === 'accept-hydrated') {
      acceptedHydrationSignatureRef.current = portfolioHydration.canonicalSignature;
      lastScheduledPortfolioSignatureRef.current = portfolioHydration.canonicalSignature;
      console.debug('[portfolio-save] authoritative hydration accepted without writeback');
      return;
    }

    if (decision === 'unchanged') {
      return;
    }

    console.debug('[portfolio-save] writeback', {
      propertyCount: properties.length,
      mortgageCount: mortgages.length,
      galleryImageCount: properties.reduce(
        (count, property) => count + (property.imageUrls?.length ?? (property.imageUrl ? 1 : 0)),
        0
      ),
    });
    lastScheduledPortfolioSignatureRef.current = currentPortfolioSignature;
    tracePortfolioPersistence('autosave:scheduled', getPortfolioSnapshotTraceMetadata(user.id, currentPortfolioData, {
      accountId: user.id,
      indexedDbKey: user.id,
    }));
    void persistence.save(currentPortfolioData).catch(() => { /* Persistent UI owns error reporting and retry. */ });
  }, [
    currentPortfolioData,
    currentPortfolioSignature,
    canAutoWrite,
    persistence,
    isBootSettled,
    portfolioHydration,
    properties,
    user.id,
  ]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (persistenceStatus !== 'saved') { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [persistenceStatus]);

  useEffect(() => {
    if (!ENABLE_LOCAL_RECOVERY_SNAPSHOT_WRITEBACK) {
      return;
    }

    if (!canAutoWrite) {
      return;
    }

    if (!currentBackup?.user || !currentBackup?.portfolio || !currentBackup?.settings) {
      return;
    }

    void saveUserRecoverySnapshot(user, currentBackup).catch(error => {
      console.warn('Recovery copy failed; canonical save status is reported separately', error);
    });
  }, [
    currentBackup,
    user,
  ]);

  useEffect(() => {
    if (!canAutoWrite) {
      return;
    }

    if (user.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveBackupToServer(currentBackup).catch(() => {
        // Silent fallback: keep working from local user storage if sync fails.
      });
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentBackup,
    user,
  ]);

  useEffect(() => {
    if (!canAutoWrite) {
      return;
    }

    if (user.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL || typeof window === 'undefined') {
      return;
    }

    const flushCurrentBackup = () => {
      // Additional best effort only: normal autosave already starts after each edit.
      if (persistenceStatus === 'error') void persistence.save(currentPortfolioData).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentBackup();
      }
    };

    window.addEventListener('pagehide', flushCurrentBackup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushCurrentBackup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentPortfolioData, persistence, persistenceStatus, user]);

  useEffect(() => {
    if (!canAutoWrite) {
      return;
    }

    const etoroAccount = investmentAccounts.find((account) => account.provider === 'etoro');

    if (!etoroAccount) {
      return;
    }

    void syncInvestmentAccount(etoroAccount.id);
  }, [syncInvestmentAccount]);

  useEffect(() => {
    if (!isBootSettled || appRecoveryMode) {
      return;
    }

    if (pendingStarterPath === 'manual-property' && currentPage === 'properties') {
      setPendingStarterPath(null);
      return;
    }

    if (pendingStarterPath === 'import-file' && currentPage === 'opportunities') {
      setPendingStarterPath(null);
      return;
    }

    if (pendingStarterPath === 'explore-demo') {
      startAdvancedDemoPreview('explore');
      setPendingStarterPath(null);
    }
  }, [currentPage, pendingStarterPath, startAdvancedDemoPreview]);

  useEffect(() => {
    if (!isBootSettled || appRecoveryMode) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const hasForcedDemoSession =
      safeDemoStorageGet(demoTutorialAdvancedSessionStorageKey) !== null ||
      safeDemoStorageGet(demoTutorialRestartRequestStorageKey) !== null;

    if (!hasForcedDemoSession) {
      setIsPreparingDemoSession(false);
      return;
    }

    if (!isAdvancedDemoLayoutReady) {
      setIsPreparingDemoSession(true);
      beginForcedAdvancedDemoSession(false);
      setCurrentPage('dashboard');
      return;
    }

    setCurrentPage('dashboard');
    setIsPreparingDemoSession(false);
  }, [
    beginForcedAdvancedDemoSession,
    demoTutorialAdvancedSessionStorageKey,
    demoTutorialRestartRequestStorageKey,
    isAdvancedDemoLayoutReady,
  ]);

  useEffect(() => {
    if (APP_RECOVERY_MODE) {
      return;
    }

    if (!isDemoUser || typeof window === 'undefined') {
      return;
    }

    if (personalizationCompletedThisSessionRef.current) {
      return;
    }

    const shouldForceRestart = safeDemoStorageGet(demoTutorialRestartRequestStorageKey);

    if (onboardingDemoFlow.shouldShowLanguageSelection) {
      setShowLanguageSelectionStep(true);
      setShowUseCaseSelectionStep(false);
      setActiveTutorialStepId(null);
      if (shouldForceRestart) {
        safeDemoStorageRemove(demoTutorialRestartRequestStorageKey);
      }
      return;
    }

    if (onboardingDemoFlow.shouldShowUseCaseSelection) {
      setShowLanguageSelectionStep(false);
      setShowUseCaseSelectionStep(true);
      setActiveTutorialStepId(null);
      if (shouldForceRestart) {
        safeDemoStorageRemove(demoTutorialRestartRequestStorageKey);
      }
    }
  }, [
    demoTutorialDismissedStorageKey,
    firstDemoTutorialStepId,
    startAdvancedDemoPreview,
    demoTutorialRestartRequestStorageKey,
    isDemoUser,
    onboardingDemoFlow.shouldShowLanguageSelection,
    onboardingDemoFlow.shouldShowUseCaseSelection,
    personalizationCompletedThisSession,
  ]);

  const activeTutorialVisibleIndex = activeTutorialStepId
    ? activeDemoTutorialSteps.findIndex((step) => step.id === activeTutorialStepId)
    : -1;
  const activeTutorialStep =
    activeTutorialVisibleIndex >= 0
      ? activeDemoTutorialSteps[activeTutorialVisibleIndex] ?? null
      : null;
  const activeTutorialUiState = useMemo(
    () =>
      resolveTutorialStepUiState(activeTutorialStep, {
        modeState: workspaceModeState,
      }),
    [activeTutorialStep, workspaceModeState]
  );
  const tutorialTargetId = activeTutorialStep?.targetId ?? null;
  const pendingOnboardingStep = getPendingOnboardingStep(settings);
  const shouldShowPostSignupWorkspaceSetup =
    pendingOnboardingStep !== null &&
    pendingOnboardingStep !== 'basic-mode-setup' &&
    user.email.trim().toLowerCase() !== DEMO_ACCOUNT_EMAIL;
  const shouldShowBasicModeSetupWizard =
    pendingOnboardingStep === 'basic-mode-setup' &&
    settings.userMode === 'basic' &&
    user.email.trim().toLowerCase() !== DEMO_ACCOUNT_EMAIL;
  useEffect(() => {
    if (activeTutorialStepId === null) {
      return;
    }

    if (activeDemoTutorialSteps.some((step) => step.id === activeTutorialStepId)) {
      return;
    }

    const currentMasterIndex = demoTutorialMasterSteps.findIndex(
      (step) => step.id === activeTutorialStepId
    );
    const nextVisibleStep =
      activeDemoTutorialSteps.find((step) => step.masterIndex > currentMasterIndex) ??
      activeDemoTutorialSteps[
        Math.max(0, Math.min(currentMasterIndex, activeDemoTutorialSteps.length - 1))
      ] ??
      activeDemoTutorialSteps[0] ??
      null;

    setActiveTutorialStepId(nextVisibleStep?.id ?? null);
  }, [activeDemoTutorialSteps, activeTutorialStepId, demoTutorialMasterSteps]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isDemoPreviewActive && activeTutorialStepId === null) {
      return;
    }

    const currentVisibleStep =
      activeTutorialVisibleIndex >= 0
        ? activeDemoTutorialSteps[activeTutorialVisibleIndex] ?? null
        : null;
    const nextVisibleStep =
      currentVisibleStep
        ? activeDemoTutorialSteps[currentVisibleStep.visibleIndex + 1] ?? null
        : activeDemoTutorialSteps[0] ?? null;

    console.info('[demo-tutorial]', {
      mode: demoPreviewState?.mode ?? null,
      workspaceMode: trackingPreference,
      visibleModules,
      masterSteps: demoTutorialMasterSteps.map((step, masterIndex) => ({
        id: step.id,
        masterIndex,
      })),
      activeSteps: activeDemoTutorialSteps.map((step) => ({
        id: step.id,
        masterIndex: step.masterIndex,
        visibleIndex: step.visibleIndex,
        visibleStepNumber: step.visibleIndex + 1,
      })),
      visibleIndexMapping: Object.fromEntries(
        activeDemoTutorialSteps.map((step) => [step.id, step.visibleIndex + 1])
      ),
      currentVisibleStep: currentVisibleStep
        ? {
            id: currentVisibleStep.id,
            visibleIndex: currentVisibleStep.visibleIndex,
            visibleStepNumber: currentVisibleStep.visibleIndex + 1,
          }
        : null,
      nextVisibleStep: nextVisibleStep
        ? {
            id: nextVisibleStep.id,
            visibleIndex: nextVisibleStep.visibleIndex,
            visibleStepNumber: nextVisibleStep.visibleIndex + 1,
          }
        : null,
    });
  }, [
    activeDemoTutorialSteps,
    activeTutorialStepId,
    activeTutorialVisibleIndex,
    demoPreviewState?.mode,
    demoTutorialMasterSteps,
    isDemoPreviewActive,
    trackingPreference,
    visibleModules,
  ]);

  useEffect(() => {
    if (onboardingDemoFlow.shouldStartGuidedDemoPreview && activeTutorialStepId === null) {
      stopDemoPreview();
    }
  }, [
    activeTutorialStepId,
    onboardingDemoFlow.shouldStartGuidedDemoPreview,
    stopDemoPreview,
  ]);

  useEffect(() => {
    if (!demoPreviewState || demoPreviewState.mode !== 'guided' || typeof window === 'undefined') {
      return;
    }

    const storedUseCaseId = readPersistedUseCaseId(makeUserSettingsStorageKey(user.id));

    if (!storedUseCaseId) {
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'missing' });
      return;
    }

    if (!isCompatibleUseCaseOption(storedUseCaseId, useCaseOptions, isDemoUser)) {
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'invalid' });
      safeUseCaseStorageRemove(makeUserSettingsStorageKey(user.id));
      return;
    }

    const storedOption = resolveUseCaseOptionById(useCaseOptions, storedUseCaseId);

    if (!storedOption) {
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'missing' });
      safeUseCaseStorageRemove(makeUserSettingsStorageKey(user.id));
      return;
    }

    if (settings.onboarding.trackingPreference === storedOption.trackingPreference) {
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} restored`, { outcome: 'restored' });
      return;
    }

    updateSettings({
      userMode: storedOption.userMode,
      dashboardSetupMode: storedOption.userMode === 'advanced' ? 'connected' : 'simple',
      onboarding: {
        ...settings.onboarding,
        completed: true,
        trackingPreference: storedOption.trackingPreference,
      },
      workspaceConfig: createOnboardingWorkspaceConfig(
        user.id,
        storedOption.userMode,
        storedOption.enabledModules
      ),
    });
  }, [
    demoPreviewState,
    settings.onboarding,
    settings.onboarding.trackingPreference,
    updateSettings,
    user.id,
    useCaseOptions,
  ]);

  useEffect(() => {
    if (!isWorkspacePageVisible(currentPage, workspaceModeState)) {
      setCurrentPage('dashboard');
    }
  }, [currentPage, workspaceModeState]);

  const handleCompletePostSignupSetup = (payload: {
    onboarding: UserOnboardingProfile;
    workspaceConfig: WorkspaceConfig;
    dashboardSetupMode: 'simple' | 'connected';
    userMode: 'basic' | 'advanced';
  }) => {
    const requiresBasicModeSetup =
      payload.userMode === 'basic' &&
      !payload.onboarding.basicModeSetupCompleted &&
      properties.length === 0;

    updateSettings({
      userMode: payload.userMode,
      onboardingCompleted: true,
      onboardingStep: requiresBasicModeSetup ? 'basic-mode-setup' : null,
      dashboardSetupMode: payload.dashboardSetupMode,
      onboarding: payload.onboarding,
      workspaceConfig: {
        ...payload.workspaceConfig,
        userId: user.id,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const handleChooseStarterPath = (path: StarterPath) => {
    setPendingStarterPath(path);

    if (path === 'manual-property') {
      setCurrentPage('properties');
      return;
    }

    if (path === 'import-file') {
      setCurrentPage('opportunities');
      return;
    }

    setCurrentPage('dashboard');
  };

  const handleFinishBasicModeSetup = (property: Property | null) => {
    if (property) {
      handleAddProperty(property);
      setCurrentPage('dashboard');
    }

    updateSettings({
      onboardingCompleted: true,
      onboardingStep: null,
      onboarding: {
        ...settings.onboarding,
        basicModeSetupCompleted: true,
      },
    });
  };

  const dismissTutorial = () => {
    clearTutorialTargetRetry();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(demoTutorialDismissedStorageKey, new Date().toISOString());
      window.localStorage.removeItem(demoTutorialRestartRequestStorageKey);
    }

    setActiveTutorialStepId(null);
    stopDemoPreview();
  };

  const replayTutorial = () => {
    resetPersonalizationSessionGate();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(demoTutorialDismissedStorageKey);
      window.localStorage.removeItem(demoTutorialRestartRequestStorageKey);
    }

    setIsPreparingDemoSession(true);
    beginForcedAdvancedDemoSession(false);
    setCurrentPage('dashboard');
    setShowLanguageSelectionStep(true);
    setShowUseCaseSelectionStep(false);
    setActiveTutorialStepId(null);
  };

  const goBackTutorial = useCallback(() => {
    clearTutorialTargetRetry();
    setActiveTutorialStepId((currentStepId) => {
      if (!currentStepId) {
        return null;
      }

      const currentIndex = activeDemoTutorialSteps.findIndex((step) => step.id === currentStepId);

      if (currentIndex <= 0) {
        return currentStepId;
      }

      return activeDemoTutorialSteps[currentIndex - 1]?.id ?? currentStepId;
    });
  }, [activeDemoTutorialSteps, clearTutorialTargetRetry]);

  const advanceTutorial = useCallback(() => {
    clearTutorialTargetRetry();
    setActiveTutorialStepId((currentStepId) => {
      return resolveNextVisibleTutorialStepId(currentStepId);
    });
  }, [clearTutorialTargetRetry, resolveNextVisibleTutorialStepId]);

  const handleTutorialNavigate = (page: PageType) => {
    if (!activeTutorialStep?.requiresAction) {
      setCurrentPage(page);
      return;
    }

    const stepId = activeTutorialStep.id;
    const propertiesAction =
      (stepId === 'open-properties' || stepId === 'return-properties') && page === 'properties';
    const mortgagesAction = stepId === 'open-mortgages' && page === 'mortgages';
    const settingsAction = stepId === 'open-settings' && page === 'settings';
    const cashAccountsAction =
      stepId === 'open-cash-accounts' && page === 'cash-accounts';
    const reportsAction = stepId === 'open-reports' && page === 'reports';

    if (propertiesAction || mortgagesAction || settingsAction || cashAccountsAction || reportsAction) {
      setCurrentPage(page);
      advanceTutorial();
    }
  };

  const handleTutorialPropertyTabChange = (
    tab:
      | 'summary'
      | 'overview'
      | 'finances'
      | 'mortgage'
      | 'documents'
      | 'tax'
      | 'taxes'
      | 'notes'
      | 'gallery'
  ) => {
    if (activeTutorialStep?.id === 'review-property-summary' && (tab === 'summary' || tab === 'overview')) {
      advanceTutorial();
      return;
    }

    if (activeTutorialStep?.id === 'review-mortgage-link' && tab === 'mortgage') {
      advanceTutorial();
    }
  };

  const handleTutorialOpenAddProperty = () => {
    if (activeTutorialStep?.id === 'open-add-property') {
      advanceTutorial();
    }
  };

  useEffect(() => {
    if (!activeTutorialUiState) {
      return;
    }

    if (currentPage !== activeTutorialUiState.page) {
      setCurrentPage(activeTutorialUiState.page);
    }
  }, [activeTutorialUiState, currentPage]);

  useEffect(() => {
    if (!activeTutorialStep?.targetId || typeof document === 'undefined') {
      clearTutorialTargetRetry();
      return;
    }

    if (activeTutorialUiState && currentPage !== activeTutorialUiState.page) {
      return;
    }

    let isCancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const evaluateTarget = () => {
      if (isCancelled) {
        return;
      }

      const target = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${activeTutorialStep.targetId}"]`
      );

      if (!target) {
        const retryState = tutorialTargetRetryRef.current;

        if (retryState.stepId !== activeTutorialStep.id) {
          retryState.stepId = activeTutorialStep.id;
          retryState.attempts = 0;
        }

        if (retryState.attempts >= DEMO_TUTORIAL_TARGET_RETRY_LIMIT) {
          setTutorialTargetResolution({
            status: 'timed-out',
            attempts: retryState.attempts,
          });
          clearTutorialTargetRetry();
          return;
        }

        retryState.attempts += 1;
        setTutorialTargetResolution({
          status: 'pending',
          attempts: retryState.attempts,
        });
        retryState.timer = window.setTimeout(evaluateTarget, DEMO_TUTORIAL_TARGET_RETRY_DELAY_MS);
        return;
      }

      const isVisible =
        target.getClientRects().length > 0 &&
        window.getComputedStyle(target).visibility !== 'hidden' &&
        window.getComputedStyle(target).display !== 'none';

      if (!isVisible) {
        const retryState = tutorialTargetRetryRef.current;

        if (retryState.stepId !== activeTutorialStep.id) {
          retryState.stepId = activeTutorialStep.id;
          retryState.attempts = 0;
        }

        if (retryState.attempts >= DEMO_TUTORIAL_TARGET_RETRY_LIMIT) {
          setTutorialTargetResolution({
            status: 'timed-out',
            attempts: retryState.attempts,
          });
          clearTutorialTargetRetry();
          return;
        }

        retryState.attempts += 1;
        setTutorialTargetResolution({
          status: 'pending',
          attempts: retryState.attempts,
        });
        retryState.timer = window.setTimeout(evaluateTarget, DEMO_TUTORIAL_TARGET_RETRY_DELAY_MS);
        return;
      }

      setTutorialTargetResolution({
        status: 'ready',
        attempts: 0,
      });
      clearTutorialTargetRetry();
    };

    const retryState = tutorialTargetRetryRef.current;
    if (retryState.stepId !== activeTutorialStep.id) {
      retryState.stepId = activeTutorialStep.id;
      retryState.attempts = 0;
    }

    setTutorialTargetResolution({
      status: 'pending',
      attempts: retryState.attempts,
    });

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(evaluateTarget);
    });

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    clearTutorialTargetRetry,
    activeTutorialStep?.id,
    activeTutorialStep?.targetId,
    activeTutorialStep?.requiresAction,
    activeTutorialUiState,
    currentPage,
    clearTutorialTargetRetry,
  ]);

  const handleChangeTutorialLanguage = (language: AppLanguage) => {
    updateSettings({ language });
  };

  const handleChangeTutorialCurrency = (currency: DisplayCurrency) => {
    updateSettings({ currency });
  };

  const handleCompleteInitialTutorialSetup = () => {
    resetPersonalizationSessionGate();
    if (isDemoUser) {
      setShowLanguageSelectionStep(false);
      setShowUseCaseSelectionStep(true);
      setActiveTutorialStepId(null);
      return;
    }

    setShowLanguageSelectionStep(false);
    setShowUseCaseSelectionStep(true);
    setSelectedUseCaseId(null);
    setActiveTutorialStepId(null);
  };

  const handleSelectUseCaseId = (optionId: string) => {
    setSelectedUseCaseId(optionId);
  };

  const handleContinueUseCaseSelection = (selectedOption: UseCaseOption) => {
    const resolvedSelectedOption =
      selectedUseCaseOption ?? resolveUseCaseOptionById(useCaseOptions, selectedOption.id);

    if (!resolvedSelectedOption) {
      return;
    }

    markPersonalizationCompletedThisSession();
    setSelectedUseCaseId(resolvedSelectedOption.id);

    const nextWorkspaceConfig = createOnboardingWorkspaceConfig(
      user.id,
      resolvedSelectedOption.userMode,
      resolvedSelectedOption.enabledModules
    );

    updateSettings({
      userMode: resolvedSelectedOption.userMode,
      dashboardSetupMode: resolvedSelectedOption.userMode === 'advanced' ? 'connected' : 'simple',
      onboardingCompleted: true,
      onboardingStep: null,
      onboarding: {
        ...settings.onboarding,
        completed: true,
        trackingPreference: resolvedSelectedOption.trackingPreference,
      },
      workspaceConfig: nextWorkspaceConfig,
    });

    setShowUseCaseSelectionStep(false);
    setActiveTutorialStepId(resolveDemoStartStepId(firstDemoTutorialStepId));
    startDemoPreview(resolvedSelectedOption, 'guided');

    const settingsStorageKey = makeUserSettingsStorageKey(user.id);
    setStoredUseCaseSelection(settingsStorageKey, true);
    setStoredSelectedUseCaseId(settingsStorageKey, resolvedSelectedOption.id);
  };

  const handleSkipUseCaseSelection = () => {
    markPersonalizationCompletedThisSession();
    const settingsStorageKey = makeUserSettingsStorageKey(user.id);
    setStoredUseCaseSelection(settingsStorageKey, true);
    setStoredSelectedUseCaseId(settingsStorageKey, null);
    setSelectedUseCaseId(null);
    setShowUseCaseSelectionStep(false);

    const fallbackOption = isDemoUser ? advancedDemoOption : useCaseOptions[0];
    if (fallbackOption) {
      startDemoPreview(fallbackOption, 'guided');
    }
    setActiveTutorialStepId(resolveDemoStartStepId(firstDemoTutorialStepId));
  };

  useEffect(() => {
    if (onboardingDemoFlow.shouldShowPersonalization) {
      return;
    }

    if (!demoPreviewState || demoPreviewState.mode !== 'guided') {
      return;
    }

    if (activeTutorialStepId !== null) {
      return;
    }

    setActiveTutorialStepId(resolveDemoStartStepId(firstDemoTutorialStepId));
  }, [
    activeTutorialStepId,
    demoPreviewState,
    firstDemoTutorialStepId,
    resolveDemoStartStepId,
    onboardingDemoFlow.shouldShowPersonalization,
  ]);

  useEffect(() => {
    if (!demoPreviewState || demoPreviewState.mode !== 'guided') {
      return;
    }

    const settingsStorageKey = makeUserSettingsStorageKey(user.id);
    const storedSelectedUseCase = getStoredSelectedUseCaseId(settingsStorageKey);

    if (!storedSelectedUseCase) {
      return;
    }

    const storedOption = resolveUseCaseOptionById(useCaseOptions, storedSelectedUseCase);
    if (!storedOption) {
      return;
    }

    if (settings.onboarding.trackingPreference !== storedOption.trackingPreference) {
      updateSettings({
        userMode: storedOption.userMode,
        dashboardSetupMode: storedOption.userMode === 'advanced' ? 'connected' : 'simple',
        onboarding: {
          ...settings.onboarding,
          completed: true,
          trackingPreference: storedOption.trackingPreference,
        },
        workspaceConfig: createOnboardingWorkspaceConfig(
          user.id,
          storedOption.userMode,
          storedOption.enabledModules
        ),
      });
    }
  }, [
    demoPreviewState,
    settings.onboarding,
    settings.onboarding.trackingPreference,
    updateSettings,
    user.id,
    useCaseOptions,
  ]);

  useEffect(() => {
    if (!onboardingDemoFlow.shouldShowUseCaseSelection || typeof window === 'undefined') {
      return;
    }

    if (selectedUseCaseId !== null) {
      return;
    }

    const storedSelectedUseCase = readPersistedUseCaseId(makeUserSettingsStorageKey(user.id));
    if (!storedSelectedUseCase || selectedUseCaseId !== null) {
      if (!storedSelectedUseCase) {
        console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'missing' });
      }
      return;
    }

    if (!isCompatibleUseCaseOption(storedSelectedUseCase, useCaseOptions, isDemoUser)) {
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'invalid' });
      safeUseCaseStorageRemove(makeUserSettingsStorageKey(user.id));
      return;
    }

    const storedOption = resolveUseCaseOptionById(useCaseOptions, storedSelectedUseCase);
    if (storedOption) {
      setSelectedUseCaseId(storedOption.id);
      console.warn(`${USECASE_RESTORE_LOG_PREFIX} restored`, { outcome: 'restored' });
      return;
    }

    console.warn(`${USECASE_RESTORE_LOG_PREFIX} skipped`, { outcome: 'missing' });
    safeUseCaseStorageRemove(makeUserSettingsStorageKey(user.id));
  }, [onboardingDemoFlow.shouldShowUseCaseSelection, selectedUseCaseId, user.id, useCaseOptions]);

  if (isPreparingDemoSession && !isAdvancedDemoLayoutReady) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6 text-center text-slate-700">
          {translateCurrentLanguage('common.loadingWorkspace')}
        </div>
      }
    >
      <>
        {isPortfolioTransition && <div role="status" tabIndex={-1} ref={element => element?.focus()} onKeyDown={event => event.preventDefault()} className="fixed inset-0 z-[110] flex items-center justify-center bg-white/90 text-slate-900">{t('persistence.saving')}</div>}
        <div role={persistenceStatus === 'error' ? 'alert' : 'status'} className="fixed bottom-3 right-3 z-[100] max-w-lg rounded-lg bg-white px-4 py-2 text-sm text-slate-900 shadow dark:bg-slate-800 dark:text-white">
          {persistenceStatus === 'error' ? t('persistence.error') : persistenceStatus === 'saving' ? t('persistence.saving') : t('persistence.saved')}
          {persistenceStatus === 'error' && <button className="ml-3 underline" onClick={() => { void persistence.save(currentPortfolioData).catch(() => undefined); }}>{t('persistence.retry')}</button>}
        </div>
        <SectionCrashBoundary sectionName="provider tree">
          <ProvidersBootLogger />
          <SectionCrashBoundary sectionName="router/app shell">
                <RouterMountLogger />
                <Layout
                  currentPage={currentPage}
                  onNavigate={(page) => handleTutorialNavigate(page as PageType)}
                  currentUserName={user.name}
                  currentUserEmail={user.email}
                  onLogout={handleLogoutWithDebug}
                  tutorialTargetId={tutorialTargetId}
                  workspaceModeState={workspaceModeState}
                  demoPreview={
                    isDemoPreviewActive
                      ? {
                          active: true,
                          onExit: stopDemoPreview,
                          onStartWithRealData: stopDemoPreview,
                          onAddFirstProperty: () => {
                            stopDemoPreview();
                            handleChooseStarterPath('manual-property');
                          },
                          onReplay:
                            demoPreviewState?.mode === 'guided' || isDemoUser
                              ? replayTutorial
                              : undefined,
                        }
                      : null
                  }
                >
                  <AppPageRenderer
                    currentPage={currentPage}
                    user={user}
                    isDemoUser={isDemoUser}
                    isPropertiesOnlyMode={isPropertiesOnlyMode}
                    syncedProperties={syncedProperties}
                    effectiveMortgages={effectiveMortgages}
                    effectiveCashAccounts={effectiveCashAccounts}
                    effectiveBankConnections={effectiveBankConnections}
                    effectiveInvestmentAccounts={effectiveInvestmentAccounts}
                    effectiveOpportunities={effectiveOpportunities}
                    effectiveRehabProjects={effectiveRehabProjects}
                    effectiveReports={effectiveReports}
                    effectiveReportTemplates={effectiveReportTemplates}
                    effectiveReportBranding={effectiveReportBranding}
                    pendingStarterPath={pendingStarterPath}
                    tutorialTargetId={tutorialTargetId}
                    activeTutorialUiState={activeTutorialUiState}
                    onUpdateCashAccounts={handleUpdateCashAccounts}
                    onUpdateBankConnections={handleUpdateBankConnections}
                    onUpdateInvestmentAccounts={handleUpdateInvestmentAccounts}
                    onConnectEtoroAccount={connectEtoroAccount}
                    onSyncInvestmentAccount={syncInvestmentAccount}
                    onAddProperty={handleAddProperty}
                    onEditProperty={handleEditProperty}
                    onDeleteProperty={handleDeleteProperty}
                    onGenerateReportFromSource={handleGenerateReportFromSource}
                    onRequestOpenAddProperty={handleTutorialOpenAddProperty}
                    onStartAddProperty={() => handleChooseStarterPath('manual-property')}
                    onOpenProperties={() => setCurrentPage('properties')}
                    onRequestPropertyTabChange={handleTutorialPropertyTabChange}
                    onAddOpportunity={handleAddOpportunity}
                    onUpdateOpportunity={handleUpdateOpportunity}
                    onDeleteOpportunity={handleDeleteOpportunity}
                    onConvertOpportunity={handleConvertOpportunity}
                    onAddMortgage={handleAddMortgage}
                    onEditMortgage={handleEditMortgage}
                    onDeleteMortgage={handleDeleteMortgage}
                    onAddProject={handleAddRehabProject}
                    onUpdateProject={handleUpdateRehabProject}
                    onDeleteProject={handleDeleteRehabProject}
                    onAddReport={handleAddReport}
                    onUpdateReport={handleUpdateReport}
                    onAddTemplate={handleAddReportTemplate}
                    onUpdateBranding={handleUpdateReportBranding}
                    onExportBackup={handleExportBackup}
                    onImportBackup={handleImportBackup}
                    onSyncBackupToServer={handleSyncBackupToServer}
                    onRestoreBackupFromServer={handleRestoreBackupFromServer}
                    onReplayDemoTutorial={replayTutorial}
                    onResetDemoData={isDemoUser ? handleResetDemoData : undefined}
                  />
                </Layout>
              </SectionCrashBoundary>
              {onboardingDemoFlow.shouldShowLanguageSelection ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <LanguageSelectionStep
                    currentLanguage={settings.language}
                    currentCurrency={settings.currency}
                    onChangeLanguage={handleChangeTutorialLanguage}
                    onChangeCurrency={handleChangeTutorialCurrency}
                    onContinue={handleCompleteInitialTutorialSetup}
                    title={t('tutorial.languagePrompt.title')}
                    description={t('tutorial.languagePrompt.description')}
                    helper={t('tutorial.languagePrompt.helper')}
                    languageLabel={t('tutorial.languagePrompt.languageLabel')}
                    currencyLabel={t('tutorial.languagePrompt.currencyLabel')}
                    continueLabel={t('tutorial.languagePrompt.continue')}
                  />
                </SectionCrashBoundary>
              ) : null}
              {onboardingDemoFlow.shouldShowUseCaseSelection ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <UseCaseSelectionStep
                    options={useCaseOptions}
                    selectedOptionId={selectedUseCaseId}
                    onContinue={handleContinueUseCaseSelection}
                    onSelectOptionId={handleSelectUseCaseId}
                    onSkip={handleSkipUseCaseSelection}
                    showSkipButton={!isDemoUser}
                    title={t('tutorial.useCasePrompt.title')}
                    description={t('tutorial.useCasePrompt.description')}
                    continueLabel={t('tutorial.useCasePrompt.continue')}
                    skipLabel={t('tutorial.useCasePrompt.skip')}
                  />
                </SectionCrashBoundary>
              ) : null}
              {onboardingDemoFlow.shouldShowTutorial && activeTutorialStep ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <DemoGuidedTutorial
                    step={activeTutorialStep}
                    stepIndex={Math.max(activeTutorialVisibleIndex, 0)}
                    totalSteps={activeDemoTutorialSteps.length}
                    targetStatus={tutorialTargetResolution.status}
                    onBack={goBackTutorial}
                    onNext={advanceTutorial}
                    onSkip={dismissTutorial}
                  />
                </SectionCrashBoundary>
              ) : null}
              {shouldShowPostSignupWorkspaceSetup ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <PostSignupWorkspaceSetup
                    userId={user.id}
                    userName={user.name}
                    initialStage={pendingOnboardingStep}
                    initialUserMode={settings.userMode}
                    initialTrackingPreference={settings.onboarding.trackingPreference ?? 'properties-and-rent'}
                    initialOnboarding={settings.onboarding}
                    onChooseStarterPath={handleChooseStarterPath}
                    onUpdateStep={(step: import('../../common/types/settings').OnboardingStep | null) =>
                      updateSettings({ onboardingStep: step })
                    }
                    onComplete={handleCompletePostSignupSetup}
                  />
                </SectionCrashBoundary>
              ) : null}
              {shouldShowBasicModeSetupWizard ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <BasicModeSetupWizard
                    onClose={() => handleFinishBasicModeSetup(null)}
                    onFinish={handleFinishBasicModeSetup}
                  />
                </SectionCrashBoundary>
              ) : null}
        </SectionCrashBoundary>
      </>
    </Suspense>
  );
};

function WebAppContent() {
  const {
    currentUser,
    isAuthBootstrapLoading,
    hydrationError,
    retryHydration,
    portfolioHydration,
    sessionKey,
    handleLogin,
    handleRegister,
    handleLogout,
  } = useAuthBootstrapController();

  const handleSocialAuth = async (provider: 'google' | 'apple' | 'microsoft') => {
    throw new Error(
      `${provider[0].toUpperCase()}${provider.slice(1)} sign-in UI is ready, but the secure OAuth backend is not configured yet. Next step: add provider credentials, callback routes, and session exchange.`
    );
  };

  useEffect(() => {
    console.info(`${NORMAL_MODE_LOG_PREFIX} app booted in normal mode`);
    console.info(`${BOOT_LOG_PREFIX} app entry started`);
  }, []);
  useEffect(() => {
    console.info(`${BOOT_LOG_PREFIX} initial screen rendered`);
  }, []);

  if (hydrationError) return <div role="alert" className="p-8">
    {translateCurrentLanguage('persistence.loadError')}
    <button className="ml-3 underline" onClick={retryHydration}>{translateCurrentLanguage('persistence.retry')}</button>
  </div>;

  if (!currentUser) {
    if (isAuthBootstrapLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6 text-center text-slate-700">
          {translateCurrentLanguage('common.loadingWorkspace')}
        </div>
      );
    }

    return (
      <SettingsProvider>
        <AuthScreen
          onLogin={handleLogin}
          onRegister={handleRegister}
          onSocialAuth={handleSocialAuth}
        />
      </SettingsProvider>
    );
  }

  if (
    isAuthBootstrapLoading ||
    !portfolioHydration ||
    portfolioHydration.userId !== currentUser.id
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6 text-center text-slate-700">
        {translateCurrentLanguage('common.loadingWorkspace')}
      </div>
    );
  }

  return (
    <SettingsProvider storageKey={makeUserSettingsStorageKey(currentUser.id)}>
      <ProvidersBootLogger />
      <WebAppShell
        key={`${currentUser.id}-${sessionKey}`}
        user={currentUser}
        portfolioHydration={portfolioHydration}
        onLogout={handleLogout}
      />
    </SettingsProvider>
  );
}

const ProvidersBootLogger = () => {
  useEffect(() => {
    console.info('[mount] providers');
  }, []);

  return null;
};

const RouterMountLogger = () => {
  useEffect(() => {
    console.info('[mount] router');
  }, []);

  return null;
};

const DemoMountLogger = () => {
  useEffect(() => {
    console.info('[mount] demo');
  }, []);

  return null;
};

const AppRoot = EMERGENCY_SAFE_MODE ? WebApp : WebApp;

function WebApp() {
  return (
    <AppErrorBoundary>
      <AppSafetyProvider>
        <WebAppContent />
      </AppSafetyProvider>
    </AppErrorBoundary>
  );
}

export default AppRoot;
