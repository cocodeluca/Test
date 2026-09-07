import { lazy } from 'react';
import { useEffect } from 'react';
import type {
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
} from '../../../common/types';
import type { LocalAccountUser, UserAccountBackup } from '../services/localAccountStore';
import { SectionCrashBoundary } from './SectionCrashBoundary';

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

const Dashboard = lazy(() => import('../pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const PropertiesOnlyDashboard = lazy(() =>
  import('../pages/PropertiesOnlyDashboard').then((module) => ({
    default: module.PropertiesOnlyDashboard,
  }))
);
const CashAccountsPage = lazy(() =>
  import('../pages/CashAccountsPage').then((module) => ({ default: module.CashAccountsPage }))
);
const PropertiesPage = lazy(() =>
  import('../pages/PropertiesPage').then((module) => ({ default: module.PropertiesPage }))
);
const MortgagesPage = lazy(() =>
  import('../pages/MortgagesPage').then((module) => ({ default: module.MortgagesPage }))
);
const OpportunitiesPage = lazy(() =>
  import('../pages/OpportunitiesPage').then((module) => ({ default: module.OpportunitiesPage }))
);
const RehabProjectsPage = lazy(() =>
  import('../pages/RehabProjectsPage').then((module) => ({ default: module.RehabProjectsPage }))
);
const ReportsPage = lazy(() =>
  import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage }))
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))
);

const DashboardMountLogger = () => {
  useEffect(() => {
    console.info('[mount] dashboard');
  }, []);

  return null;
};

const PropertiesMountLogger = () => {
  useEffect(() => {
    console.info('[mount] properties');
  }, []);

  return null;
};

const SettingsMountLogger = () => {
  useEffect(() => {
    console.info('[mount] settings');
  }, []);

  return null;
};

type AppPageRendererProps = {
  currentPage: PageType;
  user: LocalAccountUser;
  isDemoUser: boolean;
  isPropertiesOnlyMode: boolean;
  syncedProperties: Property[];
  effectiveMortgages: Mortgage[];
  effectiveCashAccounts: CashAccount[];
  effectiveBankConnections: BankConnection[];
  effectiveInvestmentAccounts: InvestmentAccount[];
  effectiveOpportunities: Opportunity[];
  effectiveRehabProjects: RehabProject[];
  effectiveReports: InvestmentReport[];
  effectiveReportTemplates: InvestmentReportTemplate[];
  effectiveReportBranding: ReportBrandingConfig;
  pendingStarterPath: 'manual-property' | 'import-file' | 'explore-demo' | null;
  tutorialTargetId: string | null;
  activeTutorialUiState: {
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
  } | null;
  onUpdateCashAccounts: (accounts: CashAccount[]) => void;
  onUpdateBankConnections: (connections: BankConnection[]) => void;
  onUpdateInvestmentAccounts: (accounts: InvestmentAccount[]) => void;
  onConnectEtoroAccount: () => Promise<void>;
  onSyncInvestmentAccount: (accountId: string) => Promise<void>;
  onAddProperty: (property: Property) => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onGenerateReportFromSource: (
    sourceType: 'opportunity' | 'property' | 'rehab',
    sourceId: string
  ) => void;
  onRequestOpenAddProperty: () => void;
  onStartAddProperty: () => void;
  onOpenProperties: () => void;
  onRequestPropertyTabChange: (
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
  ) => void;
  onAddOpportunity: (opportunity: Opportunity) => void;
  onUpdateOpportunity: (opportunity: Opportunity) => void;
  onDeleteOpportunity: (opportunityId: string) => void;
  onConvertOpportunity: (opportunity: Opportunity) => void;
  onAddMortgage: (mortgage: Mortgage) => void;
  onEditMortgage: (mortgage: Mortgage) => void;
  onDeleteMortgage: (mortgageId: string) => void;
  onAddProject: (project: RehabProject) => void;
  onUpdateProject: (project: RehabProject) => void;
  onDeleteProject: (projectId: string) => void;
  onAddReport: (report: InvestmentReport) => void;
  onUpdateReport: (report: InvestmentReport) => void;
  onAddTemplate: (template: InvestmentReportTemplate) => void;
  onUpdateBranding: (branding: ReportBrandingConfig) => void;
  onExportBackup: () => void;
  onImportBackup: (backup: UserAccountBackup) => Promise<void>;
  onSyncBackupToServer: () => Promise<void>;
  onRestoreBackupFromServer: () => Promise<void>;
  onReplayDemoTutorial: () => void;
  onResetDemoData?: () => void;
};

const DashboardBranch = (props: AppPageRendererProps) => {
  if (props.isPropertiesOnlyMode) {
    return (
      <SectionCrashBoundary sectionName="dashboard route">
        <DashboardMountLogger />
        <PropertiesOnlyDashboard
          properties={props.syncedProperties}
          mortgages={props.effectiveMortgages}
          cashAccounts={props.effectiveCashAccounts}
          onAddProperty={props.onStartAddProperty}
          onOpenProperties={props.onOpenProperties}
        />
      </SectionCrashBoundary>
    );
  }

  return (
    <SectionCrashBoundary sectionName="dashboard route">
      <DashboardMountLogger />
      <Dashboard
        properties={props.syncedProperties}
        mortgages={props.effectiveMortgages}
        cashAccounts={props.effectiveCashAccounts}
        investmentAccounts={props.effectiveInvestmentAccounts}
        opportunities={props.effectiveOpportunities}
        rehabProjects={props.effectiveRehabProjects}
        onUpdateCashAccounts={props.onUpdateCashAccounts}
        onUpdateInvestmentAccounts={props.onUpdateInvestmentAccounts}
        onConnectEtoroAccount={props.onConnectEtoroAccount}
        onSyncInvestmentAccount={props.onSyncInvestmentAccount}
      />
    </SectionCrashBoundary>
  );
};

export const AppPageRenderer = (props: AppPageRendererProps) => {
  switch (props.currentPage) {
    case 'dashboard':
      return <DashboardBranch {...props} />;
    case 'cash-accounts':
      return (
        <CashAccountsPage
          userId={props.user.id}
          cashAccounts={props.effectiveCashAccounts}
          bankConnections={props.effectiveBankConnections}
          onUpdateCashAccounts={props.onUpdateCashAccounts}
          onUpdateBankConnections={props.onUpdateBankConnections}
        />
      );
    case 'properties':
      return (
        <SectionCrashBoundary sectionName="properties route">
          <PropertiesMountLogger />
          <PropertiesPage
            properties={props.syncedProperties}
            mortgages={props.effectiveMortgages}
            onAddProperty={props.onAddProperty}
            onEditProperty={props.onEditProperty}
            onDeleteProperty={props.onDeleteProperty}
            onGenerateReport={props.onGenerateReportFromSource}
            tutorialTargetId={props.tutorialTargetId}
            onRequestOpenAddProperty={props.onRequestOpenAddProperty}
            autoOpenQuickCreate={props.pendingStarterPath === 'manual-property'}
            tutorialQuickCreateState={props.activeTutorialUiState?.quickCreateOpen ?? null}
            tutorialQuickCreateStep={props.activeTutorialUiState?.quickCreateStep ?? null}
            propertyTabOverride={props.activeTutorialUiState?.propertyTab ?? null}
            onRequestPropertyTabChange={props.onRequestPropertyTabChange}
          />
        </SectionCrashBoundary>
      );
    case 'opportunities':
      return (
        <OpportunitiesPage
          opportunities={props.effectiveOpportunities}
          onAddOpportunity={props.onAddOpportunity}
          onUpdateOpportunity={props.onUpdateOpportunity}
          onDeleteOpportunity={props.onDeleteOpportunity}
          onConvertOpportunity={props.onConvertOpportunity}
          onGenerateReport={props.onGenerateReportFromSource}
          autoOpenImport={props.pendingStarterPath === 'import-file'}
        />
      );
    case 'mortgages':
      return (
        <MortgagesPage
          properties={props.syncedProperties}
          mortgages={props.effectiveMortgages}
          onAddMortgage={props.onAddMortgage}
          onEditMortgage={props.onEditMortgage}
          onDeleteMortgage={props.onDeleteMortgage}
        />
      );
    case 'projects':
      return (
        <RehabProjectsPage
          projects={props.effectiveRehabProjects}
          opportunities={props.effectiveOpportunities}
          properties={props.syncedProperties}
          onAddProject={props.onAddProject}
          onUpdateProject={props.onUpdateProject}
          onDeleteProject={props.onDeleteProject}
          onGenerateReport={props.onGenerateReportFromSource}
          initialTab="projects"
        />
      );
    case 'budgets':
      return (
        <RehabProjectsPage
          projects={props.effectiveRehabProjects}
          opportunities={props.effectiveOpportunities}
          properties={props.syncedProperties}
          onAddProject={props.onAddProject}
          onUpdateProject={props.onUpdateProject}
          onDeleteProject={props.onDeleteProject}
          onGenerateReport={props.onGenerateReportFromSource}
          initialTab="budget"
        />
      );
    case 'documents':
      return (
        <RehabProjectsPage
          projects={props.effectiveRehabProjects}
          opportunities={props.effectiveOpportunities}
          properties={props.syncedProperties}
          onAddProject={props.onAddProject}
          onUpdateProject={props.onUpdateProject}
          onDeleteProject={props.onDeleteProject}
          onGenerateReport={props.onGenerateReportFromSource}
          initialTab="documents"
        />
      );
    case 'tasks':
      return (
        <RehabProjectsPage
          projects={props.effectiveRehabProjects}
          opportunities={props.effectiveOpportunities}
          properties={props.syncedProperties}
          onAddProject={props.onAddProject}
          onUpdateProject={props.onUpdateProject}
          onDeleteProject={props.onDeleteProject}
          onGenerateReport={props.onGenerateReportFromSource}
          initialTab="tasks"
        />
      );
    case 'reports':
      return (
        <ReportsPage
          reports={props.effectiveReports}
          templates={props.effectiveReportTemplates}
          branding={props.effectiveReportBranding}
          opportunities={props.effectiveOpportunities}
          properties={props.syncedProperties}
          rehabProjects={props.effectiveRehabProjects}
          currentUserName={props.user.name}
          onAddReport={props.onAddReport}
          onUpdateReport={props.onUpdateReport}
          onAddTemplate={props.onAddTemplate}
          onUpdateBranding={props.onUpdateBranding}
        />
      );
    case 'settings':
      return (
        <SectionCrashBoundary sectionName="settings route">
          <SettingsMountLogger />
          <SettingsPage
            currentUser={props.user}
            onExportBackup={props.onExportBackup}
            onImportBackup={props.onImportBackup}
            onSyncBackupToServer={props.onSyncBackupToServer}
            onRestoreBackupFromServer={props.onRestoreBackupFromServer}
            onReplayDemoTutorial={props.onReplayDemoTutorial}
            onResetDemoData={props.isDemoUser ? props.onResetDemoData : undefined}
          />
        </SectionCrashBoundary>
      );
    default:
      return <DashboardBranch {...props} />;
  }
};
