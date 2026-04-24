import React, { useRef, useState } from 'react';
import { CheckCircle2, Database, Download, FileText, Globe2, Landmark, LifeBuoy, Lock, Monitor, Palette, PlayCircle, Settings2, ShieldCheck, Upload, UserCircle2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { DEMO_ACCOUNT_EMAIL } from '../services/localAccountStore';
import { formatDate, getLocalizedCurrencyLabel } from '../../../common/utils/formatting';
import { currencyOptions } from '../../../common/utils/currency';
import { analyzeWorkspaceProfile, createOnboardingProfile, kpiLibrary, workspaceConfigFromRecommendation, workspaceGoals, workspaceModuleLabels, workspaceStrategies } from '../../../common/utils/workspace';
import { appButtonMutedClass, appButtonPrimaryClass, appIconChipClass, appInputClass, appPanelClass, appPanelInsetClass, appTextMutedClass, appTextSoftClass, appTextStrongClass } from '../styles/dashboardTheme';
import { LocalAccountUser, UserAccountBackup } from '../services/localAccountStore';
import type { AppLanguage } from '../../../common/types/settings';

interface SettingsPageProps {
  currentUser: LocalAccountUser;
  onExportBackup: () => void;
  onImportBackup: (backup: UserAccountBackup) => void;
  onSyncBackupToServer: () => Promise<void> | void;
  onRestoreBackupFromServer: () => Promise<void> | void;
  onReplayDemoTutorial?: () => void;
  onResetDemoData?: () => void;
}

type SettingsTab = 'workspace' | 'accounts' | 'branding' | 'reports' | 'profile';

const checklist = (items: string[], mutedClass: string) => (
  <div className="space-y-3">
    {items.map((item) => (
      <div key={item} className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
        <p className={`text-sm leading-6 ${mutedClass}`}>{item}</p>
      </div>
    ))}
  </div>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser, onExportBackup, onImportBackup, onSyncBackupToServer, onRestoreBackupFromServer, onReplayDemoTutorial, onResetDemoData }) => {
  const { settings, updateProfile, updateSettings, t, formatPreviewCurrency, formatPreviewDate, formatPreviewNumber } = useSettings();
  const sectionCardClass = `${appPanelClass} p-4 sm:p-6`;
  const labelClass = `mb-2 block text-sm font-medium ${appTextMutedClass}`;
  const helperClass = `mt-2 text-xs ${appTextSoftClass}`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isSyncingBackup, setIsSyncingBackup] = useState(false);
  const [customFieldDraft, setCustomFieldDraft] = useState('');
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');
  const isDemoAccount = currentUser.email.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
  const profileCompletionPct = Math.round(([Boolean(settings.profile.name.trim()), Boolean(settings.profile.email.trim()), Boolean(settings.profile.role.trim()), settings.taxProfile.taxResidencyCountry.trim() !== ''].filter(Boolean).length / 4) * 100);

  const toggleWorkspaceItem = <T extends string,>(current: T[], value: T, onChange: (next: T[]) => void) => onChange(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const togglePinnedKpi = (kpiId: string) => {
    const isSelected = settings.workspaceConfig.pinnedKpis.includes(kpiId);
    const pinnedKpis = isSelected
      ? settings.workspaceConfig.pinnedKpis.filter((item) => item !== kpiId)
      : [...settings.workspaceConfig.pinnedKpis, kpiId];
    const secondaryKpis = settings.workspaceConfig.secondaryKpis.filter((item) => item !== kpiId);
    const kpiOrder = isSelected
      ? settings.workspaceConfig.kpiOrder.filter((item) => item !== kpiId)
      : [...settings.workspaceConfig.kpiOrder.filter((item) => item !== kpiId), kpiId];

    updateSettings({
      workspaceConfig: {
        ...settings.workspaceConfig,
        pinnedKpis,
        secondaryKpis,
        kpiOrder,
      },
    });
  };

  const runServerBackupAction = async (action: () => Promise<void> | void, successMessage: string) => {
    setBackupError(null);
    setBackupMessage(null);
    setIsSyncingBackup(true);
    try {
      await action();
      setBackupMessage(successMessage);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : t('settings.backupSection.actionFailed'));
    } finally {
      setIsSyncingBackup(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupError(null);
    setBackupMessage(null);
    try {
      onImportBackup(JSON.parse(await file.text()) as UserAccountBackup);
      setBackupMessage(t('settings.backupSection.importSuccess'));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : t('settings.backupSection.importError'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; description: string }> = [
    { id: 'workspace', label: t('settings.tabs.workspace'), description: t('settings.tabs.workspaceDescription') },
    { id: 'accounts', label: t('settings.tabs.accounts'), description: t('settings.tabs.accountsDescription') },
    { id: 'branding', label: t('settings.tabs.branding'), description: t('settings.tabs.brandingDescription') },
    { id: 'reports', label: t('settings.tabs.reports'), description: t('settings.tabs.reportsDescription') },
    { id: 'profile', label: t('settings.tabs.profile'), description: t('settings.tabs.profileDescription') },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const renderWorkspace = () => (
    <section className={sectionCardClass}>
      <div className="flex items-start gap-4">
        <div className={`${appPanelInsetClass} p-3`}><Settings2 className="h-5 w-5 text-[var(--app-icon-fg)]" /></div>
        <div>
          <h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.title')}</h2>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.workspaceSection.description')}</p>
        </div>
      </div>
      <div className="mt-6 space-y-5">
        <div>
          <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.strategyProfile')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {workspaceStrategies.map((strategy) => (
              <button key={strategy.id} type="button" onClick={() => toggleWorkspaceItem(settings.onboarding.strategies, strategy.id, (next) => updateSettings({ onboarding: { ...settings.onboarding, strategies: next }, workspaceConfig: { ...settings.workspaceConfig, primaryStrategy: next[0] ?? settings.workspaceConfig.primaryStrategy } }))} className={`rounded-full px-3 py-1.5 text-sm font-medium ${settings.onboarding.strategies.includes(strategy.id) ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>
                {strategy.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.primaryGoals')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {workspaceGoals.map((goal) => (
              <button key={goal.id} type="button" onClick={() => toggleWorkspaceItem(settings.onboarding.goals, goal.id, (next) => updateSettings({ onboarding: { ...settings.onboarding, goals: next } }))} className={`rounded-full px-3 py-1.5 text-sm font-medium ${settings.onboarding.goals.includes(goal.id) ? 'border border-sky-400/28 bg-sky-500/10 text-sky-700 dark:text-sky-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>
                {goal.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.enabledModules')}</p><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(workspaceModuleLabels) as Array<keyof typeof workspaceModuleLabels>).map((moduleId) => <button key={moduleId} type="button" onClick={() => toggleWorkspaceItem(settings.workspaceConfig.enabledModules, moduleId, (next) => updateSettings({ workspaceConfig: { ...settings.workspaceConfig, enabledModules: next } }))} className={`rounded-full px-3 py-1.5 text-sm font-medium ${settings.workspaceConfig.enabledModules.includes(moduleId) ? 'border border-emerald-400/28 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{workspaceModuleLabels[moduleId]}</button>)}</div></div>
          <div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.pinnedKpis')}</p><div className="mt-3 flex flex-wrap gap-2">{kpiLibrary.map((kpi) => <button key={kpi.id} type="button" onClick={() => togglePinnedKpi(kpi.id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${settings.workspaceConfig.pinnedKpis.includes(kpi.id) ? 'border border-violet-400/28 bg-violet-500/10 text-violet-700 dark:text-violet-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{kpi.label}</button>)}</div></div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <label className={labelClass}>{t('settings.workspaceSection.customFields')}</label>
            <div className="flex gap-2">
              <input className={appInputClass} value={customFieldDraft} onChange={(e) => setCustomFieldDraft(e.target.value)} placeholder={t('settings.workspaceSection.customFieldPlaceholder')} />
              <button type="button" onClick={() => { if (!customFieldDraft.trim()) return; updateSettings({ workspaceConfig: { ...settings.workspaceConfig, suggestedCustomFields: [...settings.workspaceConfig.suggestedCustomFields, { id: `custom-field-${Date.now()}`, label: customFieldDraft.trim(), module: 'projects', type: 'text', required: false, suggestedByAi: false }] } }); setCustomFieldDraft(''); }} className={`rounded-xl px-4 py-2 ${appButtonPrimaryClass}`}>{t('common.add')}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{settings.workspaceConfig.suggestedCustomFields.map((field) => <span key={field.id} className={`rounded-full px-3 py-1.5 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>{field.label}</span>)}</div>
          </div>
          <div>
            <label className={labelClass}>{t('settings.workspaceSection.budgetCategories')}</label>
            <div className="flex gap-2">
              <input className={appInputClass} value={customCategoryDraft} onChange={(e) => setCustomCategoryDraft(e.target.value)} placeholder={t('settings.workspaceSection.budgetCategoryPlaceholder')} />
              <button type="button" onClick={() => { if (!customCategoryDraft.trim()) return; updateSettings({ workspaceConfig: { ...settings.workspaceConfig, suggestedBudgetCategories: [...settings.workspaceConfig.suggestedBudgetCategories, { id: `custom-category-${Date.now()}`, label: customCategoryDraft.trim(), module: 'budgets', suggestedByAi: false }] } }); setCustomCategoryDraft(''); }} className={`rounded-xl px-4 py-2 ${appButtonPrimaryClass}`}>{t('common.add')}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{settings.workspaceConfig.suggestedBudgetCategories.map((category) => <span key={category.id} className={`rounded-full px-3 py-1.5 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>{category.label}</span>)}</div>
          </div>
        </div>
        <div className={`${appPanelInsetClass} rounded-2xl p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.workspaceSection.reviewStatus')}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{settings.workspaceConfig.lastAiRecommendation?.summary || t('settings.workspaceSection.noReview')}</p></div>
            <button type="button" onClick={() => { const recommendation = analyzeWorkspaceProfile({ strategies: settings.onboarding.strategies, goals: settings.onboarding.goals, files: settings.onboarding.uploadedFiles }); updateSettings({ onboarding: createOnboardingProfile(settings.onboarding.strategies, settings.onboarding.goals, settings.onboarding.uploadedFiles, recommendation), workspaceConfig: { ...workspaceConfigFromRecommendation(recommendation), aiAutoSuggestions: settings.workspaceConfig.aiAutoSuggestions } }); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}><Settings2 className="h-4 w-4" />{t('settings.workspaceSection.reanalyze')}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{settings.workspaceConfig.detectedMissingFields.map((item) => <span key={item} className="rounded-full border border-amber-300/60 bg-amber-50/80 px-3 py-1.5 text-sm font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{item}</span>)}</div>
          <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.workspaceConfig.aiAutoSuggestions} onChange={(e) => updateSettings({ workspaceConfig: { ...settings.workspaceConfig, aiAutoSuggestions: e.target.checked } })} /><span className={appTextMutedClass}>{t('settings.workspaceSection.keepSuggestions')}</span></label>
        </div>
      </div>
    </section>
  );

  const renderAccounts = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-emerald-600 dark:text-emerald-300`}><Settings2 className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.preferences')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.preferencesDescription')}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div><label className={labelClass}>{t('settings.accountSection.userMode')}</label><select className={appInputClass} value={settings.userMode} onChange={(e) => updateSettings({ userMode: e.target.value as 'basic' | 'advanced' })}><option value="basic">{t('settings.accountSection.basicMode')}</option><option value="advanced">{t('settings.accountSection.advancedMode')}</option></select><p className={helperClass}>{t('settings.accountSection.userModeHelp')}</p></div><div><label className={labelClass}>{t('settings.accountSection.trackingPreference')}</label><select className={appInputClass} value={settings.onboarding.trackingPreference ?? 'full-portfolio'} onChange={(e) => updateSettings({ onboarding: { ...settings.onboarding, trackingPreference: e.target.value as 'properties-only' | 'properties-and-rent' | 'properties-and-mortgages' | 'full-portfolio' } })}><option value="properties-only">{t('settings.accountSection.trackingPropertiesOnly')}</option><option value="properties-and-rent">{t('settings.accountSection.trackingPropertiesRent')}</option><option value="properties-and-mortgages">{t('settings.accountSection.trackingPropertiesMortgages')}</option><option value="full-portfolio">{t('settings.accountSection.trackingFullPortfolio')}</option></select><p className={helperClass}>{t('settings.accountSection.trackingPreferenceHelp')}</p></div><div className="md:col-span-2"><label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-800"><input type="checkbox" checked={settings.showAdvancedBasicModeFeatures === true} onChange={(e) => updateSettings({ showAdvancedBasicModeFeatures: e.target.checked })} /><span className={appTextMutedClass}>{t('settings.accountSection.showAdvancedFeatures')}</span></label><p className={helperClass}>{t('settings.accountSection.showAdvancedFeaturesHelp')}</p></div><div className="md:col-span-2"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.accountSection.setupFlow')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.accountSection.setupFlowHelp')}</p><button type="button" onClick={() => updateSettings({ onboardingCompleted: false, onboarding: { ...settings.onboarding, completed: false } })} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}>{t('settings.accountSection.reopenSetup')}</button></div></div><div><label className={labelClass}>{t('settings.fields.reportingCurrency')}</label><select className={appInputClass} value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value as typeof settings.currency })}>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{getLocalizedCurrencyLabel(currency.code)}</option>)}</select><p className={helperClass}>{t('settings.helpers.reportingCurrency')}</p></div><div><label className={labelClass}>{t('settings.fields.usdToEurRate')}</label><div className={`rounded-xl px-4 py-2.5 ${appPanelInsetClass} ${appTextStrongClass}`}>{settings.usdToEurRate.toFixed(4)}</div><p className={helperClass}>{t('settings.helpers.fxRateSource', { source: settings.usdToEurRateSource === 'ECB' ? 'ECB' : t('common.manual'), date: settings.usdToEurRateUpdatedAt ? formatDate(settings.usdToEurRateUpdatedAt) : t('common.notSpecified') })}</p></div><div><label className={labelClass}>{t('settings.fields.eurToUsdRate')}</label><div className={`rounded-xl px-4 py-2.5 ${appPanelInsetClass} ${appTextStrongClass}`}>{(settings.usdToEurRate > 0 ? 1 / settings.usdToEurRate : 0).toFixed(4)}</div></div><div><label className={labelClass}>{t('settings.accountSection.arsToEurRate')}</label><div className={`rounded-xl px-4 py-2.5 ${appPanelInsetClass} ${appTextStrongClass}`}>{settings.arsToEurRate.toFixed(6)}</div><p className={helperClass}>{t('settings.helpers.fxRateSource', { source: settings.arsToEurRateSource === 'ECB' ? 'ECB' : t('common.manual'), date: settings.arsToEurRateUpdatedAt ? formatDate(settings.arsToEurRateUpdatedAt) : t('common.notSpecified') })}</p></div><div><label className={labelClass}>{t('settings.accountSection.eurToArsRate')}</label><div className={`rounded-xl px-4 py-2.5 ${appPanelInsetClass} ${appTextStrongClass}`}>{(settings.arsToEurRate > 0 ? 1 / settings.arsToEurRate : 0).toFixed(2)}</div></div><div><label className={labelClass}>{t('settings.fields.defaultDashboardView')}</label><select className={appInputClass} value={settings.defaultDashboardView} onChange={(e) => updateSettings({ defaultDashboardView: e.target.value as 'overview' | 'cashflow' | 'performance' })}><option value="overview">{t('settings.options.overview')}</option><option value="cashflow">{t('settings.options.cashflow')}</option><option value="performance">{t('settings.options.performance')}</option></select></div><div><label className={labelClass}>{t('settings.fields.dashboardSetupMode')}</label><select className={appInputClass} value={settings.dashboardSetupMode} onChange={(e) => updateSettings({ dashboardSetupMode: e.target.value as 'simple' | 'connected' })}><option value="simple">{t('settings.options.simple')}</option><option value="connected">{t('settings.options.connected')}</option></select></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.accountSection.connectionSettings')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.accountSection.connectionSettingsHelp')}</p></div></div></section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-cyan-600 dark:text-cyan-300`}><ShieldCheck className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.title')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.backupSection.description', { email: currentUser.email })}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.exportTitle')}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.backupSection.exportDescription')}</p><button type="button" onClick={() => { setBackupError(null); setBackupMessage(t('settings.backupSection.exportSuccess')); onExportBackup(); }} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}><Download className="h-4 w-4" />{t('settings.backupSection.exportTitle')}</button></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.importTitle')}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.backupSection.importDescription')}</p><input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} /><button type="button" onClick={() => fileInputRef.current?.click()} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}><Upload className="h-4 w-4" />{t('settings.backupSection.importTitle')}</button></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.syncTitle')}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.backupSection.syncDescription')}</p><button type="button" disabled={isSyncingBackup} onClick={() => void runServerBackupAction(onSyncBackupToServer, t('settings.backupSection.syncSuccess'))} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass} disabled:cursor-not-allowed disabled:opacity-70`}><ShieldCheck className="h-4 w-4" />{t('settings.backupSection.syncTitle')}</button></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.restoreTitle')}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.backupSection.restoreDescription', { email: currentUser.email })}</p><button type="button" disabled={isSyncingBackup} onClick={() => void runServerBackupAction(onRestoreBackupFromServer, t('settings.backupSection.restoreSuccess'))} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass} disabled:cursor-not-allowed disabled:opacity-70`}><Upload className="h-4 w-4" />{t('settings.backupSection.restoreTitle')}</button></div></div><div className={`${appPanelInsetClass} mt-4 rounded-2xl p-4`}><div className="flex items-start gap-3"><Database className="mt-0.5 h-4 w-4 text-cyan-500" /><div><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.backupSection.dataPortabilityTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.backupSection.dataPortabilityDescription')}</p></div></div></div>{backupMessage ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{backupMessage}</p> : null}{backupError ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{backupError}</p> : null}</section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-indigo-600 dark:text-indigo-300`}><Lock className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.securitySection.title')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.securitySection.description')}</p></div></div><div className="mt-6 grid gap-4"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.securitySection.privacyModelTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.securitySection.privacyModelDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.securitySection.guidanceTitle')}</p><div className="mt-3">{checklist([t('settings.securitySection.checklist1'), t('settings.securitySection.checklist2'), t('settings.securitySection.checklist3'), t('settings.securitySection.checklist4')], appTextMutedClass)}</div></div></div></section>
    </div>
  );
  const renderBranding = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-violet-600 dark:text-violet-300`}><Palette className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.appearance')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.appearanceDescription')}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div><label className={labelClass}>{t('settings.fields.theme')}</label><select className={appInputClass} value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'system' })}><option value="light">{t('settings.options.light')}</option><option value="dark">{t('settings.options.dark')}</option><option value="system">{t('settings.options.system')}</option></select></div><div><label className={labelClass}>{t('settings.fields.density')}</label><select className={appInputClass} value={settings.density} onChange={(e) => updateSettings({ density: e.target.value as 'comfortable' | 'compact' })}><option value="comfortable">{t('settings.options.comfortable')}</option><option value="compact">{t('settings.options.compact')}</option></select></div></div></section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-amber-600 dark:text-amber-300`}><Globe2 className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.localization')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.localizationDescription')}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div><label className={labelClass}>{t('settings.fields.language')}</label><select className={appInputClass} value={settings.language} onChange={(e) => updateSettings({ language: e.target.value as AppLanguage })}><option value="es">{t('settings.options.spanish')}</option><option value="en">{t('settings.options.english')}</option><option value="pt">{t('settings.options.portuguese')}</option></select></div><div><label className={labelClass}>{t('settings.fields.dateFormat')}</label><select className={appInputClass} value={settings.dateFormat} onChange={(e) => updateSettings({ dateFormat: e.target.value as 'en-US' | 'en-GB' | 'es-ES' })}><option value="en-GB">31/03/2026</option><option value="en-US">03/31/2026</option><option value="es-ES">31/03/2026 (ES)</option></select></div><div><label className={labelClass}>{t('settings.fields.numberFormat')}</label><select className={appInputClass} value={settings.numberFormat} onChange={(e) => updateSettings({ numberFormat: e.target.value as 'en-US' | 'es-ES' })}><option value="en-US">100,000.50</option><option value="es-ES">100.000,50</option></select></div><div><label className={labelClass}>{t('settings.preview.title')}</label><div className={`rounded-2xl p-4 ${appPanelInsetClass}`}><div className={`flex items-center gap-2 text-sm ${appTextMutedClass}`}><Monitor className="h-4 w-4" /><span>{t('settings.preview.currency')}: {formatPreviewCurrency(100000)}</span></div><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.preview.number')}: {formatPreviewNumber(100000.5, 2)}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('settings.preview.date')}: {formatPreviewDate('2026-03-31')}</p></div></div></div></section>
      <section className={sectionCardClass}><div className="grid gap-4 md:grid-cols-2"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.brandingSection.currentInputsTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.brandingSection.currentInputsDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.brandingSection.futureReadyTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.brandingSection.futureReadyDescription')}</p></div></div></section>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-rose-600 dark:text-rose-300`}><Landmark className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.taxProfile')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.taxProfileDescription')}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div><label className={labelClass}>{t('settings.fields.taxResidencyCountry')}</label><select className={appInputClass} value={settings.taxProfile.taxResidencyCountry} onChange={(e) => updateSettings({ taxProfile: { ...settings.taxProfile, taxResidencyCountry: e.target.value } })}><option value="Spain">{t('settings.options.spain')}</option><option value="Argentina">{t('settings.options.argentina')}</option><option value="Portugal">{t('settings.options.portugal')}</option><option value="Other">{t('settings.options.other')}</option></select></div><div><label className={labelClass}>{t('settings.fields.estimatedMarginalTaxRate')}</label><input type="number" step="0.1" className={appInputClass} value={settings.taxProfile.estimatedMarginalTaxRate} onChange={(e) => updateSettings({ taxProfile: { ...settings.taxProfile, estimatedMarginalTaxRate: Number(e.target.value) || 0 } })} /></div><div><label className={labelClass}>{t('settings.fields.annualEmploymentIncome')}</label><input type="number" step="1000" className={appInputClass} value={settings.taxProfile.annualEmploymentIncome} onChange={(e) => updateSettings({ taxProfile: { ...settings.taxProfile, annualEmploymentIncome: Number(e.target.value) || 0 } })} /></div><div><label className={labelClass}>{t('settings.fields.annualOtherIncome')}</label><input type="number" step="1000" className={appInputClass} value={settings.taxProfile.annualOtherIncome} onChange={(e) => updateSettings({ taxProfile: { ...settings.taxProfile, annualOtherIncome: Number(e.target.value) || 0 } })} /></div></div></section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-slate-600 dark:text-slate-300`}><FileText className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.title')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.reportsSection.description')}</p></div></div><div className="mt-6 grid gap-4"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.financialDisclaimerTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.reportsSection.financialDisclaimerDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.dataRightsTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.reportsSection.dataRightsDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.recommendedDocsTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.reportsSection.recommendedDocsDescription')}</p></div></div></section>
      <section className={sectionCardClass}><div className="grid gap-4 md:grid-cols-2"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.currentInputsTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.reportsSection.currentInputsDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.reportsSection.futureControlsTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.reportsSection.futureControlsDescription')}</p></div></div></section>
    </div>
  );
  const renderProfile = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className={`${appPanelClass} overflow-hidden p-5 sm:p-6`}><div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]"><div><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-sky-600 dark:text-sky-300`}><ShieldCheck className="h-5 w-5" /></div><div><p className={`text-sm font-semibold uppercase tracking-[0.24em] ${appTextSoftClass}`}>{t('settings.profileSection.trustEyebrow')}</p><h2 className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.trustTitle')}</h2><p className={`mt-2 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>{t('settings.profileSection.trustDescription')}</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>{t('common.signedInAs')}</p><p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{currentUser.name}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{currentUser.email}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>{t('settings.profileSection.profileReadiness')}</p><p className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>{profileCompletionPct}%</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.profileSection.profileReadinessDescription')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>{t('settings.profileSection.backupStatus')}</p><p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.backupReady')}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.profileSection.backupStatusDescription')}</p></div></div></div><div className={`${appPanelInsetClass} rounded-[26px] p-5`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.strongAppTitle')}</p><div className="mt-4">{checklist([t('settings.profileSection.strongAppChecklist1'), t('settings.profileSection.strongAppChecklist2'), t('settings.profileSection.strongAppChecklist3'), t('settings.profileSection.strongAppChecklist4'), t('settings.profileSection.strongAppChecklist5')], appTextMutedClass)}</div></div></div></section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-sky-600 dark:text-sky-300`}><UserCircle2 className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.profile')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.profileDescription')}</p></div></div><div className="mt-6 grid gap-4"><div><label className={labelClass}>{t('settings.fields.name')}</label><input className={appInputClass} value={settings.profile.name} onChange={(e) => updateProfile({ name: e.target.value })} /></div><div><label className={labelClass}>{t('settings.fields.email')}</label><input className={appInputClass} value={settings.profile.email} onChange={(e) => updateProfile({ email: e.target.value })} /></div><div><label className={labelClass}>{t('settings.fields.role')}</label><input className={appInputClass} value={settings.profile.role} onChange={(e) => updateProfile({ role: e.target.value })} /></div><div><label className={labelClass}>{t('settings.fields.notes')}</label><textarea className={appInputClass} rows={4} value={settings.profile.notes} onChange={(e) => updateProfile({ notes: e.target.value })} /><p className={helperClass}>{t('settings.helpers.profile')}</p></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.accountDetails')}</p><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><p className={appTextSoftClass}>{t('common.created')}</p><p className={`mt-1 font-medium ${appTextStrongClass}`}>{formatDate(currentUser.createdAt)}</p></div><div><p className={appTextSoftClass}>{t('settings.profileSection.storageModel')}</p><p className={`mt-1 font-medium ${appTextStrongClass}`}>{t('settings.profileSection.storageModelValue')}</p></div></div>{onResetDemoData ? <button type="button" onClick={onResetDemoData} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}>Reset demo data</button> : null}</div></div></section>
      <section className={sectionCardClass}><div className="flex items-start gap-4"><div className={`${appIconChipClass} p-3 text-emerald-600 dark:text-emerald-300`}><LifeBuoy className="h-5 w-5" /></div><div><h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.helpTitle')}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('settings.profileSection.helpDescription')}</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.supportChecklistTitle')}</p><div className="mt-3">{checklist([t('settings.profileSection.supportChecklist1'), t('settings.profileSection.supportChecklist2'), t('settings.profileSection.supportChecklist3'), t('settings.profileSection.supportChecklist4')], appTextMutedClass)}</div></div><div className={`${appPanelInsetClass} rounded-2xl p-4`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{t('settings.profileSection.interactiveTutorialTitle')}</p><p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{t('settings.profileSection.interactiveTutorialDescription')}</p>{isDemoAccount && onReplayDemoTutorial ? <button type="button" onClick={onReplayDemoTutorial} className={`mt-4 inline-flex items-center gap-2 ${appButtonPrimaryClass}`}><PlayCircle className="h-4 w-4" />{t('settings.profileSection.replayTutorial')}</button> : <p className={`mt-4 text-sm ${appTextMutedClass}`}>{t('settings.profileSection.demoAccountHelp')}</p>}</div></div></section>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-[1.75rem] font-bold sm:text-3xl ${appTextStrongClass}`}>{t('settings.title')}</h1>
        <p className={`mt-1.5 text-sm sm:mt-2 sm:text-base ${appTextMutedClass}`}>{t('settings.subtitle')}</p>
      </div>
      <section className={`${appPanelClass} p-3 sm:p-4`}>
        <div className="flex flex-wrap gap-2">{tabs.map((tab) => { const isActive = tab.id === activeTab; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${isActive ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{tab.label}</button>; })}</div>
        <div className={`${appPanelInsetClass} mt-3 rounded-2xl px-4 py-3`}><p className={`text-sm font-semibold ${appTextStrongClass}`}>{activeTabMeta.label}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{activeTabMeta.description}</p></div>
      </section>
      {activeTab === 'workspace' ? renderWorkspace() : null}
      {activeTab === 'accounts' ? renderAccounts() : null}
      {activeTab === 'branding' ? renderBranding() : null}
      {activeTab === 'reports' ? renderReports() : null}
      {activeTab === 'profile' ? renderProfile() : null}
    </div>
  );
};
