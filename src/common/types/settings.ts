export type DisplayCurrency = 'EUR' | 'USD' | 'ARS';
export type AppLanguage = 'en' | 'es' | 'pt';
export type AppTheme = 'light' | 'dark' | 'system';
export type DateFormat = 'en-US' | 'en-GB' | 'es-ES';
export type NumberFormat = 'en-US' | 'es-ES';
export type DashboardView = 'overview' | 'cashflow' | 'performance';
export type DashboardSetupMode = 'simple' | 'connected';
export type UserMode = 'basic' | 'advanced';
export type OnboardingStep = 'welcome' | 'workspace-setup' | 'basic-mode-setup';
export type TrackingPreference =
  | 'properties-only'
  | 'properties-and-rent'
  | 'properties-and-mortgages'
  | 'full-portfolio';
export type UiDensity = 'comfortable' | 'compact';
export type WorkspaceStrategy =
  | 'buy-to-let'
  | 'flip-rehab'
  | 'new-build-development'
  | 'brrrr'
  | 'portfolio-tracking'
  | 'mortgage-tracking'
  | 'broker-sourcing'
  | 'mixed-strategy';
export type WorkspaceGoal =
  | 'analyze-opportunities'
  | 'track-rental-performance'
  | 'track-rehab-budgets'
  | 'manage-mortgages'
  | 'organize-documents'
  | 'create-investor-reports'
  | 'monitor-profitability'
  | 'track-equity-debt'
  | 'manage-suppliers-contractors';
export type WorkspaceInvestorProfile =
  | 'rental-investor'
  | 'flip-investor'
  | 'rehab-project'
  | 'development-investor'
  | 'mortgage-focused-investor'
  | 'broker-sourcer'
  | 'mixed-use-investor';
export type WorkspaceModule =
  | 'dashboard'
  | 'cash-accounts'
  | 'opportunities'
  | 'properties'
  | 'projects'
  | 'budgets'
  | 'mortgages'
  | 'documents'
  | 'reports'
  | 'tasks'
  | 'settings';
export type WorkspaceCustomFieldType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'boolean';
export type WorkspaceSyncStatus = 'recommended' | 'accepted' | 'customized' | 'minimal';
export type FxSnapshotStatus = 'fresh' | 'cached' | 'stale' | 'error';
export type UploadedWorkspaceFileType = 'pdf' | 'spreadsheet' | 'csv' | 'image' | 'document';
export type UploadedWorkspaceFileShape = 'tabular' | 'narrative' | 'visual' | 'mixed';
export type UploadedWorkspaceFileReviewStatus = 'pending' | 'reviewed' | 'approved' | 'ignored';
export type IngestionDocumentType =
  | 'property-brochure'
  | 'investment-opportunity'
  | 'budget-spreadsheet'
  | 'contractor-quote'
  | 'mortgage-offer'
  | 'rent-estimate'
  | 'invoice'
  | 'receipt'
  | 'permit'
  | 'floorplan-notes'
  | 'report-memo'
  | 'marketing-deck'
  | 'unknown';
export type IngestionProjectType =
  | 'rental-investment'
  | 'flip-rehab'
  | 'development-new-build'
  | 'portfolio-tracking'
  | 'mortgage-analysis'
  | 'broker-sourcing'
  | 'mixed-strategy';
export type IngestionFieldValueType =
  | 'text'
  | 'currency'
  | 'percentage'
  | 'number'
  | 'date'
  | 'boolean'
  | 'surface'
  | 'note';
export type IngestionMappingTarget =
  | 'opportunities'
  | 'properties'
  | 'projects'
  | 'budgets'
  | 'mortgages'
  | 'documents'
  | 'reports'
  | 'workspace-config';

export interface IngestionSourceSnippet {
  id: string;
  text: string;
  reference?: string;
  linkedFieldKeys: string[];
}

export interface IngestionExtractedField {
  id: string;
  fieldKey: string;
  label: string;
  rawValue: string;
  normalizedValue: string | number | boolean;
  valueType: IngestionFieldValueType;
  confidence: number;
  sourceSnippet: string;
  sourceLocation?: string;
  extractedDirectly: boolean;
  mappingTargets: IngestionMappingTarget[];
  approved: boolean;
  userEdited?: boolean;
}

export interface IngestionSuggestedCategory {
  id: string;
  name: string;
  reason: string;
  confidence: number;
  relatedItems: string[];
  module: WorkspaceModule;
  approved: boolean;
}

export interface IngestionSuggestedCustomField {
  id: string;
  label: string;
  fieldType: WorkspaceCustomFieldType;
  module: WorkspaceModule;
  reason: string;
  confidence: number;
  required: boolean;
  approved: boolean;
}

export interface IngestionMissingDataFlag {
  key: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  affectedModule: WorkspaceModule;
}

export interface IngestionWarning {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
}

export interface IngestionDetectedSection {
  key: string;
  title: string;
  confidence: number;
}

export interface DocumentAnalysisResult {
  id: string;
  fileId: string;
  filename: string;
  analyzedAt: string;
  documentType: IngestionDocumentType[];
  documentTypeConfidence: number;
  inferredProjectType: IngestionProjectType[];
  inferredProjectTypeConfidence: number;
  extractedTextSummary: string;
  extractedEntities: Array<{
    label: string;
    value: string;
    confidence: number;
  }>;
  normalizedFields: IngestionExtractedField[];
  suggestedCategories: IngestionSuggestedCategory[];
  suggestedCustomFields: IngestionSuggestedCustomField[];
  suggestedKpis: string[];
  suggestedModules: WorkspaceModule[];
  suggestedSidebarPriority: WorkspaceModule[];
  suggestedReportTemplates: string[];
  suggestedDashboardFocus: string[];
  missingDataFlags: IngestionMissingDataFlag[];
  warnings: IngestionWarning[];
  sourceSnippets: IngestionSourceSnippet[];
  extractionTemplateName?: string;
  extractionTemplateConfidence?: number;
  detectedSections?: IngestionDetectedSection[];
  aiSummary: {
    summary: string;
    nextAction: 'pursue' | 'review-manually' | 'negotiate' | 'reject';
    strengths: string[];
    risks: string[];
    missingInformation: string[];
  };
  mappingTargets: IngestionMappingTarget[];
  readinessScore: number;
}

export interface IngestionConflict {
  id: string;
  fieldKey: string;
  values: Array<{
    fileId: string;
    value: string | number | boolean;
    confidence: number;
  }>;
  resolution: 'pending' | 'accepted' | 'ignored';
}

export interface UploadedWorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  type: UploadedWorkspaceFileType;
  sizeBytes?: number;
  uploadedAt?: string;
  pageCount?: number;
  encoding?: string;
  needsOcr?: boolean;
  contentShape?: UploadedWorkspaceFileShape;
  extractedText: string;
  extractedEntities: Array<{
    label: string;
    value: string;
    confidence: number;
  }>;
  analysis?: DocumentAnalysisResult | null;
  reviewStatus?: UploadedWorkspaceFileReviewStatus;
}

export interface WorkspaceCustomField {
  id: string;
  label: string;
  module: WorkspaceModule;
  type: WorkspaceCustomFieldType;
  required: boolean;
  suggestedByAi: boolean;
  enabled?: boolean;
}

export interface WorkspaceCustomCategory {
  id: string;
  label: string;
  module: WorkspaceModule;
  suggestedByAi: boolean;
}

export interface WorkspaceModuleRecommendation {
  module: WorkspaceModule;
  priority: 'primary' | 'secondary';
  reason: string;
  confidence: number;
}

export interface WorkspaceKpiRecommendation {
  id: string;
  label: string;
  priority: 'primary' | 'secondary';
  reason: string;
  confidence: number;
}

export interface WorkspaceTemplateRecommendation {
  id: string;
  label: string;
  reason: string;
  enabledByDefault: boolean;
}

export interface WorkspaceExtractedEntitySummary {
  label: string;
  value: string;
  sourceFileId: string;
  confidence: number;
}

export interface WorkspaceDashboardSection {
  id: string;
  title: string;
  cards: string[];
}

export interface WorkspaceDashboardLayout {
  highlightedSections: string[];
  quickActionModules: WorkspaceModule[];
  prioritizedAlerts: string[];
}

export interface WorkspaceAiConfidenceBreakdown {
  profileDetection: number;
  fileUnderstanding: number;
  moduleRecommendation: number;
  kpiRecommendation: number;
  dataCompleteness: number;
}

export interface WorkspaceUserOverrides {
  modulesChanged: boolean;
  sidebarReordered: boolean;
  kpisChanged: boolean;
  categoriesChanged: boolean;
  fieldsChanged: boolean;
  templatesChanged: boolean;
  landingPageChanged: boolean;
}

export interface WorkspaceRecommendation {
  id: string;
  createdAt: string;
  detectedProfiles: WorkspaceInvestorProfile[];
  detectedStrategy: WorkspaceStrategy;
  primaryDetectedProfile: WorkspaceInvestorProfile;
  secondaryStrategies: WorkspaceStrategy[];
  suggestedModules: WorkspaceModuleRecommendation[];
  suggestedKpis: WorkspaceKpiRecommendation[];
  suggestedDashboardCards: string[];
  suggestedReportTemplates: WorkspaceTemplateRecommendation[];
  suggestedCustomFields: WorkspaceCustomField[];
  suggestedCategories: WorkspaceCustomCategory[];
  missingInformation: string[];
  summary: string;
  confidenceScore: number;
  confidenceBreakdown: WorkspaceAiConfidenceBreakdown;
  extractedSummary: WorkspaceExtractedEntitySummary[];
  sidebarSuggestion: WorkspaceModule[];
  dashboardSuggestion: {
    defaultLandingModule: WorkspaceModule;
    sections: WorkspaceDashboardSection[];
  };
  recommendationReasons: Record<string, string>;
  mockScenarioId?: 'rental' | 'flip' | 'developer' | 'mixed';
}

export interface WorkspaceConfig {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  primaryStrategy: WorkspaceStrategy;
  secondaryStrategies: WorkspaceStrategy[];
  detectedProfile: WorkspaceInvestorProfile;
  detectedProfileConfidence: number;
  enabledModules: WorkspaceModule[];
  sidebarOrder: WorkspaceModule[];
  hiddenModules: WorkspaceModule[];
  defaultLandingModule: WorkspaceModule;
  pinnedKpis: string[];
  secondaryKpis: string[];
  kpiOrder: string[];
  preferredDashboardCards: string[];
  preferredCards: string[];
  dashboardSections: WorkspaceDashboardSection[];
  dashboardLayout: WorkspaceDashboardLayout;
  budgetCategories: WorkspaceCustomCategory[];
  customCategories: WorkspaceCustomCategory[];
  suggestedBudgetCategories: WorkspaceCustomCategory[];
  standardFieldsEnabled: string[];
  customFields: WorkspaceCustomField[];
  suggestedCustomFields: WorkspaceCustomField[];
  recommendedReportTemplates: string[];
  recommendedTemplates: string[];
  defaultReportTemplate: string;
  recommendedAnalysisType: string;
  detectedMissingFields: string[];
  missingDataFlags: string[];
  readinessScores: Record<string, number>;
  uploadedFileReferences: string[];
  extractedEntitiesSummary: WorkspaceExtractedEntitySummary[];
  aiRecommendationSummary: string;
  aiConfidenceBreakdown: WorkspaceAiConfidenceBreakdown;
  userOverrides: WorkspaceUserOverrides;
  syncStatus: WorkspaceSyncStatus;
  confidenceScore: number;
  aiAutoSuggestions: boolean;
  lastAiRecommendation: WorkspaceRecommendation | null;
}

export interface UserOnboardingProfile {
  completed: boolean;
  basicModeSetupCompleted?: boolean;
  strategies: WorkspaceStrategy[];
  goals: WorkspaceGoal[];
  detectedProfiles: WorkspaceInvestorProfile[];
  uploadedFiles: UploadedWorkspaceFile[];
  trackingPreference?: TrackingPreference;
  ingestionConflicts?: IngestionConflict[];
}

export interface UserTaxProfileSettings {
  taxResidencyCountry: string;
  annualEmploymentIncome: number;
  annualOtherIncome: number;
  estimatedMarginalTaxRate: number;
}

export interface UserProfileSettings {
  name: string;
  email: string;
  role: string;
  notes: string;
}

export interface FxRateRecord {
  baseCurrency: DisplayCurrency;
  quoteCurrency: DisplayCurrency;
  rate: number;
}

export interface FxSnapshot {
  rates: FxRateRecord[];
  provider: string;
  fetchedAt: string;
  lastSuccessfulUpdateAt: string;
  status: FxSnapshotStatus;
}

export interface AppSettings {
  profile: UserProfileSettings;
  taxProfile: UserTaxProfileSettings;
  userMode: UserMode;
  onboardingCompleted?: boolean;
  onboardingStep?: OnboardingStep | null;
  showAdvancedBasicModeFeatures?: boolean;
  currency: DisplayCurrency;
  usdToEurRate: number;
  arsToEurRate: number;
  usdToEurRateSource?: 'manual' | 'ECB';
  usdToEurRateUpdatedAt?: string | null;
  arsToEurRateSource?: 'manual' | 'ECB';
  arsToEurRateUpdatedAt?: string | null;
  fxRatesFetchedAt?: string | null;
  fxSnapshot?: FxSnapshot | null;
  language: AppLanguage;
  theme: AppTheme;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  defaultDashboardView: DashboardView;
  dashboardSetupMode: DashboardSetupMode;
  density: UiDensity;
  onboarding: UserOnboardingProfile;
  workspaceConfig: WorkspaceConfig;
}
