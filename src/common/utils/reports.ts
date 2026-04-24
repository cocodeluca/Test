import type {
  InvestmentReport,
  InvestmentReportRecommendation,
  InvestmentReportSection,
  InvestmentReportSourceSnapshot,
  InvestmentReportTemplate,
  InvestmentReportType,
  Opportunity,
  Property,
  RehabProject,
  ReportBrandingConfig,
  ReportLinkedSourceType,
} from '../types';
import { calculateOpportunityAnalysis } from './opportunities';
import { calculateRehabAnalysis } from './rehabProjects';
import { findMortgageByProperty } from './calculations';
import { formatCurrency } from './formatting';

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const defaultReportBranding: ReportBrandingConfig = {
  companyName: 'RE Portfolio',
  logoUrl: '',
  accentColor: '#0f766e',
  headerStyle: 'editorial',
  footerText: 'Confidential investment material for internal review and client presentation.',
  preparedByDefaultName: 'Investment Team',
  disclaimerText:
    'This report is for analysis and presentation purposes only. It is not legal, tax, accounting, or investment advice.',
};

const defaultSectionOrder: InvestmentReportSection[] = [
  'cover',
  'executive-summary',
  'asset-overview',
  'investment-thesis',
  'financial-summary',
  'deal-breakdown',
  'scenario-analysis',
  'risks-mitigants',
  'strengths-weaknesses',
  'timeline-business-plan',
  'photo-gallery',
  'documents-attachments',
  'final-recommendation',
];

export const defaultReportTemplates: InvestmentReportTemplate[] = [
  {
    id: 'template-clean-investor',
    name: 'Clean Investor Memo',
    templateType: 'clean-investor-memo',
    coverStyle: 'hero',
    typographyStyle: 'modern',
    density: 'comfortable',
    visibleSections: defaultSectionOrder,
    sectionOrder: defaultSectionOrder,
    kpiEmphasis: ['asking-price', 'cash-needed', 'net-cashflow', 'roi'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: true,
  },
  {
    id: 'template-broker-presentation',
    name: 'Broker Presentation',
    templateType: 'broker-presentation',
    coverStyle: 'split',
    typographyStyle: 'presentation',
    density: 'comfortable',
    visibleSections: defaultSectionOrder.filter((section) => section !== 'risks-mitigants'),
    sectionOrder: defaultSectionOrder,
    kpiEmphasis: ['asking-price', 'gross-yield', 'monthly-rent'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: true,
  },
  {
    id: 'template-flip-analysis',
    name: 'Flip Analysis Report',
    templateType: 'flip-analysis-report',
    coverStyle: 'hero',
    typographyStyle: 'modern',
    density: 'compact',
    visibleSections: defaultSectionOrder,
    sectionOrder: defaultSectionOrder,
    kpiEmphasis: ['purchase-price', 'rehab-budget', 'net-profit', 'profit-margin'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: true,
  },
  {
    id: 'template-rental-cashflow',
    name: 'Rental Cashflow Report',
    templateType: 'rental-cashflow-report',
    coverStyle: 'minimal',
    typographyStyle: 'classic',
    density: 'comfortable',
    visibleSections: defaultSectionOrder,
    sectionOrder: defaultSectionOrder,
    kpiEmphasis: ['monthly-rent', 'net-cashflow', 'gross-yield', 'cash-on-cash'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: true,
  },
];

export const reportTypeLabels: Record<InvestmentReportType, string> = {
  'rental-investment': 'Rental Investment Memo',
  'flip-rehab': 'Flip / Rehab Memo',
  'general-opportunity': 'General Opportunity Memo',
};

const serializeSnapshot = (input: unknown) => JSON.stringify(input);

const buildSnapshot = (
  linkedSourceType: ReportLinkedSourceType,
  source: Opportunity | Property | RehabProject
): InvestmentReportSourceSnapshot => {
  const sourceLabel =
    linkedSourceType === 'opportunity'
      ? (source as Opportunity).title
      : linkedSourceType === 'property'
      ? (source as Property).name
      : (source as RehabProject).title;
  const sourceCity =
    linkedSourceType === 'property'
      ? (source as Property).city
      : 'city' in source
      ? source.city
      : '';
  const sourceImageUrl =
    linkedSourceType === 'property'
      ? (source as Property).imageUrl
      : 'mainImageUrl' in source
      ? source.mainImageUrl
      : '';

  return {
    sourceLabel,
    sourceCity,
    sourceImageUrl,
    serialized: serializeSnapshot(source),
    capturedAt: nowIso(),
  };
};

const inferReportType = (sourceType: ReportLinkedSourceType): InvestmentReportType => {
  if (sourceType === 'rehab') return 'flip-rehab';
  if (sourceType === 'property') return 'rental-investment';
  return 'general-opportunity';
};

const inferRecommendation = (
  sourceType: ReportLinkedSourceType,
  source: Opportunity | Property | RehabProject
): InvestmentReportRecommendation => {
  if (sourceType === 'opportunity') {
    const deal = source as Opportunity;
    return deal.recommendedAction === 'pursue'
      ? 'pursue'
      : deal.recommendedAction === 'negotiate'
      ? 'negotiate'
      : 'reject';
  }

  if (sourceType === 'rehab') {
    const rehab = source as RehabProject;
    return rehab.healthStatus === 'strong'
      ? 'pursue'
      : rehab.healthStatus === 'stable'
      ? 'negotiate'
      : 'hold-for-more-analysis';
  }

  return 'pursue';
};

export const createReportFromSource = (
  sourceType: ReportLinkedSourceType,
  source: Opportunity | Property | RehabProject,
  createdBy: string,
  templates: InvestmentReportTemplate[] = defaultReportTemplates,
  branding: ReportBrandingConfig = defaultReportBranding
): InvestmentReport => {
  const reportType = inferReportType(sourceType);
  const template =
    templates.find((item) =>
      reportType === 'flip-rehab'
        ? item.templateType === 'flip-analysis-report'
        : reportType === 'rental-investment'
        ? item.templateType === 'rental-cashflow-report'
        : item.templateType === 'clean-investor-memo'
    ) ?? templates[0];

  const title =
    sourceType === 'property'
      ? `${(source as Property).name} Investment Memo`
      : `${('title' in source ? source.title : '')} Investment Memo`;
  const subtitle =
    sourceType === 'opportunity'
      ? 'Early-stage opportunity review with current assumptions and next-step guidance.'
      : sourceType === 'rehab'
      ? 'Execution-focused rehab report with budget, timeline, and projected profitability.'
      : 'Rental investment memo with hold-case assumptions, cashflow, and yield view.';

  let executiveSummary = '';
  let investmentThesis = '';
  let risksMitigants = '';
  let strengthsWeaknesses = '';
  let finalRecommendationText = '';
  let city = '';
  let coverImageUrl = '';
  let visibleKpis = template.kpiEmphasis;

  if (sourceType === 'opportunity') {
    const deal = source as Opportunity;
    const metrics = calculateOpportunityAnalysis(deal, 'base');
    executiveSummary = `${deal.title} is currently assessed as a ${deal.recommendedAction} opportunity with ${deal.readinessScore}% readiness and a projected gross yield of ${metrics.grossYield.toFixed(2)}%.`;
    investmentThesis = deal.investmentThesis || deal.strengths || 'Complete the thesis once rent, condition, and acquisition path are confirmed.';
    risksMitigants = deal.risks || 'Main risks and mitigants should be refined before investor circulation.';
    strengthsWeaknesses = `Strengths: ${deal.strengths || 'To be defined'}\nWeaknesses: ${deal.weaknesses || 'To be defined'}`;
    finalRecommendationText = `Recommended action: ${deal.recommendedAction}. Prioritize missing inputs, verify assumptions, and confirm execution path before moving forward.`;
    city = deal.city;
    coverImageUrl = deal.mainImageUrl;
    visibleKpis = ['asking-price', 'target-offer', 'cash-needed', 'gross-yield', 'net-cashflow', 'roi'];
  } else if (sourceType === 'rehab') {
    const rehab = source as RehabProject;
    const metrics = calculateRehabAnalysis(rehab, 'base');
    executiveSummary = `${rehab.title} is in ${rehabStageLabelsSafe(rehab.stage)} with projected net profit of ${metrics.projectedNetProfit.toFixed(0)} and health score ${rehab.healthScore}.`;
    investmentThesis = rehab.projectThesis || rehab.valueAddPlan || 'Define the value-add path, budget discipline, and sale strategy.';
    risksMitigants = rehab.mainRisks || 'Track cost overruns, schedule risk, and contingency usage closely.';
    strengthsWeaknesses = `Value-add plan: ${rehab.valueAddPlan || 'To be defined'}\nContractor notes: ${rehab.contractorNotes || 'To be defined'}`;
    finalRecommendationText = `Current health status is ${rehab.healthStatus}. Keep projected profit, contingency, and delay exposure visible before investor distribution.`;
    city = rehab.city;
    coverImageUrl = rehab.mainImageUrl;
    visibleKpis = ['purchase-price', 'budgeted-rehab', 'actual-spend', 'cash-needed', 'projected-net-profit', 'profit-margin'];
  } else {
    const property = source as Property;
    const mortgage = findMortgageByProperty(property.id, []);
    executiveSummary = `${property.name} is positioned as a rental investment in ${property.city}, with current estimated value ${formatCurrency(
      property.currentEstimatedValue,
      property.currentEstimatedValueCurrency ?? property.currency
    )} and monthly rent ${formatCurrency(
      property.monthlyRent,
      property.monthlyRentCurrency ?? property.currency
    )}.`;
    investmentThesis = property.notes || 'Summarize the hold thesis, long-term upside, and strategic fit.';
    risksMitigants = property.taxNotes || 'Review tenant, financing, and maintenance assumptions before final circulation.';
    strengthsWeaknesses = `Strengths: ${property.condition || 'Condition not specified'}\nWeaknesses: ${property.occupancyStatus || 'Occupancy not specified'}`;
    finalRecommendationText = `Suitable for rental-focused review. Confirm financing, long-term yield, and operating assumptions before sharing externally.`;
    city = property.city;
    coverImageUrl = property.imageUrl;
    visibleKpis = ['asking-price', 'monthly-rent', 'net-cashflow', 'gross-yield', 'cash-on-cash'];
    void mortgage;
  }

  return {
    id: makeId('report'),
    linkedSourceType: sourceType,
    linkedSourceId: source.id,
    reportType,
    templateId: template.id,
    title,
    subtitle,
    status: 'draft',
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy,
    brandingConfig: branding,
    visibleSections: template.visibleSections,
    sectionOrder: template.sectionOrder,
    summaryText: executiveSummary,
    thesisText: investmentThesis,
    riskText: risksMitigants,
    recommendation: inferRecommendation(sourceType, source),
    manualOverrides: {},
    sourceSnapshot: buildSnapshot(sourceType, source),
    syncStatus: 'synced',
    coverImageUrl,
    city,
    preparedBy: branding.preparedByDefaultName || createdBy,
    executiveSummary,
    investmentThesis,
    risksMitigants,
    strengthsWeaknesses,
    finalRecommendationText,
    visibleKpis,
    narrativeSections: {},
  };
};

const rehabStageLabelsSafe = (stage: RehabProject['stage']) =>
  stage.replace(/-/g, ' ');

export const duplicateReport = (report: InvestmentReport): InvestmentReport => ({
  ...report,
  id: makeId('report'),
  title: `${report.title} Copy`,
  status: 'draft',
  version: 1,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export const updateReportSyncStatus = (
  report: InvestmentReport,
  currentSource: Opportunity | Property | RehabProject | null
): InvestmentReport => {
  if (!currentSource) {
    return report;
  }

  const serialized = serializeSnapshot(currentSource);
  const sourceChanged = serialized !== report.sourceSnapshot.serialized;

  return {
    ...report,
    syncStatus: sourceChanged
      ? report.manualOverrides && Object.keys(report.manualOverrides).length > 0
        ? 'manual-overrides'
        : 'source-updated'
      : report.manualOverrides && Object.keys(report.manualOverrides).length > 0
      ? 'manual-overrides'
      : 'synced',
  };
};
