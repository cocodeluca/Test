import React, { useEffect } from 'react';
import { BarChart3, Briefcase, Building2, FileText, Hammer, Settings, Home, Landmark, LogOut, Monitor, ClipboardList, Receipt, Wallet } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useSettings } from '../context/SettingsContext';
import { workspaceModuleLabels } from '../../../common/utils/workspace';
import { getVisibleWorkspacePages, type WorkspaceModeState } from '../../../common/utils/workspaceMode';
import type { WorkspaceModule } from '../../../common/types/settings';
import { DEMO_ACCOUNT_EMAIL } from '../services/localAccountStore';
import {
  appBorderClass,
  appButtonMutedClass,
  appNavActiveClass,
  appPanelClass,
  appSidebarSurfaceClass,
  appShellClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentUserName: string;
  currentUserEmail: string;
  onLogout: () => void;
  tutorialTargetId?: string | null;
  workspaceModeState: WorkspaceModeState;
  demoPreview?: {
    active: boolean;
    onExit: () => void;
    onStartWithRealData: () => void;
    onAddFirstProperty: () => void;
    onReplay?: () => void;
  } | null;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  currentPage,
  onNavigate,
  currentUserName,
  currentUserEmail,
  onLogout,
  tutorialTargetId = null,
  workspaceModeState,
  demoPreview = null,
  children,
}) => {
  const { settings, fxSyncStatus, t } = useSettings();
  const isDashboardPage = currentPage === 'dashboard';
  const isDemoAccount = currentUserEmail.trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
  const pageTitles: Record<string, string> = {
    dashboard: t('nav.dashboard'),
    'cash-accounts': t('nav.cashAccounts'),
    opportunities: t('nav.opportunities'),
    projects: t('nav.projects'),
    budgets: t('nav.budgets'),
    documents: t('nav.documents'),
    tasks: t('nav.tasks'),
    properties: t('nav.properties'),
    mortgages: t('nav.mortgages'),
    reports: t('nav.reports'),
    settings: t('nav.settings'),
  };
  const moduleMeta = {
    dashboard: { label: t('nav.dashboard'), icon: BarChart3 },
    'cash-accounts': { label: t('nav.cashAccounts'), icon: Landmark },
    opportunities: { label: t('nav.opportunities'), icon: Briefcase },
    properties: { label: t('nav.properties'), icon: Building2 },
    projects: { label: t('nav.projects'), icon: Hammer },
    budgets: { label: t('nav.budgets'), icon: Receipt },
    mortgages: { label: t('nav.mortgages'), icon: Wallet },
    documents: { label: t('nav.documents'), icon: FileText },
    reports: { label: t('nav.reports'), icon: Monitor },
    tasks: { label: t('nav.tasks'), icon: ClipboardList },
    settings: { label: t('nav.settings'), icon: Settings },
  } as const;
  const visibleModules = getVisibleWorkspacePages(workspaceModeState);
  const prioritizedMobileModules: WorkspaceModule[] =
    visibleModules.length <= 7 || !visibleModules.includes('mortgages') || visibleModules.slice(0, 7).includes('mortgages')
      ? visibleModules
      : [
          ...visibleModules.filter((moduleId) => moduleId !== 'mortgages').slice(0, 6),
          'mortgages',
        ];
  const mobileNavItems = prioritizedMobileModules
    .slice(0, 7)
    .map((moduleId) => ({
      id: moduleId,
      label: moduleMeta[moduleId]?.label ?? workspaceModuleLabels[moduleId],
      icon: moduleMeta[moduleId]?.icon ?? Settings,
    }));

  useEffect(() => {
    console.info('[nav] mobile navigation modules', {
      enabledModules: settings.workspaceConfig.enabledModules,
      sidebarOrder: settings.workspaceConfig.sidebarOrder,
      hiddenModules: settings.workspaceConfig.hiddenModules,
      visibleModules,
      mobileNavItems: mobileNavItems.map((item) => item.id),
    });
  }, [
    mobileNavItems,
    settings.workspaceConfig.enabledModules,
    settings.workspaceConfig.hiddenModules,
    settings.workspaceConfig.sidebarOrder,
    visibleModules,
  ]);

  return (
    <div className={`flex h-screen overflow-hidden ${appShellClass}`} data-density={settings.density}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
        onLogout={onLogout}
        tutorialTargetId={tutorialTargetId}
      />
      <main className="flex-1 overflow-auto lg:pl-[224px]">
        <div className={`sticky top-0 z-20 border-b px-4 py-4 md:hidden ${appBorderClass} ${appPanelClass} ${appSidebarSurfaceClass} rounded-none shadow-none`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--app-border-strong)] bg-white text-[var(--app-nav-active-fg)]">
                <Home className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className={`text-[11px] font-medium ${appTextMutedClass}`}>
                  {t('app.title')}
                </p>
                <p className={`truncate text-[17px] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                  {pageTitles[currentPage] ?? pageTitles.dashboard}
                </p>
                <p className={`truncate text-[11px] ${appTextMutedClass}`}>{currentUserEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className={`rounded-2xl p-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}
              title={t('common.logOut')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className={`mt-2 hidden text-[11px] ${appTextMutedClass} sm:block`}>
            {t('common.signedInAs')} {currentUserName}
          </div>
        </div>
        <div
          className={
            isDashboardPage
              ? settings.density === 'compact'
                ? 'px-4 pb-24 pt-2 md:px-8 md:pb-8 md:pt-2'
                : 'px-4 pb-24 pt-2.5 md:px-10 md:pb-10 md:pt-3 xl:px-12'
              : settings.density === 'compact'
                ? 'px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-7'
                : 'px-4 pb-24 pt-5 md:px-10 md:pb-10 md:pt-8 xl:px-12'
          }
        >
          {isDemoAccount ? (
            <div className={`mb-5 rounded-[24px] border px-4 py-4 ${appPanelClass} ${appBorderClass}`}>
              <p className={`text-[12px] font-semibold uppercase tracking-[0.16em] ${appTextMutedClass}`}>
                Demo account
              </p>
              <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                This workspace is separate from your personal data. Any edits you make here stay saved between sessions.
              </p>
            </div>
          ) : null}
          {demoPreview?.active ? (
            <div className={`mb-5 rounded-[24px] border px-4 py-4 md:px-5 ${appPanelClass} ${appBorderClass}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className={`text-[12px] font-medium ${appTextMutedClass}`}>
                    {t('demoPreview.eyebrow')}
                  </p>
                  <p className={`mt-2 text-[1.05rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                    {t('demoPreview.title')}
                  </p>
                  <p className={`mt-2 max-w-3xl text-[14px] leading-6 ${appTextMutedClass}`}>
                    {t('demoPreview.body')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={demoPreview.onStartWithRealData}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextStrongClass}`}
                  >
                    {t('demoPreview.startWithRealData')}
                  </button>
                  <button
                    type="button"
                    onClick={demoPreview.onAddFirstProperty}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextStrongClass}`}
                  >
                    {t('demoPreview.addFirstProperty')}
                  </button>
                  {demoPreview.onReplay ? (
                    <button
                      type="button"
                      onClick={demoPreview.onReplay}
                      className={`rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextStrongClass}`}
                    >
                      {t('demoPreview.replay')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={demoPreview.onExit}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
                  >
                    {t('demoPreview.exit')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {fxSyncStatus.warning ? (
            <div className={`${isDashboardPage ? 'mb-[14px] rounded-[20px] px-4 py-3' : 'mb-5 rounded-[24px] px-4 py-4'} border border-amber-300/70 bg-amber-50/80 text-amber-800 shadow-[0_18px_32px_-28px_rgba(146,64,14,0.35)] dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200`}>
              <p className={`${isDashboardPage ? 'text-[11px]' : 'text-[12px]'} font-semibold uppercase tracking-[0.16em]`}>
                FX Warning
              </p>
              <p className={isDashboardPage ? 'mt-1 text-[13px] leading-5' : 'mt-2 text-sm leading-6'}>
                {fxSyncStatus.warning}
              </p>
            </div>
          ) : null}
          {children}
        </div>
      </main>
      <nav className={`fixed inset-x-0 bottom-0 z-30 border-t px-3 pb-[max(env(safe-area-inset-bottom),0.8rem)] pt-3 md:hidden ${appBorderClass} ${appPanelClass} ${appSidebarSurfaceClass} rounded-none shadow-none`}>
        <div className={`grid gap-2 ${mobileNavItems.length >= 7 ? 'grid-cols-7' : mobileNavItems.length === 6 ? 'grid-cols-6' : 'grid-cols-5'}`}>
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-[20px] px-2 py-2.5 text-center transition ${
                  isActive
                    ? `${appNavActiveClass}`
                    : `${appButtonMutedClass} ${appTextMutedClass}`
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                <span className="text-[11px] font-medium leading-4">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
