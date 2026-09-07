import React from 'react';
import { useEffect } from 'react';
import {
  BarChart3,
  Briefcase,
  ClipboardList,
  Building2,
  FileText,
  Hammer,
  Home,
  Landmark,
  LogOut,
  Monitor,
  Receipt,
  Settings,
  Wallet,
  UserCircle2,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { workspaceModuleLabels } from '../../../common/utils/workspace';
import { deriveWorkspaceModeState, getVisibleWorkspacePages } from '../../../common/utils/workspaceMode';
import {
  appBorderClass,
  appButtonMutedClass,
  appNavActiveClass,
  appNavIdleClass,
  appPanelClass,
  appSidebarSurfaceClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  currentUserName: string;
  currentUserEmail: string;
  onLogout: () => void;
  tutorialTargetId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  currentUserName,
  currentUserEmail,
  onLogout,
  tutorialTargetId = null,
}) => {
  const { settings, t } = useSettings();
  const workspaceModeState = deriveWorkspaceModeState(settings);
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
  const menuItems = visibleModules
    .map((moduleId) => ({
      id: moduleId,
      label: moduleMeta[moduleId]?.label ?? workspaceModuleLabels[moduleId],
      icon: moduleMeta[moduleId]?.icon ?? Settings,
    }));
  const sections = [
    {
      label: 'Portfolio',
      items: menuItems.filter((item) =>
        ['dashboard', 'opportunities', 'properties', 'mortgages'].includes(item.id)
      ),
    },
    {
      label: 'Finance',
      items: menuItems.filter((item) => ['cash-accounts', 'reports'].includes(item.id)),
    },
    {
      label: 'System',
      items: menuItems.filter((item) => ['settings'].includes(item.id)),
    },
  ].filter((section) => section.items.length > 0);

  useEffect(() => {
    console.info('[nav] desktop sidebar modules', {
      enabledModules: settings.workspaceConfig.enabledModules,
      sidebarOrder: settings.workspaceConfig.sidebarOrder,
      hiddenModules: settings.workspaceConfig.hiddenModules,
      visibleModules,
    });
  }, [
    settings.workspaceConfig.enabledModules,
    settings.workspaceConfig.hiddenModules,
    settings.workspaceConfig.sidebarOrder,
    visibleModules,
  ]);

  return (
    <aside
      className={`hidden h-screen w-[224px] shrink-0 flex-col border-r lg:fixed lg:inset-y-0 lg:left-0 lg:flex ${appBorderClass} ${appPanelClass} ${appSidebarSurfaceClass} rounded-none shadow-none`}
    >
      <div className={`border-b px-4 py-3 ${appBorderClass}`}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-[15px] border border-[rgba(24,34,52,0.14)] bg-white text-[var(--app-nav-active-fg)]">
            <Home className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h1 className={`truncate text-[1.1rem] font-medium tracking-[-0.04em] ${appTextStrongClass}`}>
              {t('app.title')}
            </h1>
            <p className={`mt-0.5 truncate text-[0.72rem] font-normal tracking-[-0.02em] ${appTextMutedClass}`}>
              {t('app.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1.5">
              <p className={`text-[0.82rem] font-normal tracking-[-0.03em] ${appTextMutedClass}`}>
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      data-tutorial-id={
                        item.id === 'properties'
                          ? 'nav-properties'
                          : item.id === 'mortgages'
                            ? 'nav-mortgages'
                            : item.id === 'cash-accounts'
                              ? 'nav-cash-accounts'
                              : item.id === 'reports'
                                ? 'nav-reports'
                                : item.id === 'settings'
                                  ? 'nav-settings'
                                  : undefined
                      }
                      className={`group flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2 text-left transition-all duration-200 ${
                        isActive
                          ? `${appNavActiveClass}`
                          : `${appNavIdleClass} border border-transparent bg-transparent shadow-none hover:border-transparent`
                      } ${
                        tutorialTargetId ===
                        (item.id === 'properties'
                          ? 'nav-properties'
                          : item.id === 'mortgages'
                            ? 'nav-mortgages'
                            : item.id === 'cash-accounts'
                              ? 'nav-cash-accounts'
                              : item.id === 'reports'
                                ? 'nav-reports'
                                : item.id === 'settings'
                                  ? 'nav-settings'
                                  : null)
                          ? 'app-tutorial-target'
                          : ''
                      }`}
                    >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border-none transition-all ${
                        isActive
                          ? 'bg-transparent text-[#1f5aa6]'
                          : 'bg-transparent text-[var(--app-text-muted)] group-hover:text-[var(--app-nav-active-fg)]'
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <span className={`text-[0.9rem] font-normal tracking-[-0.03em] ${appTextStrongClass}`}>
                      {item.label}
                    </span>
                  </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className={`border-t px-4 py-3 ${appBorderClass}`}>
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(31,79,136,0.12)] text-[var(--app-nav-active-fg)]">
            <UserCircle2 className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <p className={`truncate text-[0.88rem] font-medium tracking-[-0.03em] ${appTextStrongClass}`}>{currentUserName}</p>
            <p className={`mt-0.5 truncate text-[0.74rem] font-normal tracking-[-0.02em] ${appTextMutedClass}`}>
              {settings.profile.role || t('settings.fields.role')}
            </p>
            <p className={`mt-0.5 truncate text-[0.7rem] font-normal tracking-[-0.01em] ${appTextMutedClass}`}>
              {currentUserEmail}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className={`mt-2 inline-flex min-w-[138px] items-center gap-2 rounded-[14px] px-3 py-1.5 text-[0.8rem] font-medium ${appButtonMutedClass} ${appTextStrongClass}`}
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span>{t('common.logOut')}</span>
        </button>
      </div>
    </aside>
  );
};
