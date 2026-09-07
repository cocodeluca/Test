import { DisplayCurrency } from './settings';

export type OccupancyStatus = 'occupied' | 'vacant' | 'tenant-to-be-confirmed';
export type BonificationStatus = 'active' | 'inactive' | 'unknown';
export type BonificationSource = 'fein' | 'user' | 'mixed';
export type ManualAccountKind = 'cash' | 'investment';
export type InvestmentAccountType = 'stocks' | 'etf' | 'broker' | 'crypto' | 'fund' | 'other';
export type InvestmentAccountProvider = 'manual' | 'etoro';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'needs-reauth' | 'error';
export type SpainOwnerType = 'individual' | 'company';
export type SpainRentalType =
  | 'long-term'
  | 'room-by-room'
  | 'seasonal'
  | 'tourist'
  | 'vacant-owner-use';
export type ParkingCoverage = 'covered' | 'uncovered';
export type RentUpdateRuleType =
  | 'official-index'
  | 'fixed-percentage'
  | 'manual-custom-schedule'
  | 'no-automatic-update';
export type RentUpdateFrequency =
  | 'monthly'
  | 'every-3-months'
  | 'every-4-months'
  | 'every-6-months'
  | 'yearly'
  | 'custom';
export type RentUpdateIndexType = 'cpi-ipc' | 'irav' | 'icl' | 'cvs' | 'other';
export type RentAdjustmentRuleSource = 'template' | 'rule-engine' | 'manual-override' | 'imported';
export type RecurringExpenseProjectionMode =
  | 'fixed-amount'
  | 'manual-annual-estimate'
  | 'use-last-known-amount'
  | 'increase-by-x-every-y-months'
  | 'custom-schedule';
export type RecurringExpenseGrowthFrequency =
  | 'monthly'
  | 'every-3-months'
  | 'every-4-months'
  | 'every-6-months'
  | 'yearly'
  | 'custom';
export type RecurringExpenseBillingFrequency =
  | 'monthly'
  | 'quarterly'
  | 'every-4-months'
  | 'semi-annual'
  | 'yearly'
  | 'custom';
export type RecurringExpenseType =
  | 'property-tax'
  | 'home-insurance'
  | 'life-insurance'
  | 'rent-default-insurance'
  | 'community-fees'
  | 'management-fees'
  | 'maintenance'
  | 'utilities'
  | 'other-operating'
  | 'custom';
export type CashAccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'brokerage-cash'
  | 'wallet'
  | 'other';
export type CashAccountSourceType = 'manual' | 'linked';
export type CashAccountStatus = 'active' | 'inactive' | 'archived';
export type OpenBankingProviderName =
  | 'mock-bank'
  | 'tink'
  | 'truelayer'
  | 'yapily'
  | 'plaid'
  | 'other';
export type BankConnectionStatus =
  | 'not-connected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'needs-reauthentication'
  | 'error'
  | 'disconnected';

export interface MortgageBonification {
  key: string;
  label: string;
  active: boolean;
  available: boolean;
  bonusPoints: number | null;
  status: BonificationStatus;
  notes: string | null;
  source?: BonificationSource;
}

export interface RecurringExpenseScheduleEntry {
  id: string;
  effectiveDate: string;
  amount: number;
  notes?: string;
}

export interface RecurringExpensePaymentEntry {
  id: string;
  paymentDate: string;
  amount: number;
  coveredPeriod: string;
  notes?: string;
  attachedDocumentUrl?: string | null;
}

export interface RecurringExpense {
  id: string;
  expenseType: RecurringExpenseType;
  label: string;
  country: string;
  billingFrequency: RecurringExpenseBillingFrequency;
  customBillingFrequencyMonths?: number | null;
  lastKnownAmount: number;
  lastPaymentDate?: string;
  periodCovered?: string;
  projectionMode: RecurringExpenseProjectionMode;
  manualAnnualEstimate?: number | null;
  growthFrequency?: RecurringExpenseGrowthFrequency | null;
  customGrowthFrequencyMonths?: number | null;
  growthPercentage?: number | null;
  nextExpectedUpdateDate?: string;
  notes?: string;
  documentUrl?: string | null;
  paymentHistory: RecurringExpensePaymentEntry[];
  customSchedule?: RecurringExpenseScheduleEntry[];
}

export interface RentUpdateScheduleEntry {
  id: string;
  effectiveDate: string;
  percentageApplied?: number | null;
  newRent?: number | null;
  notes?: string;
}

export interface RentAdjustmentHistoryEntry {
  id: string;
  adjustmentDate: string;
  previousRent: number;
  newRent: number;
  percentageApplied: number;
  indexUsed?: RentUpdateIndexType | null;
  ruleSource: RentAdjustmentRuleSource;
  notes?: string;
}

export interface RentUpdateRule {
  type: RentUpdateRuleType;
  frequency: RentUpdateFrequency;
  customFrequencyMonths?: number | null;
  indexType?: RentUpdateIndexType | null;
  contractSignatureDate?: string;
  firstAdjustmentDate?: string;
  nextUpdateDate?: string;
  baseRent: number;
  fixedPercentage?: number | null;
  referenceRatePct?: number | null;
  minimumCapPct?: number | null;
  maximumCapPct?: number | null;
  notes?: string;
  manualCustomSchedule?: RentUpdateScheduleEntry[];
}

export interface Lease {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  monthlyRentCurrency?: DisplayCurrency;
  securityDeposit?: number | null;
  securityDepositCurrency?: DisplayCurrency;
  lateFeeAmount?: number | null;
  lateFeeCurrency?: DisplayCurrency;
  notes?: string;
  rentUpdateRule: RentUpdateRule;
  adjustmentHistory: RentAdjustmentHistoryEntry[];
  active: boolean;
}

export interface Property {
  // === BASIC INFO ===
  id: string;
  currency: DisplayCurrency;
  operatingCurrency?: DisplayCurrency;
  propertyValueCurrency?: DisplayCurrency;
  purchasePriceCurrency?: DisplayCurrency;
  currentEstimatedValueCurrency?: DisplayCurrency;
  name: string;
  address: string;
  city: string;
  country: string;
  purchaseDate: string;
  occupancyStatus: OccupancyStatus;
  notes: string;
  builtAreaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  propertyType?: string;
  leaseType?: string;
  leaseEndDate?: string;
  leases?: Lease[];
  activeLeaseId?: string | null;
  recurringExpenses?: RecurringExpense[];
  yearBuilt?: number;
  renovatedYear?: number;
  furnishedStatus?: string;
  hasElevator?: boolean;
  hasBalcony?: boolean;
  hasParking?: boolean;
  hasStorageRoom?: boolean;
  parkingSpaces?: number;
  parkingCoverage?: ParkingCoverage | null;
  condition?: string;

  // === PURCHASE & ACQUISITION ===
  purchasePrice: number;
  itpValueBase: number; // Transfer tax base
  transferTaxRate: number; // As percentage (e.g., 8 for 8%)
  transferTaxAmount: number;
  notaryCost: number;
  registryCost: number;
  agencyFees: number;
  totalPurchaseCost: number; // purchase + all acquisition costs
  
  // === RENOVATION / SETUP COSTS ===
  renovationConservation: number;
  renovationImprovements: number;
  furnishingAndOther: number;
  
  // === INVESTMENT TOTALS ===
  totalInitialInvestment: number; // Total of all costs
  currentEstimatedValue: number;
  cashInvested: number; // Equity contributed

  // === INCOME ===
  monthlyRent: number;
  monthlyRentCurrency?: DisplayCurrency;
  annualRent: number;
  annualIncomeGrowthRate: number; // As percentage
  expectedRentGrowthPct?: number;
  expectedAnnualAppreciationPct?: number;
  expectedPropertyAppreciationPct?: number;
  lastRentUpdateDate?: string;
  lastPropertyValuationDate?: string;

  // === OPERATING EXPENSES (broken by category) ===
  communityMonthly: number;
  communityAnnual: number;
  ibiAndLocalTaxesMonthly: number;
  ibiAndLocalTaxesAnnual: number;
  homeInsuranceMonthly: number;
  homeInsuranceAnnual: number;
  propertyManagementRate?: number;
  maintenanceMonthly: number;
  maintenanceAnnual: number;
  otherOperatingExpensesMonthly: number;
  otherOperatingExpensesAnnual: number;
  
  // === EXPENSE TOTALS ===
  totalOperatingExpensesMonthly: number;
  totalOperatingExpensesAnnual: number;
  annualExpenseGrowthRate: number; // As percentage
  expectedCommunityGrowthPct?: number;
  expectedInsuranceGrowthPct?: number;
  expectedTaxGrowthPct?: number;
  expectedMaintenanceGrowthPct?: number;

  // === LEGACY EXPENSE FIELDS (for backwards compatibility) ===
  acquisitionTaxes: number;
  notaryAndRegistryCosts: number;
  renovationCosts: number;
  furnishingCosts: number;
  annualIBI: number;
  annualHomeInsurance: number;
  annualLifeInsurance?: number;
  annualRentDefaultInsurance?: number;
  annualNonPaymentInsurance: number;
  annualCommunityFees: number;
  annualManagementFees: number;
  annualMaintenance: number;
  annualUtilitiesPaidByOwner: number;
  annualOtherExpenses: number;
  annualMortgageInterest?: number | null;
  annualPrincipalAmortized?: number | null;
  annualTotalMortgagePaid?: number;
  oneTimeTenantPlacementFee?: number;
  rentalDeposit?: number;
  rentalDepositCurrency?: DisplayCurrency;
  lateFeeAmount?: number;
  lateFeeCurrency?: DisplayCurrency;
  furnitureCost?: number;
  totalCashInvestedForPurchase?: number;

  // === MORTGAGE INFO ===
  hasMortgage: boolean;
  lenderName?: string;
  originalLoanAmount: number;
  currentMortgageBalance: number;
  monthlyMortgagePayment: number;
  
  // === DETAILED MORTGAGE INFO ===
  loanToValueAtPurchase: number; // As percentage
  mortgageTermYears: number;
  initialInterestRateYear1: number; // As percentage
  interestType: string; // e.g., "Fixed bonificable"
  baseRateWithoutBonificationsAfterYear1: number; // As percentage
  maxBonifiedRateAfterYear1: number; // As percentage
  monthlyMortgagePaymentYear1: number;
  monthlyMortgagePaymentWithoutBonificationsReference: number;
  monthlyMortgagePaymentWithMaxBonificationsReference: number;
  firstYearInterestAnnual: number;
  firstYearPrincipalAnnual: number;
  propertyValuationForMortgage: number;
  mortgageAppraisalCost: number;
  registryCheckCost: number;
  estimatedAnnualHomeInsuranceForBank: number;
  estimatedAnnualLifeInsurance: number;
  estimatedAnnualPaymentProtectionInsurance: number;

  // === FISCAL / CADASTRAL ===
  cadastralValueTotal: number;
  cadastralConstructionValue: number;
  cadastralLandValue: number;

  // === TAX INFORMATION (user editable) ===
  annualTaxableRentalIncome: number;
  annualDeductibleExpenses: number;
  annualDepreciationTax: number;
  annualMortgageInterestTax: number;
  annualNetTaxableIncome: number;
  taxReductionPercentage: number; // As percentage
  marginalTaxRate: number; // As percentage
  estimatedAnnualTax: number;
  taxNotes: string;
  spainOwnerType?: SpainOwnerType;
  spainRentalType?: SpainRentalType;
  spainOwnershipPercentage?: number;
  spainAutonomousCommunity?: string;
  spainEstimatedMarginalTaxRate?: number;
  spainMonthsRentedInTaxYear?: number;

  // === PERFORMANCE METRICS ===
  grossYield: number; // As percentage
  netYield: number; // As percentage
  monthlyCashflow: number;
  roceYear1: number; // As percentage
  rocePlusAppreciation5Years: number; // As percentage
  rocePlusAppreciation10Years: number; // As percentage
  rocePlusAppreciation15Years: number; // As percentage
  mortgageVsRentPercentage: number; // As percentage
  cashflowVsRentPercentage: number; // As percentage

  // === MEDIA ===
  imageUrl: string; // Property image (data URL or path)
  imageUrls?: string[];
  imageThumbnailUrls?: string[];
  primaryImageIndex?: number;
}

export interface Mortgage {
  id: string;
  propertyId: string;
  currency: DisplayCurrency;
  lenderName: string;
  referenceNumber?: string | null;
  originalLoanAmount: number;
  currentBalance: number;
  currentBalanceEstimated?: boolean;
  interestRate: number;
  mortgageTermYears: number;
  mortgageTermMonths?: number;
  totalPayments?: number | null;
  repaymentFrequency?: string | null;
  monthlyMortgagePayment: number;
  initialMonthlyPayment?: number | null;
  regularMonthlyPayment?: number | null;
  mortgageStartDate: string;
  fixedOrVariable: 'fixed' | 'variable';
  mortgageType: string;
  initialInterestRate: number | null;
  initialRateMonths?: number | null;
  baseInterestRate: number | null;
  currentInterestRate: number | null;
  maxBonifiedRate: number | null;
  maxTotalBonificationPoints: number | null;
  valuationAmount?: number | null;
  collateralAddress?: string | null;
  openingFees?: number | null;
  valuationFee?: number | null;
  brokerFee?: number | null;
  insuranceRequirements?: string | null;
  payrollBonificationConditions?: string | null;
  rateNotes: string;
  availableBonifications: MortgageBonification[];
  activeBonifications: MortgageBonification[];
  mandatoryProducts?: string[];
  optionalProducts?: string[];
  importProfile?: string | null;
  notes: string;
  /** Optional imported lifecycle state; absent records keep date/balance classification. */
  status?: 'active' | 'paid';
}

export interface CashAccount {
  id: string;
  userId?: string;
  nickname: string;
  institutionName: string;
  accountType: CashAccountType;
  currency: DisplayCurrency;
  currentBalance: number;
  availableBalance?: number | null;
  sourceType: CashAccountSourceType;
  providerName?: OpenBankingProviderName | null;
  externalAccountId?: string | null;
  institutionId?: string | null;
  maskedReference?: string | null;
  connectionId?: string | null;
  status: CashAccountStatus;
  syncStatus: SyncStatus;
  lastSyncedAt?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
  balance?: number;
  isManual?: boolean;
}

export interface BankConnection {
  id: string;
  userId?: string;
  providerName: OpenBankingProviderName;
  institutionName: string;
  institutionId: string;
  connectionStatus: BankConnectionStatus;
  syncStatus: SyncStatus;
  lastSyncedAt?: string | null;
  needsReauth: boolean;
  errorMessage?: string | null;
  linkedAccountIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  balance: number;
  currency: DisplayCurrency;
  isManual: boolean;
  type?: InvestmentAccountType;
  provider?: InvestmentAccountProvider;
  syncStatus?: SyncStatus;
  dailyChangePct?: number | null;
  lastSyncedAt?: string | null;
  lastSuccessfulBalance?: number | null;
  syncError?: string | null;
}

export type OpportunityStatus =
  | 'new-lead'
  | 'under-review'
  | 'negotiating'
  | 'offer-made'
  | 'rejected'
  | 'purchased';
export type OpportunityStrategy =
  | 'buy-to-let'
  | 'flip'
  | 'brrrr'
  | 'short-term-rental'
  | 'other';
export type OpportunitySourceType = 'pdf' | 'manual' | 'document';
export type OpportunityScenario = 'conservative' | 'base' | 'optimistic';
export type OpportunityRecommendation = 'pursue' | 'negotiate' | 'reject';
export type OpportunityDocumentType = 'pdf' | 'photo' | 'floorplan' | 'other';
export type OpportunityFieldExtractionConfidence = 'high' | 'medium' | 'low';
export type OpportunityAiSuggestedAction =
  | 'pursue'
  | 'review-manually'
  | 'negotiate'
  | 'reject';

export interface OpportunityAttachment {
  id: string;
  name: string;
  type: OpportunityDocumentType;
  mimeType: string;
  url: string;
  uploadedAt: string;
}

export interface OpportunityFieldConfidence {
  value: string;
  confidence: OpportunityFieldExtractionConfidence;
}

export interface OpportunityExtractedField {
  id: string;
  field: string;
  label: string;
  value: string;
  normalizedValue: string | number | boolean;
  confidence: OpportunityFieldExtractionConfidence;
  sourceSnippet: string;
  inferred: boolean;
  isCorrupted?: boolean;
  reviewMessage?: string;
}

export interface OpportunityAiSummary {
  summary: string;
  keyStrengths: string[];
  mainRisks: string[];
  missingInformation: string[];
  suggestedNextAction: OpportunityAiSuggestedAction;
}

export interface OpportunityDocumentAnalysis {
  id: string;
  attachmentId: string;
  fileName: string;
  extractedAt: string;
  extractedText: string;
  extractionTemplateName?: string;
  extractionTemplateConfidence?: number;
  detectedSections?: Array<{
    key: string;
    title: string;
    confidence: number;
  }>;
  extractedFields: OpportunityExtractedField[];
  summary: OpportunityAiSummary;
}

export interface Opportunity {
  id: string;
  title: string;
  address: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  propertyType: string;
  strategy: OpportunityStrategy;
  status: OpportunityStatus;
  description: string;
  bedrooms: number;
  bathrooms: number;
  builtSqm: number;
  plotSqm: number;
  floor: string;
  yearBuilt: number;
  condition: string;
  occupancyStatus: string;
  askingPrice: number;
  targetOfferPrice: number;
  estimatedClosingCosts: number;
  estimatedRenovationCost: number;
  furnitureSetupCost: number;
  monthlyRentEstimate: number;
  otherMonthlyIncome: number;
  monthlyCommunityCost: number;
  monthlyInsuranceCost: number;
  monthlyPropertyTax: number;
  monthlyMaintenanceReserve: number;
  monthlyManagementCost: number;
  vacancyAssumptionPct: number;
  sellingCostPct: number;
  contingencyPct: number;
  financingNotes: string;
  cashPurchase: boolean;
  useMortgage: boolean;
  downPaymentPct: number;
  interestRate: number;
  mortgageTermYears: number;
  estimatedMonthlyMortgagePayment: number;
  loanAmount: number;
  brokerLenderNotes: string;
  estimatedResalePrice: number;
  monthlyHoldingCosts: number;
  investmentThesis: string;
  risks: string;
  strengths: string;
  weaknesses: string;
  locationNotes: string;
  exitStrategyNotes: string;
  mainImageUrl: string;
  galleryImages: OpportunityAttachment[];
  documents: OpportunityAttachment[];
  extractedText: string;
  sourcePdfName: string;
  sourceType: OpportunitySourceType;
  fieldConfidence: Record<string, OpportunityFieldConfidence>;
  documentAnalyses: OpportunityDocumentAnalysis[];
  readinessScore: number;
  recommendedAction: OpportunityRecommendation;
  linkedPropertyId?: string | null;
  createdAt: string;
  updatedAt: string;
  addedAt: string;
}

export interface OpportunityAnalysisMetrics {
  totalCashNeeded: number;
  totalProjectCost: number;
  grossYield: number;
  netAnnualIncome: number;
  netMonthlyCashflow: number;
  cashOnCashReturn: number;
  roiOnSale: number;
  breakEvenSalePrice: number;
  annualRent: number;
  annualOperatingExpenses: number;
  monthlyMortgagePayment: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  estimatedSaleProfit: number;
}

export type RehabStrategy = 'flip' | 'renovation-hold' | 'brrrr' | 'value-add-rental';
export type RehabStage =
  | 'sourcing'
  | 'purchased'
  | 'planning'
  | 'permits'
  | 'demolition'
  | 'structure'
  | 'installations'
  | 'finishes'
  | 'furnishing'
  | 'ready-for-sale'
  | 'listed'
  | 'sold'
  | 'hold-as-rental';
export type RehabTaskStatus = 'to-do' | 'in-progress' | 'waiting' | 'completed';
export type RehabTaskPriority = 'low' | 'medium' | 'high';
export type RehabHealthStatus = 'strong' | 'stable' | 'watch-closely' | 'at-risk';
export type RehabScenario = 'conservative' | 'base' | 'optimistic';

export interface RehabBudgetLine {
  id: string;
  category: string;
  budgeted: number;
  actual: number;
  notes: string;
}

export interface RehabTimelinePhase {
  id: string;
  title: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'delayed';
  progressPct: number;
}

export interface RehabTask {
  id: string;
  title: string;
  category: string;
  linkedBudgetCategory: string;
  assignedTo: string;
  dueDate: string;
  status: RehabTaskStatus;
  priority: RehabTaskPriority;
  estimatedCost: number;
  actualCost: number;
  notes: string;
}

export interface RehabProject {
  id: string;
  title: string;
  address: string;
  city: string;
  region: string;
  country: string;
  propertyType: string;
  strategy: RehabStrategy;
  stage: RehabStage;
  bedrooms: number;
  bathrooms: number;
  builtSqm: number;
  plotSqm: number;
  yearBuilt: number;
  conditionBeforeRehab: string;
  linkedOpportunityId?: string | null;
  linkedPropertyId?: string | null;
  linkedMortgageId?: string | null;
  purchasePrice: number;
  closingCosts: number;
  targetResalePrice: number;
  estimatedSellingCosts: number;
  estimatedHoldingPeriodMonths: number;
  targetRentalIncome: number;
  exitNotes: string;
  budgetLines: RehabBudgetLine[];
  monthlyFinancingCost: number;
  monthlyUtilities: number;
  monthlyTaxIbi: number;
  monthlyInsurance: number;
  monthlyCommunityFees: number;
  monthlySecurityMisc: number;
  otherMonthlyHoldingCosts: number;
  projectThesis: string;
  mainRisks: string;
  valueAddPlan: string;
  contractorNotes: string;
  saleStrategy: string;
  lessonsLearned: string;
  mainImageUrl: string;
  galleryImages: OpportunityAttachment[];
  documents: OpportunityAttachment[];
  timelinePhases: RehabTimelinePhase[];
  tasks: RehabTask[];
  progressPct: number;
  healthScore: number;
  healthStatus: RehabHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RehabAnalysisMetrics {
  totalBudgetedRehab: number;
  totalActualRehab: number;
  totalProjectBudget: number;
  remainingBudget: number;
  projectedFinalSpend: number;
  totalHoldingCosts: number;
  totalCashNeeded: number;
  totalProjectCost: number;
  remainingCashNeeded: number;
  projectedGrossProfit: number;
  projectedNetProfit: number;
  profitMarginPct: number;
  roiPct: number;
  breakEvenSalePrice: number;
  rentalFallbackMonthlyRent: number;
  rentalFallbackNetCashflow: number;
  rentalFallbackGrossYield: number;
  rentalFallbackCashOnCash: number;
  scheduleDelayDays: number;
  contingencyBudget: number;
  contingencyUsed: number;
  remainingContingency: number;
  documentationCompletionPct: number;
}

export type ReportLinkedSourceType = 'opportunity' | 'property' | 'rehab';
export type InvestmentReportType = 'rental-investment' | 'flip-rehab' | 'general-opportunity';
export type InvestmentReportStatus = 'draft' | 'ready' | 'shared' | 'archived';
export type InvestmentReportRecommendation =
  | 'pursue'
  | 'negotiate'
  | 'reject'
  | 'hold-for-more-analysis';
export type InvestmentReportSection =
  | 'cover'
  | 'executive-summary'
  | 'asset-overview'
  | 'investment-thesis'
  | 'financial-summary'
  | 'deal-breakdown'
  | 'scenario-analysis'
  | 'risks-mitigants'
  | 'strengths-weaknesses'
  | 'timeline-business-plan'
  | 'photo-gallery'
  | 'documents-attachments'
  | 'final-recommendation';
export type ReportTemplateType =
  | 'clean-investor-memo'
  | 'broker-presentation'
  | 'flip-analysis-report'
  | 'rental-cashflow-report';

export interface ReportBrandingConfig {
  companyName: string;
  logoUrl: string;
  accentColor: string;
  headerStyle: 'minimal' | 'editorial' | 'corporate';
  footerText: string;
  preparedByDefaultName: string;
  disclaimerText: string;
}

export interface InvestmentReportTemplate {
  id: string;
  name: string;
  templateType: ReportTemplateType;
  coverStyle: 'hero' | 'split' | 'minimal';
  typographyStyle: 'modern' | 'classic' | 'presentation';
  density: 'comfortable' | 'compact';
  visibleSections: InvestmentReportSection[];
  sectionOrder: InvestmentReportSection[];
  kpiEmphasis: string[];
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}

export interface InvestmentReportSourceSnapshot {
  sourceLabel: string;
  sourceCity: string;
  sourceImageUrl: string;
  serialized: string;
  capturedAt: string;
}

export interface InvestmentReport {
  id: string;
  linkedSourceType: ReportLinkedSourceType;
  linkedSourceId: string;
  reportType: InvestmentReportType;
  templateId: string;
  title: string;
  subtitle: string;
  status: InvestmentReportStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  brandingConfig: ReportBrandingConfig;
  visibleSections: InvestmentReportSection[];
  sectionOrder: InvestmentReportSection[];
  summaryText: string;
  thesisText: string;
  riskText: string;
  recommendation: InvestmentReportRecommendation;
  manualOverrides: Record<string, boolean>;
  sourceSnapshot: InvestmentReportSourceSnapshot;
  syncStatus: 'synced' | 'source-updated' | 'manual-overrides';
  coverImageUrl: string;
  city: string;
  preparedBy: string;
  executiveSummary: string;
  investmentThesis: string;
  risksMitigants: string;
  strengthsWeaknesses: string;
  finalRecommendationText: string;
  visibleKpis: string[];
  narrativeSections: Record<string, string>;
}

export interface PortfolioMetrics {
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
  totalPortfolioValue: number;
  totalPortfolioAssetValue: number;
  totalDebt: number;
  totalDebtIn1Year: number;
  debtChangeIn1Year: number;
  debtReductionIn1Year: number;
  debtReductionRate: number;
  totalEquity: number;
  totalEquityIn1Year: number;
  equityChangeIn1Year: number;
  totalInvestedCapital: number;
  equityVsInvestedCapitalRatio: number;
  equityPercentage: number;
  availableCash: number;
  investmentsValue: number;
  totalNetWorth: number;
  totalMonthlyRent: number;
  totalMonthlyOperatingExpenses: number;
  totalAnnualExpenses: number;
  totalMonthlyMortgagePayments: number;
  totalNetMonthlyCashflow: number;
  annualizedCashflow: number;
  averageGrossYield: number;
  averageNetYield: number;
  cashOnCashReturn: number;
  portfolioRoce: number;
  debtToValueRatio: number;
  principalRepaidNext12Months: number;
  interestPaidNext12Months: number;
  totalEstimatedAnnualPropertyAppreciation: number;
  annualValueCreation: number;
  annualValueCreationOnCapital: number;
  estimatedAnnualTax: number;
  estimatedAnnualAfterTaxCashflow: number;
  estimatedMonthlyAfterTaxCashflow: number;
  actualTrailing12MonthsExpenses: number;
  projectedNext12MonthsExpenses: number;
}

export interface PropertyMetrics {
  id: string;
  name: string;
  city: string;
  country: string;
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
  currentEstimatedValue: number;
  mortgageBalance: number;
  equity: number;
  investedCapital: number;
  equityPercentage: number;
  annualRentalIncome: number;
  totalAnnualExpenses: number;
  actualTrailing12MonthsExpenses: number;
  projectedNext12MonthsExpenses: number;
  monthlyExpensesEquivalent: number;
  netMonthlyCashflow: number;
  grossYield: number;
  netYield: number;
  roce: number;
}
