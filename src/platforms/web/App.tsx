import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getPendingOnboardingStep } from '../../common/utils/onboarding';
import {
  completeOnboarding,
  createPendingOnboardingState,
  beginOnboarding,
  markReadyToComplete,
  markTutorialEntryResolved,
  markWorkspaceInitialized,
  isOnboardingComplete,
  resumeOnboardingState,
} from '../../common/utils/onboardingStateMachine';
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
  loadUserPortfolio,
  LocalAccountUser,
  clearDemoSessionState,
  clearDemoAccountSessionPointers,
  clearDemoAuthArtifacts,
  makeUserSettingsStorageKey,
  resetDemoAccountData,
  importUserAccountBackup,
  saveUserPortfolio,
  saveUserRecoverySnapshot,
  saveDemoSessionBackup,
  DEMO_ACCOUNT_EMAIL,
  UserPortfolioData,
  safeJsonParse,
  safeJsonStringify,
} from './services/localAccountStore';
import {
  hasStoredUseCaseSelection,
  getStoredSelectedUseCaseId,
  setStoredUseCaseSelection,
  setStoredSelectedUseCaseId,
} from '../../common/utils/settingsStore';
import { flushBackupToServer, loadBackupFromServer, saveBackupToServer } from './services/accountBackupApi';
import '../web/styles/index.css';
import { translateCurrentLanguage } from '../web/i18n/translations';
import { GALLERY_SAFE_MODE } from './utils/gallerySafeMode';
import { APP_RECOVERY_MODE } from './utils/appRecoveryMode';

const Layout = lazy(() => import('../web/components/Layout').then((module) => ({ default: module.Layout })));
const AuthScreen = lazy(() =>
  import('../web/components/AuthScreen').then((module) => ({ default: module.AuthScreen }))
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

const normalizeStoredInvestmentAccounts = (
  accounts: InvestmentAccount[]
): InvestmentAccount[] =>
  accounts.map((account) => ({
    ...account,
    provider: account.provider ?? 'manual',
    syncStatus: account.syncStatus ?? 'idle',
    dailyChangePct: account.dailyChangePct ?? null,
    lastSyncedAt: account.lastSyncedAt ?? null,
    lastSuccessfulBalance: account.lastSuccessfulBalance ?? null,
    syncError: account.syncError ?? null,
  }));

const DEMO_TUTORIAL_DISMISSED_KEY = 're-portfolio-demo-tutorial-dismissed';
const DEMO_TUTORIAL_RESTART_REQUEST_KEY = 're-portfolio-demo-tutorial-restart-request';
const DEMO_TUTORIAL_ADVANCED_SESSION_KEY = 're-portfolio-demo-advanced-session';
const DEMO_ONBOARDING_FLOW_SESSION_KEY = 're-portfolio-demo-onboarding-flow';
const DEMO_SELECTED_USE_CASE_SESSION_KEY = 're-portfolio-demo-selected-use-case';
const DEMO_ONBOARDING_STAGE_SESSION_KEY = 're-portfolio-demo-onboarding-stage';
const DEMO_ONBOARDING_DISMISSED_KEY = 're-portfolio-demo-onboarding-dismissed';
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
const RECOVERY_SNAPSHOT_LOG_PREFIX = '[recovery-snapshot]';
const DEMO_SESSION_LOG_PREFIX = '[demo-restore]';
const USECASE_RESTORE_LOG_PREFIX = '[usecase-restore]';
const BOOT_LOG_PREFIX = '[boot]';

const safeDemoStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
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
    window.sessionStorage.setItem(key, value);
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
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} localStorage remove failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const clearDemoAuthAndTutorialPointers = (userEmail?: string | null) => {
  clearDemoAccountSessionPointers();
  clearDemoAuthArtifacts(userEmail);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(DEMO_ONBOARDING_DISMISSED_KEY);
  } catch (error) {
    console.warn('[demo-restore] failed to clear demo auth/tutorial pointers', {
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

const safeSessionStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} sessionStorage get failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const safeSessionStorageSet = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} sessionStorage set failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const safeSessionStorageRemove = (key: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} sessionStorage remove failed`, {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const readDemoOnboardingSnapshot = (): ReturnType<typeof resumeOnboardingState> | null => {
  const raw = safeSessionStorageGet(DEMO_ONBOARDING_FLOW_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return resumeOnboardingState(JSON.parse(raw));
  } catch {
    safeSessionStorageRemove(DEMO_ONBOARDING_FLOW_SESSION_KEY);
    return null;
  }
};

const writeDemoOnboardingSnapshot = (snapshot: ReturnType<typeof resumeOnboardingState> | null) => {
  if (!snapshot) {
    safeSessionStorageRemove(DEMO_ONBOARDING_FLOW_SESSION_KEY);
    safeSessionStorageRemove(DEMO_SELECTED_USE_CASE_SESSION_KEY);
    safeSessionStorageRemove(DEMO_ONBOARDING_STAGE_SESSION_KEY);
    return;
  }

  safeSessionStorageSet(DEMO_ONBOARDING_FLOW_SESSION_KEY, JSON.stringify(snapshot));
  safeSessionStorageSet(DEMO_SELECTED_USE_CASE_SESSION_KEY, snapshot.selectedUseCaseId ?? '');
  safeSessionStorageSet(DEMO_ONBOARDING_STAGE_SESSION_KEY, snapshot.lifecycleState);
};

const getDemoOnboardingSnapshot = (): ReturnType<typeof resumeOnboardingState> =>
  readDemoOnboardingSnapshot() ?? createPendingOnboardingState();

const clearDemoOnboardingSessionState = () => {
  writeDemoOnboardingSnapshot(null);
};

const isDemoOnboardingDismissed = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(DEMO_ONBOARDING_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const setDemoOnboardingDismissed = (dismissed: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (dismissed) {
      window.localStorage.setItem(DEMO_ONBOARDING_DISMISSED_KEY, 'true');
    } else {
      window.localStorage.removeItem(DEMO_ONBOARDING_DISMISSED_KEY);
    }
  } catch (error) {
    console.warn(`${DEMO_SESSION_LOG_PREFIX} demo onboarding dismissal update failed`, {
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
  demoOnboardingLifecycleState: ReturnType<typeof resumeOnboardingState>['lifecycleState'];
  hasExplicitLanguageSelection: boolean;
  hasStoredUseCaseSelection: boolean;
  personalizationCompletedThisSession: boolean;
  showLanguageSelectionStep: boolean;
  showUseCaseSelectionStep: boolean;
  demoTutorialDismissed: boolean;
  demoPreviewState: DemoPreviewState | null;
  activeTutorialStepId: string | null;
}): OnboardingDemoFlowState => {
  const isDemoOnboardingCompleted = args.demoOnboardingLifecycleState === 'completed';
  const isPersonalizationVisible =
    args.showLanguageSelectionStep || args.showUseCaseSelectionStep;
  const shouldShowPersonalization =
    !isDemoOnboardingCompleted &&
    !args.personalizationCompletedThisSession &&
    !args.demoTutorialDismissed &&
    (!args.hasExplicitLanguageSelection || !args.hasStoredUseCaseSelection || isPersonalizationVisible);

  const shouldShowLanguageSelection =
    !isDemoOnboardingCompleted &&
    shouldShowPersonalization &&
    (!args.hasExplicitLanguageSelection || !args.hasStoredUseCaseSelection || args.showLanguageSelectionStep);

  const shouldShowUseCaseSelection =
    !isDemoOnboardingCompleted &&
    shouldShowPersonalization &&
    (args.hasExplicitLanguageSelection || args.hasStoredUseCaseSelection || args.showUseCaseSelectionStep);

  const shouldShowTutorial =
    !isDemoOnboardingCompleted &&
    Boolean(args.activeTutorialStepId) &&
    !shouldShowPersonalization &&
    !shouldShowLanguageSelection;

  const shouldStartGuidedDemoPreview =
    !isDemoOnboardingCompleted &&
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
  onLogout: (backup: import('./services/localAccountStore').UserAccountBackup) => void;
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

const WebAppShell = ({ user, onLogout }: WebAppShellProps) => {
  const { canAutoWrite, isBootSettled, appRecoveryMode } = useAppSafety();
  const { settings, hasExplicitLanguageSelection, updateSettings, t } = useSettings();
  const initialPortfolioData = useMemo(() => loadUserPortfolio(user.id), [user.id]);
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
    () => normalizeStoredInvestmentAccounts(initialPortfolioData.investmentAccounts)
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
  const [demoOnboardingSnapshot, setDemoOnboardingSnapshot] = useState(() => getDemoOnboardingSnapshot());
  const [demoTutorialDismissed, setDemoTutorialDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(DEMO_ONBOARDING_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
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
      isDemoUser
        ? deriveOnboardingDemoFlowState({
            demoOnboardingLifecycleState: demoOnboardingSnapshot.lifecycleState,
            hasExplicitLanguageSelection,
            hasStoredUseCaseSelection: Boolean(demoOnboardingSnapshot.selectedUseCaseId),
            personalizationCompletedThisSession,
            showLanguageSelectionStep,
            showUseCaseSelectionStep,
            demoTutorialDismissed,
            demoPreviewState,
            activeTutorialStepId:
              demoOnboardingSnapshot.lifecycleState === 'completed' ? null : activeTutorialStepId,
          })
        : deriveOnboardingDemoFlowState({
            demoOnboardingLifecycleState: 'pending',
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
      demoOnboardingSnapshot.lifecycleState,
      demoOnboardingSnapshot.selectedUseCaseId,
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

      if (persistUseCaseSelection && !isDemoUser) {
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
    if (isDemoUser) {
      setDemoOnboardingSnapshot((currentSnapshot) => {
        if (currentSnapshot.lifecycleState === 'completed') {
          return currentSnapshot;
        }

        return createPendingOnboardingState();
      });
    }
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
    () => normalizeProperties(effectiveProperties, effectiveMortgages),
    [effectiveMortgages, effectiveProperties]
  );
  const backupExportedAtRef = useRef(new Date().toISOString());
  const currentBackup = useMemo(
    () => ({
      version: 1 as const,
      exportedAt: backupExportedAtRef.current,
      user: {
        name: user.name,
        email: user.email,
      },
      portfolio: {
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
      },
      settings,
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
      settings,
      user.email,
      user.name,
    ]
  );

  useEffect(() => {
    if (!isDemoUser || typeof window === 'undefined') {
      return;
    }

    saveDemoSessionBackup(currentBackup);
  }, [currentBackup, isDemoUser]);

  const handleAddProperty = (property: Property) => {
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
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                properties: currentPreview.portfolio.properties.map((currentProperty) =>
                  currentProperty.id === property.id
                    ? normalizePropertyRecord(property)
                    : currentProperty
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setProperties((currentProperties) =>
      currentProperties.map((currentProperty) =>
        currentProperty.id === property.id
          ? normalizePropertyRecord(property)
          : currentProperty
      )
    );
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
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                mortgages: [...currentPreview.portfolio.mortgages, mortgage],
              },
            }
          : currentPreview
      );
      return;
    }

    setMortgages((currentMortgages) => [...currentMortgages, mortgage]);
  };

  const handleEditMortgage = (mortgage: Mortgage) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                mortgages: currentPreview.portfolio.mortgages.map((currentMortgage) =>
                  currentMortgage.id === mortgage.id ? mortgage : currentMortgage
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setMortgages((currentMortgages) =>
      currentMortgages.map((currentMortgage) =>
        currentMortgage.id === mortgage.id ? mortgage : currentMortgage
      )
    );
  };

  const handleDeleteMortgage = (mortgageId: string) => {
    if (isDemoPreviewActive) {
      setDemoPreviewState((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              portfolio: {
                ...currentPreview.portfolio,
                mortgages: currentPreview.portfolio.mortgages.filter(
                  (mortgage) => mortgage.id !== mortgageId
                ),
              },
            }
          : currentPreview
      );
      return;
    }

    setMortgages((currentMortgages) =>
      currentMortgages.filter((mortgage) => mortgage.id !== mortgageId)
    );
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

  const handleImportBackup = (backup: import('./services/localAccountStore').UserAccountBackup) => {
    importUserAccountBackup(user, backup);
    window.location.reload();
  };

  const handleSyncBackupToServer = async () => {
    await saveBackupToServer(currentBackup);
  };

  const handleRestoreBackupFromServer = async () => {
    const result = await loadBackupFromServer(user.email);
    importUserAccountBackup(user, result.payload);
    window.location.reload();
  };

  const handleResetDemoData = () => {
    const result = resetDemoAccountData(user, {
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
    onLogout(currentBackup);
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

  useEffect(() => {
    if (!canAutoWrite) {
      console.debug('[recovery] skipped portfolio auto-save');
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
    saveUserPortfolio(user.id, {
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
    });
  }, [bankConnections, cashAccounts, investmentAccounts, mortgages, opportunities, properties, rehabProjects, reportBranding, reportTemplates, reports, user.id]);

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

    const serializedBackup = safeJsonStringify(currentBackup);

    if (!serializedBackup) {
      console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} skipped recovery snapshot writeback`);
      return;
    }

    try {
      saveUserRecoverySnapshot(user, currentBackup);
    } catch (error) {
      console.warn(`${RECOVERY_SNAPSHOT_LOG_PREFIX} recovery snapshot writeback failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
      const flushed = flushBackupToServer(currentBackup);

      if (!flushed) {
        void saveBackupToServer(currentBackup).catch(() => {
          // Keep local and recovery snapshot data even if the network is unavailable.
        });
      }
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
  }, [currentBackup, user]);

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
  const shouldShowDemoTutorial =
    isDemoUser &&
    !demoTutorialDismissed &&
    !isOnboardingComplete(demoOnboardingSnapshot) &&
    onboardingDemoFlow.shouldShowTutorial &&
    Boolean(activeTutorialStep);

  useEffect(() => {
    console.info('[demo-tutorial] shouldShowDemoTutorial', shouldShowDemoTutorial);
  }, [shouldShowDemoTutorial]);

  const tutorialTargetId = activeTutorialStep?.targetId ?? null;
  const pendingOnboardingStep = settings.onboardingFlow
    ? (isOnboardingComplete(settings.onboardingFlow) ? null : 'welcome')
    : getPendingOnboardingStep(settings);
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
    if (demoTutorialDismissed) {
      return;
    }

    if (onboardingDemoFlow.shouldStartGuidedDemoPreview && activeTutorialStepId === null) {
      console.info('[demo-tutorial] auto-start preview effect setting first step');
      stopDemoPreview();
    }
  }, [
    activeTutorialStepId,
    onboardingDemoFlow.shouldStartGuidedDemoPreview,
    demoTutorialDismissed,
    stopDemoPreview,
  ]);

  useEffect(() => {
    if (demoTutorialDismissed) {
      return;
    }

    if (!isDemoUser || !demoOnboardingSnapshot.selectedUseCaseId) {
      return;
    }

    if (tutorialTargetResolution.status !== 'ready') {
      return;
    }

    const readySnapshot = markReadyToComplete(
      markTutorialEntryResolved(markWorkspaceInitialized(demoOnboardingSnapshot))
    );
    if (readySnapshot.lifecycleState !== demoOnboardingSnapshot.lifecycleState) {
      setDemoOnboardingSnapshot(readySnapshot);
      writeDemoOnboardingSnapshot(readySnapshot);
    }
  }, [demoOnboardingSnapshot, isDemoUser, tutorialTargetResolution.status, demoTutorialDismissed]);

  useEffect(() => {
    if (demoTutorialDismissed) {
      return;
    }

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
    console.info('[demo-tutorial] dismissTutorial');
    setDemoTutorialDismissed(true);
    setDemoOnboardingDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(demoTutorialDismissedStorageKey, new Date().toISOString());
      window.localStorage.removeItem(demoTutorialRestartRequestStorageKey);
    }

    setActiveTutorialStepId(null);
    if (isDemoUser) {
      const completedSnapshot = completeOnboarding(demoOnboardingSnapshot);
      setDemoOnboardingSnapshot(completedSnapshot);
      writeDemoOnboardingSnapshot(completedSnapshot);
    } else {
      updateSettings({
        onboardingCompleted: true,
        onboardingStep: null,
        onboardingFlow: completeOnboarding(settings.onboardingFlow ?? createPendingOnboardingState()),
        onboarding: {
          ...settings.onboarding,
          completed: true,
        },
      });
    }
    stopDemoPreview();
  };

  const exitDemoMode = () => {
    clearTutorialTargetRetry();
    console.info('[demo-tutorial] exitDemoMode');
    setDemoTutorialDismissed(true);
    setDemoOnboardingDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(demoTutorialDismissedStorageKey, new Date().toISOString());
      window.localStorage.removeItem(demoTutorialRestartRequestStorageKey);
    }

    clearDemoAuthAndTutorialPointers(user.email);
    stopDemoPreview();
    setActiveTutorialStepId(null);
    setShowLanguageSelectionStep(false);
    setShowUseCaseSelectionStep(false);
    setSelectedUseCaseId(null);

    if (isDemoUser) {
      updateSettings({
        onboardingCompleted: false,
        onboardingStep: null,
        onboardingFlow: null,
        onboarding: {
          ...settings.onboarding,
          completed: false,
        },
        workspaceConfig: createMinimalWorkspaceConfig(user.id),
      });
    }

    onLogout(currentBackup);
  };

  const finalizeRealAccountOnboarding = useCallback(() => {
    updateSettings({
      onboardingCompleted: true,
      onboardingStep: null,
      onboardingFlow: completeOnboarding(settings.onboardingFlow ?? createPendingOnboardingState()),
      onboarding: {
        ...settings.onboarding,
        completed: true,
      },
    });
  }, [settings.onboarding, settings.onboardingFlow, updateSettings]);

  const replayTutorial = () => {
    resetPersonalizationSessionGate();
    console.info('[demo-tutorial] replayTutorial');
    setDemoTutorialDismissed(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DEMO_ONBOARDING_DISMISSED_KEY);
      window.localStorage.removeItem(demoTutorialDismissedStorageKey);
      window.localStorage.removeItem(demoTutorialRestartRequestStorageKey);
    }

    setIsPreparingDemoSession(true);
    beginForcedAdvancedDemoSession(false);
    setCurrentPage('dashboard');
    setShowLanguageSelectionStep(true);
    setShowUseCaseSelectionStep(false);
    setActiveTutorialStepId(null);
    if (isDemoUser) {
      const pendingSnapshot = createPendingOnboardingState();
      setDemoOnboardingSnapshot(pendingSnapshot);
      writeDemoOnboardingSnapshot(pendingSnapshot);
    }
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
      const nextStepId = resolveNextVisibleTutorialStepId(currentStepId);

      if (!isDemoUser && nextStepId === null) {
        finalizeRealAccountOnboarding();
      }

      if (isDemoUser && nextStepId === null) {
        const completedSnapshot = completeOnboarding(demoOnboardingSnapshot);
        setDemoOnboardingSnapshot(completedSnapshot);
        writeDemoOnboardingSnapshot(completedSnapshot);
      }

      return nextStepId;
    });
  }, [
    clearTutorialTargetRetry,
    demoOnboardingSnapshot,
    finalizeRealAccountOnboarding,
    isDemoUser,
    resolveNextVisibleTutorialStepId,
  ]);

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
      const startedSnapshot = beginOnboarding('');
      setDemoOnboardingSnapshot(startedSnapshot);
      writeDemoOnboardingSnapshot(startedSnapshot);
      setActiveTutorialStepId(null);
      return;
    }

    setShowLanguageSelectionStep(false);
    setShowUseCaseSelectionStep(true);
    setSelectedUseCaseId(null);
    setActiveTutorialStepId(null);
  };

  const handleSelectUseCaseId = (optionId: string) => {
    if (isDemoOnboardingDismissed()) {
      return;
    }
    setSelectedUseCaseId(optionId);
  };

  const handleContinueUseCaseSelection = (selectedOption: UseCaseOption) => {
    if (isDemoOnboardingDismissed()) {
      return;
    }
    const resolvedSelectedOption =
      selectedUseCaseOption ?? resolveUseCaseOptionById(useCaseOptions, selectedOption.id);

    if (!resolvedSelectedOption) {
      return;
    }

    markPersonalizationCompletedThisSession();
    setSelectedUseCaseId(resolvedSelectedOption.id);
    if (isDemoUser) {
      const inProgressSnapshot = beginOnboarding(resolvedSelectedOption.id);
      setDemoOnboardingSnapshot(inProgressSnapshot);
      writeDemoOnboardingSnapshot(inProgressSnapshot);
    }

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
    if (!isDemoUser) {
      setStoredUseCaseSelection(settingsStorageKey, true);
      setStoredSelectedUseCaseId(settingsStorageKey, resolvedSelectedOption.id);
    }
  };

  const handleSkipUseCaseSelection = () => {
    markPersonalizationCompletedThisSession();
    const settingsStorageKey = makeUserSettingsStorageKey(user.id);
    if (!isDemoUser) {
      setStoredUseCaseSelection(settingsStorageKey, true);
      setStoredSelectedUseCaseId(settingsStorageKey, null);
    }
    setSelectedUseCaseId(null);
    setShowUseCaseSelectionStep(false);

    const fallbackOption = isDemoUser ? advancedDemoOption : useCaseOptions[0];
    if (fallbackOption) {
      if (isDemoUser) {
        const inProgressSnapshot = beginOnboarding(fallbackOption.id);
        setDemoOnboardingSnapshot(inProgressSnapshot);
        writeDemoOnboardingSnapshot(inProgressSnapshot);
      }
      startDemoPreview(fallbackOption, 'guided');
    }
    setActiveTutorialStepId(resolveDemoStartStepId(firstDemoTutorialStepId));
  };

  useEffect(() => {
    const demoOnboardingCompleted = isDemoUser && isOnboardingComplete(demoOnboardingSnapshot);
    const realAccountOnboardingCompleted =
      !isDemoUser && Boolean(settings.onboardingFlow) && isOnboardingComplete(settings.onboardingFlow!);

    if (demoTutorialDismissed || demoOnboardingCompleted || realAccountOnboardingCompleted) {
      return;
    }

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
    demoOnboardingSnapshot,
    resolveDemoStartStepId,
    settings.onboardingFlow,
    isDemoUser,
    onboardingDemoFlow.shouldShowPersonalization,
    demoTutorialDismissed,
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
    demoTutorialDismissed,
  ]);

  useEffect(() => {
    if (!isDemoUser || typeof window === 'undefined') {
      return;
    }

    if (demoTutorialDismissed) {
      clearDemoOnboardingSessionState();
      setActiveTutorialStepId(null);
      return;
    }

    const snapshot = readDemoOnboardingSnapshot();
    if (!snapshot) {
      return;
    }

    setDemoOnboardingSnapshot(snapshot);
    if (snapshot.selectedUseCaseId) {
      setSelectedUseCaseId(snapshot.selectedUseCaseId);
    }
    if (snapshot.lifecycleState === 'completed') {
      setShowLanguageSelectionStep(false);
      setShowUseCaseSelectionStep(false);
      setActiveTutorialStepId(null);
    }
  }, [isDemoUser, user.id, demoTutorialDismissed]);

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
        <SectionCrashBoundary sectionName="provider tree">
          <ProvidersBootLogger />
          <AppSafetyProvider>
            <SettingsProvider storageKey={makeUserSettingsStorageKey(user.id)}>
              <SectionCrashBoundary sectionName="router/app shell">
                <RouterMountLogger />
                <Layout
                  currentPage={currentPage}
                  onNavigate={(page) => handleTutorialNavigate(page as PageType)}
                  currentUserName={user.name}
                  currentUserEmail={user.email}
                  onLogout={handleLogoutWithDebug}
                  onExitDemo={isDemoUser ? exitDemoMode : undefined}
                  tutorialTargetId={tutorialTargetId}
                  workspaceModeState={workspaceModeState}
                  demoPreview={
                    isDemoPreviewActive
                      ? {
                          active: true,
                          onExit: () => {
                            stopDemoPreview();
                            if (isDemoUser) {
                              clearDemoAuthAndTutorialPointers(user.email);
                            }
                          },
                          onStartWithRealData: () => {
                            stopDemoPreview();
                            if (isDemoUser) {
                              clearDemoAuthAndTutorialPointers(user.email);
                            }
                          },
                          onAddFirstProperty: () => {
                            stopDemoPreview();
                            if (isDemoUser) {
                              clearDemoAuthAndTutorialPointers(user.email);
                            }
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
              {shouldShowDemoTutorial ? (
                <SectionCrashBoundary sectionName="demo/onboarding route">
                  <DemoMountLogger />
                  <DemoGuidedTutorial
                    step={activeTutorialStep!}
                    stepIndex={Math.max(activeTutorialVisibleIndex, 0)}
                    totalSteps={activeDemoTutorialSteps.length}
                    targetStatus={tutorialTargetResolution.status}
                    onBack={goBackTutorial}
                    onNext={advanceTutorial}
                    onClose={dismissTutorial}
                    onSkip={dismissTutorial}
                    onExitDemo={isDemoUser ? exitDemoMode : undefined}
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
            </SettingsProvider>
          </AppSafetyProvider>
        </SectionCrashBoundary>
      </>
    </Suspense>
  );
};

function WebAppContent() {
  const {
    currentUser,
    isAuthBootstrapLoading,
    sessionKey,
    handleLogin,
    handleRegister,
    handleLogout,
  } = useAuthBootstrapController();
  const previousUserRef = useRef<LocalAccountUser | null>(null);

  const handleSocialAuth = async (provider: 'google' | 'apple' | 'microsoft') => {
    clearDemoSessionState();
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

  useEffect(() => {
    console.info('[auth] currentUser changed.', {
      currentUser: currentUser
        ? {
            id: currentUser.id,
            email: currentUser.email,
            isDemoUser: currentUser.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL,
          }
        : null,
    });
  }, [currentUser]);

  useEffect(() => {
    const previousUser = previousUserRef.current;

    if (!currentUser && previousUser?.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL) {
      clearDemoAuthAndTutorialPointers(previousUser.email);
    }

    previousUserRef.current = currentUser;
  }, [currentUser]);

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

  if (isAuthBootstrapLoading) {
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
