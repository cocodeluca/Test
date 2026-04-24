import React, { useMemo, useState } from 'react';
import {
  Archive,
  Brush,
  Copy,
  Eye,
  FileText,
  Filter,
  LayoutTemplate,
  Monitor,
  Printer,
  Send,
  Share2,
  Sparkles,
} from 'lucide-react';
import type {
  InvestmentReport,
  InvestmentReportSection,
  InvestmentReportStatus,
  InvestmentReportTemplate,
  Opportunity,
  Property,
  RehabProject,
  ReportBrandingConfig,
  ReportLinkedSourceType,
} from '../../../common/types';
import { formatDate } from '../../../common/utils/formatting';
import {
  createReportFromSource,
  defaultReportTemplates,
  duplicateReport,
  updateReportSyncStatus,
} from '../../../common/utils/reports';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

type ReportsTab = 'all' | 'templates' | 'branding' | 'presentation';

interface ReportsPageProps {
  reports: InvestmentReport[];
  templates: InvestmentReportTemplate[];
  branding: ReportBrandingConfig;
  opportunities: Opportunity[];
  properties: Property[];
  rehabProjects: RehabProject[];
  currentUserName: string;
  onAddReport: (report: InvestmentReport) => void;
  onUpdateReport: (report: InvestmentReport) => void;
  onAddTemplate: (template: InvestmentReportTemplate) => void;
  onUpdateBranding: (branding: ReportBrandingConfig) => void;
}

const allSections: InvestmentReportSection[] = [
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

const labelClass = `mb-2 block text-sm font-medium ${appTextMutedClass}`;
const inputClass = `w-full ${appInputClass}`;

const getLinkedSource = (
  report: InvestmentReport,
  opportunities: Opportunity[],
  properties: Property[],
  rehabProjects: RehabProject[]
) => {
  if (report.linkedSourceType === 'opportunity') {
    return opportunities.find((item) => item.id === report.linkedSourceId) ?? null;
  }
  if (report.linkedSourceType === 'property') {
    return properties.find((item) => item.id === report.linkedSourceId) ?? null;
  }
  return rehabProjects.find((item) => item.id === report.linkedSourceId) ?? null;
};

const ReportEditor: React.FC<{
  report: InvestmentReport;
  onChange: (report: InvestmentReport) => void;
  onClose: () => void;
}> = ({ report, onChange, onClose }) => {
  const { t } = useSettings();
  const sectionLabels: Record<InvestmentReportSection, string> = {
    cover: t('reportsUi.sectionCover'),
    'executive-summary': t('reportsUi.sectionExecutiveSummary'),
    'asset-overview': t('reportsUi.sectionAssetOverview'),
    'investment-thesis': t('reportsUi.sectionInvestmentThesis'),
    'financial-summary': t('reportsUi.sectionFinancialSummary'),
    'deal-breakdown': t('reportsUi.sectionDealBreakdown'),
    'scenario-analysis': t('reportsUi.sectionScenarioAnalysis'),
    'risks-mitigants': t('reportsUi.sectionRisksMitigants'),
    'strengths-weaknesses': t('reportsUi.sectionStrengthsWeaknesses'),
    'timeline-business-plan': t('reportsUi.sectionTimelineBusinessPlan'),
    'photo-gallery': t('reportsUi.sectionPhotoGallery'),
    'documents-attachments': t('reportsUi.sectionDocumentsAttachments'),
    'final-recommendation': t('reportsUi.sectionFinalRecommendation'),
  };
  const toggleSection = (section: InvestmentReportSection) => {
    const visibleSections = report.visibleSections.includes(section)
      ? report.visibleSections.filter((item) => item !== section)
      : [...report.visibleSections, section];

    onChange({
      ...report,
      visibleSections,
      manualOverrides: {
        ...report.manualOverrides,
        visibleSections: true,
      },
    });
  };

  const moveSection = (section: InvestmentReportSection, direction: -1 | 1) => {
    const index = report.sectionOrder.indexOf(section);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= report.sectionOrder.length) return;
    const sectionOrder = [...report.sectionOrder];
    [sectionOrder[index], sectionOrder[nextIndex]] = [sectionOrder[nextIndex], sectionOrder[index]];
    onChange({
      ...report,
      sectionOrder,
      manualOverrides: {
        ...report.manualOverrides,
        sectionOrder: true,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className={`mx-auto max-w-6xl ${appPanelClass} rounded-[30px] p-5`}>
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>{t('reportsUi.reportEditor')}</p>
            <h2 className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>{report.title}</h2>
          </div>
          <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>{t('reportsUi.close')}</button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_340px]">
          <div className="space-y-5">
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>{t('reportsUi.fieldTitle')}</label><input value={report.title} onChange={(e) => onChange({ ...report, title: e.target.value, manualOverrides: { ...report.manualOverrides, title: true } })} className={inputClass} /></div>
                <div><label className={labelClass}>{t('reportsUi.fieldSubtitle')}</label><input value={report.subtitle} onChange={(e) => onChange({ ...report, subtitle: e.target.value, manualOverrides: { ...report.manualOverrides, subtitle: true } })} className={inputClass} /></div>
                <div className="sm:col-span-2"><label className={labelClass}>{t('reportsUi.fieldExecutiveSummary')}</label><textarea value={report.executiveSummary} onChange={(e) => onChange({ ...report, executiveSummary: e.target.value, summaryText: e.target.value, manualOverrides: { ...report.manualOverrides, executiveSummary: true } })} rows={4} className={inputClass} /></div>
                <div className="sm:col-span-2"><label className={labelClass}>{t('reportsUi.fieldInvestmentThesis')}</label><textarea value={report.investmentThesis} onChange={(e) => onChange({ ...report, investmentThesis: e.target.value, thesisText: e.target.value, manualOverrides: { ...report.manualOverrides, investmentThesis: true } })} rows={4} className={inputClass} /></div>
                <div className="sm:col-span-2"><label className={labelClass}>{t('reportsUi.fieldRisksMitigants')}</label><textarea value={report.risksMitigants} onChange={(e) => onChange({ ...report, risksMitigants: e.target.value, riskText: e.target.value, manualOverrides: { ...report.manualOverrides, risksMitigants: true } })} rows={4} className={inputClass} /></div>
                <div className="sm:col-span-2"><label className={labelClass}>{t('reportsUi.fieldFinalRecommendation')}</label><textarea value={report.finalRecommendationText} onChange={(e) => onChange({ ...report, finalRecommendationText: e.target.value, manualOverrides: { ...report.manualOverrides, finalRecommendationText: true } })} rows={4} className={inputClass} /></div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('reportsUi.visibleSections')}</p>
              <div className="mt-3 space-y-2">
                {allSections.map((section) => (
                  <label key={section} className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                    <span className={`text-sm ${appTextStrongClass}`}>{sectionLabels[section]}</span>
                    <input type="checkbox" checked={report.visibleSections.includes(section)} onChange={() => toggleSection(section)} />
                  </label>
                ))}
              </div>
            </div>
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('reportsUi.sectionOrder')}</p>
              <div className="mt-3 space-y-2">
                {report.sectionOrder.map((section) => (
                  <div key={section} className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2">
                    <span className={`text-sm ${appTextStrongClass}`}>{sectionLabels[section]}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => moveSection(section, -1)} className={`rounded-lg px-2 py-1 ${appButtonMutedClass} ${appTextMutedClass}`}>{t('reportsUi.up')}</button>
                      <button type="button" onClick={() => moveSection(section, 1)} className={`rounded-lg px-2 py-1 ${appButtonMutedClass} ${appTextMutedClass}`}>{t('reportsUi.down')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ReportsPage: React.FC<ReportsPageProps> = ({
  reports,
  templates,
  branding,
  opportunities,
  properties,
  rehabProjects,
  currentUserName,
  onAddReport,
  onUpdateReport,
  onAddTemplate,
  onUpdateBranding,
}) => {
  const { t } = useSettings();
  const sectionLabels: Record<InvestmentReportSection, string> = {
    cover: t('reportsUi.sectionCover'),
    'executive-summary': t('reportsUi.sectionExecutiveSummary'),
    'asset-overview': t('reportsUi.sectionAssetOverview'),
    'investment-thesis': t('reportsUi.sectionInvestmentThesis'),
    'financial-summary': t('reportsUi.sectionFinancialSummary'),
    'deal-breakdown': t('reportsUi.sectionDealBreakdown'),
    'scenario-analysis': t('reportsUi.sectionScenarioAnalysis'),
    'risks-mitigants': t('reportsUi.sectionRisksMitigants'),
    'strengths-weaknesses': t('reportsUi.sectionStrengthsWeaknesses'),
    'timeline-business-plan': t('reportsUi.sectionTimelineBusinessPlan'),
    'photo-gallery': t('reportsUi.sectionPhotoGallery'),
    'documents-attachments': t('reportsUi.sectionDocumentsAttachments'),
    'final-recommendation': t('reportsUi.sectionFinalRecommendation'),
  };
  const reportTypeLabelMap = {
    'rental-investment': t('reportsUi.reportTypeRentalInvestment'),
    'flip-rehab': t('reportsUi.reportTypeFlipRehab'),
    'general-opportunity': t('reportsUi.reportTypeGeneralOpportunity'),
  } as const;
  const reportStatusLabelMap = {
    draft: t('reportsUi.statusDraft'),
    ready: t('reportsUi.statusReady'),
    shared: t('reportsUi.statusShared'),
    archived: t('reportsUi.statusArchived'),
  } as const;
  const [activeTab, setActiveTab] = useState<ReportsTab>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(reports[0]?.id ?? null);
  const [editingReport, setEditingReport] = useState<InvestmentReport | null>(null);
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    city: '',
    linkedModule: 'all',
    updated: '',
  });

  const syncedReports = useMemo(
    () =>
      reports.map((report) =>
        updateReportSyncStatus(
          report,
          getLinkedSource(report, opportunities, properties, rehabProjects) as
            | Opportunity
            | Property
            | RehabProject
            | null
        )
      ),
    [opportunities, properties, rehabProjects, reports]
  );

  const filteredReports = useMemo(
    () =>
      syncedReports.filter((report) => {
        if (filters.type !== 'all' && report.reportType !== filters.type) return false;
        if (filters.status !== 'all' && report.status !== filters.status) return false;
        if (filters.city && !report.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
        if (filters.linkedModule !== 'all' && report.linkedSourceType !== filters.linkedModule) return false;
        if (filters.updated && !report.updatedAt.startsWith(filters.updated)) return false;
        return true;
      }),
    [filters, syncedReports]
  );

  const selectedReport =
    syncedReports.find((report) => report.id === selectedReportId) ?? filteredReports[0] ?? null;

  const generateFromSource = (
    sourceType: ReportLinkedSourceType,
    source?: Opportunity | Property | RehabProject
  ) => {
    const selected =
      source ??
      (sourceType === 'opportunity'
        ? opportunities[0]
        : sourceType === 'property'
        ? properties[0]
        : rehabProjects[0]);
    if (!selected) return;
    const report = createReportFromSource(sourceType, selected, currentUserName, templates, branding);
    onAddReport(report);
    setSelectedReportId(report.id);
    setActiveTab('presentation');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className={`text-[1.65rem] font-bold ${appTextStrongClass}`}>{t('reportsUi.title')}</h1>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('reportsUi.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => generateFromSource('opportunity')} className={`inline-flex items-center gap-2 ${appButtonPrimaryClass}`}><Sparkles className="h-4.5 w-4.5" />{t('reportsUi.generateFromOpportunity')}</button>
          <button type="button" onClick={() => generateFromSource('property')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.generateFromProperty')}</button>
          <button type="button" onClick={() => generateFromSource('rehab')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.generateFromRehab')}</button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className={`${appPanelClass} rounded-[30px] p-10 text-center`}>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-400/18 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><FileText className="h-9 w-9" /></div>
          <h2 className={`mt-5 text-2xl font-semibold ${appTextStrongClass}`}>{t('reportsUi.emptyTitle')}</h2>
          <p className={`mx-auto mt-3 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>{t('reportsUi.emptyBody')}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => generateFromSource('opportunity')} className={`inline-flex items-center gap-2 ${appButtonPrimaryClass}`}><Sparkles className="h-4.5 w-4.5" />{t('reportsUi.generateFromOpportunity')}</button>
            <button type="button" onClick={() => generateFromSource('property')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.generateFromProperty')}</button>
            <button type="button" onClick={() => generateFromSource('rehab')} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.generateFromRehab')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', t('reportsUi.tabAll'), <FileText className="h-4 w-4" />],
              ['templates', t('reportsUi.tabTemplates'), <LayoutTemplate className="h-4 w-4" />],
              ['branding', t('reportsUi.tabBranding'), <Brush className="h-4 w-4" />],
              ['presentation', t('reportsUi.tabPresentation'), <Monitor className="h-4 w-4" />],
            ] as const).map(([tab, label, icon]) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium ${activeTab === tab ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{icon}{label}</button>
            ))}
          </div>

          {activeTab === 'all' ? (
            <div className={`grid grid-cols-1 gap-4 ${appPanelClass} rounded-[28px] p-4 xl:grid-cols-[300px_minmax(0,1fr)]`}>
              <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-cyan-500" /><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('reportsUi.filters')}</p></div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <select value={filters.type} onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value }))} className={inputClass}><option value="all">{t('reportsUi.allTypes')}</option>{Object.entries(reportTypeLabelMap).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))} className={inputClass}><option value="all">{t('reportsUi.allStatus')}</option>{(['draft', 'ready', 'shared', 'archived'] as InvestmentReportStatus[]).map((status) => <option key={status} value={status}>{reportStatusLabelMap[status]}</option>)}</select>
                  <input placeholder={t('reportsUi.cityPlaceholder')} value={filters.city} onChange={(e) => setFilters((current) => ({ ...current, city: e.target.value }))} className={inputClass} />
                  <select value={filters.linkedModule} onChange={(e) => setFilters((current) => ({ ...current, linkedModule: e.target.value }))} className={inputClass}><option value="all">{t('reportsUi.allLinkedModules')}</option><option value="opportunity">{t('reportsUi.linkedModuleOpportunity')}</option><option value="property">{t('reportsUi.linkedModuleProperty')}</option><option value="rehab">{t('reportsUi.linkedModuleRehab')}</option></select>
                  <input type="date" value={filters.updated} onChange={(e) => setFilters((current) => ({ ...current, updated: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredReports.map((report) => (
                  <div key={report.id} className={`${appPanelClass} rounded-[26px] p-4`}>
                    {report.coverImageUrl ? <img src={report.coverImageUrl} alt={report.title} className="h-44 w-full rounded-[20px] object-cover" /> : <div className={`flex h-44 items-center justify-center rounded-[20px] ${appPanelInsetClass}`}><span className={appTextSoftClass}>{t('reportsUi.coverImage')}</span></div>}
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div><p className={`text-lg font-semibold ${appTextStrongClass}`}>{report.title}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{reportTypeLabelMap[report.reportType]}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${appPanelInsetClass} ${appTextMutedClass}`}>v{report.version}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.linkedAsset')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{report.sourceSnapshot.sourceLabel}</p></div>
                      <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.status')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{reportStatusLabelMap[report.status]}</p></div>
                      <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.lastUpdated')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{formatDate(report.updatedAt)}</p></div>
                      <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.sync')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{report.syncStatus}</p></div>
                    </div>
                    {report.syncStatus === 'source-updated' ? <div className="mt-4 rounded-[18px] border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{t('reportsUi.sourceUpdated')}</div> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEditingReport(report)} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.edit')}</button>
                      <button type="button" onClick={() => setSelectedReportId(report.id)} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Eye className="mr-2 inline h-4 w-4" />{t('reportsUi.open')}</button>
                      <button type="button" onClick={() => onAddReport(duplicateReport(report))} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Copy className="mr-2 inline h-4 w-4" />{t('reportsUi.duplicate')}</button>
                      <button type="button" onClick={() => onUpdateReport({ ...report, status: 'archived' })} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Archive className="mr-2 inline h-4 w-4" />{t('reportsUi.archive')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {activeTab === 'templates' ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[...(templates.length > 0 ? templates : defaultReportTemplates)].map((template) => (
                <div key={template.id} className={`${appPanelClass} rounded-[26px] p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg font-semibold ${appTextStrongClass}`}>{template.name}</p>
                      <p className={`mt-1 text-sm ${appTextMutedClass}`}>{template.templateType}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${appPanelInsetClass} ${appTextMutedClass}`}>{template.coverStyle}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.typography')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{template.typographyStyle}</p></div>
                    <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>{t('reportsUi.density')}</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{template.density}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{template.visibleSections.map((section) => <span key={section} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${appPanelInsetClass} ${appTextMutedClass}`}>{sectionLabels[section]}</span>)}</div>
                  <div className="mt-4"><button type="button" onClick={() => onAddTemplate({ ...template, id: `template-${Date.now()}`, name: `${template.name} Copy`, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Copy className="mr-2 inline h-4 w-4" />{t('reportsUi.duplicateTemplate')}</button></div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === 'branding' ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
              <div className={`${appPanelClass} rounded-[28px] p-5`}>
                <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('reportsUi.brandingTitle')}</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className={labelClass}>{t('reportsUi.companyName')}</label><input value={branding.companyName} onChange={(e) => onUpdateBranding({ ...branding, companyName: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>{t('reportsUi.preparedByDefaultName')}</label><input value={branding.preparedByDefaultName} onChange={(e) => onUpdateBranding({ ...branding, preparedByDefaultName: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>{t('reportsUi.logoUrl')}</label><input value={branding.logoUrl} onChange={(e) => onUpdateBranding({ ...branding, logoUrl: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>{t('reportsUi.accentColor')}</label><input value={branding.accentColor} onChange={(e) => onUpdateBranding({ ...branding, accentColor: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>{t('reportsUi.headerStyle')}</label><select value={branding.headerStyle} onChange={(e) => onUpdateBranding({ ...branding, headerStyle: e.target.value as ReportBrandingConfig['headerStyle'] })} className={inputClass}><option value="minimal">{t('reportsUi.headerStyleMinimal')}</option><option value="editorial">{t('reportsUi.headerStyleEditorial')}</option><option value="corporate">{t('reportsUi.headerStyleCorporate')}</option></select></div>
                  <div><label className={labelClass}>{t('reportsUi.footerText')}</label><input value={branding.footerText} onChange={(e) => onUpdateBranding({ ...branding, footerText: e.target.value })} className={inputClass} /></div>
                  <div className="sm:col-span-2"><label className={labelClass}>{t('reportsUi.disclaimerText')}</label><textarea value={branding.disclaimerText} onChange={(e) => onUpdateBranding({ ...branding, disclaimerText: e.target.value })} rows={5} className={inputClass} /></div>
                </div>
              </div>
              <div className={`${appPanelClass} rounded-[28px] p-5`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.brandingPreview')}</p>
                <div className="mt-4 rounded-[24px] p-5 text-white" style={{ background: `linear-gradient(145deg, ${branding.accentColor} 0%, #0f172a 70%)` }}>
                  <p className="text-sm font-semibold">{branding.companyName}</p>
                  <h3 className="mt-3 text-2xl font-semibold">{t('reportsUi.investmentMemo')}</h3>
                  <p className="mt-2 text-sm text-white/80">{t('reportsUi.preparedBy', { name: branding.preparedByDefaultName })}</p>
                  <p className="mt-6 text-xs text-white/70">{branding.footerText}</p>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'presentation' && selectedReport ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className={`text-2xl font-semibold ${appTextStrongClass}`}>{selectedReport.title}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{selectedReport.subtitle}</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingReport(selectedReport)} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('reportsUi.editReport')}</button>
                  <button type="button" className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Printer className="mr-2 inline h-4 w-4" />{t('reportsUi.print')}</button>
                  <button type="button" className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}><Share2 className="mr-2 inline h-4 w-4" />{t('reportsUi.share')}</button>
                  <button type="button" className={`rounded-xl px-4 py-2 ${appButtonPrimaryClass}`}><Send className="mr-2 inline h-4 w-4" />{t('reportsUi.exportPdf')}</button>
                </div>
              </div>

              <article className={`${appPanelClass} overflow-hidden rounded-[32px]`}>
                <section className="relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10" style={{ background: `linear-gradient(145deg, ${selectedReport.brandingConfig.accentColor} 0%, #0f172a 58%, #08111f 100%)` }}>
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
                    <div className="text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">{selectedReport.brandingConfig.companyName}</p>
                      <h1 className="mt-4 text-[2.2rem] font-semibold leading-tight">{selectedReport.title}</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">{selectedReport.subtitle}</p>
                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{reportTypeLabelMap[selectedReport.reportType]}</span>
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{selectedReport.city || t('reportsUi.locationPending')}</span>
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{formatDate(selectedReport.updatedAt)}</span>
                      </div>
                    </div>
                    <div>{selectedReport.coverImageUrl ? <img src={selectedReport.coverImageUrl} alt={selectedReport.title} className="h-72 w-full rounded-[28px] object-cover" /> : <div className="flex h-72 items-center justify-center rounded-[28px] border border-white/10 bg-white/10 text-sm text-white/70">{t('reportsUi.coverImage')}</div>}</div>
                  </div>
                </section>
                <section className="space-y-6 px-6 py-8 sm:px-8">
                  {selectedReport.syncStatus === 'source-updated' ? <div className="rounded-[20px] border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{t('reportsUi.sourceUpdated')}</div> : null}
                  {selectedReport.visibleSections.includes('executive-summary') ? <div className={`${appPanelInsetClass} rounded-[24px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionExecutiveSummary')}</p><p className={`mt-3 text-sm leading-7 ${appTextMutedClass}`}>{selectedReport.executiveSummary}</p></div> : null}
                  {selectedReport.visibleSections.includes('financial-summary') ? <div><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionFinancialSummary')}</p><div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">{selectedReport.visibleKpis.map((kpi) => <div key={kpi} className={`${appPanelInsetClass} rounded-[22px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>{kpi.replace(/-/g, ' ')}</p><p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{t('reportsUi.autofilledFromSource')}</p></div>)}</div></div> : null}
                  {selectedReport.visibleSections.includes('investment-thesis') ? <div className={`${appPanelInsetClass} rounded-[24px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionInvestmentThesis')}</p><p className={`mt-3 text-sm leading-7 ${appTextMutedClass}`}>{selectedReport.investmentThesis}</p></div> : null}
                  {selectedReport.visibleSections.includes('risks-mitigants') ? <div className={`${appPanelInsetClass} rounded-[24px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionRisksMitigants')}</p><p className={`mt-3 text-sm leading-7 ${appTextMutedClass}`}>{selectedReport.risksMitigants}</p></div> : null}
                  {selectedReport.visibleSections.includes('strengths-weaknesses') ? <div className={`${appPanelInsetClass} rounded-[24px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionStrengthsWeaknesses')}</p><p className={`mt-3 whitespace-pre-line text-sm leading-7 ${appTextMutedClass}`}>{selectedReport.strengthsWeaknesses}</p></div> : null}
                  {selectedReport.visibleSections.includes('final-recommendation') ? <div className={`${appPanelInsetClass} rounded-[24px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('reportsUi.sectionFinalRecommendation')}</p><p className={`mt-3 text-sm leading-7 ${appTextMutedClass}`}>{selectedReport.finalRecommendationText}</p></div> : null}
                  <div className={`rounded-[24px] border px-5 py-4 ${appTextSoftClass}`}>{selectedReport.brandingConfig.disclaimerText}</div>
                </section>
              </article>
            </div>
          ) : null}
        </>
      )}

      {editingReport ? <ReportEditor report={editingReport} onChange={(report) => onUpdateReport({ ...report, updatedAt: new Date().toISOString() })} onClose={() => setEditingReport(null)} /> : null}
    </div>
  );
};
