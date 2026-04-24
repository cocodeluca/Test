import type {
  AppSettings,
  UploadedWorkspaceFile,
  UserOnboardingProfile,
  WorkspaceAiConfidenceBreakdown,
  WorkspaceConfig,
  WorkspaceCustomCategory,
  WorkspaceCustomField,
  WorkspaceDashboardSection,
  WorkspaceExtractedEntitySummary,
  WorkspaceGoal,
  WorkspaceInvestorProfile,
  WorkspaceKpiRecommendation,
  WorkspaceModule,
  WorkspaceModuleRecommendation,
  WorkspaceRecommendation,
  WorkspaceStrategy,
  WorkspaceTemplateRecommendation,
  WorkspaceUserOverrides,
} from '../types/settings';
import { getModulesForTrackingPreference, normalizeTrackingPreference } from './appModes';

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const workspaceStrategies: Array<{ id: WorkspaceStrategy; label: string; description: string }> = [
  { id: 'buy-to-let', label: 'Buy to let', description: 'Focus on yield, rent, debt, and long-term hold performance.' },
  { id: 'flip-rehab', label: 'Flip / Rehab', description: 'Track budgets, timelines, resale assumptions, and project profit.' },
  { id: 'new-build-development', label: 'New build / Development', description: 'Manage permits, phases, cost allocation, and delivery risk.' },
  { id: 'brrrr', label: 'BRRRR', description: 'Combine rehab and refinance with rental stabilization.' },
  { id: 'portfolio-tracking', label: 'Portfolio tracking', description: 'Monitor a growing portfolio across properties, debt, and equity.' },
  { id: 'mortgage-tracking', label: 'Mortgage tracking', description: 'Prioritize debt terms, payment visibility, and payoff progress.' },
  { id: 'broker-sourcing', label: 'Broker / deal sourcing', description: 'Screen opportunities and package them into clear client-facing memos.' },
  { id: 'mixed-strategy', label: 'Mixed strategy', description: 'Blend rental, flips, projects, and reporting in one flexible workspace.' },
];

export const workspaceGoals: Array<{ id: WorkspaceGoal; label: string }> = [
  { id: 'analyze-opportunities', label: 'Analyze opportunities' },
  { id: 'track-rental-performance', label: 'Track rental performance' },
  { id: 'track-rehab-budgets', label: 'Track construction / rehab budgets' },
  { id: 'manage-mortgages', label: 'Manage mortgages' },
  { id: 'organize-documents', label: 'Organize project documents' },
  { id: 'create-investor-reports', label: 'Create investor reports' },
  { id: 'monitor-profitability', label: 'Monitor profitability' },
  { id: 'track-equity-debt', label: 'Track equity and debt' },
  { id: 'manage-suppliers-contractors', label: 'Manage suppliers / contractors' },
];

export const workspaceModuleLabels: Record<WorkspaceModule, string> = {
  dashboard: 'Dashboard',
  'cash-accounts': 'Cash Accounts',
  opportunities: 'Opportunities',
  properties: 'Properties',
  projects: 'Projects',
  budgets: 'Budgets',
  mortgages: 'Mortgages',
  documents: 'Documents',
  reports: 'Reports',
  tasks: 'Tasks',
  settings: 'Settings',
};

const workspaceModuleIds = Object.keys(workspaceModuleLabels) as WorkspaceModule[];
export const workspaceNavigationOrder: WorkspaceModule[] = [
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

export const normalizeWorkspaceModule = (
  moduleId: string | null | undefined
): WorkspaceModule | null => {
  if (!moduleId) {
    return null;
  }

  const normalized = moduleId.trim().toLowerCase();
  const compact = normalized.replace(/[\s_]+/g, '-');

  if ((workspaceModuleIds as string[]).includes(compact)) {
    return compact as WorkspaceModule;
  }

  switch (compact) {
    case 'mortgage':
    case 'mortgage-tracking':
    case 'mortgage-tracker':
    case 'manage-mortgages':
    case 'mortgagetracking':
      return 'mortgages';
    case 'cash-accounts':
    case 'cashaccounts':
    case 'cash-account':
      return 'cash-accounts';
    case 'rehabs':
      return 'projects';
    default:
      return null;
  }
};

export const normalizeWorkspaceModuleList = (
  moduleIds: Array<string | WorkspaceModule> | null | undefined,
  fallback: WorkspaceModule[] = []
): WorkspaceModule[] => {
  const normalizedModules = (moduleIds ?? [])
    .map((moduleId) => normalizeWorkspaceModule(moduleId))
    .filter((moduleId): moduleId is WorkspaceModule => moduleId !== null);

  return normalizedModules.length > 0
    ? Array.from(new Set(normalizedModules))
    : [...fallback];
};

export const normalizeWorkspaceConfig = (config: WorkspaceConfig): WorkspaceConfig => {
  const enabledModules = normalizeWorkspaceModuleList(config.enabledModules, defaultWorkspaceConfig.enabledModules);
  const hiddenModules = normalizeWorkspaceModuleList(config.hiddenModules).filter(
    (moduleId) => !enabledModules.includes(moduleId)
  );
  const sidebarOrder = normalizeWorkspaceModuleList(config.sidebarOrder).filter(
    (moduleId) => enabledModules.includes(moduleId)
  );
  const defaultLandingModule =
    normalizeWorkspaceModule(config.defaultLandingModule) ??
    enabledModules[0] ??
    defaultWorkspaceConfig.defaultLandingModule;
  const normalizedPinnedKpis = normalizeWorkspaceKpiList(config.pinnedKpis);
  const normalizedSecondaryKpis = normalizeWorkspaceKpiList(config.secondaryKpis).filter(
    (kpiId) => !normalizedPinnedKpis.includes(kpiId)
  );
  const pinnedKpis =
    (config.pinnedKpis?.length ?? 0) > 0 && normalizedPinnedKpis.length === 0
      ? [...defaultWorkspaceConfig.pinnedKpis]
      : normalizedPinnedKpis;
  const secondaryKpis =
    (config.secondaryKpis?.length ?? 0) > 0 && normalizedSecondaryKpis.length === 0
      ? [...defaultWorkspaceConfig.secondaryKpis].filter((kpiId) => !pinnedKpis.includes(kpiId))
      : normalizedSecondaryKpis;
  const kpiOrder = [
    ...normalizeWorkspaceKpiList(config.kpiOrder).filter(
      (kpiId) => pinnedKpis.includes(kpiId) || secondaryKpis.includes(kpiId)
    ),
    ...pinnedKpis,
    ...secondaryKpis,
  ].filter((kpiId, index, array) => array.indexOf(kpiId) === index);

  return {
    ...config,
    enabledModules,
    hiddenModules,
    sidebarOrder,
    pinnedKpis,
    secondaryKpis,
    kpiOrder,
    defaultLandingModule: enabledModules.includes(defaultLandingModule)
      ? defaultLandingModule
      : enabledModules[0] ?? defaultWorkspaceConfig.defaultLandingModule,
  };
};

export const getVisibleWorkspaceModules = (settings: AppSettings): WorkspaceModule[] => {
  const normalizedWorkspaceConfig = normalizeWorkspaceConfig(settings.workspaceConfig);
  const workspaceEnabledModules = normalizeWorkspaceModuleList(
    normalizedWorkspaceConfig.enabledModules,
    defaultWorkspaceConfig.enabledModules
  );
  const trackingModules =
    settings.userMode === 'basic'
      ? getModulesForTrackingPreference(
          normalizeTrackingPreference(settings.onboarding.trackingPreference),
          settings.userMode
        )
      : [];
  const enabledModules = Array.from(
    new Set<WorkspaceModule>([
      ...trackingModules,
      ...workspaceEnabledModules,
      'settings',
    ])
  );
  const orderedConfiguredModules = normalizeWorkspaceModuleList(normalizedWorkspaceConfig.sidebarOrder).filter(
    (moduleId) => enabledModules.includes(moduleId)
  );
  const fallbackOrderedModules = workspaceNavigationOrder.filter((moduleId) =>
    enabledModules.includes(moduleId)
  );
  const orderedModules = Array.from(
    new Set<WorkspaceModule>([
      ...orderedConfiguredModules,
      ...fallbackOrderedModules,
    ])
  );

  return orderedModules;
};

export interface WorkspaceKpiDefinition {
  id: string;
  label: string;
  aliases?: string[];
}

export const workspaceKpiDefinitions: WorkspaceKpiDefinition[] = [
  { id: 'total-portfolio-value', label: 'Total portfolio value', aliases: ['property-value', 'total-property-value'] },
  { id: 'total-debt', label: 'Total debt' },
  { id: 'total-equity', label: 'Total equity' },
  { id: 'equity-pct', label: 'Equity %', aliases: ['equity-percentage'] },
  { id: 'monthly-rent', label: 'Monthly rent', aliases: ['rent', 'total-monthly-rent'] },
  { id: 'total-monthly-expenses', label: 'Total monthly expenses', aliases: ['expenses', 'monthly-expenses'] },
  { id: 'net-monthly-cashflow', label: 'Net monthly cashflow', aliases: ['cashflow', 'monthly-cashflow'] },
  { id: 'gross-yield', label: 'Gross yield' },
  { id: 'cash-on-cash-return', label: 'Cash-on-cash return', aliases: ['cash-on-cash'] },
  { id: 'total-cash-needed', label: 'Total cash needed' },
  { id: 'projected-net-profit', label: 'Projected net profit' },
  { id: 'break-even-sale-price', label: 'Break-even sale price' },
  { id: 'budget-variance', label: 'Budget variance' },
  { id: 'remaining-budget', label: 'Remaining budget' },
  { id: 'completion-pct', label: 'Completion %', aliases: ['completion'] },
  { id: 'cost-per-m2', label: 'Cost per m2', aliases: ['cost-per-sqm'] },
  { id: 'cost-per-unit', label: 'Cost per unit' },
  { id: 'mortgage-payment', label: 'Mortgage payment' },
  { id: 'debt-payoff-progress', label: 'Debt payoff progress' },
  { id: 'contingency-used', label: 'Contingency used' },
  { id: 'readiness-score', label: 'Readiness score' },
];

const workspaceKpiDefinitionsById = new Map(
  workspaceKpiDefinitions.map((definition) => [definition.id, definition])
);

const toKpiToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[%]/g, 'pct')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const workspaceKpiAliasMap = new Map<string, string>();

workspaceKpiDefinitions.forEach((definition) => {
  [definition.id, definition.label, ...(definition.aliases ?? [])].forEach((value) => {
    workspaceKpiAliasMap.set(toKpiToken(value), definition.id);
  });
});

export const normalizeWorkspaceKpi = (kpiId: string | null | undefined): string | null => {
  if (!kpiId) {
    return null;
  }

  return workspaceKpiAliasMap.get(toKpiToken(kpiId)) ?? null;
};

export const normalizeWorkspaceKpiList = (
  kpiIds: string[] | null | undefined,
  fallback: string[] = []
): string[] => {
  if (!kpiIds) {
    return [...fallback];
  }

  const normalizedKpis = kpiIds
    .map((kpiId) => normalizeWorkspaceKpi(kpiId))
    .filter((kpiId): kpiId is string => kpiId !== null);

  return Array.from(new Set(normalizedKpis));
};

export const getWorkspaceKpiLabel = (kpiId: string) =>
  workspaceKpiDefinitionsById.get(kpiId)?.label ?? kpiId;

export const kpiLibrary = workspaceKpiDefinitions;

const standardFieldLibrary = ['title', 'address', 'city', 'property type', 'status', 'acquisition price', 'notes', 'dates', 'documents'];

const defaultConfidenceBreakdown: WorkspaceAiConfidenceBreakdown = {
  profileDetection: 60,
  fileUnderstanding: 50,
  moduleRecommendation: 58,
  kpiRecommendation: 55,
  dataCompleteness: 48,
};

const defaultUserOverrides = (): WorkspaceUserOverrides => ({
  modulesChanged: false,
  sidebarReordered: false,
  kpisChanged: false,
  categoriesChanged: false,
  fieldsChanged: false,
  templatesChanged: false,
  landingPageChanged: false,
});

export const defaultWorkspaceConfig: WorkspaceConfig = {
  id: 'workspace-default',
  userId: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  primaryStrategy: 'mixed-strategy',
  secondaryStrategies: [],
  detectedProfile: 'mixed-use-investor',
  detectedProfileConfidence: 52,
  enabledModules: ['dashboard', 'cash-accounts', 'opportunities', 'properties', 'projects', 'mortgages', 'reports', 'settings'],
  sidebarOrder: ['dashboard', 'cash-accounts', 'opportunities', 'properties', 'projects', 'mortgages', 'reports', 'settings'],
  hiddenModules: ['budgets', 'documents', 'tasks'],
  defaultLandingModule: 'dashboard',
  pinnedKpis: ['total-portfolio-value', 'total-debt', 'total-equity', 'net-monthly-cashflow'],
  secondaryKpis: ['gross-yield', 'monthly-rent'],
  kpiOrder: ['total-portfolio-value', 'total-debt', 'total-equity', 'net-monthly-cashflow', 'gross-yield', 'monthly-rent'],
  preferredDashboardCards: ['portfolio-overview', 'cashflow-summary', 'equity-debt', 'reports-shortcuts'],
  preferredCards: ['portfolio-overview', 'cashflow-summary', 'equity-debt', 'reports-shortcuts'],
  dashboardSections: [
    { id: 'hero', title: 'Portfolio Overview', cards: ['portfolio-overview', 'cashflow-summary'] },
    { id: 'follow-up', title: 'Recommended Next Actions', cards: ['reports-shortcuts', 'alerts'] },
  ],
  dashboardLayout: {
    highlightedSections: ['hero', 'follow-up'],
    quickActionModules: ['opportunities', 'reports'],
    prioritizedAlerts: ['missing-data', 'memo-ready'],
  },
  budgetCategories: [],
  customCategories: [],
  suggestedBudgetCategories: [],
  standardFieldsEnabled: standardFieldLibrary,
  customFields: [],
  suggestedCustomFields: [],
  recommendedReportTemplates: ['Clean Investor Memo'],
  recommendedTemplates: ['Clean Investor Memo'],
  defaultReportTemplate: 'Clean Investor Memo',
  recommendedAnalysisType: 'portfolio-overview',
  detectedMissingFields: [],
  missingDataFlags: [],
  readinessScores: { workspace: 52 },
  uploadedFileReferences: [],
  extractedEntitiesSummary: [],
  aiRecommendationSummary: 'Start with a balanced investor workspace and refine it after the first uploads.',
  aiConfidenceBreakdown: defaultConfidenceBreakdown,
  userOverrides: defaultUserOverrides(),
  syncStatus: 'recommended',
  confidenceScore: 52,
  aiAutoSuggestions: true,
  lastAiRecommendation: null,
};

const inferProfiles = (
  strategies: WorkspaceStrategy[],
  goals: WorkspaceGoal[],
  files: UploadedWorkspaceFile[]
): WorkspaceInvestorProfile[] => {
  const textBlob = files.map((file) => `${file.name} ${file.extractedText}`.toLowerCase()).join(' ');
  const profiles = new Set<WorkspaceInvestorProfile>();

  if (strategies.includes('buy-to-let') || goals.includes('track-rental-performance')) profiles.add('rental-investor');
  if (strategies.includes('flip-rehab') || goals.includes('track-rehab-budgets')) {
    profiles.add('flip-investor');
    profiles.add('rehab-project');
  }
  if (strategies.includes('new-build-development') || /permit|materials|construction|development/.test(textBlob)) profiles.add('development-investor');
  if (strategies.includes('mortgage-tracking') || goals.includes('manage-mortgages')) profiles.add('mortgage-focused-investor');
  if (strategies.includes('broker-sourcing') || /brochure|broker|teaser|memo|opportunity/.test(textBlob)) profiles.add('broker-sourcer');
  if (strategies.includes('mixed-strategy') || strategies.length > 1) profiles.add('mixed-use-investor');
  if (profiles.size === 0) profiles.add('mixed-use-investor');

  return Array.from(profiles);
};

const buildConfidenceBreakdown = (
  strategyCount: number,
  goalCount: number,
  fileCount: number,
  missingCount: number
): WorkspaceAiConfidenceBreakdown => ({
  profileDetection: Math.min(95, 52 + strategyCount * 10 + goalCount * 3),
  fileUnderstanding: Math.min(95, 40 + fileCount * 14),
  moduleRecommendation: Math.min(95, 54 + strategyCount * 7 + fileCount * 4),
  kpiRecommendation: Math.min(95, 50 + goalCount * 6 + strategyCount * 3),
  dataCompleteness: Math.max(28, Math.min(92, 72 + fileCount * 4 - missingCount * 8)),
});

const buildModuleRecommendations = (
  primaryProfile: WorkspaceInvestorProfile,
  profiles: WorkspaceInvestorProfile[],
  goals: WorkspaceGoal[]
): WorkspaceModuleRecommendation[] => {
  const items: WorkspaceModuleRecommendation[] = [];
  const add = (module: WorkspaceModule, priority: 'primary' | 'secondary', reason: string, confidence: number) => {
    if (items.some((item) => item.module === module)) return;
    items.push({ module, priority, reason, confidence });
  };

  add('dashboard', 'primary', 'Every workspace needs a command center.', 0.95);
  add('cash-accounts', 'secondary', 'Cash visibility helps users understand liquidity and reserves.', 0.78);
  add('settings', 'secondary', 'Keep personalization editable after onboarding.', 0.9);

  if (primaryProfile === 'rental-investor' || profiles.includes('mortgage-focused-investor')) {
    add('opportunities', 'primary', 'Rental workflows start with acquisition screening.', 0.84);
    add('cash-accounts', 'secondary', 'Liquidity and cash buffers matter alongside rent and debt.', 0.82);
    add('properties', 'primary', 'Rental investors need stabilized asset tracking from day one.', 0.9);
    add('mortgages', 'primary', 'Debt tracking supports equity and cashflow decisions.', 0.87);
    add('reports', 'secondary', 'Rental memos help package the hold case clearly.', 0.74);
  }
  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    add('opportunities', 'primary', 'Flip workflows still start with acquisition review.', 0.81);
    add('cash-accounts', 'secondary', 'Remaining cash needed is easier to track with dedicated cash accounts.', 0.79);
    add('projects', 'primary', 'Project execution becomes the center of the workflow after purchase.', 0.92);
    add('budgets', 'primary', 'Actual vs planned spend is critical for rehab decisions.', 0.94);
    add('documents', 'secondary', 'Quotes, invoices, and permits need to stay attached to the project.', 0.82);
    add('reports', 'secondary', 'Flip analysis reports support investor and partner decisions.', 0.76);
    add('tasks', 'secondary', 'Execution follow-up benefits from simple tasks.', 0.73);
  }
  if (primaryProfile === 'development-investor') {
    add('projects', 'primary', 'Development workflows are project-first.', 0.94);
    add('cash-accounts', 'secondary', 'Developers benefit from visible cash reserves and drawdown capacity.', 0.77);
    add('budgets', 'primary', 'Budget allocation is one of the central controls for developers.', 0.95);
    add('documents', 'primary', 'Permits, plans, and approvals are core operating assets.', 0.9);
    add('reports', 'secondary', 'Investor and lender reporting remains important.', 0.75);
    add('tasks', 'secondary', 'Task coordination supports site and team follow-through.', 0.72);
  }
  if (primaryProfile === 'broker-sourcer') {
    add('opportunities', 'primary', 'Broker workflows revolve around sourcing and packaging deals.', 0.95);
    add('reports', 'primary', 'Presentation-ready memos are core to sourcing.', 0.9);
    add('documents', 'secondary', 'Broker files and brochures need clean storage.', 0.78);
  }
  if (profiles.includes('mixed-use-investor') && goals.includes('monitor-profitability')) {
    add('reports', 'secondary', 'Mixed strategies benefit from unified reporting.', 0.71);
  }

  return items;
};

const buildKpiRecommendations = (
  primaryProfile: WorkspaceInvestorProfile,
  profiles: WorkspaceInvestorProfile[],
  goals: WorkspaceGoal[]
): WorkspaceKpiRecommendation[] => {
  const items: WorkspaceKpiRecommendation[] = [];
  const add = (label: string, priority: 'primary' | 'secondary', reason: string, confidence: number) => {
    if (items.some((item) => item.label === label)) return;
    items.push({ id: buildId('kpi'), label, priority, reason, confidence });
  };

  if (primaryProfile === 'rental-investor') {
    add('Monthly rent', 'primary', 'Rental income is the operating heartbeat of the hold strategy.', 0.91);
    add('Net monthly cashflow', 'primary', 'Cashflow decides whether the deal performs after debt and opex.', 0.93);
    add('Gross yield', 'primary', 'Yield is the fastest comparable metric for buy-to-let screening.', 0.86);
    add('Mortgage payment', 'secondary', 'Debt service stays visible when leverage is part of the strategy.', 0.82);
    add('Total debt', 'secondary', 'Portfolio landlords need debt visibility alongside asset growth.', 0.8);
    add('Total equity', 'secondary', 'Equity tracking matters for long-term hold and refinance planning.', 0.8);
  }
  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    add('Projected net profit', 'primary', 'Projected profit is the clearest headline for a flip workflow.', 0.94);
    add('Budget variance', 'primary', 'Overruns must stay visible throughout execution.', 0.92);
    add('Remaining budget', 'primary', 'Remaining budget shows how much cash is still exposed.', 0.9);
    add('Break-even sale price', 'secondary', 'This protects the downside if the exit price softens.', 0.84);
    add('Completion %', 'secondary', 'Progress must be tracked alongside cost and timing.', 0.76);
  }
  if (primaryProfile === 'development-investor') {
    add('Total cash needed', 'primary', 'Development requires visibility into total capital demand.', 0.92);
    add('Cost per unit', 'primary', 'Developers compare cost efficiency on a per-unit basis.', 0.9);
    add('Cost per m2', 'primary', 'Area-based cost is a core feasibility benchmark.', 0.88);
    add('Completion %', 'secondary', 'Phase progress should stay tied to commercial plans.', 0.82);
    add('Contingency used', 'secondary', 'Contingency consumption is a key early warning signal.', 0.86);
  }
  if (primaryProfile === 'broker-sourcer') {
    add('Readiness score', 'primary', 'A broker benefits from knowing whether the opportunity is presentation-ready.', 0.9);
    add('Gross yield', 'secondary', 'Headline yield helps frame the deal quickly for clients.', 0.72);
    add('Projected net profit', 'secondary', 'Profitability framing matters for opportunistic buyers.', 0.68);
  }
  if (profiles.includes('mortgage-focused-investor') || goals.includes('track-equity-debt')) {
    add('Total portfolio value', 'secondary', 'Debt context works best next to aggregate asset value.', 0.78);
    add('Total debt', 'primary', 'Debt monitoring is a declared goal for this workspace.', 0.89);
    add('Total equity', 'secondary', 'Equity shows how leverage is evolving over time.', 0.77);
    add('Equity %', 'secondary', 'Debt-to-equity visibility strengthens portfolio-level monitoring.', 0.74);
  }

  return items;
};

const buildCategories = (
  primaryProfile: WorkspaceInvestorProfile,
  files: UploadedWorkspaceFile[]
): WorkspaceCustomCategory[] => {
  const blob = files.map((file) => file.extractedText.toLowerCase()).join(' ');
  const labels = new Set<string>();

  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    ['Labor', 'Materials', 'Plumbing', 'Electrical', 'Finishes', 'Furniture', 'Contingency'].forEach((label) => labels.add(label));
  }
  if (primaryProfile === 'development-investor') {
    ['Labor', 'Materials', 'Permits', 'Shared / common area', 'Structural phase', 'Contingency'].forEach((label) => labels.add(label));
  }
  if (/roof|hvac|landscap|windows/.test(blob)) {
    ['Roofing', 'HVAC', 'Landscaping', 'Windows'].forEach((label) => labels.add(label));
  }

  return Array.from(labels).map((label) => ({
    id: buildId('cat'),
    label,
    module: 'budgets',
    suggestedByAi: true,
  }));
};

const buildCustomFields = (
  primaryProfile: WorkspaceInvestorProfile,
  files: UploadedWorkspaceFile[]
): WorkspaceCustomField[] => {
  const blob = files.map((file) => file.extractedText.toLowerCase()).join(' ');
  const fields: WorkspaceCustomField[] = [];
  const add = (label: string, module: WorkspaceModule, type: WorkspaceCustomField['type'], required = false) => {
    if (fields.some((field) => field.label === label)) return;
    fields.push({
      id: buildId('field'),
      label,
      module,
      type,
      required,
      suggestedByAi: true,
      enabled: true,
    });
  };

  if (primaryProfile === 'rental-investor') {
    add('Vacancy assumption', 'properties', 'percentage');
    add('Target refinance value', 'properties', 'currency');
  }
  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    add('Expected resale value', 'projects', 'currency');
    add('Contractor name', 'tasks', 'text');
    add('Staging cost', 'budgets', 'currency');
  }
  if (primaryProfile === 'development-investor') {
    add('Permit number', 'documents', 'text', true);
    add('Common area allocation', 'budgets', 'percentage');
    add('Cost per apartment', 'budgets', 'currency');
  }
  if (primaryProfile === 'broker-sourcer') {
    add('Client presentation headline', 'reports', 'text');
  }
  if (/supplier|builder|contractor/.test(blob)) {
    add('Supplier reference', 'tasks', 'text');
  }

  return fields;
};

const buildTemplateRecommendations = (
  primaryProfile: WorkspaceInvestorProfile
): WorkspaceTemplateRecommendation[] => {
  const templates: WorkspaceTemplateRecommendation[] = [
    {
      id: 'clean-investor-memo',
      label: 'Clean Investor Memo',
      reason: 'A clean all-purpose template works across most investor setups.',
      enabledByDefault: true,
    },
  ];

  if (primaryProfile === 'rental-investor') {
    templates.push({
      id: 'rental-investment-memo',
      label: 'Rental Investment Memo',
      reason: 'Rental cashflow and debt assumptions should be front and center.',
      enabledByDefault: true,
    });
  }
  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    templates.push({
      id: 'flip-analysis-report',
      label: 'Flip Analysis Report',
      reason: 'The exit case and rehab economics deserve a dedicated presentation format.',
      enabledByDefault: true,
    });
  }
  if (primaryProfile === 'development-investor') {
    templates.push({
      id: 'developer-budget-summary',
      label: 'Developer Budget Summary',
      reason: 'Construction and allocation detail should be easier to review with stakeholders.',
      enabledByDefault: true,
    });
  }
  if (primaryProfile === 'broker-sourcer') {
    templates.push({
      id: 'broker-presentation',
      label: 'Broker Presentation',
      reason: 'A broker-oriented format helps package opportunities clearly for clients.',
      enabledByDefault: true,
    });
  }

  return templates;
};

const buildMissingInformation = (
  primaryProfile: WorkspaceInvestorProfile,
  profiles: WorkspaceInvestorProfile[],
  files: UploadedWorkspaceFile[]
) => {
  const blob = files.map((file) => file.extractedText.toLowerCase()).join(' ');
  const missing: string[] = [];

  if (!/address|direccion|dirección|calle|avenida|paseo/.test(blob)) missing.push('No address detected');
  if ((primaryProfile === 'rental-investor' || profiles.includes('mortgage-focused-investor')) && !/rent|alquiler/.test(blob)) missing.push('Rent estimate missing');
  if ((primaryProfile === 'rental-investor' || profiles.includes('mortgage-focused-investor')) && !/mortgage|loan|hipoteca/.test(blob)) missing.push('Mortgage terms missing');
  if ((primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project' || primaryProfile === 'development-investor') && !/budget|presupuesto|renovation|reforma|rehab/.test(blob)) missing.push('Renovation budget missing');
  if ((primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project' || primaryProfile === 'development-investor') && !/sale|resale|venta/.test(blob)) missing.push('No sale assumption found');
  if ((primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project' || primaryProfile === 'development-investor') && !/contingency|imprevistos/.test(blob)) missing.push('Contingency line missing');
  if ((primaryProfile === 'flip-investor' || primaryProfile === 'development-investor') && !/contractor|supplier|builder/.test(blob)) missing.push('No contractor assigned');

  return missing;
};

const buildExtractedSummary = (files: UploadedWorkspaceFile[]): WorkspaceExtractedEntitySummary[] =>
  files.flatMap((file) =>
    (file.analysis?.extractedEntities ?? file.extractedEntities).map((entity) => ({
      label: entity.label,
      value: entity.value,
      sourceFileId: file.id,
      confidence: entity.confidence,
    }))
  );

const buildRecommendationReasons = (
  modules: WorkspaceModuleRecommendation[],
  kpis: WorkspaceKpiRecommendation[],
  templates: WorkspaceTemplateRecommendation[]
) => {
  const reasons: Record<string, string> = {};
  modules.forEach((item) => {
    reasons[`module:${item.module}`] = item.reason;
  });
  kpis.forEach((item) => {
    reasons[`kpi:${item.label}`] = item.reason;
  });
  templates.forEach((item) => {
    reasons[`template:${item.label}`] = item.reason;
  });
  return reasons;
};

const buildDashboardSections = (
  primaryProfile: WorkspaceInvestorProfile,
  pinnedKpis: string[]
): WorkspaceDashboardSection[] => {
  const normalizedPinnedKpis = normalizeWorkspaceKpiList(pinnedKpis);

  if (primaryProfile === 'flip-investor' || primaryProfile === 'rehab-project') {
    return [
      { id: 'hero', title: 'Deal Control', cards: ['profit-trend', 'budget-variance', 'remaining-cash'] },
      { id: 'execution', title: 'Execution', cards: ['timeline-status', 'tasks-focus', ...normalizedPinnedKpis.slice(0, 2)] },
    ];
  }
  if (primaryProfile === 'development-investor') {
    return [
      { id: 'hero', title: 'Project Feasibility', cards: ['total-project-cost', 'cost-per-unit', 'contingency-used'] },
      { id: 'delivery', title: 'Delivery Control', cards: ['completion-status', 'documents-alerts', ...normalizedPinnedKpis.slice(0, 2)] },
    ];
  }
  if (primaryProfile === 'broker-sourcer') {
    return [
      { id: 'hero', title: 'Opportunity Desk', cards: ['readiness-score', 'memo-quick-links', 'key-deal-metrics'] },
      { id: 'follow-up', title: 'Follow-Up', cards: ['missing-data-alerts', 'document-status'] },
    ];
  }

  return [
    { id: 'hero', title: 'Portfolio Overview', cards: ['portfolio-overview', 'cashflow-summary', ...normalizedPinnedKpis.slice(0, 2)] },
    { id: 'follow-up', title: 'Next Decisions', cards: ['equity-debt', 'reports-shortcuts', 'alerts'] },
  ];
};

const buildSummary = (
  primaryProfile: WorkspaceInvestorProfile,
  modules: WorkspaceModuleRecommendation[],
  missing: string[]
) => {
  const leadingModules = modules.filter((item) => item.priority === 'primary').slice(0, 4).map((item) => workspaceModuleLabels[item.module]).join(', ');
  return `AI detected a ${primaryProfile.replace(/-/g, ' ')} workflow and recommends leading with ${leadingModules}. ${missing.length > 0 ? `Missing information still needs attention: ${missing.slice(0, 3).join(', ')}.` : 'The current inputs are strong enough to start with a personalized workspace.'}`;
};

export const mockWorkspaceRecommendationScenarios: Record<
  'rental' | 'flip' | 'developer' | 'mixed',
  { strategies: WorkspaceStrategy[]; goals: WorkspaceGoal[]; files: UploadedWorkspaceFile[] }
> = {
  rental: {
    strategies: ['buy-to-let', 'mortgage-tracking'],
    goals: ['analyze-opportunities', 'track-rental-performance', 'manage-mortgages'],
    files: [
      {
        id: 'mock-rental-file-1',
        name: 'malaga-rental-brochure.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        extractedText: 'Rental opportunity brochure with asking price, monthly rent, mortgage terms and address.',
        extractedEntities: [
          { label: 'Rent estimate', value: 'EUR 950 / month', confidence: 0.84 },
          { label: 'Mortgage terms', value: 'Detected', confidence: 0.8 },
        ],
      },
    ],
  },
  flip: {
    strategies: ['flip-rehab'],
    goals: ['track-rehab-budgets', 'monitor-profitability', 'organize-documents'],
    files: [
      {
        id: 'mock-flip-file-1',
        name: 'rehab-budget.xlsx',
        mimeType: 'application/vnd.ms-excel',
        type: 'spreadsheet',
        extractedText: 'Budget with demolition, labor, electrical, plumbing, finishes, resale estimate and contractor notes.',
        extractedEntities: [
          { label: 'Budget structure', value: 'Detected', confidence: 0.88 },
          { label: 'Resale estimate', value: 'Detected', confidence: 0.78 },
        ],
      },
    ],
  },
  developer: {
    strategies: ['new-build-development'],
    goals: ['track-rehab-budgets', 'organize-documents', 'manage-suppliers-contractors'],
    files: [
      {
        id: 'mock-dev-file-1',
        name: 'developer-budget-and-permits.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        extractedText: 'Construction budget, permit number, materials list, structural phase cost and common area allocation.',
        extractedEntities: [
          { label: 'Permit number', value: 'Detected', confidence: 0.84 },
          { label: 'Common area allocation', value: 'Detected', confidence: 0.74 },
        ],
      },
    ],
  },
  mixed: {
    strategies: ['buy-to-let', 'flip-rehab', 'mixed-strategy'],
    goals: ['analyze-opportunities', 'monitor-profitability', 'create-investor-reports'],
    files: [
      {
        id: 'mock-mixed-file-1',
        name: 'mixed-investor-notes.txt',
        mimeType: 'text/plain',
        type: 'document',
        extractedText: 'Portfolio landlord with occasional flips. Wants better opportunities, cashflow, rehab budget visibility, and memo generation.',
        extractedEntities: [{ label: 'Mixed workflow', value: 'Detected', confidence: 0.78 }],
      },
    ],
  },
};

export const analyzeWorkspaceProfile = (input: {
  strategies: WorkspaceStrategy[];
  goals: WorkspaceGoal[];
  files: UploadedWorkspaceFile[];
}): WorkspaceRecommendation => {
  const profiles = inferProfiles(input.strategies, input.goals, input.files);
  const primaryDetectedProfile = profiles[0] ?? 'mixed-use-investor';
  const suggestedModules = buildModuleRecommendations(primaryDetectedProfile, profiles, input.goals);
  const suggestedKpis = buildKpiRecommendations(primaryDetectedProfile, profiles, input.goals);
  const suggestedCategories = buildCategories(primaryDetectedProfile, input.files);
  const suggestedCustomFields = buildCustomFields(primaryDetectedProfile, input.files);
  const suggestedReportTemplates = buildTemplateRecommendations(primaryDetectedProfile);
  const missingInformation = buildMissingInformation(primaryDetectedProfile, profiles, input.files);
  const confidenceBreakdown = buildConfidenceBreakdown(
    input.strategies.length,
    input.goals.length,
    input.files.length,
    missingInformation.length
  );
  const confidenceScore = Math.round(
    (confidenceBreakdown.profileDetection +
      confidenceBreakdown.fileUnderstanding +
      confidenceBreakdown.moduleRecommendation +
      confidenceBreakdown.kpiRecommendation +
      confidenceBreakdown.dataCompleteness) /
      5
  );
  const sidebarSuggestion: WorkspaceModule[] = [...suggestedModules]
    .sort((left, right) => Number(right.priority === 'primary') - Number(left.priority === 'primary'))
    .map((item) => item.module)
    .filter((module, index, array): module is WorkspaceModule => array.indexOf(module) === index);
  const dashboardSections = buildDashboardSections(
    primaryDetectedProfile,
    suggestedKpis.filter((item) => item.priority === 'primary').map((item) => item.label)
  );

  return {
    id: buildId('workspace-rec'),
    createdAt: new Date().toISOString(),
    detectedProfiles: profiles,
    detectedStrategy: input.strategies[0] ?? 'mixed-strategy',
    primaryDetectedProfile,
    secondaryStrategies: input.strategies.slice(1),
    suggestedModules,
    suggestedKpis,
    suggestedDashboardCards: suggestedKpis.map((item) => item.label.toLowerCase().replace(/\s+/g, '-')).slice(0, 8),
    suggestedReportTemplates,
    suggestedCustomFields,
    suggestedCategories,
    missingInformation,
    summary: buildSummary(primaryDetectedProfile, suggestedModules, missingInformation),
    confidenceScore,
    confidenceBreakdown,
    extractedSummary: buildExtractedSummary(input.files),
    sidebarSuggestion,
    dashboardSuggestion: {
      defaultLandingModule: sidebarSuggestion[0] ?? 'dashboard',
      sections: dashboardSections,
    },
    recommendationReasons: buildRecommendationReasons(
      suggestedModules,
      suggestedKpis,
      suggestedReportTemplates
    ),
  };
};

export const workspaceConfigFromRecommendation = (
  recommendation: WorkspaceRecommendation,
  userId = ''
): WorkspaceConfig => {
  const enabledModules = recommendation.suggestedModules.map((item) => item.module);
  const pinnedKpis = normalizeWorkspaceKpiList(
    recommendation.suggestedKpis.filter((item) => item.priority === 'primary').map((item) => item.label),
    defaultWorkspaceConfig.pinnedKpis
  );
  const secondaryKpis = normalizeWorkspaceKpiList(
    recommendation.suggestedKpis.filter((item) => item.priority === 'secondary').map((item) => item.label)
  ).filter((kpiId) => !pinnedKpis.includes(kpiId));
  const budgetCategories = recommendation.suggestedCategories.filter((item) => item.module === 'budgets');
  const sidebarOrder = Array.from(
    new Set<WorkspaceModule>([
      ...recommendation.sidebarSuggestion.filter((module): module is WorkspaceModule => module !== 'settings'),
      'settings',
    ])
  );
  const now = new Date().toISOString();
  const defaultTemplate =
    recommendation.suggestedReportTemplates.find((item) => item.enabledByDefault)?.label ??
    recommendation.suggestedReportTemplates[0]?.label ??
    'Clean Investor Memo';

  return {
    id: buildId('workspace-config'),
    userId,
    createdAt: now,
    updatedAt: now,
    primaryStrategy: recommendation.detectedStrategy,
    secondaryStrategies: recommendation.secondaryStrategies,
    detectedProfile: recommendation.primaryDetectedProfile,
    detectedProfileConfidence: recommendation.confidenceBreakdown.profileDetection,
    enabledModules,
    sidebarOrder,
    hiddenModules: (Object.keys(workspaceModuleLabels) as WorkspaceModule[]).filter((module) => !enabledModules.includes(module)),
    defaultLandingModule: recommendation.dashboardSuggestion.defaultLandingModule,
    pinnedKpis,
    secondaryKpis,
    kpiOrder: [...pinnedKpis, ...secondaryKpis],
    preferredDashboardCards: recommendation.suggestedDashboardCards,
    preferredCards: recommendation.suggestedDashboardCards,
    dashboardSections: recommendation.dashboardSuggestion.sections,
    dashboardLayout: {
      highlightedSections: recommendation.dashboardSuggestion.sections.map((section) => section.id),
      quickActionModules: enabledModules.slice(0, 3),
      prioritizedAlerts: recommendation.missingInformation.slice(0, 3),
    },
    budgetCategories,
    customCategories: recommendation.suggestedCategories.filter((item) => item.module !== 'budgets'),
    suggestedBudgetCategories: budgetCategories,
    standardFieldsEnabled: standardFieldLibrary,
    customFields: recommendation.suggestedCustomFields.map((field) => ({ ...field, enabled: true })),
    suggestedCustomFields: recommendation.suggestedCustomFields.map((field) => ({ ...field, enabled: true })),
    recommendedReportTemplates: recommendation.suggestedReportTemplates.map((item) => item.label),
    recommendedTemplates: recommendation.suggestedReportTemplates.map((item) => item.label),
    defaultReportTemplate: defaultTemplate,
    recommendedAnalysisType:
      recommendation.primaryDetectedProfile === 'development-investor'
        ? 'development-feasibility'
        : recommendation.primaryDetectedProfile === 'flip-investor' || recommendation.primaryDetectedProfile === 'rehab-project'
        ? 'flip-analysis'
        : recommendation.primaryDetectedProfile === 'broker-sourcer'
        ? 'opportunity-packaging'
        : 'rental-performance',
    detectedMissingFields: recommendation.missingInformation,
    missingDataFlags: recommendation.missingInformation,
    readinessScores: {
      workspace: recommendation.confidenceScore,
      files: recommendation.confidenceBreakdown.fileUnderstanding,
      data: recommendation.confidenceBreakdown.dataCompleteness,
    },
    uploadedFileReferences: recommendation.extractedSummary.map((item) => item.sourceFileId),
    extractedEntitiesSummary: recommendation.extractedSummary,
    aiRecommendationSummary: recommendation.summary,
    aiConfidenceBreakdown: recommendation.confidenceBreakdown,
    userOverrides: defaultUserOverrides(),
    syncStatus: 'recommended',
    confidenceScore: recommendation.confidenceScore,
    aiAutoSuggestions: true,
    lastAiRecommendation: recommendation,
  };
};

export const createOnboardingProfile = (
  strategies: WorkspaceStrategy[],
  goals: WorkspaceGoal[],
  files: UploadedWorkspaceFile[],
  recommendation: WorkspaceRecommendation
): UserOnboardingProfile => ({
  completed: true,
  strategies,
  goals,
  detectedProfiles: recommendation.detectedProfiles,
  uploadedFiles: files,
});

export const createMinimalWorkspaceConfig = (
  userId = '',
  primaryStrategy: WorkspaceStrategy = 'mixed-strategy'
): WorkspaceConfig => ({
  ...defaultWorkspaceConfig,
  id: buildId('workspace-config'),
  userId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  primaryStrategy,
  syncStatus: 'minimal',
});

export const createDemoPropertiesOnlyWorkspaceConfig = (userId = ''): WorkspaceConfig => ({
  ...createMinimalWorkspaceConfig(userId, 'portfolio-tracking'),
  enabledModules: ['dashboard', 'properties', 'settings'],
  sidebarOrder: ['dashboard', 'properties', 'settings'],
  hiddenModules: ['cash-accounts', 'opportunities', 'projects', 'budgets', 'mortgages', 'documents', 'reports', 'tasks'],
  defaultLandingModule: 'dashboard',
  pinnedKpis: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
  secondaryKpis: [],
  kpiOrder: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
  preferredDashboardCards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
  preferredCards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
  dashboardSections: [
    {
      id: 'starter',
      title: 'Starter',
      cards: ['total-portfolio-value', 'monthly-rent', 'total-monthly-expenses', 'net-monthly-cashflow'],
    },
  ],
  dashboardLayout: {
    highlightedSections: ['starter'],
    quickActionModules: [],
    prioritizedAlerts: [],
  },
  userOverrides: {
    modulesChanged: true,
    sidebarReordered: true,
    kpisChanged: true,
    categoriesChanged: false,
    fieldsChanged: false,
    templatesChanged: false,
    landingPageChanged: true,
  },
});
