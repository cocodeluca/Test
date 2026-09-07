import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronRight, FileText, MapPin, Plus, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import type { Opportunity, OpportunityAttachment, OpportunityDocumentAnalysis, OpportunityExtractedField, OpportunityFieldExtractionConfidence } from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';
import { formatCurrency, formatDate, formatPercentage } from '../../../common/utils/formatting';
import { assertValidOpportunityFinancialValues } from '../../../common/utils/financialValidation';
import { analyzeOpportunityDocument, applyOpportunityDocumentAnalysis, calculateOpportunityAnalysis, createAttachmentFromFile, createEmptyOpportunity, detectOpportunityAttachmentType, enrichOpportunity, normalizeOpportunityExtractedValue } from '../../../common/utils/opportunities';
import { useSettings } from '../context/SettingsContext';
import { appBorderClass, appButtonMutedClass, appButtonPrimaryClass, appInputClass, appPanelClass, appPanelInsetClass, appTextMutedClass, appTextSoftClass, appTextStrongClass } from '../styles/dashboardTheme';

interface OpportunitiesPageProps {
  opportunities: Opportunity[];
  onAddOpportunity: (opportunity: Opportunity) => void;
  onUpdateOpportunity: (opportunity: Opportunity) => void;
  onDeleteOpportunity: (id: string) => void;
  onConvertOpportunity: (opportunity: Opportunity) => void;
  onGenerateReport: (sourceType: 'opportunity' | 'property' | 'rehab', sourceId: string) => void;
  autoOpenImport?: boolean;
}

type ReviewField = OpportunityExtractedField & { approved: boolean };

const statusTone: Record<Opportunity['status'], string> = {
  'new-lead': 'border-sky-300/60 bg-sky-50/80 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300',
  'under-review': 'border-violet-300/60 bg-violet-50/80 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
  negotiating: 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  'offer-made': 'border-cyan-300/60 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300',
  rejected: 'border-rose-300/60 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
  purchased: 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
};

const confidenceTone: Record<OpportunityFieldExtractionConfidence, string> = {
  high: 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  medium: 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'border-rose-300/60 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
};

const extractionStateTone = {
  clean: 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  missing: 'border-slate-300/70 bg-slate-50/90 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
};

const inputClass = `w-full ${appInputClass}`;
const labelClass = `mb-2 block text-sm font-medium ${appTextMutedClass}`;
const requiredFieldLabels = ['Property title', 'Address', 'City', 'Asking price', 'Monthly rent estimate'];
const reviewGroups = [
  { id: 'property', title: 'Property Inputs', matches: ['title', 'address', 'city', 'propertyType', 'bedrooms', 'bathrooms', 'builtSqm'] },
  { id: 'financial', title: 'Financial Inputs', matches: ['askingPrice', 'monthlyRentEstimate', 'estimatedRenovationCost'] },
  {
    id: 'dossier',
    title: 'Dossier Metrics',
    matches: [
      'municipality',
      'province',
      'autonomousCommunity',
      'builtArea',
      'terrace',
      'elevator',
      'parking',
      'storageRoom',
      'purchasePrice',
      'transferTax',
      'notaryRegistry',
      'renovationFurniture',
      'sourcingServiceFee',
      'agencyFee',
      'totalInvestment',
      'pessimisticMonthlyRent',
      'realisticMonthlyRent',
      'optimisticMonthlyRent',
      'annualIbiTrash',
      'annualInsurance',
      'annualCommunity',
      'annualRentalManagement',
      'monthlyNetCashflow',
      'annualNetCashflow',
      'grossYield',
      'netComparableYield',
      'fullyPassiveNetYield',
      'ltv',
      'totalCashContributionNeeded',
      'mortgagePayment',
      'leveragedReturnOnEquity',
      'leveragedCashflow',
      'demandNotes',
      'acquisitionSteps',
    ],
  },
  { id: 'notes', title: 'Notes & Context', matches: ['strengths', 'risks', 'financingNotes', 'brokerLenderNotes'] },
];

const DetailInput: React.FC<{ label: string; value: string | number; type?: string; onChange: (value: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <div><label className={labelClass}>{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></div>
);

const MetricCard: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight = false }) => (
  <div className={`${appPanelInsetClass} rounded-[24px] p-4 ${highlight ? 'border-cyan-300/45 bg-[linear-gradient(135deg,rgba(6,182,212,0.10),rgba(37,99,235,0.08))] dark:border-cyan-500/20' : ''}`}>
    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{label}</p>
    <p className={`mt-3 text-[1.65rem] font-semibold leading-none ${appTextStrongClass}`}>{value}</p>
  </div>
);

const OpportunityListCard: React.FC<{ opportunity: Opportunity; active: boolean; currency: DisplayCurrency; onSelect: () => void }> = ({ opportunity, active, currency, onSelect }) => {
  const metrics = calculateOpportunityAnalysis(opportunity, 'base');
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-[24px] border p-4 text-left transition ${active ? 'border-cyan-400/40 bg-cyan-500/8 shadow-[0_22px_46px_-34px_rgba(6,182,212,0.28)]' : `${appPanelInsetClass} hover:-translate-y-[1px]`}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className={`truncate text-base font-semibold ${appTextStrongClass}`}>{opportunity.title || 'Untitled opportunity'}</p><p className={`mt-1 truncate text-sm ${appTextMutedClass}`}>{opportunity.city || 'City pending'}</p></div>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 ${appTextSoftClass}`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Asking</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatCurrency(opportunity.askingPrice, currency)}</p></div>
        <div><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Rent</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatCurrency(opportunity.monthlyRentEstimate, currency)}</p></div>
        <div><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Yield</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatPercentage(metrics.grossYield)}</p></div>
        <div><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Created</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatDate(opportunity.createdAt)}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[opportunity.status]}`}>{opportunity.status.replace(/-/g, ' ')}</span><span className={`text-xs ${appTextSoftClass}`}>{opportunity.readinessScore}% ready</span></div>
    </button>
  );
};

const ImportReviewModal: React.FC<{ attachment: OpportunityAttachment; analysis: OpportunityDocumentAnalysis; onBack: () => void; onCancel: () => void; onCreate: (analysis: OpportunityDocumentAnalysis) => void; }> = ({ attachment, analysis, onBack, onCancel, onCreate }) => {
  const [fields, setFields] = useState<ReviewField[]>(
    analysis.extractedFields.map((field) => ({
      ...field,
      approved: !field.isCorrupted && field.value !== '',
    }))
  );
  const missingFields = requiredFieldLabels.filter((label) => !fields.some((field) => field.approved && field.label === label));
  const groupedFields = useMemo(() => reviewGroups.map((group) => ({ ...group, fields: fields.filter((field) => group.matches.includes(field.field)) })), [fields]);
  const approvedCount = fields.filter((field) => field.approved).length;
  const corruptedCount = fields.filter((field) => field.isCorrupted).length;

  const updateField = (fieldId: string, updates: Partial<ReviewField>) => {
    setFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }

        const nextValue = updates.value ?? field.value;
        const clearedCorruption = updates.value !== undefined && nextValue.trim().length > 0;

        return {
          ...field,
          ...updates,
          value: nextValue,
          normalizedValue:
            updates.value !== undefined
              ? normalizeOpportunityExtractedValue(field.field, updates.value)
              : updates.normalizedValue ?? field.normalizedValue,
          isCorrupted:
            updates.isCorrupted ?? (clearedCorruption ? false : field.isCorrupted),
          reviewMessage:
            updates.reviewMessage ?? (clearedCorruption ? undefined : field.reviewMessage),
        };
      })
    );
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-slate-950/56 px-4 py-6 backdrop-blur-sm">
      <div className={`mx-auto max-w-6xl ${appPanelClass} rounded-[34px] p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div><p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>Step 2 of 2</p><h2 className={`mt-2 text-[1.9rem] font-semibold tracking-tight ${appTextStrongClass}`}>Review extracted deal values</h2><p className={`mt-2 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>Approve what looks right, ignore what does not, and complete any missing items before creating the opportunity.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onBack} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Back</button>
            <button type="button" onClick={onCancel} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>Cancel Import</button>
            <button type="button" onClick={() => onCreate({ ...analysis, extractedFields: fields.filter((field) => field.approved).map(({ approved, ...field }) => field) })} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>Create Opportunity</button>
          </div>
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <section className="space-y-4">
            {groupedFields.map((group) => group.fields.length > 0 ? (
              <div key={group.id} className={`${appPanelInsetClass} rounded-[26px] p-4 sm:p-5`}>
                <div className="flex items-center justify-between gap-3"><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{group.title}</h3><button type="button" onClick={() => setFields((current) => current.map((field) => group.matches.includes(field.field) ? { ...field, approved: true } : field))} className={`rounded-xl px-3 py-2 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>Accept Group</button></div>
                <div className="mt-4 space-y-3">
                  {group.fields.map((field) => (
                    <div key={field.id} className="rounded-[22px] border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/20">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-sm font-semibold ${appTextStrongClass}`}>{field.label}</p>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confidenceTone[field.confidence]}`}>{field.confidence}</span>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${field.isCorrupted ? extractionStateTone.warning : field.value ? extractionStateTone.clean : extractionStateTone.missing}`}>
                              {field.isCorrupted ? 'Needs manual review' : field.value ? 'Clean value' : 'Missing value'}
                            </span>
                          </div>
                          {field.reviewMessage ? (
                            <div className="mt-2 rounded-[16px] border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                              {field.reviewMessage}
                            </div>
                          ) : null}
                          <p className={`mt-2 text-xs leading-5 ${appTextMutedClass}`}>
                            {field.isCorrupted
                              ? 'Source evidence was preserved for auditability, but the extracted text was not trusted.'
                              : field.sourceSnippet}
                          </p>
                          {field.isCorrupted ? (
                            <p className={`mt-2 rounded-[16px] border px-3 py-2 text-xs leading-5 ${appBorderClass} ${appTextMutedClass}`}>
                              {field.sourceSnippet}
                            </p>
                          ) : null}
                        </div>
                        <label className={`inline-flex items-center gap-2 text-sm ${appTextMutedClass}`}><input type="checkbox" checked={field.approved} onChange={(event) => updateField(field.id, { approved: event.target.checked })} />Use value</label>
                      </div>
                      <input
                        value={field.value}
                        onChange={(event) => updateField(field.id, { value: event.target.value, approved: event.target.value.trim().length > 0 })}
                        placeholder={field.isCorrupted ? 'Complete manually' : 'Enter value'}
                        className={`mt-3 ${inputClass}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null)}
          </section>
          <aside className="space-y-4">
            <div className={`${appPanelClass} rounded-[26px] p-5`}><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Import Summary</p><h3 className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{attachment.name}</h3>{analysis.extractionTemplateName ? <div className="mt-3 inline-flex rounded-full border border-cyan-300/60 bg-cyan-50/80 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">{analysis.extractionTemplateName}{analysis.extractionTemplateConfidence ? ` · ${analysis.extractionTemplateConfidence}%` : ''}</div> : null}<p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{analysis.summary.summary}</p><div className="mt-4 grid grid-cols-3 gap-3"><div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Approved</p><p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{approvedCount}</p></div><div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Missing</p><p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{missingFields.length}</p></div><div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Warnings</p><p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{corruptedCount}</p></div></div></div>
            <div className={`${appPanelClass} rounded-[26px] p-5`}><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-300" /><p className={`text-sm font-semibold ${appTextStrongClass}`}>Missing Values</p></div><div className="mt-3 space-y-2">{missingFields.length > 0 ? missingFields.map((item) => <div key={item} className="rounded-[18px] border border-amber-300/60 bg-amber-50/80 px-3 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{item}</div>) : <div className={`rounded-[18px] border px-3 py-3 text-sm ${appBorderClass} ${appTextMutedClass}`}>The main investment inputs were found. You can still refine the wording before saving.</div>}</div></div>
            {corruptedCount > 0 ? <div className={`${appPanelClass} rounded-[26px] p-5`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>Extraction Warnings</p><div className="mt-3 rounded-[18px] border border-amber-300/60 bg-amber-50/80 px-3 py-3 text-sm leading-6 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">Some PDF sections look malformed or unreadable. Those values were not trusted and should be completed manually before saving.</div></div> : null}
          </aside>
        </div>
      </div>
    </div>
  );
};

export const OpportunitiesPage: React.FC<OpportunitiesPageProps> = ({
  opportunities,
  onAddOpportunity,
  onUpdateOpportunity,
  onDeleteOpportunity,
  autoOpenImport = false,
}) => {
  const { settings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(opportunities[0]?.id ?? null);
  const [isImporting, setIsImporting] = useState(false);
  const [importState, setImportState] = useState<{ file: File; attachment: OpportunityAttachment; analysis: OpportunityDocumentAnalysis } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (opportunities.length === 0) { setSelectedOpportunityId(null); return; }
    if (!selectedOpportunityId || !opportunities.some((item) => item.id === selectedOpportunityId)) setSelectedOpportunityId(opportunities[0].id);
  }, [opportunities, selectedOpportunityId]);

  const selectedOpportunity = opportunities.find((item) => item.id === selectedOpportunityId) ?? opportunities[0] ?? null;
  const selectedMetrics = useMemo(() => (selectedOpportunity ? calculateOpportunityAnalysis(selectedOpportunity, 'base') : null), [selectedOpportunity]);
  const listItems = useMemo(() => [...opportunities].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [opportunities]);
  const openImport = () => fileInputRef.current?.click();

  useEffect(() => {
    if (autoOpenImport && !importState && !isImporting) {
      fileInputRef.current?.click();
    }
  }, [autoOpenImport, importState, isImporting]);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const attachment = await createAttachmentFromFile(file, detectOpportunityAttachmentType(file));
      const analysis = await analyzeOpportunityDocument(file, attachment);
      setImportState({ file, attachment, analysis });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleCreateFromImport = (analysis: OpportunityDocumentAnalysis) => {
    if (!importState) return;
    const titleField = analysis.extractedFields.find((field) => field.field === 'title');
    const opportunity = applyOpportunityDocumentAnalysis(analysis, importState.attachment, createEmptyOpportunity({ title: titleField?.value || importState.file.name.replace(/\.[^.]+$/, '') || 'New Opportunity', status: 'under-review', estimatedClosingCosts: 8000, monthlyHoldingCosts: 120 }));
    try {
      assertValidOpportunityFinancialValues(opportunity);
      setValidationError(null);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid opportunity financial values');
      return;
    }
    onAddOpportunity(opportunity);
    setSelectedOpportunityId(opportunity.id);
    setImportState(null);
  };

  const handleAddManually = () => {
    const opportunity = createEmptyOpportunity({ title: 'New Opportunity', status: 'new-lead', estimatedClosingCosts: 8000, monthlyHoldingCosts: 120 });
    onAddOpportunity(opportunity);
    setSelectedOpportunityId(opportunity.id);
  };

  const updateSelectedOpportunity = (patch: Partial<Opportunity>) => {
    if (!selectedOpportunity) return;
    const opportunity = enrichOpportunity({ ...selectedOpportunity, ...patch });
    try {
      assertValidOpportunityFinancialValues(opportunity);
      setValidationError(null);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid opportunity financial values');
      return;
    }
    onUpdateOpportunity(opportunity);
  };

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className={`${appPanelClass} rounded-[32px] p-5 sm:p-6`}>
          <div><p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>Opportunities</p><h1 className={`mt-2 text-[2rem] font-semibold tracking-tight ${appTextStrongClass}`}>Upload an opportunity document. Review the extraction. Get a clean investment view.</h1><p className={`mt-3 max-w-md text-sm leading-6 ${appTextMutedClass}`}>The current V1 is intentionally focused on one workflow: import an opportunity document, confirm the key numbers, and start analyzing it immediately.</p></div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={openImport} disabled={isImporting} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}><Upload className="h-4 w-4" />{isImporting ? 'Importing...' : 'Import Opportunity Document'}</button>
            <button type="button" onClick={handleAddManually} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><Plus className="h-4 w-4" />Add Opportunity Manually</button>
            <input ref={fileInputRef} type="file" accept=".pdf,.csv,.xls,.xlsx,image/*" className="hidden" onChange={(event) => void handleImportFile(event)} />
          </div>
          {validationError ? <p className="mt-4 rounded-xl border border-rose-300/60 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{validationError}</p> : null}
          {listItems.length === 0 ? (
            <div className={`mt-6 rounded-[28px] border border-dashed p-8 text-center ${appBorderClass}`}>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><Sparkles className="h-7 w-7" /></div>
              <h2 className={`mt-5 text-[1.55rem] font-semibold tracking-tight ${appTextStrongClass}`}>Turn the first opportunity document into a structured opportunity</h2>
              <p className={`mx-auto mt-3 max-w-md text-sm leading-6 ${appTextMutedClass}`}>Upload a real estate opportunity PDF, spreadsheet, or image. The app will prefill the main investment inputs, let you review them clearly, and create a polished opportunity sheet with live analysis cards.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={openImport} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>Import Opportunity Document</button>
                <button type="button" onClick={handleAddManually} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Add Opportunity Manually</button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">{listItems.map((opportunity) => <OpportunityListCard key={opportunity.id} opportunity={opportunity} currency={settings.currency} active={selectedOpportunityId === opportunity.id} onSelect={() => setSelectedOpportunityId(opportunity.id)} />)}</div>
          )}
        </section>

        <section className={`${appPanelClass} rounded-[32px] p-5 sm:p-6`}>
          {selectedOpportunity && selectedMetrics ? (
            <>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.22fr)_320px]">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>Opportunity Detail</p>
                  <h2 className={`mt-2 text-[2.15rem] font-semibold tracking-tight ${appTextStrongClass}`}>{selectedOpportunity.title || 'Untitled opportunity'}</h2>
                  <p className={`mt-3 flex items-center gap-2 text-sm ${appTextMutedClass}`}><MapPin className="h-4 w-4" />{[selectedOpportunity.address, selectedOpportunity.city].filter(Boolean).join(', ') || 'Location pending'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">{[selectedOpportunity.propertyType || 'Property type pending', selectedOpportunity.bedrooms ? `${selectedOpportunity.bedrooms} bed` : 'Bedrooms pending', selectedOpportunity.bathrooms ? `${selectedOpportunity.bathrooms} bath` : 'Bathrooms pending', selectedOpportunity.builtSqm ? `${selectedOpportunity.builtSqm} m2` : 'Size pending'].map((item) => <span key={item} className={`rounded-full px-3 py-1.5 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>{item}</span>)}</div>
                  <p className={`mt-5 max-w-3xl text-sm leading-6 ${appTextMutedClass}`}>{selectedOpportunity.investmentThesis || selectedOpportunity.description || 'Add a short note to capture the main rationale, context, or open questions around this opportunity.'}</p>
                </div>
                <div className={`${appPanelInsetClass} rounded-[26px] p-4`}>
                  {selectedOpportunity.mainImageUrl ? <img src={selectedOpportunity.mainImageUrl} alt={selectedOpportunity.title} className="h-52 w-full rounded-[22px] object-cover" /> : <div className="flex h-52 items-center justify-center rounded-[22px] border border-dashed border-slate-300/80 bg-white/60 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"><div className="text-center"><FileText className="mx-auto h-8 w-8" /><p className="mt-3 text-sm font-medium">Source file preview</p><p className="mt-1 text-xs">{selectedOpportunity.sourcePdfName || 'Imported deal file'}</p></div></div>}
                  <div className="mt-4 rounded-[22px] border border-slate-200/70 p-4 dark:border-slate-800"><p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Import Status</p><div className="mt-3 flex items-center justify-between"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[selectedOpportunity.status]}`}>{selectedOpportunity.status.replace(/-/g, ' ')}</span><span className={`text-xs ${appTextSoftClass}`}>{selectedOpportunity.readinessScore}% ready</span></div><p className={`mt-3 text-sm ${appTextMutedClass}`}>{selectedOpportunity.sourcePdfName || 'Manual opportunity'}</p></div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Asking Price" value={formatCurrency(selectedOpportunity.askingPrice, settings.currency)} />
                <MetricCard label="Monthly Rent" value={formatCurrency(selectedOpportunity.monthlyRentEstimate, settings.currency)} />
                <MetricCard label="Gross Yield" value={formatPercentage(selectedMetrics.grossYield)} highlight />
                <MetricCard label="Total Cash Needed" value={formatCurrency(selectedMetrics.totalCashNeeded, settings.currency)} />
                <MetricCard label="Net Monthly Cashflow" value={formatCurrency(selectedMetrics.netMonthlyCashflow, settings.currency)} />
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_360px]">
                <div className="space-y-5">
                  <div className={`${appPanelInsetClass} rounded-[26px] p-5`}><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Property Overview</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><DetailInput label="Title" value={selectedOpportunity.title} onChange={(value) => updateSelectedOpportunity({ title: value })} /><DetailInput label="Property Type" value={selectedOpportunity.propertyType} onChange={(value) => updateSelectedOpportunity({ propertyType: value })} /><DetailInput label="Address" value={selectedOpportunity.address} onChange={(value) => updateSelectedOpportunity({ address: value })} /><DetailInput label="City" value={selectedOpportunity.city} onChange={(value) => updateSelectedOpportunity({ city: value })} /><DetailInput label="Bedrooms" value={selectedOpportunity.bedrooms} type="number" onChange={(value) => updateSelectedOpportunity({ bedrooms: Number(value || 0) })} /><DetailInput label="Bathrooms" value={selectedOpportunity.bathrooms} type="number" onChange={(value) => updateSelectedOpportunity({ bathrooms: Number(value || 0) })} /><DetailInput label="Built m2" value={selectedOpportunity.builtSqm} type="number" onChange={(value) => updateSelectedOpportunity({ builtSqm: Number(value || 0) })} /></div></div>
                  <div className={`${appPanelInsetClass} rounded-[26px] p-5`}><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Financial Inputs</h3><div className="mt-4 grid gap-4 sm:grid-cols-3"><DetailInput label="Asking Price" value={selectedOpportunity.askingPrice} type="number" onChange={(value) => updateSelectedOpportunity({ askingPrice: Number(value || 0) })} /><DetailInput label="Rent Estimate" value={selectedOpportunity.monthlyRentEstimate} type="number" onChange={(value) => updateSelectedOpportunity({ monthlyRentEstimate: Number(value || 0) })} /><DetailInput label="Renovation Cost" value={selectedOpportunity.estimatedRenovationCost} type="number" onChange={(value) => updateSelectedOpportunity({ estimatedRenovationCost: Number(value || 0) })} /></div></div>
                  <div className={`${appPanelInsetClass} rounded-[26px] p-5`}><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Notes</h3><textarea value={selectedOpportunity.investmentThesis || selectedOpportunity.description} onChange={(event) => updateSelectedOpportunity({ investmentThesis: event.target.value, description: event.target.value })} rows={6} className={`mt-4 w-full ${appInputClass}`} /></div>
                </div>
                <div className="space-y-5">
                  <div className={`${appPanelInsetClass} rounded-[26px] p-5`}><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Analysis Assumptions</h3><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>Keep this simple for V1. These five inputs drive the live headline analysis.</p><div className="mt-4 space-y-4"><DetailInput label="Down Payment %" value={selectedOpportunity.downPaymentPct} type="number" onChange={(value) => updateSelectedOpportunity({ downPaymentPct: Number(value || 0), useMortgage: true, cashPurchase: false })} /><DetailInput label="Closing Cost Estimate" value={selectedOpportunity.estimatedClosingCosts} type="number" onChange={(value) => updateSelectedOpportunity({ estimatedClosingCosts: Number(value || 0) })} /><DetailInput label="Interest Rate %" value={selectedOpportunity.interestRate} type="number" onChange={(value) => updateSelectedOpportunity({ interestRate: Number(value || 0), useMortgage: true, cashPurchase: false })} /><DetailInput label="Mortgage Term" value={selectedOpportunity.mortgageTermYears} type="number" onChange={(value) => updateSelectedOpportunity({ mortgageTermYears: Number(value || 0), useMortgage: true, cashPurchase: false })} /><DetailInput label="Monthly Expenses" value={selectedOpportunity.monthlyHoldingCosts} type="number" onChange={(value) => updateSelectedOpportunity({ monthlyHoldingCosts: Number(value || 0) })} /></div></div>
                  <div className={`${appPanelInsetClass} rounded-[26px] p-5`}><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Quick Read</h3><div className="mt-4 space-y-2">{[['Annual Rent', formatCurrency(selectedMetrics.annualRent, settings.currency)], ['Mortgage Payment', formatCurrency(selectedMetrics.monthlyMortgagePayment, settings.currency)], ['Monthly Expenses', formatCurrency(selectedMetrics.totalMonthlyExpenses, settings.currency)], ['Readiness Score', `${selectedOpportunity.readinessScore}%`]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-[18px] border border-slate-200/70 px-3 py-3 dark:border-slate-800"><span className={`text-sm ${appTextMutedClass}`}>{label}</span><span className={`text-sm font-semibold ${appTextStrongClass}`}>{value}</span></div>)}</div></div>
                  <button type="button" onClick={() => onDeleteOpportunity(selectedOpportunity.id)} className={`w-full rounded-xl px-4 py-2.5 ${appButtonMutedClass} text-rose-600 dark:text-rose-300`}>Delete Opportunity</button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[580px] items-center justify-center"><div className="max-w-md text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><Building2 className="h-7 w-7" /></div><h2 className={`mt-5 text-[1.75rem] font-semibold tracking-tight ${appTextStrongClass}`}>Opportunity Detail</h2><p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>Import a deal or add one manually to open the first opportunity sheet and see the live V1 analysis cards.</p></div></div>
          )}
        </section>
      </div>
      {importState ? <ImportReviewModal attachment={importState.attachment} analysis={importState.analysis} onBack={() => setImportState(null)} onCancel={() => setImportState(null)} onCreate={handleCreateFromImport} /> : null}
    </>
  );
};
