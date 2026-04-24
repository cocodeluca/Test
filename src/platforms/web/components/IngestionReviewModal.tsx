import React, { useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import type { DocumentAnalysisResult, IngestionExtractedField, UploadedWorkspaceFile } from '../../../common/types/settings';
import { updateAnalysisField } from '../../../common/utils/ingestion';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface IngestionReviewModalProps {
  files: UploadedWorkspaceFile[];
  analyses: DocumentAnalysisResult[];
  onSave: (nextFiles: UploadedWorkspaceFile[], nextAnalyses: DocumentAnalysisResult[]) => void;
  onClose: () => void;
  onIgnore?: () => void;
  onReanalyze?: () => void;
}

const confidenceClass = (confidence: number) =>
  confidence >= 0.8
    ? 'border-emerald-300/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'
    : confidence >= 0.6
    ? 'border-amber-300/60 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
    : 'border-rose-300/60 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300';

const groupedSections: Array<{ id: string; title: string; matcher: (field: IngestionExtractedField) => boolean }> = [
  {
    id: 'property',
    title: 'Property data',
    matcher: (field) =>
      ['title', 'address', 'city', 'region', 'country', 'postalCode', 'propertyType', 'strategy', 'bedrooms', 'bathrooms', 'builtSqm', 'plotSqm', 'floor', 'yearBuilt', 'condition', 'occupancyStatus', 'askingPrice', 'targetOfferPrice', 'monthlyRentEstimate', 'estimatedResalePrice', 'strengths', 'risks'].includes(field.fieldKey),
  },
  {
    id: 'budget',
    title: 'Budget / project data',
    matcher: (field) =>
      ['estimatedClosingCosts', 'estimatedRenovationCost', 'furnitureSetupCost', 'lineItemName', 'budgetCategory', 'estimatedTotal', 'actualTotal', 'supplier', 'contractor', 'contingency', 'permitNumber'].includes(field.fieldKey),
  },
  {
    id: 'mortgage',
    title: 'Mortgage / financing data',
    matcher: (field) =>
      ['lender', 'loanAmount', 'interestRate', 'mortgageTermYears', 'estimatedMonthlyMortgagePayment', 'financingNotes'].includes(field.fieldKey),
  },
];

export const IngestionReviewModal: React.FC<IngestionReviewModalProps> = ({
  files,
  analyses,
  onSave,
  onClose,
  onIgnore,
  onReanalyze,
}) => {
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id ?? '');
  const [draftAnalyses, setDraftAnalyses] = useState(analyses);

  const selectedIndex = Math.max(0, files.findIndex((file) => file.id === selectedFileId));
  const selectedFile = files[selectedIndex] ?? files[0];
  const selectedAnalysis = draftAnalyses[selectedIndex] ?? draftAnalyses[0];

  const groupedFields = useMemo(
    () =>
      groupedSections.map((section) => ({
        ...section,
        fields: selectedAnalysis ? selectedAnalysis.normalizedFields.filter(section.matcher) : [],
      })),
    [selectedAnalysis]
  );

  const updateField = (fieldId: string, updates: Partial<IngestionExtractedField>) => {
    setDraftAnalyses((current) =>
      current.map((analysis) => (analysis.id === selectedAnalysis.id ? updateAnalysisField(analysis, fieldId, updates) : analysis))
    );
  };

  if (!selectedFile || !selectedAnalysis) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className={`mx-auto max-w-7xl ${appPanelClass} rounded-[28px] p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>File Ingestion Review</p>
            <h2 className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>Review extracted investment data before saving</h2>
            <p className={`mt-2 max-w-3xl text-sm ${appTextMutedClass}`}>
              The app analyzed your uploaded files, grouped the extracted information, and kept source evidence attached so you can approve only what you trust.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onReanalyze ? (
              <button type="button" onClick={onReanalyze} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>
                <RefreshCcw className="mr-2 inline h-4 w-4" />
                Reanalyze
              </button>
            ) : null}
            {onIgnore ? (
              <button type="button" onClick={onIgnore} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>
                Ignore This File
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>
              Close
            </button>
            <button type="button" onClick={() => onSave(files, draftAnalyses)} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>
              Save Approved Data
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          <aside className={`${appPanelInsetClass} rounded-[26px] p-4`}>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Files</p>
            </div>
            <div className="mt-4 space-y-2">
              {files.map((file, index) => {
                const analysis = draftAnalyses[index];
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedFileId(file.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      file.id === selectedFile.id ? 'border-cyan-400/35 bg-cyan-500/10' : `${appBorderClass} ${appPanelClass}`
                    }`}
                  >
                    <p className={`text-sm font-semibold ${appTextStrongClass}`}>{file.name}</p>
                    <p className={`mt-1 text-xs ${appTextMutedClass}`}>{analysis.documentType[0]?.replace(/-/g, ' ') || file.type}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${confidenceClass(analysis.documentTypeConfidence / 100)}`}>
                        {analysis.documentTypeConfidence}% type confidence
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-4">
            <div className={`${appPanelInsetClass} rounded-[26px] p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>File Summary</p>
                  <h3 className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{selectedFile.name}</h3>
                  <p className={`mt-2 text-sm ${appTextMutedClass}`}>
                    {selectedAnalysis.documentType.map((item) => item.replace(/-/g, ' ')).join(', ')} for a{' '}
                    {selectedAnalysis.inferredProjectType.map((item) => item.replace(/-/g, ' ')).join(', ')} workflow.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-md border px-3 py-1.5 text-xs font-medium ${confidenceClass(selectedAnalysis.documentTypeConfidence / 100)}`}>
                    {selectedAnalysis.documentTypeConfidence}% document confidence
                  </span>
                  <span className={`rounded-md border px-3 py-1.5 text-xs font-medium ${confidenceClass(selectedAnalysis.inferredProjectTypeConfidence / 100)}`}>
                    {selectedAnalysis.inferredProjectTypeConfidence}% workflow confidence
                  </span>
                </div>
              </div>
              <p className={`mt-4 text-sm leading-6 ${appTextMutedClass}`}>{selectedAnalysis.extractedTextSummary}</p>
            </div>

            {groupedFields.map((section) =>
              section.fields.length > 0 ? (
                <div key={section.id} className={`${appPanelInsetClass} rounded-[26px] p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{section.title}</h3>
                    <p className={`text-sm ${appTextMutedClass}`}>{section.fields.filter((field) => field.approved).length} approved</p>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className={`border-b ${appBorderClass}`}>
                          <th className="px-3 py-3">Use</th>
                          <th className="px-3 py-3">Field</th>
                          <th className="px-3 py-3">Value</th>
                          <th className="px-3 py-3">Confidence</th>
                          <th className="px-3 py-3">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.fields.map((field) => (
                          <tr key={field.id} className={`border-b align-top ${appBorderClass}`}>
                            <td className="px-3 py-3">
                              <input type="checkbox" checked={field.approved} onChange={(event) => updateField(field.id, { approved: event.target.checked })} />
                            </td>
                            <td className="px-3 py-3 font-medium">{field.label}</td>
                            <td className="px-3 py-3">
                              <input
                                value={field.rawValue}
                                onChange={(event) => updateField(field.id, { rawValue: event.target.value, normalizedValue: event.target.value })}
                                className={`w-full ${appInputClass}`}
                              />
                              {field.extractedDirectly ? null : <p className={`mt-1 text-xs ${appTextSoftClass}`}>Inferred from context</p>}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${confidenceClass(field.confidence)}`}>
                                {Math.round(field.confidence * 100)}%
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className={`max-w-[280px] text-xs leading-5 ${appTextMutedClass}`}>{field.sourceSnippet}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null
            )}
          </section>

          <aside className="space-y-4">
            <div className={`${appPanelClass} rounded-[26px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Summary</p>
              <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{selectedAnalysis.aiSummary.summary}</p>
              <div className={`mt-4 rounded-[18px] border px-4 py-3 text-sm ${appPanelInsetClass} ${appTextStrongClass}`}>
                Recommended next action: {selectedAnalysis.aiSummary.nextAction}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[26px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Suggested Categories</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAnalysis.suggestedCategories.map((category) => (
                  <span key={category.id} className={`rounded-full border px-3 py-1.5 text-sm ${category.approved ? appButtonMutedClass : 'border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}>
                    {category.name}
                  </span>
                ))}
              </div>
              <p className={`mt-4 text-sm font-semibold ${appTextStrongClass}`}>Suggested Custom Fields</p>
              <div className="mt-3 space-y-2">
                {selectedAnalysis.suggestedCustomFields.map((field) => (
                  <div key={field.id} className={`${appPanelInsetClass} rounded-[18px] p-3`}>
                    <p className={`text-sm font-semibold ${appTextStrongClass}`}>{field.label}</p>
                    <p className={`mt-1 text-xs ${appTextMutedClass}`}>{field.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[26px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Missing Information</p>
              <div className="mt-3 space-y-2">
                {selectedAnalysis.missingDataFlags.map((flag) => (
                  <div key={flag.key} className="rounded-[18px] border border-amber-300/60 bg-amber-50/80 px-3 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                    {flag.explanation}
                  </div>
                ))}
                {selectedAnalysis.missingDataFlags.length === 0 ? (
                  <div className={`rounded-[18px] border px-3 py-3 text-sm ${appBorderClass} ${appTextMutedClass}`}>No critical gaps were detected in this file.</div>
                ) : null}
              </div>
            </div>

            <div className={`${appPanelClass} rounded-[26px] p-5`}>
              <p className={`text-sm font-semibold ${appTextStrongClass}`}>Traceability</p>
              <div className="mt-3 space-y-2">
                {selectedAnalysis.sourceSnippets.slice(0, 4).map((snippet) => (
                  <div key={snippet.id} className={`${appPanelInsetClass} rounded-[18px] p-3`}>
                    <p className={`text-xs leading-5 ${appTextMutedClass}`}>{snippet.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
