import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Landmark,
  PencilLine,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { PortfolioCompositionChart } from '../components/PortfolioCompositionChart';
import { WealthAccountsEditor } from '../components/WealthAccountsEditor';
import { useSettings } from '../context/SettingsContext';
import {
  dashboardLightIconChipClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
} from '../styles/dashboardTheme';
import { calculatePortfolioMetrics } from '../../../common/utils/calculations';
import { getActiveFxSnapshot, getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { formatCurrencyValue, formatPercentage } from '../../../common/utils/formatting';
import { convertCurrency } from '../../../common/utils/currency';
import { resolveDisplayCurrency } from '../../../common/utils/metricCurrency';
import {
  CashAccount,
  InvestmentAccount,
  Mortgage,
  Opportunity,
  Property,
  RehabProject,
} from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';

interface DashboardProps {
  properties: Property[];
  mortgages: Mortgage[];
  cashAccounts: CashAccount[];
  investmentAccounts: InvestmentAccount[];
  opportunities: Opportunity[];
  rehabProjects: RehabProject[];
  onUpdateCashAccounts: (accounts: CashAccount[]) => void;
  onUpdateInvestmentAccounts: (accounts: InvestmentAccount[]) => void;
  onConnectEtoroAccount: () => Promise<void>;
  onSyncInvestmentAccount: (accountId: string) => Promise<void>;
}

interface TrendPoint {
  label: string;
  value: number;
}

interface HeroKpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  toneClassName?: string;
  deltaText?: string;
  deltaToneClassName?: string;
  deltaIcon?: React.ReactNode;
  badgeText?: string;
}

interface MiniTrendChartProps {
  points: TrendPoint[];
  color: string;
  gradientId: string;
  heightClassName?: string;
}

const baseCardClassName =
  'dashboard-card rounded-[28px] border border-[var(--dashboard-border)] bg-[var(--dashboard-card-surface)] shadow-[0_24px_54px_-42px_rgba(15,23,42,0.18)]';

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const createTrendSeries = (current: number, monthlyDelta: number, months: number = 6): TrendPoint[] =>
  Array.from({ length: months }, (_, index) => {
    const remainingMonths = months - 1 - index;
    return {
      label: `${index + 1}`,
      value: current - monthlyDelta * remainingMonths,
    };
  });

const MiniTrendChart: React.FC<MiniTrendChartProps> = ({
  points,
  color,
  gradientId,
  heightClassName = 'h-[82px]',
}) => (
  <div className={heightClassName}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.25}
          fill={`url(#${gradientId})`}
          dot={{ r: 3.5, strokeWidth: 1.75, fill: '#ffffff' }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const HeroKpiCard: React.FC<HeroKpiCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  toneClassName = dashboardMetricToneClass.default,
  deltaText,
  deltaToneClassName = dashboardMetricToneClass.success,
  deltaIcon,
  badgeText,
}) => (
  <div className={`${baseCardClassName} h-full px-6 py-5`}>
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{title}</p>
          <p className={`mt-3 text-[2.6rem] font-bold leading-none tracking-[-0.04em] ${toneClassName}`}>
            {value}
          </p>
        </div>
        <div className={`${dashboardLightIconChipClass} flex h-11 w-11 items-center justify-center rounded-[16px]`}>
          {icon}
        </div>
      </div>

      <div className="space-y-2.5">
        {deltaText ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-1.5 text-[14px] font-semibold ${deltaToneClassName}`}>
              {deltaIcon}
              <span>{deltaText}</span>
            </div>
            {badgeText ? (
              <span className="inline-flex rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[12px] font-medium text-[#15803d]">
                {badgeText}
              </span>
            ) : null}
          </div>
        ) : badgeText ? (
          <span className="inline-flex w-fit rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[12px] font-medium text-[#15803d]">
            {badgeText}
          </span>
        ) : null}
        <p className={`max-w-[34rem] text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>{subtitle}</p>
      </div>
    </div>
  </div>
);

const ProgressBar: React.FC<{
  value: number;
  color: string;
  trackClassName?: string;
}> = ({ value, color, trackClassName = 'bg-[rgba(148,163,184,0.22)]' }) => (
  <div className={`h-2.5 w-full overflow-hidden rounded-full ${trackClassName}`}>
    <div className="h-full rounded-full" style={{ width: `${clampPercentage(value)}%`, backgroundColor: color }} />
  </div>
);

const InlineBadge: React.FC<{ children: React.ReactNode; tone?: 'green' | 'red' | 'blue' }> = ({
  children,
  tone = 'green',
}) => {
  const toneClassName =
    tone === 'red'
      ? 'bg-[rgba(239,68,68,0.12)] text-[#c2410c]'
      : tone === 'blue'
        ? 'bg-[rgba(37,99,235,0.1)] text-[#1d4ed8]'
        : 'bg-[rgba(22,163,74,0.12)] text-[#15803d]';

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${toneClassName}`}>{children}</span>;
};

const SectionEyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${dashboardLightLabelClass}`}>{children}</p>
);
const InsightPanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  text: string;
  toneClassName: string;
}> = ({ icon, title, text, toneClassName }) => (
  <div className={`rounded-[20px] border px-4 py-3 ${toneClassName}`}>
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-1 text-[12px] leading-5 opacity-90">{text}</p>
      </div>
    </div>
  </div>
);

const typeLabelMap = (t: (key: string, replacements?: Record<string, string | number>) => string) => ({
  etf: t('dashboard.assetTypeEtf'),
  stocks: t('dashboard.assetTypeStocks'),
  crypto: t('dashboard.assetTypeCrypto'),
  fund: t('dashboard.assetTypeFunds'),
  broker: t('dashboard.assetTypeBroker'),
  other: t('dashboard.assetTypeOther'),
});

export const Dashboard: React.FC<DashboardProps> = ({
  properties,
  mortgages,
  cashAccounts,
  investmentAccounts,
  onUpdateCashAccounts,
  onUpdateInvestmentAccounts,
  onConnectEtoroAccount,
  onSyncInvestmentAccount,
}) => {
  const { settings, t } = useSettings();
  const activeFxSnapshot = getActiveFxSnapshot(settings);
  const fxRates = getSettingsCurrencyRates(settings);
  const [showWealthEditor, setShowWealthEditor] = useState(false);
  const displayMode = settings.displayMode ?? 'single-reporting-currency';
  const reportingCurrency = resolveDisplayCurrency({ domain: 'reporting', settings });
  const valueCurrency = resolveDisplayCurrency({ domain: 'value', settings });
  const operatingCurrency = resolveDisplayCurrency({ domain: 'operating', settings });

  const metrics = useMemo(
    () =>
      calculatePortfolioMetrics(
        properties,
        mortgages,
        cashAccounts,
        investmentAccounts,
        reportingCurrency,
        fxRates
      ),
    [
      properties,
      mortgages,
      cashAccounts,
      investmentAccounts,
      displayMode,
      reportingCurrency,
      valueCurrency,
      operatingCurrency,
      fxRates,
    ]
  );

  useEffect(() => {
    console.info('[fx]', {
      event: 'portfolio-calculation-snapshot',
      provider: activeFxSnapshot?.provider ?? null,
      status: activeFxSnapshot?.status ?? 'error',
      fetchedAt: activeFxSnapshot?.fetchedAt ?? null,
      lastSuccessfulUpdateAt: activeFxSnapshot?.lastSuccessfulUpdateAt ?? null,
      displayMode,
      reportingCurrency,
      valueCurrency,
      operatingCurrency,
      rates: fxRates,
    });
  }, [activeFxSnapshot, displayMode, fxRates, operatingCurrency, reportingCurrency, valueCurrency]);

  const dashboardValuationDisplayCurrency: DisplayCurrency = resolveDisplayCurrency({
    domain: 'value',
    settings,
  });
  const dashboardOperatingDisplayCurrency: DisplayCurrency = resolveDisplayCurrency({
    domain: 'operating',
    settings,
  });

  const formatDashboardCurrency = (
    value: number,
    sourceCurrency: DisplayCurrency,
    targetCurrency: DisplayCurrency
  ) =>
    formatCurrencyValue(
      convertCurrency(value, sourceCurrency, targetCurrency, fxRates),
      targetCurrency,
      { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    );

  const formatValuationCurrency = (value: number) =>
    formatDashboardCurrency(value, metrics.valuationDisplayCurrency, dashboardValuationDisplayCurrency);
  const formatOperatingCurrency = (value: number) =>
    formatDashboardCurrency(value, metrics.operatingDisplayCurrency, dashboardOperatingDisplayCurrency);

  const totalGrossPortfolioValue =
    metrics.totalPortfolioValue + metrics.investmentsValue + metrics.availableCash;

  const occupiedProperties = useMemo(
    () => properties.filter((property) => property.occupancyStatus === 'occupied').length,
    [properties]
  );
  const occupancyRate =
    properties.length > 0 ? (occupiedProperties / properties.length) * 100 : null;

  const availableCashReserve = useMemo(() => {
    const monthlyBurn = metrics.totalMonthlyOperatingExpenses + metrics.totalMonthlyMortgagePayments;
    const targetReserve = monthlyBurn > 0 ? monthlyBurn * 6 : 0;
    const progressPct = targetReserve > 0 ? (metrics.availableCash / targetReserve) * 100 : 0;
    const monthsCovered = monthlyBurn > 0 ? metrics.availableCash / monthlyBurn : null;

    return {
      monthlyBurn,
      targetReserve,
      progressPct,
      monthsCovered,
    };
  }, [metrics.availableCash, metrics.totalMonthlyMortgagePayments, metrics.totalMonthlyOperatingExpenses]);

  const investmentTypeLabels = useMemo(() => typeLabelMap(t), [t]);

  const investmentSnapshot = useMemo(() => {
    const accountsWithBaseline = investmentAccounts.filter(
      (account) => account.lastSuccessfulBalance !== null && account.lastSuccessfulBalance !== undefined
    );
    const reliableMonthlyDelta = accountsWithBaseline.reduce(
      (sum, account) => sum + (account.balance - (account.lastSuccessfulBalance ?? account.balance)),
      0
    );
    const reliable = accountsWithBaseline.length > 0;
    const trendSeries = reliable
      ? createTrendSeries(metrics.investmentsValue, reliableMonthlyDelta, 6)
      : null;
    const groupedByType = investmentAccounts.reduce<Record<string, number>>((accumulator, account) => {
      const key = account.type ?? 'other';
      accumulator[key] = (accumulator[key] ?? 0) + account.balance;
      return accumulator;
    }, {});
    const topTypeEntry = Object.entries(groupedByType).sort((left, right) => right[1] - left[1])[0];
    const topTypeKey = topTypeEntry?.[0] ?? 'other';
    const topTypeBalance = topTypeEntry?.[1] ?? 0;
    const assetTypeCount = Object.keys(groupedByType).length;

    return {
      reliable,
      reliableMonthlyDelta,
      monthlyDeltaPct:
        metrics.investmentsValue > 0 ? (reliableMonthlyDelta / metrics.investmentsValue) * 100 : 0,
      trendSeries,
      trendStartValue: trendSeries?.[0]?.value ?? metrics.investmentsValue,
      trendEndValue: trendSeries?.[trendSeries.length - 1]?.value ?? metrics.investmentsValue,
      topTypeLabel: investmentTypeLabels[topTypeKey as keyof typeof investmentTypeLabels] ?? investmentTypeLabels.other,
      topTypeShare:
        metrics.investmentsValue > 0 ? (topTypeBalance / metrics.investmentsValue) * 100 : 0,
      assetTypeCount,
    };
  }, [investmentAccounts, investmentTypeLabels, metrics.investmentsValue]);

  const debtMonthlyDelta = Math.abs(metrics.debtChangeIn1Year / 12);
  const equityMonthlyDelta = Math.max(metrics.principalRepaidNext12Months / 12, 0);
  const portfolioAppreciationMonthlyLift = metrics.totalEstimatedAnnualPropertyAppreciation / 12;
  const netWorthModeledMonthlyLift =
    metrics.totalNetMonthlyCashflow + equityMonthlyDelta + investmentSnapshot.reliableMonthlyDelta;
  const grossPortfolioModeledMonthlyLift =
    portfolioAppreciationMonthlyLift + investmentSnapshot.reliableMonthlyDelta;

  const equityTrend = useMemo(
    () => createTrendSeries(metrics.totalEquity, equityMonthlyDelta, 6),
    [equityMonthlyDelta, metrics.totalEquity]
  );
  const debtTrend = useMemo(
    () => createTrendSeries(metrics.totalDebt, -debtMonthlyDelta, 6),
    [debtMonthlyDelta, metrics.totalDebt]
  );

  const avgMortgageRate =
    mortgages.length > 0
      ? mortgages.reduce((sum, mortgage) => sum + mortgage.interestRate, 0) / mortgages.length
      : null;

  const realEstateMix = useMemo(
    () => [
      {
        key: 'equity',
        name: t('dashboard.totalEquity'),
        value: metrics.totalEquity,
        color: '#2f8a58',
        helperText: t('dashboard.realEstateEquitySubtitle'),
      },
      {
        key: 'debt',
        name: t('dashboard.totalDebt'),
        value: metrics.totalDebt,
        color: '#c76576',
        helperText: t('dashboard.realEstateDebtSubtitle'),
      },
    ].filter((segment) => segment.value > 0),
    [metrics.totalDebt, metrics.totalEquity, t]
  );

  const totalPortfolioMix = useMemo(
    () => [
      {
        key: 'real-estate',
        name: t('dashboard.realEstateLabel'),
        value: metrics.totalPortfolioValue,
        color: '#3f7f97',
        helperText: t('dashboard.totalPortfolioStructureSubtitle'),
      },
      {
        key: 'investments',
        name: t('dashboard.investmentsValue'),
        value: metrics.investmentsValue,
        color: '#4d6fb1',
        helperText: t('dashboard.investmentsValueSubtitle'),
      },
      {
        key: 'cash',
        name: t('dashboard.availableCash'),
        value: metrics.availableCash,
        color: '#7560a2',
        helperText: t('dashboard.availableCashSubtitle'),
      },
    ].filter((segment) => segment.value > 0),
    [metrics.availableCash, metrics.investmentsValue, metrics.totalPortfolioValue, t]
  );

  const realEstateSharePct =
    totalGrossPortfolioValue > 0 ? (metrics.totalPortfolioValue / totalGrossPortfolioValue) * 100 : 0;
  const investmentSharePct =
    totalGrossPortfolioValue > 0 ? (metrics.investmentsValue / totalGrossPortfolioValue) * 100 : 0;

  const portfolioStructureBullets = useMemo(() => {
    const bullets = [
      t('dashboard.structureBulletRealEstate', {
        percentage: formatPercentage(realEstateSharePct),
      }),
    ];

    if (metrics.availableCash > 0) {
      bullets.push(t('dashboard.structureBulletCash'));
    }

    if (metrics.investmentsValue > 0) {
      bullets.push(t('dashboard.structureBulletInvestments'));
    }

    return bullets.slice(0, 3);
  }, [investmentSharePct, metrics.availableCash, metrics.investmentsValue, realEstateSharePct, t]);

  const realEstateStructureBullets = useMemo(() => {
    const bullets = [
      t('dashboard.realEstateStructureBulletEquity', {
        percentage: formatPercentage(metrics.equityPercentage),
      }),
      t('dashboard.realEstateStructureBulletDebt', {
        percentage: formatPercentage(metrics.debtToValueRatio),
      }),
    ];

    if (mortgages.length > 0) {
      bullets.push(t('dashboard.realEstateStructureBulletAmortization'));
    }

    return bullets.slice(0, 3);
  }, [metrics.debtToValueRatio, metrics.equityPercentage, mortgages.length, t]);

  const operatingExpenseRatio =
    metrics.totalMonthlyRent > 0
      ? (metrics.totalMonthlyOperatingExpenses / metrics.totalMonthlyRent) * 100
      : null;

  const cashflowSummaryBullets = useMemo(() => {
    const bullets: string[] = [];

    if (operatingExpenseRatio !== null) {
      bullets.push(
        t('dashboard.cashflowSummaryExpenseRatio', {
          percentage: formatPercentage(operatingExpenseRatio),
        })
      );
    }

    if (metrics.totalMonthlyMortgagePayments >= metrics.totalMonthlyOperatingExpenses) {
      bullets.push(t('dashboard.cashflowSummaryMortgageDrag'));
    }

    if (occupancyRate !== null && properties.length > 0) {
      bullets.push(
        t('dashboard.cashflowSummaryOccupancy', {
          percentage: formatPercentage(occupancyRate),
        })
      );
    }

    return bullets.slice(0, 3);
  }, [
    metrics.totalMonthlyMortgagePayments,
    metrics.totalMonthlyOperatingExpenses,
    occupancyRate,
    operatingExpenseRatio,
    properties.length,
    t,
  ]);

  const keyInsights = useMemo(() => {
    const items: string[] = [];

    if (netWorthModeledMonthlyLift !== 0) {
      items.push(
        t('dashboard.keyInsightNetWorth', {
          amount: formatValuationCurrency(Math.abs(netWorthModeledMonthlyLift)),
          direction:
            netWorthModeledMonthlyLift >= 0
              ? t('dashboard.keyInsightDirectionUp')
              : t('dashboard.keyInsightDirectionDown'),
        })
      );
    }

    if (metrics.totalNetMonthlyCashflow !== 0) {
      items.push(
        t('dashboard.keyInsightCashflow', {
          amount: formatOperatingCurrency(Math.abs(metrics.totalNetMonthlyCashflow)),
          direction:
            metrics.totalNetMonthlyCashflow >= 0
              ? t('dashboard.keyInsightDirectionPositive')
              : t('dashboard.keyInsightDirectionNegative'),
        })
      );
    }

    if (metrics.debtToValueRatio > 0) {
      items.push(
        t('dashboard.keyInsightDebt', {
          percentage: formatPercentage(metrics.debtToValueRatio),
        })
      );
    }

    if (items.length < 3 && occupancyRate !== null) {
      items.push(
        t('dashboard.keyInsightOccupancy', {
          percentage: formatPercentage(occupancyRate),
        })
      );
    }

    return items.slice(0, 3);
  }, [
    formatOperatingCurrency,
    formatValuationCurrency,
    metrics.debtToValueRatio,
    metrics.totalNetMonthlyCashflow,
    netWorthModeledMonthlyLift,
    occupancyRate,
    t,
  ]);

  const suggestedFocusBullets = useMemo(() => {
    const bullets: string[] = [];

    if (metrics.debtToValueRatio >= 50) {
      bullets.push(t('dashboard.suggestedFocusDebt'));
    }

    if ((availableCashReserve.monthsCovered ?? 0) >= 6) {
      bullets.push(t('dashboard.suggestedFocusCash'));
    }

    if (realEstateSharePct >= 65) {
      bullets.push(t('dashboard.suggestedFocusDiversification'));
    }

    if (bullets.length === 0 && metrics.totalNetMonthlyCashflow < 0) {
      bullets.push(t('dashboard.suggestedFocusCashflow'));
    }

    return bullets.slice(0, 3);
  }, [
    availableCashReserve.monthsCovered,
    metrics.debtToValueRatio,
    metrics.totalNetMonthlyCashflow,
    realEstateSharePct,
    t,
  ]);


  return (
    <div className="space-y-2 pb-2">
      <section className="relative">
        <div className="grid gap-3.5 xl:grid-cols-3">
          <HeroKpiCard
            title={t('dashboard.totalNetWorth')}
            value={formatValuationCurrency(metrics.totalNetWorth)}
            subtitle={t('dashboard.heroNetWorthSubtitle')}
            icon={<Wallet className="h-5 w-5" />}
            deltaText={
              netWorthModeledMonthlyLift !== 0
                ? t('dashboard.modeledMonthlyChange', {
                    amount: formatValuationCurrency(Math.abs(netWorthModeledMonthlyLift)),
                  })
                : undefined
            }
            deltaToneClassName={
              netWorthModeledMonthlyLift >= 0
                ? dashboardMetricToneClass.success
                : dashboardMetricToneClass.danger
            }
            deltaIcon={
              netWorthModeledMonthlyLift >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )
            }
          />
          <HeroKpiCard
            title={t('dashboard.netMonthlyCashflow')}
            value={formatOperatingCurrency(metrics.totalNetMonthlyCashflow)}
            subtitle={t('dashboard.heroCashflowSubtitle')}
            icon={<BarChart3 className="h-5 w-5" />}
            toneClassName={
              metrics.totalNetMonthlyCashflow >= 0
                ? dashboardMetricToneClass.success
                : dashboardMetricToneClass.danger
            }
            badgeText={`${t('dashboard.annualizedCashflow')}: ${formatOperatingCurrency(metrics.annualizedCashflow)}`}
          />
          <HeroKpiCard
            title={t('dashboard.totalPortfolioValue')}
            value={formatValuationCurrency(totalGrossPortfolioValue)}
            subtitle={t('dashboard.heroPortfolioValueSubtitle')}
            icon={<Building2 className="h-5 w-5" />}
            deltaText={
              grossPortfolioModeledMonthlyLift !== 0
                ? t('dashboard.modeledMonthlyChange', {
                    amount: formatValuationCurrency(Math.abs(grossPortfolioModeledMonthlyLift)),
                  })
                : undefined
            }
            deltaToneClassName={
              grossPortfolioModeledMonthlyLift >= 0
                ? dashboardMetricToneClass.success
                : dashboardMetricToneClass.danger
            }
            deltaIcon={
              grossPortfolioModeledMonthlyLift >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )
            }
          />
        </div>
        <div className="pt-2 sm:pt-0">
          <button
            type="button"
            onClick={() => setShowWealthEditor(true)}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(21,43,71,0.14)] bg-[var(--app-button-primary-bg)] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_-24px_rgba(21,43,71,0.34)] transition hover:-translate-y-[1px] sm:absolute sm:right-5 sm:top-3 sm:z-10"
          >
            <PencilLine className="h-4 w-4" />
            {t('dashboard.editWealthInputs')}
          </button>
        </div>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-4">
        <div className={`${baseCardClassName} flex h-full flex-col gap-4 px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{t('dashboard.availableCash')}</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardMetricToneClass.success}`}>
                {formatValuationCurrency(metrics.availableCash)}
              </p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>{t('dashboard.liquidCashOnHand')}</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(34,197,94,0.08)] text-[#15803d]`}>
              <PiggyBank className="h-5 w-5" />
            </div>
          </div>

          {availableCashReserve.targetReserve > 0 ? (
            <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <SectionEyebrow>{t('dashboard.reserveTarget')}</SectionEyebrow>
                <p className={`text-[13px] font-semibold ${dashboardLightMutedTextClass}`}>
                  {formatValuationCurrency(availableCashReserve.targetReserve)}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar value={availableCashReserve.progressPct} color="#14b87a" />
                </div>
                <InlineBadge>
                  {formatPercentage(availableCashReserve.progressPct)}
                </InlineBadge>
              </div>
              {availableCashReserve.monthsCovered !== null ? (
                <p className={`mt-2 text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>
                  {t('dashboard.monthsCoveredLine', {
                    months: availableCashReserve.monthsCovered.toFixed(1),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          <InsightPanel
            icon={<ShieldCheck className="h-5 w-5 text-[#16a34a]" />}
            title={t('dashboard.healthyLiquidityBuffer')}
            text={
              availableCashReserve.targetReserve > 0 && metrics.availableCash >= availableCashReserve.targetReserve
                ? t('dashboard.aboveTargetReserve')
                : t('dashboard.cashReserveNeedsAttention')
            }
            toneClassName="border-[rgba(22,163,74,0.14)] bg-[rgba(236,253,245,0.94)] text-[#166534]"
          />
        </div>

        <div className={`${baseCardClassName} flex h-full flex-col gap-4 px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{t('dashboard.investmentsValue')}</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardMetricToneClass.info}`}>
                {formatValuationCurrency(metrics.investmentsValue)}
              </p>
              {investmentSnapshot.reliable ? (
                <div
                  className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold ${
                    investmentSnapshot.reliableMonthlyDelta >= 0
                      ? dashboardMetricToneClass.success
                      : dashboardMetricToneClass.danger
                  }`}
                >
                  {investmentSnapshot.reliableMonthlyDelta >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  <span>
                    {formatValuationCurrency(Math.abs(investmentSnapshot.reliableMonthlyDelta))} (
                    {formatPercentage(Math.abs(investmentSnapshot.monthlyDeltaPct))}) {t('dashboard.last30Days')}
                  </span>
                </div>
              ) : null}
              <p className={`mt-2 text-[13px] leading-5 ${dashboardLightMutedTextClass}`}>
                {t('dashboard.investmentsValueDetailedSubtitle')}
              </p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(37,99,235,0.08)] text-[#2563eb]`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-[12px] font-semibold">
              <span className={dashboardLightMutedTextClass}>
                {formatValuationCurrency(investmentSnapshot.trendStartValue)}
              </span>
              <span className={dashboardMetricToneClass.info}>
                {formatValuationCurrency(investmentSnapshot.trendEndValue)}
              </span>
            </div>
            {investmentSnapshot.trendSeries ? (
              <MiniTrendChart
                points={investmentSnapshot.trendSeries}
                color="#2563eb"
                gradientId="dashboard-investment-trend"
              />
            ) : (
              <div className="mt-3 rounded-[16px] border border-dashed border-[rgba(37,99,235,0.18)] bg-[rgba(239,246,255,0.7)] px-3 py-3">
                <p className={`text-[12px] leading-5 ${dashboardLightMutedTextClass}`}>
                  {t('dashboard.investmentTrendLimited')}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[rgba(37,99,235,0.12)] bg-[rgba(239,246,255,0.9)] px-4 py-3 text-[#1e3a8a]">
            <p className="text-[13px] font-semibold">
              {t('dashboard.largestAllocationLine', {
                type: investmentSnapshot.topTypeLabel,
                percentage: formatPercentage(investmentSnapshot.topTypeShare),
              })}
            </p>
            <p className="mt-1 text-[12px] leading-5 opacity-85">
              {t('dashboard.diversifiedAcrossAssetTypes', {
                count: investmentSnapshot.assetTypeCount,
              })}
            </p>
          </div>
        </div>

        <div className={`${baseCardClassName} flex h-full flex-col gap-4 px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{t('dashboard.totalEquity')}</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardMetricToneClass.success}`}>
                {formatValuationCurrency(metrics.totalEquity)}
              </p>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold ${dashboardMetricToneClass.success}`}>
                <ArrowUpRight className="h-4 w-4" />
                <span>
                  {formatValuationCurrency(equityMonthlyDelta)} ({formatPercentage(
                    metrics.totalEquity > 0 ? (equityMonthlyDelta / metrics.totalEquity) * 100 : 0
                  )}) {t('dashboard.fromAmortizationVsLastMonth')}
                </span>
              </div>
              <p className={`mt-2 text-[13px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboard.equityCardSubtitle')}</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(34,197,94,0.08)] text-[#15803d]`}>
              <Landmark className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <SectionEyebrow>{t('dashboard.equityTrend6Months')}</SectionEyebrow>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[12px] font-semibold">
              <span className={dashboardLightMutedTextClass}>{formatValuationCurrency(equityTrend[0]?.value ?? metrics.totalEquity)}</span>
              <span className={dashboardMetricToneClass.success}>{formatValuationCurrency(equityTrend[equityTrend.length - 1]?.value ?? metrics.totalEquity)}</span>
            </div>
            <MiniTrendChart
              points={equityTrend}
              color="#18a56b"
              gradientId="dashboard-equity-trend"
            />
          </div>

          <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
            <div className="flex h-3 overflow-hidden rounded-full bg-[rgba(148,163,184,0.22)]">
              <div
                className="h-full bg-[#18a56b]"
                style={{ width: `${clampPercentage(metrics.equityPercentage)}%` }}
              />
              <div
                className="h-full bg-[#7c8798]"
                style={{ width: `${clampPercentage(100 - metrics.equityPercentage)}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="font-semibold text-[#14834f]">
                  {formatPercentage(metrics.equityPercentage)} {t('dashboard.equityLabel')}
                </p>
                <p className={`mt-1 text-[16px] font-semibold ${dashboardLightValueClass}`}>{formatValuationCurrency(metrics.totalEquity)}</p>
              </div>
              <div>
                <p className="font-semibold text-[#475569]">
                  {formatPercentage(100 - metrics.equityPercentage)} {t('dashboard.totalDebt')}
                </p>
                <p className={`mt-1 text-[16px] font-semibold ${dashboardLightValueClass}`}>{formatValuationCurrency(metrics.totalDebt)}</p>
              </div>
            </div>
          </div>

          <InsightPanel
            icon={<TrendingUp className="h-5 w-5 text-[#16a34a]" />}
            title={t('dashboard.equityIsGrowing')}
            text={t('dashboard.equityIsGrowingText')}
            toneClassName="border-[rgba(22,163,74,0.14)] bg-[rgba(236,253,245,0.94)] text-[#166534]"
          />
        </div>

        <div className={`${baseCardClassName} flex h-full flex-col gap-4 px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[14px] font-semibold ${dashboardLightLabelClass}`}>{t('dashboard.totalDebt')}</p>
              <p className={`mt-2 text-[2.05rem] font-bold tracking-[-0.04em] ${dashboardMetricToneClass.danger}`}>
                {formatValuationCurrency(metrics.totalDebt)}
              </p>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold ${dashboardMetricToneClass.success}`}>
                <ArrowDownRight className="h-4 w-4" />
                <span>
                  {formatValuationCurrency(debtMonthlyDelta)} ({formatPercentage(
                    metrics.totalDebt > 0 ? (debtMonthlyDelta / metrics.totalDebt) * 100 : 0
                  )}) {t('dashboard.vsLastMonth')}
                </span>
              </div>
              <p className={`mt-2 text-[13px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboard.debtCardSubtitle')}</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px] bg-[rgba(239,68,68,0.08)] text-[#dc2626]`}>
              <Wallet className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
            <SectionEyebrow>{t('dashboard.debtReduction6Months')}</SectionEyebrow>
            <div className="mt-2 flex items-center justify-between gap-3 text-[12px] font-semibold">
              <span className={dashboardLightMutedTextClass}>{formatValuationCurrency(debtTrend[0]?.value ?? metrics.totalDebt)}</span>
              <span className={dashboardMetricToneClass.danger}>{formatValuationCurrency(debtTrend[debtTrend.length - 1]?.value ?? metrics.totalDebt)}</span>
            </div>
            <MiniTrendChart
              points={debtTrend}
              color="#d83a4c"
              gradientId="dashboard-debt-trend"
            />
          </div>

          <div className="rounded-[20px] border border-[var(--dashboard-border)] bg-[rgba(248,250,252,0.86)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>{t('dashboard.debtToValueLtv')}</SectionEyebrow>
              <p className={`text-[12px] font-semibold ${dashboardLightMutedTextClass}`}>{t('dashboard.ltvTarget')}</p>
            </div>
            <div className="mt-3">
              <ProgressBar value={metrics.debtToValueRatio} color="#d83a4c" />
            </div>
            <p className={`mt-2 text-[13px] font-semibold ${dashboardMetricToneClass.danger}`}>
              {formatPercentage(metrics.debtToValueRatio)} {t('dashboard.ltvShort')}
            </p>
            {mortgages.length > 0 && avgMortgageRate !== null ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <InlineBadge tone="blue">
                  {t('dashboard.mortgagesCount', { count: mortgages.length })}
                </InlineBadge>
                <InlineBadge tone="red">
                  {t('dashboard.avgRate', { rate: formatPercentage(avgMortgageRate) })}
                </InlineBadge>
              </div>
            ) : null}
          </div>

          <InsightPanel
            icon={<TrendingDown className="h-5 w-5 text-[#ea580c]" />}
            title={t('dashboard.debtTrendingDown')}
            text={t('dashboard.debtTrendingDownText')}
            toneClassName="border-[rgba(249,115,22,0.16)] bg-[rgba(255,247,237,0.95)] text-[#9a3412]"
          />
        </div>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-2">
        {totalPortfolioMix.length >= 2 ? (
          <PortfolioCompositionChart
            title={t('dashboard.portfolioStructure')}
            subtitle={t('dashboard.totalPortfolioStructureSubtitle')}
            centerLabel={t('dashboard.totalPortfolioValue')}
            centerValue={totalGrossPortfolioValue}
            segments={totalPortfolioMix}
            displayCurrency={metrics.valuationDisplayCurrency}
            compact
            insightTitle={t('dashboard.whatThisMeans')}
            insightBullets={portfolioStructureBullets}
            insightTone="neutral"
          />
        ) : null}

        {realEstateMix.length >= 2 ? (
          <PortfolioCompositionChart
            title={t('dashboard.realEstateStructure')}
            subtitle={t('dashboard.realEstateStructureSubtitle')}
            centerLabel={t('dashboard.realEstateValue')}
            centerValue={metrics.totalPortfolioValue}
            segments={realEstateMix}
            displayCurrency={metrics.valuationDisplayCurrency}
            compact
            insightTitle={t('dashboard.whatThisMeans')}
            insightBullets={realEstateStructureBullets}
            insightTone="success"
          />
        ) : null}
      </section>

      <section className="grid gap-3.5 xl:grid-cols-2">
        <div className={`${baseCardClassName} px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[1rem] font-semibold ${dashboardLightValueClass}`}>{t('dashboard.cashflowBreakdown')}</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px]`}>
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--dashboard-border)] bg-white/75 px-4 py-3">
              <div>
                <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{t('dashboard.rentIncome')}</p>
              </div>
              <div className="text-right">
                <p className={`text-[16px] font-semibold ${dashboardLightValueClass}`}>{formatOperatingCurrency(metrics.totalMonthlyRent)}</p>
                {occupancyRate !== null ? (
                  <p className={`mt-1 text-[12px] ${dashboardMetricToneClass.success}`}>
                    {t('dashboard.occupancyHelper', {
                      percentage: formatPercentage(occupancyRate),
                    })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--dashboard-border)] bg-white/75 px-4 py-3">
              <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{t('dashboard.monthlyOperatingExpenses')}</p>
              <p className={`text-[16px] font-semibold ${dashboardMetricToneClass.danger}`}>{formatOperatingCurrency(metrics.totalMonthlyOperatingExpenses)}</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--dashboard-border)] bg-white/75 px-4 py-3">
              <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{t('dashboard.mortgagePayments')}</p>
              <p className={`text-[16px] font-semibold ${dashboardMetricToneClass.warning}`}>{formatOperatingCurrency(metrics.totalMonthlyMortgagePayments)}</p>
            </div>
          </div>

          {cashflowSummaryBullets.length > 0 ? (
            <div className="mt-4 rounded-[20px] border border-[rgba(37,99,235,0.12)] bg-[rgba(239,246,255,0.88)] px-4 py-3 text-[#1e3a8a]">
              <p className="text-[14px] font-semibold">{t('dashboard.cashflowSummary')}</p>
              <ul className="mt-2 space-y-1.5 pl-4 text-[12px] leading-5">
                {cashflowSummaryBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className={`${baseCardClassName} px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[1rem] font-semibold ${dashboardLightValueClass}`}>{t('dashboard.keyInsightsTitle')}</p>
            </div>
            <div className={`${dashboardLightIconChipClass} flex h-10 w-10 items-center justify-center rounded-[15px]`}>
              <Target className="h-5 w-5" />
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {keyInsights.map((insight) => (
              <li key={insight} className="flex items-start gap-3 rounded-[18px] border border-[var(--dashboard-border)] bg-white/75 px-4 py-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(22,163,74,0.08)] text-[#15803d]">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <p className={`text-[14px] leading-6 ${dashboardLightValueClass}`}>{insight}</p>
              </li>
            ))}
          </ul>

          {suggestedFocusBullets.length > 0 ? (
            <div className="mt-4 rounded-[20px] border border-[rgba(249,115,22,0.14)] bg-[rgba(255,247,237,0.92)] px-4 py-3 text-[#9a3412]">
              <p className="text-[14px] font-semibold">{t('dashboard.suggestedFocusTitle')}</p>
              <ul className="mt-2 space-y-1.5 pl-4 text-[12px] leading-5">
                {suggestedFocusBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {showWealthEditor ? (
        <WealthAccountsEditor
          cashAccounts={cashAccounts}
          investmentAccounts={investmentAccounts}
          onChangeCashAccounts={onUpdateCashAccounts}
          onChangeInvestmentAccounts={onUpdateInvestmentAccounts}
          onConnectEtoroAccount={onConnectEtoroAccount}
          onSyncInvestmentAccount={onSyncInvestmentAccount}
          onClose={() => setShowWealthEditor(false)}
        />
      ) : null}
    </div>
  );
};
