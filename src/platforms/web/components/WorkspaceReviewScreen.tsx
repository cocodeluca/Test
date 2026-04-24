import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MoveDown, MoveUp } from 'lucide-react';
import type {
  WorkspaceConfig,
  WorkspaceCustomCategory,
  WorkspaceCustomField,
  WorkspaceModule,
  WorkspaceRecommendation,
} from '../../../common/types/settings';
import { getWorkspaceKpiLabel, normalizeWorkspaceKpi, workspaceModuleLabels } from '../../../common/utils/workspace';
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

interface WorkspaceReviewScreenProps {
  recommendation: WorkspaceRecommendation;
  draftConfig: WorkspaceConfig;
  onChange: (config: WorkspaceConfig) => void;
  onAccept: () => void;
  onStartMinimal: () => void;
  onReanalyze: () => void;
  onCustomize?: () => void;
}

const inputClass = `w-full ${appInputClass}`;

const moveItem = <T,>(items: T[], index: number, direction: 'up' | 'down') => {
  const next = [...items];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const WorkspaceReviewScreen: React.FC<WorkspaceReviewScreenProps> = ({
  recommendation,
  draftConfig,
  onChange,
  onAccept,
  onStartMinimal,
  onReanalyze,
  onCustomize,
}) => {
  const [categoryDraft, setCategoryDraft] = useState('');
  const [editingMode, setEditingMode] = useState(false);
  const lowConfidence = recommendation.confidenceScore < 60;
  const moduleReasons = useMemo(
    () => Object.fromEntries(recommendation.suggestedModules.map((item) => [item.module, item.reason])),
    [recommendation.suggestedModules]
  );

  const updateConfig = (updates: Partial<WorkspaceConfig>) =>
    onChange({
      ...draftConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    });

  const updateUserOverrides = (key: keyof WorkspaceConfig['userOverrides']) =>
    updateConfig({
      userOverrides: {
        ...draftConfig.userOverrides,
        [key]: true,
      },
      syncStatus: 'customized',
    });

  const toggleModule = (module: WorkspaceModule) => {
    const enabled = draftConfig.enabledModules.includes(module);
    const nextEnabled = enabled
      ? draftConfig.enabledModules.filter((item) => item !== module)
      : [...draftConfig.enabledModules, module];

    updateConfig({
      enabledModules: nextEnabled,
      hiddenModules: (Object.keys(workspaceModuleLabels) as WorkspaceModule[]).filter(
        (item) => !nextEnabled.includes(item)
      ),
    });
    updateUserOverrides('modulesChanged');
  };

  const toggleKpi = (kpi: string, primary = false) => {
    const normalizedKpi = normalizeWorkspaceKpi(kpi);
    if (!normalizedKpi) {
      return;
    }

    const isPinned = draftConfig.pinnedKpis.includes(normalizedKpi);
    const isSecondary = draftConfig.secondaryKpis.includes(normalizedKpi);
    const pinnedKpis = primary
      ? isPinned
        ? draftConfig.pinnedKpis.filter((item) => item !== normalizedKpi)
        : [...draftConfig.pinnedKpis, normalizedKpi]
      : draftConfig.pinnedKpis.filter((item) => item !== normalizedKpi);
    const secondaryKpis = primary
      ? draftConfig.secondaryKpis.filter((item) => item !== normalizedKpi)
      : isSecondary
      ? draftConfig.secondaryKpis.filter((item) => item !== normalizedKpi)
      : [...draftConfig.secondaryKpis, normalizedKpi];
    const kpiOrder = [
      ...draftConfig.kpiOrder.filter((item) => item !== normalizedKpi),
      ...pinnedKpis,
      ...secondaryKpis,
    ].filter((item, index, array) => array.indexOf(item) === index);

    updateConfig({ kpiOrder, pinnedKpis, secondaryKpis });
    updateUserOverrides('kpisChanged');
  };

  const updateCategory = (categoryId: string, updates: Partial<WorkspaceCustomCategory>) => {
    updateConfig({
      budgetCategories: draftConfig.budgetCategories.map((item) =>
        item.id === categoryId ? { ...item, ...updates } : item
      ),
    });
    updateUserOverrides('categoriesChanged');
  };

  const updateField = (fieldId: string, updates: Partial<WorkspaceCustomField>) => {
    updateConfig({
      customFields: draftConfig.customFields.map((item) =>
        item.id === fieldId ? { ...item, ...updates } : item
      ),
    });
    updateUserOverrides('fieldsChanged');
  };

  return (
    <div className={`${appPanelClass} flex max-h-[70vh] flex-col overflow-hidden rounded-[30px]`}>
      {lowConfidence ? (
        <div className="m-5 mb-0 rounded-[24px] border border-amber-300/60 bg-amber-50/80 p-4 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Low-confidence setup</p>
              <p className="mt-1 text-sm leading-6">
                The uploaded inputs are still thin. You can accept the recommendation, customize it, or start with a minimal workspace and refine it later.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="sticky top-0 z-10 border-b bg-slate-950 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>Review Screen</p>
            <h2 className={`mt-2 text-[1.85rem] font-semibold ${appTextStrongClass}`}>Workspace proposal</h2>
            <p className={`mt-2 max-w-3xl text-sm leading-6 ${appTextMutedClass}`}>{recommendation.summary}</p>
          </div>
        </div>
      </div>

      <div className="modal-scroll-body flex-1 px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Detected Profile</p>
                <p className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{recommendation.primaryDetectedProfile.replace(/-/g, ' ')}</p>
                <p className={`mt-2 text-sm ${appTextMutedClass}`}>Secondary strategies: {recommendation.secondaryStrategies.length > 0 ? recommendation.secondaryStrategies.join(', ') : 'None'}</p>
                <div className="mt-4 inline-flex rounded-full border border-cyan-300/60 bg-cyan-50/80 px-3 py-1.5 text-sm font-semibold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Confidence {recommendation.confidenceScore}%
                </div>
              </div>
              <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Confidence Breakdown</p>
                <div className="mt-3 space-y-2 text-sm">
                  {Object.entries(recommendation.confidenceBreakdown).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className={appTextMutedClass}>{label.replace(/([A-Z])/g, ' $1').replace(/^./, (v) => v.toUpperCase())}</span>
                      <span className={`font-semibold ${appTextStrongClass}`}>{value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Recommended Modules</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {recommendation.suggestedModules.map((item) => {
                  const enabled = draftConfig.enabledModules.includes(item.module);
                  return (
                    <div key={item.module} className={`rounded-[20px] border p-4 ${enabled ? 'border-cyan-400/28 bg-cyan-500/8' : appBorderClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${appTextStrongClass}`}>{workspaceModuleLabels[item.module]}</p>
                          <p className={`mt-1 text-xs ${appTextSoftClass}`}>{item.priority}</p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={enabled} onChange={() => toggleModule(item.module)} />
                          <span className={appTextMutedClass}>Enabled</span>
                        </label>
                      </div>
                      <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{moduleReasons[item.module]}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Suggested KPI Focus</p>
              <div className="mt-4 space-y-3">
                {recommendation.suggestedKpis.map((item, index) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border p-3">
                    <div className="min-w-[220px] flex-1">
                      <p className={`text-sm font-semibold ${appTextStrongClass}`}>{getWorkspaceKpiLabel(normalizeWorkspaceKpi(item.label) ?? item.label)}</p>
                      <p className={`mt-1 text-xs ${appTextMutedClass}`}>{item.reason}</p>
                    </div>
                    <button type="button" onClick={() => toggleKpi(item.label, true)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${draftConfig.pinnedKpis.includes(normalizeWorkspaceKpi(item.label) ?? item.label) ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>Primary</button>
                    <button type="button" onClick={() => toggleKpi(item.label, false)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${draftConfig.secondaryKpis.includes(normalizeWorkspaceKpi(item.label) ?? item.label) ? 'border border-sky-400/28 bg-sky-500/10 text-sky-700 dark:text-sky-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>Secondary</button>
                    <button type="button" onClick={() => updateConfig({ kpiOrder: moveItem(draftConfig.kpiOrder, index, 'up') })} className={`rounded-xl p-2 ${appButtonMutedClass} ${appTextMutedClass}`}><MoveUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => updateConfig({ kpiOrder: moveItem(draftConfig.kpiOrder, index, 'down') })} className={`rounded-xl p-2 ${appButtonMutedClass} ${appTextMutedClass}`}><MoveDown className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                <p className={`text-lg font-semibold ${appTextStrongClass}`}>Suggested Categories</p>
                <div className="mt-4 space-y-3">
                  {draftConfig.budgetCategories.map((category) => (
                    <div key={category.id} className="flex gap-2">
                      <input value={category.label} onChange={(event) => updateCategory(category.id, { label: event.target.value })} className={inputClass} />
                      <button type="button" onClick={() => updateConfig({ budgetCategories: draftConfig.budgetCategories.filter((item) => item.id !== category.id) })} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Delete</button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} className={inputClass} placeholder="Add category" />
                    <button type="button" onClick={() => {
                      if (!categoryDraft.trim()) return;
                      updateConfig({
                        budgetCategories: [
                          ...draftConfig.budgetCategories,
                          { id: `manual-category-${Date.now()}`, label: categoryDraft.trim(), module: 'budgets', suggestedByAi: false },
                        ],
                      });
                      updateUserOverrides('categoriesChanged');
                      setCategoryDraft('');
                    }} className={`rounded-xl px-3 py-2 ${appButtonPrimaryClass}`}>Add</button>
                  </div>
                </div>
              </div>

              <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
                <p className={`text-lg font-semibold ${appTextStrongClass}`}>Suggested Custom Fields</p>
                <div className="mt-4 space-y-3">
                  {draftConfig.customFields.map((field) => (
                    <div key={field.id} className="space-y-2 rounded-[18px] border p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} className={inputClass} />
                        <select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as WorkspaceCustomField['type'] })} className={inputClass}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="currency">Currency</option>
                          <option value="percentage">Percentage</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={field.enabled !== false} onChange={(event) => updateField(field.id, { enabled: event.target.checked })} /><span className={appTextMutedClass}>Enabled</span></label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /><span className={appTextMutedClass}>Required</span></label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Missing Information</p>
              <div className="mt-4 space-y-2">
                {draftConfig.missingDataFlags.length > 0 ? draftConfig.missingDataFlags.map((item) => (
                  <div key={item} className="rounded-[18px] border border-amber-300/60 bg-amber-50/80 p-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{item}</div>
                )) : <div className={`${appPanelClass} rounded-[18px] p-3 text-sm ${appTextMutedClass}`}>No critical gaps detected.</div>}
              </div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Recommended Report Templates</p>
              <div className="mt-4 space-y-2">
                {recommendation.suggestedReportTemplates.map((template) => (
                  <label key={template.id} className="flex items-start gap-3 rounded-[18px] border p-3">
                    <input type="radio" name="default-template" checked={draftConfig.defaultReportTemplate === template.label} onChange={() => { updateConfig({ defaultReportTemplate: template.label }); updateUserOverrides('templatesChanged'); }} />
                    <div>
                      <p className={`text-sm font-semibold ${appTextStrongClass}`}>{template.label}</p>
                      <p className={`mt-1 text-xs ${appTextMutedClass}`}>{template.reason}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Sidebar / Dashboard Proposal</p>
              <div className="mt-4 space-y-2">
                {draftConfig.sidebarOrder.map((module, index) => (
                  <div key={`${module}-${index}`} className="flex items-center gap-2 rounded-[18px] border p-3">
                    <span className={`min-w-[20px] text-sm font-semibold ${appTextStrongClass}`}>{index + 1}</span>
                    <span className={`flex-1 text-sm ${appTextStrongClass}`}>{workspaceModuleLabels[module]}</span>
                    <button type="button" onClick={() => { updateConfig({ sidebarOrder: moveItem(draftConfig.sidebarOrder, index, 'up') }); updateUserOverrides('sidebarReordered'); }} className={`rounded-xl p-2 ${appButtonMutedClass} ${appTextMutedClass}`}><MoveUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => { updateConfig({ sidebarOrder: moveItem(draftConfig.sidebarOrder, index, 'down') }); updateUserOverrides('sidebarReordered'); }} className={`rounded-xl p-2 ${appButtonMutedClass} ${appTextMutedClass}`}><MoveDown className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>Default landing page</label>
                <select value={draftConfig.defaultLandingModule} onChange={(event) => { updateConfig({ defaultLandingModule: event.target.value as WorkspaceModule }); updateUserOverrides('landingPageChanged'); }} className={inputClass}>
                  {draftConfig.enabledModules.map((module) => (
                    <option key={module} value={module}>{workspaceModuleLabels[module]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-lg font-semibold ${appTextStrongClass}`}>Final State</p>
              <div className="mt-4 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3"><span className={appTextMutedClass}>Sync status</span><span className={`font-semibold ${appTextStrongClass}`}>{draftConfig.syncStatus}</span></div>
                <div className="flex items-center justify-between gap-3"><span className={appTextMutedClass}>User overrides</span><span className={`font-semibold ${appTextStrongClass}`}>{Object.values(draftConfig.userOverrides).filter(Boolean).length}</span></div>
                <div className="flex items-center justify-between gap-3"><span className={appTextMutedClass}>Readiness score</span><span className={`font-semibold ${appTextStrongClass}`}>{draftConfig.readinessScores.workspace}%</span></div>
              </div>
              {editingMode ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50/80 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Custom edits are being tracked separately from the recommendation
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditingMode(true);
            onCustomize?.();
          }}
          className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}
        >
          Customize Before Saving
        </button>
        <button
          type="button"
          onClick={onStartMinimal}
          className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}
        >
          Start With Minimal Setup
        </button>
        <button
          type="button"
          onClick={onReanalyze}
          className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}
        >
          Reanalyze
        </button>
        <button
          type="button"
          onClick={onAccept}
          className={`relative z-20 rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}
        >
          Accept Recommended Setup
        </button>
      </div>
    </div>
  );
};
