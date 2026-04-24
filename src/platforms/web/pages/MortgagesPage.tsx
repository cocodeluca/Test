import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { MortgageForm } from '../components/MortgageForm';
import { MortgageCard } from '../components/MortgageCard';
import { useSettings } from '../context/SettingsContext';
import { Mortgage, OpportunityAttachment, OpportunityFieldExtractionConfidence, Property } from '../../../common/types';
import {
  analyzeMortgageDocument,
  applyMortgageDocumentAnalysis,
  createEmptyMortgage,
  MortgageDocumentAnalysis,
  MortgageDocumentFieldStatus,
  MortgageDocumentExtractedField,
} from '../../../common/utils/mortgageDocuments';
import {
  createAttachmentFromFile,
  detectOpportunityAttachmentType,
  extractTextFromDocumentFile,
} from '../../../common/utils/opportunities';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appOverlayClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface MortgagesPageProps {
  properties: Property[];
  mortgages: Mortgage[];
  onAddMortgage: (mortgage: Mortgage) => void;
  onEditMortgage: (mortgage: Mortgage) => void;
  onDeleteMortgage: (id: string) => void;
}

type ReviewField = MortgageDocumentExtractedField & { approved: boolean };
const inputClass = `w-full ${appInputClass}`;
const confidenceTone: Record<OpportunityFieldExtractionConfidence, string> = {
  high: 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  medium: 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  low: 'border-rose-300/60 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
};

const statusTone: Record<MortgageDocumentFieldStatus, string> = {
  found_high_confidence: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/15 dark:bg-emerald-500/5',
  found_low_confidence: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-500/15 dark:bg-amber-500/5',
  missing: 'border-slate-200/70 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/50',
  needs_user_confirmation: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-500/15 dark:bg-amber-500/5',
};

const reviewGroups = [
  {
    id: 'identity',
    title: 'Mortgage identity',
    fields: ['propertyId', 'lenderName', 'referenceNumber', 'interestType', 'mortgageStartDate', 'collateralAddress'],
  },
  {
    id: 'economics',
    title: 'Economics',
    fields: ['principalAmount', 'currency', 'termYears', 'totalPayments', 'repaymentFrequency', 'initialRate', 'initialRateMonths', 'baseRate', 'initialMonthlyPayment', 'regularMonthlyPayment', 'valuationAmount'],
  },
  {
    id: 'fees',
    title: 'Fees & conditions',
    fields: ['bonificationMax', 'bonificationItems', 'mandatoryProducts', 'optionalProducts'],
  },
];

const MortgageImportReviewModal: React.FC<{
  attachment: OpportunityAttachment;
  analysis: MortgageDocumentAnalysis;
  properties: Property[];
  onBack: () => void;
  onCancel: () => void;
  onCreate: (analysis: MortgageDocumentAnalysis) => void;
}> = ({ attachment, analysis, properties, onBack, onCancel, onCreate }) => {
  const [fields, setFields] = useState<ReviewField[]>(
    analysis.extractedFields.map((field) => ({
      ...field,
      approved: field.status !== 'missing',
    }))
  );

  useEffect(() => {
    setFields(
      analysis.extractedFields.map((field) => ({
        ...field,
        approved: field.status !== 'missing',
      }))
    );
  }, [analysis]);

  const getField = (fieldKey: ReviewField['field']) => fields.find((field) => field.field === fieldKey);
  const isResolved = (field?: ReviewField | null) =>
    Boolean(
      field &&
        field.approved &&
        field.status !== 'missing' &&
        field.status !== 'needs_user_confirmation' &&
        field.normalizedValue !== null &&
        field.value !== 'Missing from document'
    );
  const hasResolvedTerm = isResolved(getField('termYears')) || isResolved(getField('totalPayments'));
  const hasResolvedPayment =
    isResolved(getField('initialMonthlyPayment')) || isResolved(getField('regularMonthlyPayment'));
  const requiredChecks = [
    { label: 'Linked property', resolved: isResolved(getField('propertyId')) },
    { label: 'Lender name', resolved: isResolved(getField('lenderName')) },
    { label: 'Principal amount', resolved: isResolved(getField('principalAmount')) },
    { label: 'Mortgage type', resolved: isResolved(getField('interestType')) },
    { label: 'Term or total payments', resolved: hasResolvedTerm },
    { label: 'Monthly payment or payment schedule', resolved: hasResolvedPayment },
  ];
  const unresolvedRequired = requiredChecks.filter((item) => !item.resolved);
  const canCreateMortgage = unresolvedRequired.length === 0;

  const groupedFields = useMemo(
    () =>
      reviewGroups.map((group) => ({
        ...group,
        items: fields.filter((field) => group.fields.includes(field.field)),
      })),
    [fields]
  );

  const computedMissing = [
    !isResolved(getField('propertyId')) ? 'Choose and confirm the linked property before creating the mortgage.' : null,
    !isResolved(getField('lenderName')) ? 'Confirm the lender name.' : null,
    !isResolved(getField('principalAmount')) ? 'Confirm the initial loan principal.' : null,
    !isResolved(getField('interestType')) ? 'Confirm whether the mortgage is fixed, variable, or mixed.' : null,
    !hasResolvedTerm ? 'Confirm either the mortgage term or the total number of payments.' : null,
    !hasResolvedPayment ? 'Confirm the monthly payment or payment schedule.' : null,
  ].filter((item): item is string => Boolean(item));

  const updateField = (fieldId: string, updates: Partial<ReviewField>) => {
    setFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }
        return {
          ...field,
          ...updates,
        };
      })
    );
  };

  const createAnalysisPayload = (): MortgageDocumentAnalysis => ({
    ...analysis,
    extractedFields: fields
      .filter((field) => field.approved)
      .map(({ approved, ...field }) => field),
    summary: {
      ...analysis.summary,
      missingInformation: computedMissing,
      lowConfidenceFields: fields
        .filter((field) => field.approved && field.status === 'found_low_confidence')
        .map((field) => field.label),
      needsConfirmationFields: fields
        .filter((field) => field.approved && field.status === 'needs_user_confirmation')
        .map((field) => field.label),
    },
  });

  const renderFieldInput = (field: ReviewField) => {
    if (field.field === 'propertyId') {
      return (
        <select
          value={typeof field.normalizedValue === 'string' ? field.normalizedValue : ''}
          onChange={(event) =>
            updateField(field.id, {
              value: properties.find((property) => property.id === event.target.value)?.name ?? '',
              normalizedValue: event.target.value,
              approved: event.target.value !== '',
              confidence: event.target.value ? 'high' : field.confidence,
              status: event.target.value ? 'found_high_confidence' : 'missing',
            })
          }
          className={inputClass}
        >
          <option value="">Select property</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name} - {property.city}
            </option>
          ))}
        </select>
      );
    }

    const isNumeric = [
      'principalAmount',
      'termYears',
      'totalPayments',
      'initialRate',
      'initialRateMonths',
      'baseRate',
      'initialMonthlyPayment',
      'regularMonthlyPayment',
      'valuationAmount',
      'bonificationMax',
    ].includes(field.field);
    const isList = ['bonificationItems', 'mandatoryProducts', 'optionalProducts'].includes(field.field);

    if (field.field === 'interestType') {
      const currentValue = typeof field.normalizedValue === 'string' ? field.normalizedValue : field.value;
      return (
        <select
          value={currentValue || ''}
          onChange={(event) =>
            updateField(field.id, {
              value: event.target.value,
              normalizedValue: event.target.value,
              approved: event.target.value !== '',
              status: event.target.value ? 'found_high_confidence' : 'needs_user_confirmation',
              confidence: event.target.value ? 'high' : field.confidence,
            })
          }
          className={inputClass}
        >
          <option value="">Select type</option>
          <option value="Fixed">Fixed</option>
          <option value="Variable">Variable</option>
          <option value="Mixed">Mixed</option>
        </select>
      );
    }

    if (field.field === 'repaymentFrequency') {
      const currentValue = typeof field.normalizedValue === 'string' ? field.normalizedValue : field.value;
      return (
        <select
          value={currentValue || ''}
          onChange={(event) =>
            updateField(field.id, {
              value: event.target.value,
              normalizedValue: event.target.value,
              approved: event.target.value !== '',
              status: event.target.value ? 'found_high_confidence' : 'needs_user_confirmation',
              confidence: event.target.value ? 'high' : field.confidence,
            })
          }
          className={inputClass}
        >
          <option value="">Select frequency</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
      );
    }

    if (isList) {
      return (
        <textarea
          value={
            Array.isArray(field.normalizedValue)
              ? field.normalizedValue
                  .map((item) => (typeof item === 'string' ? item : item.label))
                  .join('\n')
              : field.value
          }
          onChange={(event) =>
            updateField(field.id, {
              value: event.target.value,
              normalizedValue:
                field.field === 'bonificationItems'
                  ? event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item, index) => ({
                        key: `manual-bonification-${index + 1}`,
                        label: item,
                        active: false,
                        available: true,
                        bonusPoints: null,
                        status: 'inactive' as const,
                        notes: null,
                        source: 'user' as const,
                      }))
                  : event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
              approved: event.target.value.trim().length > 0,
              status: event.target.value.trim().length > 0 ? 'found_high_confidence' : 'missing',
              confidence: event.target.value.trim().length > 0 ? 'high' : field.confidence,
            })
          }
          rows={3}
          className={inputClass}
        />
      );
    }

    return (
      <input
        type={isNumeric ? 'number' : field.field === 'mortgageStartDate' ? 'date' : 'text'}
        value={
          field.status === 'missing' && !isNumeric && field.field !== 'mortgageStartDate'
            ? ''
            : Array.isArray(field.normalizedValue)
            ? field.value
            : field.value
        }
        onChange={(event) =>
          updateField(field.id, {
            value: event.target.value,
            normalizedValue:
              isNumeric
                ? event.target.value === ''
                  ? null
                  : Number(event.target.value || 0)
                : event.target.value,
            approved: event.target.value.trim().length > 0,
            status: event.target.value.trim().length > 0 ? 'found_high_confidence' : 'missing',
            confidence: event.target.value.trim().length > 0 ? 'high' : field.confidence,
          })
        }
        className={inputClass}
        step={isNumeric ? '0.01' : undefined}
      />
    );
  };

  return (
    <div className={`fixed inset-0 z-[80] overflow-auto p-4 backdrop-blur-sm ${appOverlayClass}`}>
      <div className={`mx-auto max-w-6xl ${appPanelClass} rounded-[34px] p-5 sm:p-6`}>
        <div className={`flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between ${appBorderClass}`}>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>Mortgage Import Review</p>
            <h2 className={`mt-2 text-[1.9rem] font-semibold tracking-tight ${appTextStrongClass}`}>Review extracted mortgage values</h2>
            <p className={`mt-2 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
              Confirm the AI draft, fix low-confidence items, and answer only the details that were unclear.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onBack} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Back</button>
            <button type="button" onClick={onCancel} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>Cancel</button>
            <button type="button" disabled={!canCreateMortgage} onClick={() => onCreate(createAnalysisPayload())} className={`rounded-xl px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60 ${appButtonPrimaryClass}`}>Create Mortgage</button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <section className="space-y-4">
            {groupedFields.map((group) =>
              group.items.length > 0 ? (
                <div key={group.id} className={`${appPanelInsetClass} rounded-[28px] p-5`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{group.title}</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setFields((current) =>
                          current.map((field) =>
                            group.fields.includes(field.field) ? { ...field, approved: true } : field
                          )
                        )
                      }
                      className={`rounded-xl px-3 py-2 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}
                    >
                      Accept Group
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {group.items.map((field) => (
                      <div key={field.id} className={`rounded-[22px] border p-4 ${statusTone[field.status]} ${appBorderClass}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`text-sm font-semibold ${appTextStrongClass}`}>{field.label}</p>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confidenceTone[field.confidence]}`}>
                                {field.confidence}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${field.status === 'found_high_confidence' ? 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : field.status === 'found_low_confidence' || field.status === 'needs_user_confirmation' ? 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300' : 'border-slate-300/60 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'}`}>
                                {field.status}
                              </span>
                            </div>
                            <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{field.sourceLabel}</p>
                            <p className={`mt-1 text-xs leading-5 ${appTextMutedClass}`}>{field.sourceSnippet || 'Added manually during review.'}</p>
                            <div className={`mt-2 rounded-[16px] border px-3 py-2 text-xs leading-5 ${appBorderClass} ${appPanelInsetClass}`}>
                              <p className={`font-semibold ${appTextStrongClass}`}>Raw extraction</p>
                              <p className={`mt-1 ${appTextMutedClass}`}>{field.value || 'No raw value captured'}</p>
                              <p className={`mt-2 font-semibold ${appTextStrongClass}`}>Mapped value</p>
                              <p className={`mt-1 ${appTextMutedClass}`}>
                                {field.normalizedValue === null
                                  ? 'No mapped value'
                                  : Array.isArray(field.normalizedValue)
                                  ? field.normalizedValue
                                      .map((item) => (typeof item === 'string' ? item : item.label))
                                      .join(', ')
                                  : String(field.normalizedValue)}
                              </p>
                            </div>
                            {field.reviewMessage ? (
                              <p className="mt-2 rounded-[16px] border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                                {field.reviewMessage}
                              </p>
                            ) : null}
                            <details className="mt-3">
                              <summary className={`cursor-pointer text-xs font-medium ${appTextMutedClass}`}>View source text</summary>
                              <div className={`mt-2 rounded-[16px] border px-3 py-3 text-xs leading-5 ${appBorderClass} ${appPanelInsetClass} ${appTextMutedClass}`}>
                                {field.sourceText || 'No source text captured for this field.'}
                              </div>
                            </details>
                          </div>
                          <label className={`inline-flex items-center gap-2 text-sm ${appTextMutedClass}`}>
                            <input
                              type="checkbox"
                              checked={field.approved}
                              onChange={(event) =>
                                updateField(field.id, {
                                  approved: event.target.checked,
                                  status: event.target.checked ? field.status : 'needs_user_confirmation',
                                })
                              }
                            />
                            Use value
                          </label>
                        </div>
                        <div className="mt-3">{renderFieldInput(field)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </section>

          <aside className="space-y-4">
            <div className={`${appPanelClass} rounded-[28px] p-5`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Import Summary</p>
              <h3 className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{attachment.name}</h3>
              <div className="mt-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <p className={`text-sm ${appTextMutedClass}`}>Parser profile: {analysis.parserProfile}</p>
              </div>
              <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{analysis.summary.summary}</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className={`${appPanelInsetClass} rounded-[18px] p-3`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Fields</p>
                  <p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{fields.length}</p>
                </div>
                <div className={`${appPanelInsetClass} rounded-[18px] p-3`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Missing</p>
                  <p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{fields.filter((field) => field.status === 'missing').length}</p>
                </div>
                <div className={`${appPanelInsetClass} rounded-[18px] p-3`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Low confidence</p>
                  <p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{fields.filter((field) => field.status === 'found_low_confidence').length}</p>
                </div>
              </div>
              <div className={`mt-4 rounded-[20px] border p-4 ${appBorderClass} ${appPanelInsetClass}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Compact summary before save</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className={appTextMutedClass}>Lender</span>
                    <span className={`text-right font-medium ${appTextStrongClass}`}>{fields.find((field) => field.field === 'lenderName')?.value || 'Missing from document'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className={appTextMutedClass}>Principal</span>
                    <span className={`text-right font-medium ${appTextStrongClass}`}>{fields.find((field) => field.field === 'principalAmount')?.value || 'Missing from document'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className={appTextMutedClass}>Property</span>
                    <span className={`text-right font-medium ${appTextStrongClass}`}>{properties.find((property) => property.id === fields.find((field) => field.field === 'propertyId')?.normalizedValue)?.name || fields.find((field) => field.field === 'propertyId')?.value || 'Select property'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[28px] p-5`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                <p className={`text-sm font-semibold ${appTextStrongClass}`}>Questions to confirm</p>
              </div>
              <div className="mt-3 space-y-2">
                {computedMissing.length > 0 ? (
                  computedMissing.map((item) => (
                    <div key={item} className="rounded-[18px] border border-amber-300/60 bg-amber-50/80 px-3 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                      {item}
                    </div>
                  ))
                ) : (
                  <div className={`rounded-[18px] border px-3 py-3 text-sm ${appBorderClass} ${appTextMutedClass}`}>
                    The key mortgage inputs are already covered. You can still refine any field before saving.
                  </div>
                )}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[28px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Required before save</p>
              <div className="mt-3 space-y-2">
                {requiredChecks.map((item) => (
                  <div key={item.label} className={`rounded-[18px] border px-3 py-3 text-sm ${item.resolved ? 'border-emerald-300/60 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-amber-300/60 bg-amber-50/70 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[28px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Low-confidence items</p>
              <div className="mt-3 space-y-2">
                {fields.filter((field) => field.status === 'found_low_confidence').length > 0 ? (
                  fields
                    .filter((field) => field.status === 'found_low_confidence')
                    .map((field) => (
                      <div key={field.id} className={`rounded-[18px] px-3 py-3 text-sm ${appPanelInsetClass} ${appTextMutedClass}`}>
                        {field.label}
                      </div>
                    ))
                ) : (
                  <div className={`rounded-[18px] border px-3 py-3 text-sm ${appBorderClass} ${appTextMutedClass}`}>
                    Nothing is currently flagged as low confidence.
                  </div>
                )}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[28px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Import debug</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className={`rounded-[18px] border px-3 py-3 ${appBorderClass} ${appPanelInsetClass}`}>
                  <p className={`font-semibold ${appTextStrongClass}`}>Parser used</p>
                  <p className={`mt-1 ${appTextMutedClass}`}>{analysis.debug.parserUsed}</p>
                </div>
                <div className={`rounded-[18px] border px-3 py-3 ${appBorderClass} ${appPanelInsetClass}`}>
                  <p className={`font-semibold ${appTextStrongClass}`}>Matched FEIN sections</p>
                  <div className="mt-2 space-y-2">
                    {analysis.debug.matchedSections.map((section) => (
                      <div key={section.key} className={`rounded-[14px] px-3 py-2 ${section.matched ? 'bg-emerald-50/70 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-50/70 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300'}`}>
                        <div className="font-medium">{section.title}</div>
                        <div className="mt-1 text-xs">{section.preview || 'No section match'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <details className={`rounded-[18px] border px-3 py-3 ${appBorderClass} ${appPanelInsetClass}`}>
                  <summary className={`cursor-pointer font-semibold ${appTextStrongClass}`}>Raw extracted fields</summary>
                  <div className="mt-3 space-y-2">
                    {analysis.debug.rawExtractedFields.map((item) => (
                      <div key={`${item.field}-${item.sourceSnippet}`} className={`rounded-[14px] px-3 py-2 ${appPanelInsetClass}`}>
                        <div className={`font-medium ${appTextStrongClass}`}>{item.field}</div>
                        <div className={`mt-1 text-xs ${appTextMutedClass}`}>{item.rawValue}</div>
                      </div>
                    ))}
                  </div>
                </details>
                <details className={`rounded-[18px] border px-3 py-3 ${appBorderClass} ${appPanelInsetClass}`}>
                  <summary className={`cursor-pointer font-semibold ${appTextStrongClass}`}>Mapped fields</summary>
                  <div className="mt-3 space-y-2">
                    {analysis.debug.mappedFields.map((item) => (
                      <div key={item.field} className={`rounded-[14px] px-3 py-2 ${appPanelInsetClass}`}>
                        <div className={`font-medium ${appTextStrongClass}`}>{item.field}</div>
                        <div className={`mt-1 text-xs ${appTextMutedClass}`}>Raw: {item.rawValue || 'none'}</div>
                        <div className={`mt-1 text-xs ${appTextMutedClass}`}>Mapped: {item.mappedValue || 'none'}</div>
                        <div className={`mt-1 text-xs ${appTextMutedClass}`}>Status: {item.status}</div>
                      </div>
                    ))}
                  </div>
                </details>
                {analysis.debug.mappingFailures.length > 0 ? (
                  <div className="rounded-[18px] border border-rose-300/60 bg-rose-50/80 px-3 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                    {analysis.debug.mappingFailures.map((item) => `${item.field}: ${item.reason}`).join(' | ')}
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export const MortgagesPage: React.FC<MortgagesPageProps> = ({
  properties,
  mortgages,
  onAddMortgage,
  onEditMortgage,
  onDeleteMortgage,
}) => {
  const { t } = useSettings();
  void onDeleteMortgage;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMortgageId, setEditingMortgageId] = useState<string | null>(null);
  const [editingMortgage, setEditingMortgage] = useState<Mortgage | null>(null);
  const [editingMortgageSection, setEditingMortgageSection] = useState<string | null>(null);
  const [selectedMortgageId, setSelectedMortgageId] = useState<string | null>(
    mortgages[0]?.id ?? null
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importState, setImportState] = useState<{
    file: File;
    attachment: OpportunityAttachment;
    analysis: MortgageDocumentAnalysis;
  } | null>(null);

  useEffect(() => {
    if (mortgages.length === 0) {
      setSelectedMortgageId(null);
      return;
    }

    const selectedStillExists = selectedMortgageId
      ? mortgages.some((mortgage) => mortgage.id === selectedMortgageId)
      : false;

    if (!selectedStillExists) {
      setSelectedMortgageId(mortgages[0].id);
    }
  }, [mortgages, selectedMortgageId]);

  const getPropertyById = (propertyId: string) =>
    properties.find((property) => property.id === propertyId);

  const selectedMortgage = useMemo(
    () => mortgages.find((mortgage) => mortgage.id === selectedMortgageId) ?? null,
    [mortgages, selectedMortgageId]
  );

  const selectorItems = useMemo(
    () =>
      mortgages.map((mortgage) => {
        const property = getPropertyById(mortgage.propertyId);
        return {
          id: mortgage.id,
          title: mortgage.lenderName,
          subtitle: property ? property.name : t('mortgages.unlinkedProperty'),
          meta: property ? `${property.city}, ${property.country}` : mortgage.fixedOrVariable,
        };
      }),
    [mortgages, properties, t]
  );

  const handleOpenEditForm = (mortgage: Mortgage, section: string | null = null) => {
    setEditingMortgageId(mortgage.id);
    setEditingMortgage(mortgage);
    setEditingMortgageSection(section);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingMortgageId(null);
    setEditingMortgage(null);
    setEditingMortgageSection(null);
  };

  const handleAddMortgageSubmit = (mortgage: Mortgage) => {
    onAddMortgage(mortgage);
    setSelectedMortgageId(mortgage.id);
    handleCloseForm();
  };

  const handleEditMortgageSubmit = (mortgage: Mortgage) => {
    onEditMortgage(mortgage);
    setSelectedMortgageId(mortgage.id);
    handleCloseForm();
  };

  const handleOpenManualFlow = () => {
    if (properties.length === 0) {
      return;
    }
    setShowForm(true);
  };

  const handleOpenImportFlow = () => {
    if (properties.length === 0) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const attachment = await createAttachmentFromFile(file, detectOpportunityAttachmentType(file));
      const extractedText = await extractTextFromDocumentFile(file);
      const analysis = await analyzeMortgageDocument(file, attachment, extractedText, properties);
      setImportState({ file, attachment, analysis });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleCreateFromImport = (analysis: MortgageDocumentAnalysis) => {
    const mortgage = applyMortgageDocumentAnalysis(
      analysis,
      properties,
      createEmptyMortgage(properties, {
        id: `mort${Date.now()}`,
      })
    );

    onAddMortgage(mortgage);
    setSelectedMortgageId(mortgage.id);
    setImportState(null);
  };

  const selectedProperty = selectedMortgage
    ? getPropertyById(selectedMortgage.propertyId)
    : undefined;

  const hasProperties = properties.length > 0;

  return (
    <>
      <div className="space-y-3 md:space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={`text-[1.55rem] font-bold md:text-[2rem] ${appTextStrongClass}`}>{t('mortgages.title')}</h1>
            <p className={`mt-1 text-sm md:text-[15px] ${appTextMutedClass}`}>
              {t(
                mortgages.length === 1
                  ? 'mortgages.mortgageCount_one'
                  : 'mortgages.mortgageCount_other',
                { count: mortgages.length }
              )}{' '}
              - {t('mortgages.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenImportFlow}
              disabled={!hasProperties || isImporting}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-cyan-200/70 bg-cyan-50/65 px-3.5 py-2.5 text-sm font-medium text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:border-cyan-500/35 dark:hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <Sparkles className="h-4.5 w-4.5" />
              {isImporting ? t('mortgagesUi.importing') : t('mortgagesUi.importWithAi')}
            </button>
            <button
              type="button"
              onClick={handleOpenManualFlow}
              disabled={!hasProperties}
              data-tutorial-id="mortgages-add"
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 px-6 py-3 ${appButtonPrimaryClass} disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400`}
            >
              <Plus className="w-5 h-5" />
              {t('mortgagesUi.addManually')}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(event) => void handleImportFile(event)}
        />

        {mortgages.length === 0 ? (
          <div className={`${appPanelClass} overflow-hidden p-6 sm:p-8`}>
            <div className="mx-auto max-w-3xl text-center">
              <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>{t('mortgagesUi.emptyBadge')}</p>
              <h2 className={`mt-3 text-[1.8rem] font-semibold tracking-tight ${appTextStrongClass}`}>{t('mortgagesUi.emptyTitle')}</h2>
              <p className={`mx-auto mt-3 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
                {t('mortgagesUi.emptyBody')}
              </p>
              {!hasProperties ? (
                <div className="mx-auto mt-5 max-w-2xl rounded-[20px] border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                  {t('mortgagesUi.linkPropertyFirst')}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="min-w-0">
              {selectedMortgage ? (
                <MortgageCard
                  mortgage={selectedMortgage}
                  property={selectedProperty}
                  selectorItems={selectorItems}
                  selectedMortgageId={selectedMortgageId}
                  onSelectMortgage={setSelectedMortgageId}
                  onEdit={handleOpenEditForm}
                />
              ) : (
                <div className={`${appPanelClass} p-12 text-center`}>
                  <p className={`text-lg font-medium ${appTextStrongClass}`}>
                    {t('mortgages.selectMortgage')}
                  </p>
                  <p className={`mt-2 text-sm ${appTextMutedClass}`}>
                    {t('mortgages.selectMortgageHelp')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {showForm && (
          <MortgageForm
            properties={properties}
            isEditing={editingMortgageId !== null}
            editingMortgage={editingMortgage}
            initialSection={editingMortgageSection}
            onAddMortgage={handleAddMortgageSubmit}
            onEditMortgage={handleEditMortgageSubmit}
            onClose={handleCloseForm}
          />
        )}
      </div>

      {importState ? (
        <MortgageImportReviewModal
          attachment={importState.attachment}
          analysis={importState.analysis}
          properties={properties}
          onBack={() => setImportState(null)}
          onCancel={() => setImportState(null)}
          onCreate={handleCreateFromImport}
        />
      ) : null}
    </>
  );
};
