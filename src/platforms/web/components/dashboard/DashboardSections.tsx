import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Landmark,
  PencilLine,
  PieChart as PieChartIcon,
  PiggyBank,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { PortfolioAlert } from '../../../../common/utils/alerts';
import { formatPercentage } from '../../../../common/utils/formatting';
import { useResolvedGalleryUrls } from '../../hooks/useResolvedGalleryUrls';
import {
  dashboardLightIconChipClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
} from '../../styles/dashboardTheme';
import type {
  DashboardAllocationItem,
  DashboardHealthViewModel,
  DashboardPropertySummaryItem,
  DashboardViewModel,
} from '../../pages/dashboardViewModel';

type Translate = (
  key: string,
  replacements?: Record<string, string | number>
) => string;

const dashboardCardClass =
  'dashboard-card rounded-[20px] border border-[var(--dashboard-border)] bg-[var(--dashboard-card-surface)] shadow-[0_18px_48px_-42px_rgba(15,23,42,0.24)]';

const dashboardSupportingCardClass =
  'flex h-full flex-col p-4 md:min-h-[286px] md:p-[18px] xl:min-h-[300px]';

const clampPercentage = (value: number) => Math.max(0, Math.min(value, 100));

export const DashboardCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <section className={`${dashboardCardClass} ${className}`}>{children}</section>
);

const CardHeading: React.FC<{
  title: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ title, icon, meta }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2.5">
      {icon ? (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${dashboardLightIconChipClass}`}>
          {icon}
        </span>
      ) : null}
      <h2 className={`text-[15px] font-semibold leading-5 tracking-[-0.015em] ${dashboardLightValueClass}`}>
        {title}
      </h2>
    </div>
    {meta}
  </div>
);

export const DashboardHeader: React.FC<{
  firstName: string;
  onEditWealth: () => void;
  t: Translate;
}> = ({ firstName, onEditWealth, t }) => (
  <header className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dashboardLightLabelClass}`}>
        {t('dashboard.title')}
      </p>
      <h1 className={`mt-1 text-[1.45rem] font-semibold tracking-[-0.035em] md:text-[1.7rem] ${dashboardLightValueClass}`}>
        {t('dashboardUi.greeting', { name: firstName })}
      </h1>
      <p className={`mt-1 text-[13px] md:text-[14px] ${dashboardLightMutedTextClass}`}>
        {t('dashboardUi.greetingSubtitle')}
      </p>
    </div>
    <button
      type="button"
      onClick={onEditWealth}
      className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-xl bg-[var(--app-button-primary-bg)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_-25px_rgba(37,99,235,0.65)] transition hover:-translate-y-px"
    >
      <PencilLine className="h-4 w-4" />
      {t('dashboard.editWealthInputs')}
    </button>
  </header>
);

interface PrimaryMetricsProps {
  primary: DashboardViewModel['primary'];
  formatValuation: (value: number) => string;
  formatOperating: (value: number) => string;
  t: Translate;
}

export const PrimaryMetrics: React.FC<PrimaryMetricsProps> = ({
  primary,
  formatValuation,
  formatOperating,
  t,
}) => {
  const cards = [
    {
      key: 'net-worth',
      label: t('dashboard.totalNetWorth'),
      value: formatValuation(primary.netWorth),
      context: t('dashboardUi.netWorthContext'),
      icon: <Wallet className="h-5 w-5" />,
      valueClass: dashboardMetricToneClass.default,
      accent: 'bg-[#2f6fed]',
    },
    {
      key: 'cashflow',
      label: t('dashboard.netMonthlyCashflow'),
      value: formatOperating(primary.netMonthlyCashflow),
      context: t('dashboardUi.annualizedContext', {
        amount: formatOperating(primary.annualizedCashflow),
      }),
      icon: <BarChart3 className="h-5 w-5" />,
      valueClass:
        primary.netMonthlyCashflow >= 0
          ? dashboardMetricToneClass.success
          : dashboardMetricToneClass.danger,
      accent: primary.netMonthlyCashflow >= 0 ? 'bg-[#2f9e68]' : 'bg-[#d94b5b]',
    },
    {
      key: 'equity',
      label: t('dashboard.totalEquity'),
      value: formatValuation(primary.totalEquity),
      context: t('dashboardUi.equityContext', {
        percentage: formatPercentage(primary.equityPct, 1),
      }),
      icon: <Landmark className="h-5 w-5" />,
      valueClass: dashboardMetricToneClass.default,
      accent: 'bg-[#35a36f]',
    },
    {
      key: 'debt',
      label: t('dashboard.totalDebt'),
      value: formatValuation(primary.totalDebt),
      context: t('dashboardUi.debtContext', {
        percentage: formatPercentage(primary.debtToValuePct, 1),
      }),
      icon: <Wallet className="h-5 w-5" />,
      valueClass: dashboardMetricToneClass.danger,
      accent: 'bg-[#d94b5b]',
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <DashboardCard key={card.key} className="relative min-h-[156px] overflow-hidden p-4 md:min-h-[164px] md:p-5">
          <div className="flex h-full min-w-0 flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[13px] font-semibold ${dashboardLightLabelClass}`}>{card.label}</p>
                <p className={`mt-2.5 min-w-0 break-words text-[clamp(1.75rem,2.25vw,2rem)] font-bold leading-[1.05] tracking-[-0.045em] ${card.valueClass}`}>
                  {card.value}
                </p>
              </div>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${dashboardLightIconChipClass}`}>
                {card.icon}
              </span>
            </div>
            <p className={`text-[12px] font-medium leading-5 ${dashboardLightMutedTextClass}`}>{card.context}</p>
          </div>
          <span className={`absolute inset-x-5 bottom-0 h-[3px] rounded-full opacity-65 ${card.accent}`} />
        </DashboardCard>
      ))}
    </section>
  );
};

const getAlertTitle = (alert: PortfolioAlert, t: Translate) => {
  switch (alert.kind) {
    case 'rent-update-upcoming':
      return t('dashboardUi.alertsRentUpdateTitle');
    case 'lease-ending':
      return t('dashboardUi.alertsLeaseEndingTitle');
    case 'lease-expired':
      return t('dashboardUi.alertsLeaseExpiredTitle');
    case 'insurance-ending':
      return t('dashboardUi.alertsInsuranceEndingTitle');
    case 'missing-lease-end-date':
      return t('dashboardUi.alertsMissingDataTitle');
    default:
      return t('dashboardUi.attentionTitle');
  }
};

const getAlertTiming = (alert: PortfolioAlert, t: Translate) => {
  if (typeof alert.daysUntil !== 'number') {
    return null;
  }
  if (alert.daysUntil < 0) {
    return t('dashboardUi.alertsOverdueDays', { count: Math.abs(alert.daysUntil) });
  }
  if (alert.daysUntil === 0) {
    return t('dashboardUi.alertsToday');
  }
  return t('dashboardUi.alertsInDays', { count: alert.daysUntil });
};

export const AttentionStrip: React.FC<{
  attention: DashboardViewModel['attention'];
  t: Translate;
}> = ({ attention, t }) => (
  <DashboardCard className="px-4 py-3 md:px-5">
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BellRing className="h-4.5 w-4.5 text-[#d97706]" />
          <h2 className={`text-[15px] font-semibold ${dashboardLightValueClass}`}>
            {t('dashboardUi.attentionTitle')}
          </h2>
          {attention.totalCount > 0 ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
              {attention.totalCount}
            </span>
          ) : null}
        </div>
        {attention.totalCount > attention.items.length ? (
          <span className={`text-[12px] font-medium ${dashboardLightMutedTextClass}`}>
            +{attention.totalCount - attention.items.length}
          </span>
        ) : null}
      </div>

      {attention.items.length > 0 ? (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {attention.items.map((alert) => {
            const timing = getAlertTiming(alert, t);
            const urgent = alert.severity === 'urgent';
            return (
              <article
                key={alert.id}
                className={`flex min-w-0 items-center gap-3 rounded-[15px] border px-3.5 py-2.5 ${
                  urgent
                    ? 'border-rose-200/80 bg-rose-50/80'
                    : 'border-amber-200/75 bg-amber-50/65'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${urgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {urgent ? <AlertCircle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-[13px] font-semibold ${dashboardLightValueClass}`}>
                    {getAlertTitle(alert, t)}
                  </p>
                  <p className={`mt-0.5 truncate text-[11px] ${dashboardLightMutedTextClass}`}>
                    {[alert.propertyName, timing].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[15px] border border-emerald-100 bg-emerald-50/55 px-3.5 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className={`text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.attentionEmptyTitle')}</p>
            <p className={`mt-0.5 text-[11px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.attentionEmptyBody')}</p>
          </div>
        </div>
      )}
    </div>
  </DashboardCard>
);

export const PortfolioHistoryCard: React.FC<{
  currentNetWorth: string;
  t: Translate;
}> = ({ currentNetWorth, t }) => (
  <DashboardCard className={dashboardSupportingCardClass}>
    <CardHeading title={t('dashboardUi.portfolioHistoryTitle')} icon={<History className="h-4 w-4" />} />
    <div className="mt-4">
      <p className={`text-[11px] font-medium ${dashboardLightLabelClass}`}>{t('dashboardUi.currentNetWorth')}</p>
      <p className={`mt-1 text-[1.65rem] font-bold tracking-[-0.04em] ${dashboardLightValueClass}`}>{currentNetWorth}</p>
    </div>
    <div className="relative mt-4 flex min-h-[150px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-[var(--dashboard-border-strong)] bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,0.45))] px-4 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative max-w-sm">
        <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] ${dashboardLightIconChipClass}`}>
          <History className="h-4.5 w-4.5" />
        </span>
        <p className={`mt-3 text-[14px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.historyUnavailableTitle')}</p>
        <p className={`mt-1.5 text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboardUi.historyUnavailableBody')}</p>
      </div>
    </div>
  </DashboardCard>
);

const AllocationTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: DashboardAllocationItem & { label: string; percentage: number } }>;
  formatValuation: (value: number) => string;
}> = ({ active, payload, formatValuation }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-slate-800">{item.label}</p>
      <p className="mt-1 text-[11px] text-slate-600">{formatValuation(item.value)} · {formatPercentage(item.percentage, 1)}</p>
    </div>
  );
};

export const AssetAllocationCard: React.FC<{
  items: DashboardAllocationItem[];
  totalAssets: number;
  formatValuation: (value: number) => string;
  t: Translate;
}> = ({ items, totalAssets, formatValuation, t }) => {
  const labels: Record<DashboardAllocationItem['key'], string> = {
    'real-estate': t('dashboardUi.realEstate'),
    cash: t('dashboard.availableCash'),
    investments: t('dashboard.investmentsValue'),
  };
  const chartTotal = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  const data = items
    .filter((item) => item.value > 0)
    .map((item) => ({
      ...item,
      label: labels[item.key],
      percentage: chartTotal > 0 ? (item.value / chartTotal) * 100 : 0,
    }));

  return (
    <DashboardCard className={dashboardSupportingCardClass}>
      <CardHeading title={t('dashboardUi.assetAllocationTitle')} icon={<PieChartIcon className="h-4 w-4" />} />
      {data.length > 0 ? (
        <div className="mt-3 grid min-w-0 flex-1 grid-cols-1 items-center gap-2 min-[1400px]:grid-cols-[minmax(150px,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative mx-auto h-[146px] w-[146px] xl:h-[150px] xl:w-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={46} outerRadius={65} paddingAngle={2} stroke="var(--dashboard-card-surface)" strokeWidth={4}>
                  {data.map((item) => <Cell key={item.key} fill={item.color} />)}
                </Pie>
                <Tooltip content={<AllocationTooltip formatValuation={formatValuation} />} cursor={false} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className={`max-w-[100px] break-words text-[13px] font-bold leading-4 tracking-[-0.03em] ${dashboardLightValueClass}`}>{formatValuation(totalAssets)}</p>
              <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${dashboardLightLabelClass}`}>{t('dashboardUi.totalAssets')}</p>
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            {data.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <p className={`truncate text-[12px] font-semibold ${dashboardLightValueClass}`}>{item.label}</p>
                  </div>
                  <p className={`ml-4.5 mt-0.5 text-[10px] ${dashboardLightMutedTextClass}`}>{formatPercentage(item.percentage, 1)}</p>
                </div>
                <p className={`whitespace-nowrap text-right text-[11px] font-semibold ${dashboardLightValueClass}`}>{formatValuation(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-center">
          <p className={`max-w-xs text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboardUi.assetAllocationEmpty')}</p>
        </div>
      )}
    </DashboardCard>
  );
};

export const RecentActivityCard: React.FC<{ t: Translate }> = ({ t }) => (
  <DashboardCard className={dashboardSupportingCardClass}>
    <CardHeading title={t('dashboardUi.recentActivityTitle')} icon={<Clock3 className="h-4 w-4" />} />
    <div className="flex flex-1 items-center justify-center px-3 text-center">
      <div className="max-w-xs">
        <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] ${dashboardLightIconChipClass}`}>
          <Clock3 className="h-4.5 w-4.5" />
        </span>
        <p className={`mt-3 text-[14px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.activityUnavailableTitle')}</p>
        <p className={`mt-1.5 text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboardUi.activityUnavailableBody')}</p>
      </div>
    </div>
  </DashboardCard>
);

export const CashflowOverviewCard: React.FC<{
  cashflow: DashboardViewModel['cashflow'];
  formatOperating: (value: number) => string;
  t: Translate;
}> = ({ cashflow, formatOperating, t }) => {
  const rows = [
    { key: 'rent', label: t('dashboardUi.rentalIncome'), value: cashflow.monthlyRent, color: '#31a36c' },
    { key: 'expenses', label: t('dashboardUi.operatingExpenses'), value: -Math.abs(cashflow.monthlyOperatingExpenses), color: '#e35d6a' },
    { key: 'mortgage', label: t('dashboardUi.mortgagePayments'), value: -Math.abs(cashflow.monthlyMortgagePayments), color: '#e69a3b' },
  ];
  const maxValue = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <DashboardCard className={dashboardSupportingCardClass}>
      <CardHeading
        title={t('dashboardUi.cashflowOverviewTitle')}
        icon={<BarChart3 className="h-4 w-4" />}
        meta={<span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${dashboardLightLabelClass}`}>{t('dashboardUi.currentMonthlyModel')}</span>}
      />
      <div className="mt-4 flex min-w-0 flex-1 flex-col">
        <div>
          <p className={`text-[11px] ${dashboardLightMutedTextClass}`}>{t('dashboard.netMonthlyCashflow')}</p>
          <p className={`mt-1 min-w-0 break-words text-[clamp(1.5rem,2vw,1.65rem)] font-bold tracking-[-0.04em] ${cashflow.netMonthlyCashflow >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger}`}>
            {formatOperating(cashflow.netMonthlyCashflow)}
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className={`font-medium ${dashboardLightMutedTextClass}`}>{row.label}</span>
                <span className={`font-semibold ${dashboardLightValueClass}`}>{formatOperating(row.value)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(148,163,184,0.16)]">
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(row.value) / maxValue) * 100}%`, backgroundColor: row.color }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-[var(--dashboard-border)] pt-3 text-[12px] font-semibold">
          <span className={dashboardLightValueClass}>{t('dashboard.netMonthlyCashflow')}</span>
          <span className={cashflow.netMonthlyCashflow >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger}>{formatOperating(cashflow.netMonthlyCashflow)}</span>
        </div>
      </div>
    </DashboardCard>
  );
};

const PropertyThumbnail: React.FC<{ item: DashboardPropertySummaryItem }> = ({ item }) => {
  const resolvedUrls = useResolvedGalleryUrls(item.imageRefs);
  const [failed, setFailed] = useState(false);
  const imageUrl = resolvedUrls[0];

  if (!imageUrl || failed) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(135deg,#e8eef6,#f8fafc)] text-[#55708d]">
        <Building2 className="h-5 w-5" />
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={item.name}
      className="h-12 w-12 shrink-0 rounded-[13px] object-cover"
      onError={() => setFailed(true)}
    />
  );
};

export const PropertiesSummaryCard: React.FC<{
  properties: DashboardPropertySummaryItem[];
  totalPropertyCount: number;
  formatPropertyValue: (item: DashboardPropertySummaryItem, value: number) => string;
  formatPropertyCashflow: (item: DashboardPropertySummaryItem, value: number) => string;
  t: Translate;
}> = ({ properties, totalPropertyCount, formatPropertyValue, formatPropertyCashflow, t }) => (
  <DashboardCard className={dashboardSupportingCardClass}>
    <CardHeading
      title={t('dashboardUi.propertiesSummaryTitle')}
      icon={<Building2 className="h-4 w-4" />}
      meta={<span className={`text-[11px] font-semibold ${dashboardLightMutedTextClass}`}>{totalPropertyCount}</span>}
    />
    {properties.length > 0 ? (
      <div className="mt-3 divide-y divide-[var(--dashboard-border)]">
        {properties.map((item) => (
          <article key={item.id} className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <PropertyThumbnail item={item} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[12px] font-semibold ${dashboardLightValueClass}`}>{item.name}</p>
              <p className={`mt-0.5 truncate text-[10px] ${dashboardLightMutedTextClass}`}>{item.location}</p>
              <p className={`mt-1 text-[11px] font-semibold ${dashboardLightValueClass}`}>{formatPropertyValue(item, item.currentEstimatedValue)}</p>
              <p className={`mt-0.5 text-[10px] ${dashboardLightMutedTextClass}`}>{t('dashboard.totalEquity')}: {formatPropertyValue(item, item.equity)}</p>
            </div>
            <div className="min-w-0 shrink-0 text-right">
              <p className={`text-[11px] font-semibold ${item.netMonthlyCashflow >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger}`}>
                {formatPropertyCashflow(item, item.netMonthlyCashflow)}
              </p>
              <p className={`mt-0.5 text-[9px] uppercase tracking-[0.08em] ${dashboardLightLabelClass}`}>{t('dashboardUi.monthlyCashflowShort')}</p>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center text-center">
        <div className="max-w-xs">
          <Building2 className={`mx-auto h-8 w-8 ${dashboardLightMutedTextClass}`} />
          <p className={`mt-3 text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesEmptyTitle')}</p>
          <p className={`mt-1.5 text-[11px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesEmptyBody')}</p>
        </div>
      </div>
    )}
  </DashboardCard>
);

const HealthRow: React.FC<{
  label: string;
  value: string;
  percentage: number | null;
  icon: React.ReactNode;
}> = ({ label, value, percentage, icon }) => (
  <div className="py-2.5 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(37,99,235,0.07)] text-[#315f91]">{icon}</span>
        <p className={`text-[11px] font-medium leading-4 ${dashboardLightMutedTextClass}`}>{label}</p>
      </div>
      <p className={`shrink-0 text-[11px] font-semibold ${dashboardLightValueClass}`}>{value}</p>
    </div>
    {percentage !== null ? (
      <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(148,163,184,0.15)]">
        <div className="h-full rounded-full bg-[#3977dd]" style={{ width: `${clampPercentage(percentage)}%` }} />
      </div>
    ) : null}
  </div>
);

export const PortfolioHealthCard: React.FC<{
  health: DashboardHealthViewModel;
  t: Translate;
}> = ({ health, t }) => {
  const unavailable = t('dashboardUi.notAvailable');
  const reserveValue = health.reserveMonths === null
    ? unavailable
    : t('dashboardUi.reserveMonthsValue', {
        months: health.reserveMonths.toFixed(1),
        target: health.reserveTargetMonths,
      });

  return (
    <DashboardCard className={dashboardSupportingCardClass}>
      <CardHeading title={t('dashboardUi.portfolioHealthTitle')} icon={<ShieldCheck className="h-4 w-4" />} />
      <div className="mt-4 flex-1 divide-y divide-[var(--dashboard-border)]">
        <HealthRow
          label={t('dashboardUi.propertyConcentration')}
          value={health.propertyConcentrationPct === null ? unavailable : formatPercentage(health.propertyConcentrationPct, 1)}
          percentage={health.propertyConcentrationPct}
          icon={<Building2 className="h-4 w-4" />}
        />
        <HealthRow
          label={t('dashboardUi.cashReserve')}
          value={reserveValue}
          percentage={health.reserveCoveragePct}
          icon={<PiggyBank className="h-4 w-4" />}
        />
        <HealthRow
          label={t('dashboardUi.debtToValue')}
          value={formatPercentage(health.debtToValuePct, 1)}
          percentage={health.debtToValuePct}
          icon={<Landmark className="h-4 w-4" />}
        />
        <HealthRow
          label={t('dashboardUi.liquidity')}
          value={health.liquidityPct === null ? unavailable : formatPercentage(health.liquidityPct, 1)}
          percentage={health.liquidityPct}
          icon={<PiggyBank className="h-4 w-4" />}
        />
      </div>
      <p className={`mt-3 border-t border-[var(--dashboard-border)] pt-2.5 text-[10px] leading-4 ${dashboardLightMutedTextClass}`}>
        {t('dashboardUi.healthTransparencyNote')}
      </p>
    </DashboardCard>
  );
};

interface DashboardOverviewGridProps {
  viewModel: DashboardViewModel;
  formatValuation: (value: number) => string;
  formatOperating: (value: number) => string;
  formatPropertyValue: (item: DashboardPropertySummaryItem, value: number) => string;
  formatPropertyCashflow: (item: DashboardPropertySummaryItem, value: number) => string;
  t: Translate;
}

export const DashboardOverviewGrid: React.FC<DashboardOverviewGridProps> = ({
  viewModel,
  formatValuation,
  formatOperating,
  formatPropertyValue,
  formatPropertyCashflow,
  t,
}) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
    <div className="h-full md:col-span-1 xl:col-span-5">
      <PortfolioHistoryCard currentNetWorth={formatValuation(viewModel.primary.netWorth)} t={t} />
    </div>
    <div className="h-full md:col-span-1 xl:col-span-4">
      <AssetAllocationCard items={viewModel.allocation} totalAssets={viewModel.totalAssets} formatValuation={formatValuation} t={t} />
    </div>
    <div className="h-full md:col-span-2 xl:col-span-3">
      <RecentActivityCard t={t} />
    </div>
    <div className="h-full md:col-span-1 xl:col-span-5">
      <CashflowOverviewCard cashflow={viewModel.cashflow} formatOperating={formatOperating} t={t} />
    </div>
    <div className="h-full md:col-span-1 xl:col-span-4">
      <PropertiesSummaryCard
        properties={viewModel.properties}
        totalPropertyCount={viewModel.totalPropertyCount}
        formatPropertyValue={formatPropertyValue}
        formatPropertyCashflow={formatPropertyCashflow}
        t={t}
      />
    </div>
    <div className="h-full md:col-span-2 xl:col-span-3">
      <PortfolioHealthCard health={viewModel.health} t={t} />
    </div>
  </div>
);
