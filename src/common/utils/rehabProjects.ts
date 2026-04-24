import type {
  Opportunity,
  Property,
  RehabAnalysisMetrics,
  RehabBudgetLine,
  RehabHealthStatus,
  RehabProject,
  RehabScenario,
  RehabStage,
  RehabStrategy,
  RehabTask,
  RehabTimelinePhase,
} from '../types';

const asNumber = (value: number | null | undefined) => (Number.isFinite(value) ? Number(value) : 0);
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const rehabStageLabels: Record<RehabStage, string> = {
  sourcing: 'Sourcing',
  purchased: 'Purchased',
  planning: 'Planning',
  permits: 'Permits',
  demolition: 'Demolition',
  structure: 'Structure',
  installations: 'Installations',
  finishes: 'Finishes',
  furnishing: 'Furnishing',
  'ready-for-sale': 'Ready for sale',
  listed: 'Listed',
  sold: 'Sold',
  'hold-as-rental': 'Hold as rental',
};

export const rehabStrategyLabels: Record<RehabStrategy, string> = {
  flip: 'Flip',
  'renovation-hold': 'Renovation + hold',
  brrrr: 'BRRRR',
  'value-add-rental': 'Value-add rental',
};

export const rehabScenarioLabels: Record<RehabScenario, string> = {
  conservative: 'Conservative',
  base: 'Base',
  optimistic: 'Optimistic',
};

const scenarioAdjustments: Record<
  RehabScenario,
  { resaleFactor: number; rehabFactor: number; monthFactor: number; holdingFactor: number }
> = {
  conservative: { resaleFactor: 0.94, rehabFactor: 1.12, monthFactor: 1.25, holdingFactor: 1.15 },
  base: { resaleFactor: 1, rehabFactor: 1, monthFactor: 1, holdingFactor: 1 },
  optimistic: { resaleFactor: 1.06, rehabFactor: 0.94, monthFactor: 0.88, holdingFactor: 0.92 },
};

const defaultBudgetCategories = [
  'Demolition',
  'Structure',
  'Roof',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Windows / doors',
  'Kitchen',
  'Bathrooms',
  'Flooring',
  'Painting',
  'Carpentry',
  'Furniture / staging',
  'Permits / technical fees',
  'Labor',
  'Contingency',
  'Other',
];

const defaultTimelineTitles = [
  'Purchase',
  'Design',
  'Permits',
  'Demolition',
  'Structural works',
  'Installations',
  'Finishes',
  'Furnishing / staging',
  'Sale preparation',
  'Listing',
  'Sold',
];

export const createDefaultBudgetLines = (): RehabBudgetLine[] =>
  defaultBudgetCategories.map((category) => ({
    id: id('budget'),
    category,
    budgeted: 0,
    actual: 0,
    notes: '',
  }));

export const createDefaultTimelinePhases = (): RehabTimelinePhase[] =>
  defaultTimelineTitles.map((title) => ({
    id: id('phase'),
    title,
    plannedStartDate: '',
    plannedEndDate: '',
    actualStartDate: '',
    actualEndDate: '',
    status: 'not-started',
    progressPct: 0,
  }));

export const createEmptyRehabProject = (
  overrides: Partial<RehabProject> = {}
): RehabProject => {
  const now = new Date().toISOString();
  const base: RehabProject = {
    id: id('rehab'),
    title: 'New Rehab Project',
    address: '',
    city: '',
    region: '',
    country: 'Spain',
    propertyType: 'Apartment',
    strategy: 'flip',
    stage: 'sourcing',
    bedrooms: 0,
    bathrooms: 0,
    builtSqm: 0,
    plotSqm: 0,
    yearBuilt: 0,
    conditionBeforeRehab: '',
    linkedOpportunityId: null,
    linkedPropertyId: null,
    linkedMortgageId: null,
    purchasePrice: 0,
    closingCosts: 0,
    targetResalePrice: 0,
    estimatedSellingCosts: 0,
    estimatedHoldingPeriodMonths: 6,
    targetRentalIncome: 0,
    exitNotes: '',
    budgetLines: createDefaultBudgetLines(),
    monthlyFinancingCost: 0,
    monthlyUtilities: 0,
    monthlyTaxIbi: 0,
    monthlyInsurance: 0,
    monthlyCommunityFees: 0,
    monthlySecurityMisc: 0,
    otherMonthlyHoldingCosts: 0,
    projectThesis: '',
    mainRisks: '',
    valueAddPlan: '',
    contractorNotes: '',
    saleStrategy: '',
    lessonsLearned: '',
    mainImageUrl: '',
    galleryImages: [],
    documents: [],
    timelinePhases: createDefaultTimelinePhases(),
    tasks: [],
    progressPct: 0,
    healthScore: 0,
    healthStatus: 'stable',
    createdAt: now,
    updatedAt: now,
  };
  return enrichRehabProject({
    ...base,
    ...overrides,
    budgetLines: overrides.budgetLines ?? base.budgetLines,
    galleryImages: overrides.galleryImages ?? base.galleryImages,
    documents: overrides.documents ?? base.documents,
    timelinePhases: overrides.timelinePhases ?? base.timelinePhases,
    tasks: overrides.tasks ?? base.tasks,
  });
};

const toDate = (value: string) => {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

const diffDays = (from: string, to: string) => {
  const fromTime = toDate(from);
  const toTime = toDate(to);
  if (fromTime === null || toTime === null) return 0;
  return Math.round((toTime - fromTime) / 86400000);
};

export const calculateRehabAnalysis = (
  project: RehabProject,
  scenario: RehabScenario = 'base'
): RehabAnalysisMetrics => {
  const scenarioConfig = scenarioAdjustments[scenario];
  const adjustedBudget = project.budgetLines.map((line) => ({
    ...line,
    budgeted: asNumber(line.budgeted) * scenarioConfig.rehabFactor,
    actual: asNumber(line.actual),
  }));
  const totalBudgetedRehab = adjustedBudget.reduce((sum, line) => sum + asNumber(line.budgeted), 0);
  const totalActualRehab = adjustedBudget.reduce((sum, line) => sum + asNumber(line.actual), 0);
  const contingencyBudget =
    adjustedBudget.find((line) => line.category.toLowerCase() === 'contingency')?.budgeted ?? 0;
  const contingencyUsed =
    adjustedBudget.find((line) => line.category.toLowerCase() === 'contingency')?.actual ?? 0;
  const remainingContingency = Math.max(contingencyBudget - contingencyUsed, 0);
  const baseHoldingMonthly =
    asNumber(project.monthlyFinancingCost) +
    asNumber(project.monthlyUtilities) +
    asNumber(project.monthlyTaxIbi) +
    asNumber(project.monthlyInsurance) +
    asNumber(project.monthlyCommunityFees) +
    asNumber(project.monthlySecurityMisc) +
    asNumber(project.otherMonthlyHoldingCosts);
  const totalHoldingCosts =
    baseHoldingMonthly *
    asNumber(project.estimatedHoldingPeriodMonths) *
    scenarioConfig.monthFactor *
    scenarioConfig.holdingFactor;
  const totalProjectBudget = asNumber(project.purchasePrice) + asNumber(project.closingCosts) + totalBudgetedRehab + totalHoldingCosts + asNumber(project.estimatedSellingCosts);
  const projectedFinalSpend = asNumber(project.purchasePrice) + asNumber(project.closingCosts) + Math.max(totalActualRehab, totalBudgetedRehab) + totalHoldingCosts + asNumber(project.estimatedSellingCosts);
  const totalCashNeeded = asNumber(project.purchasePrice) + asNumber(project.closingCosts) + totalBudgetedRehab + totalHoldingCosts;
  const totalProjectCost = asNumber(project.purchasePrice) + asNumber(project.closingCosts) + totalActualRehab + totalHoldingCosts + asNumber(project.estimatedSellingCosts);
  const remainingBudget = totalBudgetedRehab - totalActualRehab;
  const remainingCashNeeded = Math.max(projectedFinalSpend - (asNumber(project.purchasePrice) + asNumber(project.closingCosts) + totalActualRehab), 0);
  const adjustedResale = asNumber(project.targetResalePrice) * scenarioConfig.resaleFactor;
  const projectedGrossProfit = adjustedResale - totalProjectCost;
  const projectedNetProfit = adjustedResale - asNumber(project.purchasePrice) - asNumber(project.closingCosts) - totalActualRehab - totalHoldingCosts - asNumber(project.estimatedSellingCosts);
  const profitMarginPct = adjustedResale === 0 ? 0 : (projectedNetProfit / adjustedResale) * 100;
  const roiPct = totalCashNeeded === 0 ? 0 : (projectedNetProfit / totalCashNeeded) * 100;
  const breakEvenSalePrice = totalProjectCost;
  const rentalFallbackMonthlyRent = asNumber(project.targetRentalIncome);
  const rentalFallbackNetCashflow = rentalFallbackMonthlyRent - baseHoldingMonthly;
  const rentalFallbackGrossYield = totalProjectCost === 0 ? 0 : ((rentalFallbackMonthlyRent * 12) / totalProjectCost) * 100;
  const rentalFallbackCashOnCash = totalCashNeeded === 0 ? 0 : ((rentalFallbackNetCashflow * 12) / totalCashNeeded) * 100;
  const scheduleDelayDays = project.timelinePhases.reduce((sum, phase) => {
    if (!phase.plannedEndDate || !phase.actualEndDate) return sum;
    return sum + Math.max(diffDays(phase.plannedEndDate, phase.actualEndDate), 0);
  }, 0);
  const documentTarget = Math.max(project.documents.length + project.galleryImages.length, 8);
  const documentationCompletionPct = Math.min(
    (((project.documents.length + project.galleryImages.length) / documentTarget) * 100),
    100
  );

  return {
    totalBudgetedRehab,
    totalActualRehab,
    totalProjectBudget,
    remainingBudget,
    projectedFinalSpend,
    totalHoldingCosts,
    totalCashNeeded,
    totalProjectCost,
    remainingCashNeeded,
    projectedGrossProfit,
    projectedNetProfit,
    profitMarginPct,
    roiPct,
    breakEvenSalePrice,
    rentalFallbackMonthlyRent,
    rentalFallbackNetCashflow,
    rentalFallbackGrossYield,
    rentalFallbackCashOnCash,
    scheduleDelayDays,
    contingencyBudget,
    contingencyUsed,
    remainingContingency,
    documentationCompletionPct,
  };
};

export const getRehabHealth = (
  project: RehabProject,
  metrics: RehabAnalysisMetrics
): { score: number; status: RehabHealthStatus } => {
  const budgetScore = metrics.totalBudgetedRehab <= 0 ? 55 : Math.max(0, 100 - Math.max(((metrics.totalActualRehab - metrics.totalBudgetedRehab) / metrics.totalBudgetedRehab) * 100, 0) * 3);
  const scheduleScore = Math.max(0, 100 - metrics.scheduleDelayDays * 2);
  const contingencyScore = metrics.contingencyBudget <= 0 ? 40 : Math.min((metrics.remainingContingency / metrics.contingencyBudget) * 100, 100);
  const profitabilityScore = Math.max(0, Math.min(metrics.profitMarginPct * 4, 100));
  const completionScore = project.progressPct;
  const score = Math.round(
    budgetScore * 0.3 +
      scheduleScore * 0.2 +
      metrics.documentationCompletionPct * 0.15 +
      contingencyScore * 0.15 +
      profitabilityScore * 0.15 +
      completionScore * 0.05
  );

  if (score >= 75) return { score, status: 'strong' };
  if (score >= 58) return { score, status: 'stable' };
  if (score >= 40) return { score, status: 'watch-closely' };
  return { score, status: 'at-risk' };
};

export const enrichRehabProject = (project: RehabProject): RehabProject => {
  const progressPct =
    project.timelinePhases.length === 0
      ? 0
      : Math.round(
          project.timelinePhases.reduce((sum, phase) => sum + asNumber(phase.progressPct), 0) /
            project.timelinePhases.length
        );
  const metrics = calculateRehabAnalysis({ ...project, progressPct }, 'base');
  const health = getRehabHealth({ ...project, progressPct }, metrics);

  return {
    ...project,
    progressPct,
    healthScore: health.score,
    healthStatus: health.status,
    updatedAt: new Date().toISOString(),
  };
};

export const createRehabTask = (overrides: Partial<RehabTask> = {}): RehabTask => ({
  id: id('task'),
  title: '',
  category: '',
  linkedBudgetCategory: '',
  assignedTo: '',
  dueDate: '',
  status: 'to-do',
  priority: 'medium',
  estimatedCost: 0,
  actualCost: 0,
  notes: '',
  ...overrides,
});

export const createProjectFromOpportunity = (opportunity: Opportunity): RehabProject =>
  createEmptyRehabProject({
    title: opportunity.title,
    address: opportunity.address,
    city: opportunity.city,
    region: opportunity.region,
    country: opportunity.country,
    propertyType: opportunity.propertyType,
    strategy:
      opportunity.strategy === 'brrrr'
        ? 'brrrr'
        : opportunity.strategy === 'flip'
        ? 'flip'
        : 'value-add-rental',
    bedrooms: opportunity.bedrooms,
    bathrooms: opportunity.bathrooms,
    builtSqm: opportunity.builtSqm,
    plotSqm: opportunity.plotSqm,
    yearBuilt: opportunity.yearBuilt,
    conditionBeforeRehab: opportunity.condition,
    linkedOpportunityId: opportunity.id,
    purchasePrice: opportunity.targetOfferPrice || opportunity.askingPrice,
    closingCosts: opportunity.estimatedClosingCosts,
    targetResalePrice: opportunity.estimatedResalePrice,
    targetRentalIncome: opportunity.monthlyRentEstimate,
    exitNotes: opportunity.exitStrategyNotes,
    mainImageUrl: opportunity.mainImageUrl,
    galleryImages: opportunity.galleryImages,
    documents: opportunity.documents,
    projectThesis: opportunity.investmentThesis,
    mainRisks: opportunity.risks,
    valueAddPlan: opportunity.strengths,
    saleStrategy: opportunity.exitStrategyNotes,
    budgetLines: createDefaultBudgetLines().map((line) =>
      line.category === 'Contingency'
        ? { ...line, budgeted: opportunity.targetOfferPrice * (opportunity.contingencyPct / 100 || 0) }
        : line
    ),
  });

export const createProjectFromProperty = (property: Property): RehabProject =>
  createEmptyRehabProject({
    title: `${property.name} Rehab`,
    address: property.address,
    city: property.city,
    country: property.country,
    propertyType: property.propertyType ?? 'Apartment',
    strategy: 'renovation-hold',
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    builtSqm: property.builtAreaSqm ?? 0,
    plotSqm: 0,
    yearBuilt: property.yearBuilt ?? 0,
    conditionBeforeRehab: property.condition ?? '',
    linkedPropertyId: property.id,
    purchasePrice: property.purchasePrice,
    closingCosts: property.acquisitionTaxes + property.notaryAndRegistryCosts,
    targetResalePrice: property.currentEstimatedValue,
    targetRentalIncome: property.monthlyRent,
    mainImageUrl: property.imageUrl,
    galleryImages: (property.imageUrls ?? []).map((url, index) => ({
      id: id(`property-photo-${index}`),
      name: `Photo ${index + 1}`,
      type: 'photo',
      mimeType: 'image/jpeg',
      url,
      uploadedAt: new Date().toISOString(),
    })),
    projectThesis: property.notes,
  });
