import React, { useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import type {
  DocumentAnalysisResult,
  OnboardingStep,
  TrackingPreference,
  UploadedWorkspaceFile,
  UserMode,
  WorkspaceConfig,
  WorkspaceGoal,
  WorkspaceRecommendation,
  WorkspaceStrategy,
} from '../../../common/types/settings';
import { getModulesForTrackingPreference } from '../../../common/utils/appModes';
import {
  analyzeUploadedWorkspaceFiles,
  approveDocumentAnalysis,
  mockIngestionScenarios,
  preprocessUploadedWorkspaceFile,
} from '../../../common/utils/ingestion';
import {
  analyzeWorkspaceProfile,
  createMinimalWorkspaceConfig,
  createOnboardingProfile,
  mockWorkspaceRecommendationScenarios,
  workspaceConfigFromRecommendation,
  workspaceGoals,
  workspaceStrategies,
} from '../../../common/utils/workspace';
import { IngestionReviewModal } from './IngestionReviewModal';
import { WorkspaceReviewScreen } from './WorkspaceReviewScreen';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface PostSignupWorkspaceSetupProps {
  userId: string;
  userName: string;
  initialUserMode?: UserMode;
  initialStage?: OnboardingStep | null;
  initialTrackingPreference?: TrackingPreference;
  initialOnboarding?: ReturnType<typeof createOnboardingProfile> | null;
  onChooseStarterPath: (path: 'manual-property' | 'import-file' | 'explore-demo') => void;
  onUpdateStep?: (step: OnboardingStep) => void;
  onComplete: (payload: {
    onboarding: ReturnType<typeof createOnboardingProfile>;
    workspaceConfig: WorkspaceConfig;
    dashboardSetupMode: 'simple' | 'connected';
    userMode: UserMode;
  }) => void;
}

export const PostSignupWorkspaceSetup: React.FC<PostSignupWorkspaceSetupProps> = ({
  userId,
  userName,
  initialUserMode = 'basic',
  initialStage = 'welcome',
  initialTrackingPreference = 'properties-and-rent',
  initialOnboarding = null,
  onChooseStarterPath,
  onUpdateStep,
  onComplete,
}) => {
  const { t } = useSettings();
  const [stage, setStage] = useState<'decision' | 'guided'>(
    initialStage === 'workspace-setup' ? 'guided' : 'decision'
  );
  const [selectedUserMode, setSelectedUserMode] = useState<UserMode>(initialUserMode);
  const [trackingPreference, setTrackingPreference] = useState<TrackingPreference>(initialTrackingPreference);
  const [selectedStrategies, setSelectedStrategies] = useState<WorkspaceStrategy[]>(
    initialOnboarding?.strategies?.length ? initialOnboarding.strategies : ['mixed-strategy']
  );
  const [selectedGoals, setSelectedGoals] = useState<WorkspaceGoal[]>(
    initialOnboarding?.goals?.length ? initialOnboarding.goals : ['analyze-opportunities']
  );
  const [uploadedFiles, setUploadedFiles] = useState<UploadedWorkspaceFile[]>(
    initialOnboarding?.uploadedFiles ?? []
  );
  const [pendingIngestionReview, setPendingIngestionReview] = useState<{
    files: UploadedWorkspaceFile[];
    analyses: DocumentAnalysisResult[];
  } | null>(null);
  const [workspaceRecommendation, setWorkspaceRecommendation] = useState<WorkspaceRecommendation | null>(null);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null);
  const [isAnalyzingWorkspace, setIsAnalyzingWorkspace] = useState(false);

  const toggleSelection = <T extends string,>(
    value: T,
    setter: React.Dispatch<React.SetStateAction<T[]>>
  ) => {
    setter((items) =>
      items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
    );
    setWorkspaceRecommendation(null);
    setWorkspaceConfig(null);
  };

  const handleWorkspaceFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const preprocessed = await Promise.all(files.map((file) => preprocessUploadedWorkspaceFile(file)));
    const { results } = analyzeUploadedWorkspaceFiles(preprocessed);
    setPendingIngestionReview({
      files: preprocessed,
      analyses: results,
    });
    event.target.value = '';
  };

  const runWorkspaceAnalysis = () => {
    setIsAnalyzingWorkspace(true);
    const recommendation = analyzeWorkspaceProfile({
      strategies: selectedStrategies,
      goals: selectedGoals,
      files: uploadedFiles,
    });
    const nextConfig = workspaceConfigFromRecommendation(recommendation, userId);
    setWorkspaceRecommendation(recommendation);
    setWorkspaceConfig(nextConfig);
    setIsAnalyzingWorkspace(false);
  };

  const loadMockScenario = (scenarioId: keyof typeof mockWorkspaceRecommendationScenarios) => {
    const scenario = mockWorkspaceRecommendationScenarios[scenarioId];
    setSelectedStrategies(scenario.strategies);
    setSelectedGoals(scenario.goals);
    setUploadedFiles(scenario.files);
    const recommendation = analyzeWorkspaceProfile(scenario);
    setWorkspaceRecommendation({ ...recommendation, mockScenarioId: scenarioId });
    setWorkspaceConfig(workspaceConfigFromRecommendation(recommendation, userId));
  };

  const loadMockIngestion = (scenarioId: keyof typeof mockIngestionScenarios) => {
    const files = mockIngestionScenarios[scenarioId];
    const { results } = analyzeUploadedWorkspaceFiles(files);
    setPendingIngestionReview({ files, analyses: results });
  };

  const saveApprovedIngestion = (
    filesToSave: UploadedWorkspaceFile[],
    analysesToSave: DocumentAnalysisResult[]
  ) => {
    const approvedFiles = filesToSave.map((file, index) =>
      approveDocumentAnalysis(file, analysesToSave[index])
    );
    setUploadedFiles((current) => [...current, ...approvedFiles]);
    setPendingIngestionReview(null);
    setWorkspaceRecommendation(null);
    setWorkspaceConfig(null);
  };

  const buildBasicWorkspaceConfig = (
    mode: UserMode,
    preference: TrackingPreference
  ): WorkspaceConfig => {
    const baseConfig = createMinimalWorkspaceConfig(userId, 'portfolio-tracking');
    const visibleModules = getModulesForTrackingPreference(preference, mode);

    return {
      ...baseConfig,
      enabledModules: visibleModules,
      sidebarOrder: visibleModules,
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
    };
  };

  const completeWithDefault = () => {
    const recommendation = analyzeWorkspaceProfile({
      strategies: ['mixed-strategy'],
      goals: [],
      files: [],
    });
    const onboarding = {
      completed: true,
      strategies: ['mixed-strategy'] as WorkspaceStrategy[],
      goals: [] as WorkspaceGoal[],
      detectedProfiles: recommendation.detectedProfiles,
      uploadedFiles: [] as UploadedWorkspaceFile[],
      trackingPreference,
    };
    onComplete({
      dashboardSetupMode: selectedUserMode === 'basic' ? 'simple' : 'connected',
      userMode: selectedUserMode,
      onboarding,
      workspaceConfig:
        selectedUserMode === 'basic'
          ? buildBasicWorkspaceConfig(selectedUserMode, trackingPreference)
          : createMinimalWorkspaceConfig(userId, 'mixed-strategy'),
    });
  };

  const completeWithStarterPath = (path: 'manual-property' | 'import-file' | 'explore-demo') => {
    completeWithDefault();
    onChooseStarterPath(path);
  };

  const completeGuided = () => {
    const recommendation =
      workspaceRecommendation ??
      analyzeWorkspaceProfile({
        strategies: selectedStrategies,
        goals: selectedGoals,
        files: uploadedFiles,
      });
    const nextConfig =
      workspaceConfig ?? workspaceConfigFromRecommendation(recommendation, userId);

    onComplete({
      dashboardSetupMode: 'connected',
      userMode: 'advanced',
      onboarding: {
        ...createOnboardingProfile(
          selectedStrategies,
          selectedGoals,
          uploadedFiles,
          recommendation
        ),
        trackingPreference,
      },
      workspaceConfig: {
        ...nextConfig,
        syncStatus:
          nextConfig.userOverrides && Object.values(nextConfig.userOverrides).some(Boolean)
            ? 'customized'
            : 'accepted',
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className={`flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden ${appPanelClass} rounded-[28px]`}>
        <div className="modal-scroll-body p-5 sm:p-6">
        {stage === 'decision' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
            <section className={`${appPanelInsetClass} rounded-[28px] p-6`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>
                Welcome
              </p>
              <h2 className={`mt-3 text-[2rem] font-semibold tracking-tight ${appTextStrongClass}`}>
                Welcome, {userName}. Choose the easiest way to get into the app.
              </h2>
              <p className={`mt-3 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
                The product should work whether you want to type everything manually, import a deal file, or just explore a sample workspace first.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => completeWithStarterPath('manual-property')}
                  className="rounded-[24px] border border-slate-200/70 bg-white/75 p-5 text-left transition hover:-translate-y-[1px] dark:border-slate-800 dark:bg-slate-950/30"
                >
                  <p className={`text-lg font-semibold ${appTextStrongClass}`}>Add property manually</p>
                  <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                    Start with the simple landlord flow. Add one property, type rent and expenses, and begin tracking cashflow right away.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => completeWithStarterPath('import-file')}
                  className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-inset)] p-5 text-left transition hover:bg-[var(--app-panel-soft)]"
                >
                  <p className={`text-lg font-semibold ${appTextStrongClass}`}>Import from file</p>
                  <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                    Go straight to the opportunity import flow and review extracted deal values before creating the record.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => completeWithStarterPath('explore-demo')}
                  className="rounded-[24px] border border-slate-200/70 bg-white/75 p-5 text-left transition hover:-translate-y-[1px] dark:border-slate-800 dark:bg-slate-950/30"
                >
                  <p className={`text-lg font-semibold ${appTextStrongClass}`}>{t('onboarding.starterCards.demoTitle')}</p>
                  <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                    {t('onboarding.starterCards.demoBody')}
                  </p>
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                  <p className={`text-sm font-semibold ${appTextStrongClass}`}>Choose your mode</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      {
                        id: 'basic',
                        label: 'Basic Mode',
                        description: 'Calm, simple property tracking for first-time users.',
                      },
                      {
                        id: 'advanced',
                        label: 'Advanced Mode',
                        description: 'Keep mortgages, analytics, integrations, and deeper controls visible.',
                      },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedUserMode(option.id as UserMode)}
                        className={`rounded-2xl border p-3 text-left transition ${
                          selectedUserMode === option.id
                            ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)]'
                            : 'border-[var(--app-border)]'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${appTextStrongClass}`}>{option.label}</p>
                        <p className={`mt-1 text-sm ${appTextMutedClass}`}>{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                  <p className={`text-sm font-semibold ${appTextStrongClass}`}>What do you want to track?</p>
                  <div className="mt-3 grid gap-2">
                    {[
                      ['properties-only', 'Only properties'],
                      ['properties-and-rent', 'Properties and rent'],
                      ['properties-and-mortgages', 'Properties and mortgages'],
                      ['full-portfolio', 'Full portfolio'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTrackingPreference(id as TrackingPreference)}
                        className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                          trackingPreference === id
                            ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)] text-[var(--app-text-strong)]'
                            : 'border-[var(--app-border)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200/70 bg-white/55 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/25">
                <div>
                  <p className={`text-sm font-semibold ${appTextStrongClass}`}>Need the advanced setup?</p>
                  <p className={`mt-1 text-sm ${appTextMutedClass}`}>
                    Workspace personalization is still here, just moved out of signup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage('guided');
                    onUpdateStep?.('workspace-setup');
                  }}
                  className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}
                >
                  Set up my workspace
                </button>
              </div>
            </section>

            <aside className="space-y-4">
              <div className={`${appPanelInsetClass} rounded-[28px] p-5`}>
                <p className={`text-sm font-semibold ${appTextStrongClass}`}>Start simple if you want</p>
                <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                  Not everyone has PDFs, broker dossiers, mortgages, or connected accounts. The manual path is now a first-class way to begin.
                </p>
              </div>
              <div className={`${appPanelInsetClass} rounded-[28px] p-5`}>
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-inset)] p-2">
                      <Link2 className="h-4 w-4" />
                    </div>
                  <div>
                    <p className={`text-sm font-semibold ${appTextStrongClass}`}>You stay in control</p>
                    <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                      The app can recommend a workspace, but you can accept, edit, or skip it now and come back later.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>
                  Guided Setup
                </p>
                <h2 className={`mt-2 text-[1.9rem] font-semibold tracking-tight ${appTextStrongClass}`}>
                  Set up your workspace after signup
                </h2>
                <p className={`mt-2 max-w-3xl text-sm leading-6 ${appTextMutedClass}`}>
                  Tell the app how you invest, add any existing files if you want, and review the AI proposal before saving.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStage('decision');
                    onUpdateStep?.('welcome');
                  }}
                  className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={completeWithDefault}
                  className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}
                >
                  Start with default instead
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
                <p className={`text-sm font-semibold ${appTextStrongClass}`}>Step 1. Strategy selection</p>
                <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>
                  Tell the app how you mainly invest. You can choose more than one strategy.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {workspaceStrategies.map((strategy) => {
                    const isActive = selectedStrategies.includes(strategy.id);
                    return (
                      <button
                        key={strategy.id}
                        type="button"
                        onClick={() => toggleSelection(strategy.id, setSelectedStrategies)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isActive
                            ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)]'
                            : 'border-[var(--app-border)]'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${appTextStrongClass}`}>{strategy.label}</p>
                        <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{strategy.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
                <p className={`text-sm font-semibold ${appTextStrongClass}`}>Step 2. Primary goals</p>
                <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>
                  Choose what you want the workspace to emphasize first.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {workspaceGoals.map((goal) => {
                    const isActive = selectedGoals.includes(goal.id);
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => toggleSelection(goal.id, setSelectedGoals)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                          isActive
                            ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)] text-[var(--app-text-strong)]'
                            : `${appButtonMutedClass} ${appTextMutedClass}`
                        }`}
                      >
                        {goal.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${appTextStrongClass}`}>Step 3. Upload existing files</p>
                    <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>
                      Upload brochures, budgets, mortgage offers, screenshots, invoices, plans, or scanned documents.
                    </p>
                  </div>
                  <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${appButtonMutedClass} ${appTextStrongClass}`}>
                    <Upload className="h-4 w-4" />
                    Add files
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.csv,.tsv,.txt,.xls,.xlsx,image/*"
                      className="hidden"
                      onChange={(event) => void handleWorkspaceFiles(event)}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => loadMockIngestion('opportunity-pdf')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Opportunity file mock</button>
                  <button type="button" onClick={() => loadMockIngestion('budget-spreadsheet')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Budget mock</button>
                  <button type="button" onClick={() => loadMockIngestion('mortgage-offer')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Mortgage mock</button>
                  <button type="button" onClick={() => loadMockIngestion('mixed-upload')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Mixed upload mock</button>
                </div>
                <div className="mt-4 space-y-2">
                  {uploadedFiles.length > 0 ? (
                    uploadedFiles.map((file) => (
                      <div key={file.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/70 px-4 py-3 text-sm dark:border-slate-800">
                        <div>
                          <p className={`font-semibold ${appTextStrongClass}`}>{file.name}</p>
                          <p className={`mt-1 ${appTextMutedClass}`}>{file.type} · {file.extractedEntities.length} detected signals</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFiles((current) => current.filter((item) => item.id !== file.id));
                            setWorkspaceRecommendation(null);
                            setWorkspaceConfig(null);
                          }}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold ${appButtonMutedClass} ${appTextMutedClass}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--app-border)] px-4 py-4 text-sm text-[var(--app-text-muted)]">
                      No files uploaded yet. The workspace engine still works from your selected strategy and goals.
                    </div>
                  )}
                </div>
              </div>

              <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${appTextStrongClass}`}>Step 4. Workspace proposal</p>
                    <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>
                      Upload your files, tell us how you invest, and the app will build the right workspace for you.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runWorkspaceAnalysis}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}
                    >
                      {isAnalyzingWorkspace ? 'Analyzing...' : 'Analyze workspace'}
                    </button>
                    <button type="button" onClick={() => loadMockScenario('rental')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Rental mock</button>
                    <button type="button" onClick={() => loadMockScenario('flip')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Flip mock</button>
                    <button type="button" onClick={() => loadMockScenario('developer')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Developer mock</button>
                    <button type="button" onClick={() => loadMockScenario('mixed')} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Mixed mock</button>
                  </div>
                </div>

                {workspaceRecommendation && workspaceConfig ? (
                  <div className="mt-4">
                    <WorkspaceReviewScreen
                      recommendation={workspaceRecommendation}
                      draftConfig={workspaceConfig}
                      onChange={setWorkspaceConfig}
                      onCustomize={() => undefined}
                      onReanalyze={runWorkspaceAnalysis}
                      onStartMinimal={() => {
                        setWorkspaceConfig(createMinimalWorkspaceConfig(userId, selectedStrategies[0] ?? 'mixed-strategy'));
                        setWorkspaceRecommendation(null);
                      }}
                      onAccept={completeGuided}
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--app-border)] px-4 py-4 text-sm text-[var(--app-text-muted)]">
                    Run the analysis to generate your personalized workspace proposal.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {pendingIngestionReview ? (
        <IngestionReviewModal
          files={pendingIngestionReview.files}
          analyses={pendingIngestionReview.analyses}
          onSave={saveApprovedIngestion}
          onClose={() => setPendingIngestionReview(null)}
          onIgnore={() => setPendingIngestionReview(null)}
          onReanalyze={() =>
            setPendingIngestionReview((current) =>
              current
                ? {
                    ...current,
                    analyses: analyzeUploadedWorkspaceFiles(current.files).results,
                  }
                : current
            )
          }
        />
      ) : null}
    </div>
  );
};
