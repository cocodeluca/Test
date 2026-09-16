import React, { useMemo } from 'react';
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Droplets,
  Info,
  Landmark,
  Plus,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { CashAccount, ExpenseObligation, ExpensePayment, Mortgage, Property, RentPayment, RentReceivable } from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';
import type { PortfolioAlert } from '../../../common/utils/alerts';
import { generatePortfolioAlerts } from '../../../common/utils/alerts';
import { generateRentReceivables } from '../../../common/utils/rentCollection';
import {
  calculateAllPropertyMetrics,
  calculateMortgageDebtPaydown,
  calculatePortfolioTaxPreview,
} from '../../../common/utils/calculations';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { formatCurrencyValue, formatPercentage } from '../../../common/utils/formatting';
import { DashboardCard } from '../components/dashboard/DashboardSections';
import { useSettings } from '../context/SettingsContext';
import { useResolvedGalleryUrls } from '../hooks/useResolvedGalleryUrls';
import {
  dashboardLightIconChipClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
} from '../styles/dashboardTheme';
import {
  buildPropertiesOnlyDashboardViewModel,
  type DashboardCoverage,
  type DashboardCoveredAmount,
  type PropertiesOnlyDashboardViewModel,
  type PropertiesOnlyPropertyRow,
} from './propertiesOnlyDashboardViewModel';

type Translate = (key: string, replacements?: Record<string, string | number>) => string;

interface PropertiesOnlyDashboardProps {
  properties: Property[];
  mortgages: Mortgage[];
  cashAccounts: CashAccount[];
  onAddProperty: () => void;
  onOpenProperties: () => void;
  rentReceivables: RentReceivable[];
  rentPayments: RentPayment[];
  onOpenRentCollection: () => void;
  expenseObligations: ExpenseObligation[];
  expensePayments: ExpensePayment[];
  onOpenExpenses: () => void;
}

const panelClassName = 'properties-only-panel';
const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));
const primaryIconClassName = 'properties-only-icon-primary';
const successIconClassName = 'properties-only-icon-success';
const warningIconClassName = 'properties-only-icon-warning';
const expensesIconClassName = 'properties-only-icon-expenses';
const neutralIconClassName = 'properties-only-icon-neutral';

const getMostCommonCurrency = (
  currencies: DisplayCurrency[],
  fallback: DisplayCurrency
): DisplayCurrency => {
  const counts = currencies.reduce<Map<DisplayCurrency, number>>((result, currency) => {
    result.set(currency, (result.get(currency) ?? 0) + 1);
    return result;
  }, new Map());

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
};

const CoverageNote: React.FC<{
  coverage: DashboardCoverage;
  t: Translate;
}> = ({ coverage, t }) => {
  if (coverage.status === 'available') {
    return null;
  }

  const text = coverage.status === 'partial'
    ? t('dashboardUi.propertiesOnly.coveragePartial', {
        covered: coverage.coveredCount,
        total: coverage.totalCount,
      })
    : t('dashboardUi.propertiesOnly.coverageUnavailable');

  return (
    <p
      className={`mt-2 flex items-center gap-1.5 text-[12px] font-medium ${
        coverage.status === 'partial' ? 'text-amber-700' : 'text-rose-700'
      }`}
      data-fx-coverage={coverage.status}
    >
      <Info className="h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
};

const formatAmount = (value: number | null, currency: DisplayCurrency) =>
  value === null
    ? '—'
    : formatCurrencyValue(value, currency, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

const formatBalanceSheetDebt = (value: number | null, currency: DisplayCurrency) =>
  value === null ? '—' : `−${formatAmount(Math.abs(value), currency)}`;

const CoveredAmount: React.FC<{
  amount: DashboardCoveredAmount;
  currency: DisplayCurrency;
  t: Translate;
  className?: string;
  metricId?: string;
  showUnavailableCurrency?: boolean;
}> = ({ amount, currency, t, className = '', metricId, showUnavailableCurrency = true }) => (
  <div
    data-dashboard-metric={metricId}
    data-raw-value={amount.value ?? 'unavailable'}
    data-currency={currency}
    data-coverage={amount.coverage.status}
    data-covered-count={amount.coverage.coveredCount}
    data-total-count={amount.coverage.totalCount}
  >
    <p className={className} data-formatted-value>
      {formatAmount(amount.value, currency)}
      {amount.value === null && showUnavailableCurrency ? (
        <span
          className={`ml-2 text-[12px] font-semibold ${dashboardLightMutedTextClass}`}
          title={t('dashboardUi.propertiesOnly.fxUnavailableCurrency', { currency })}
        >
          {currency}
        </span>
      ) : null}
    </p>
    <CoverageNote coverage={amount.coverage} t={t} />
  </div>
);

const MetricCard: React.FC<{
  title: string;
  description: string;
  amount: DashboardCoveredAmount;
  currency: DisplayCurrency;
  icon: React.ReactNode;
  toneClassName?: string;
  t: Translate;
  badge?: React.ReactNode;
  tooltip?: string;
  metricId: string;
  iconClassName?: string;
  cardClassName?: string;
  showUnavailableCurrency?: boolean;
}> = ({ title, description, amount, currency, icon, toneClassName, t, badge, tooltip, metricId, iconClassName = primaryIconClassName, cardClassName = '', showUnavailableCurrency }) => (
  <DashboardCard className={`${panelClassName} properties-only-kpi-card ${cardClassName}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <p className={`properties-only-kpi-title font-semibold leading-5 ${dashboardLightLabelClass}`}>{title}</p>
        {tooltip ? <span title={tooltip}><Info className="h-3.5 w-3.5 text-slate-400" aria-label={tooltip} /></span> : null}
      </div>
      <span className={`properties-only-kpi-icon flex shrink-0 items-center justify-center rounded-[12px] ${dashboardLightIconChipClass} ${iconClassName}`}>
        {icon}
      </span>
    </div>
    <CoveredAmount
      amount={amount}
      currency={currency}
      t={t}
      metricId={metricId}
      showUnavailableCurrency={showUnavailableCurrency}
      className={`properties-only-kpi-value mt-4 font-bold leading-none tracking-[-0.045em] ${
        toneClassName ?? dashboardLightValueClass
      }`}
    />
    <div className="properties-only-kpi-footer mt-4">
      {badge}
      <p className={`${badge ? 'mt-2' : ''} properties-only-kpi-description leading-[1.35rem] ${dashboardLightMutedTextClass}`}>{description}</p>
    </div>
  </DashboardCard>
);

const CardHeading: React.FC<{
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  iconClassName?: string;
}> = ({ title, icon, action, iconClassName = primaryIconClassName }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[11px] 2xl:h-9.5 2xl:w-9.5 ${dashboardLightIconChipClass} ${iconClassName}`}>
        {icon}
      </span>
      <h2 className={`text-[15px] font-semibold leading-5 2xl:text-[16px] ${dashboardLightValueClass}`}>{title}</h2>
    </div>
    {action}
  </div>
);

interface PropertiesOnlyMortgageDebtCardProps {
  debt: PropertiesOnlyDashboardViewModel['debt'];
  currency: DisplayCurrency;
  t: Translate;
}

export const PropertiesOnlyMortgageDebtCard: React.FC<PropertiesOnlyMortgageDebtCardProps> = ({
  debt,
  currency,
  t,
}) => {
  const debtReduction = debt.current.value !== null && debt.projectedAfter12Months !== null
    ? debt.current.value - debt.projectedAfter12Months
    : null;
  const debtReductionPercentage = debt.current.value !== null && debt.current.value > 0 && debtReduction !== null
    ? (debtReduction / debt.current.value) * 100
    : null;

  return (
    <DashboardCard className={`${panelClassName} properties-only-mortgage-debt-card`}>
      <div className="flex flex-col" data-dashboard-card="mortgage-debt">
        <CardHeading
          title={t('dashboardUi.propertiesOnly.mortgageDebtTitle')}
          icon={<Landmark className="h-4 w-4" />}
          iconClassName={neutralIconClassName}
        />
        <p className={`properties-only-summary-value mt-3.5 font-bold leading-none tracking-[-0.05em] ${dashboardLightValueClass}`}>
          {formatAmount(debt.current.value, currency)}
        </p>
        <p className={`mt-1 text-[14px] font-medium 2xl:text-[14.5px] ${dashboardLightMutedTextClass}`}>
          {t('dashboardUi.propertiesOnly.outstandingBalance')}
        </p>
        <CoverageNote coverage={debt.current.coverage} t={t} />
        {(debt.unverifiedMortgageCount ?? 0) > 0 ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t('dashboardUi.unverifiedMortgageDebt', {
              count: debt.unverifiedMortgageCount ?? 0,
              amount: formatAmount(debt.unverifiedOutstandingBalance ?? null, currency),
            })}
          </p>
        ) : null}
        {(debt.paidMortgageConflictCount ?? 0) > 0 ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t('dashboardUi.paidMortgageConflict', {
              count: debt.paidMortgageConflictCount ?? 0,
              amount: formatAmount(debt.paidMortgageConflictBalance ?? null, currency),
            })}
          </p>
        ) : null}

        <div className="properties-only-debt-detail-grid mt-3 grid gap-2 sm:grid-cols-2">
          <div className="properties-only-debt-mini-card rounded-[16px] border border-[#e5eaf0] bg-[#f8fafc] p-2.5 dark:border-[#e5eaf0] dark:bg-[#f8fafc]">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${dashboardLightIconChipClass} ${primaryIconClassName}`}>
                <CalendarDays className="h-4 w-4" />
              </span>
              <p className={`text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.nextPaymentTitle')}</p>
            </div>
            <p className={`mt-2.5 text-[1.75rem] font-bold leading-none tracking-[-0.04em] ${dashboardLightValueClass}`}>
              {formatAmount(debt.nextPaymentPrincipal, currency)}
            </p>
            <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.principalLabel')}</p>
          </div>
          <div className="properties-only-debt-mini-card rounded-[16px] border border-[#e5eaf0] bg-[#f8fafc] p-2.5 dark:border-[#e5eaf0] dark:bg-[#f8fafc]">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${dashboardLightIconChipClass} ${primaryIconClassName}`}>
                <TrendingUp className="h-4 w-4" />
              </span>
              <p className={`text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.next12MonthsTitle')}</p>
            </div>
            <div className="properties-only-debt-year-stack mt-2.5 space-y-2">
              <div>
                <p className={`text-[1.65rem] font-bold leading-none tracking-[-0.04em] ${dashboardLightValueClass}`}>{formatAmount(debt.next12MonthsPrincipal, currency)}</p>
                <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.principalAmortizedLabel')}</p>
              </div>
              <div className="properties-only-debt-year-separator border-t border-slate-200/70 pt-2 dark:border-slate-700/50">
                <p className={`text-[1.65rem] font-bold leading-none tracking-[-0.04em] ${dashboardLightValueClass}`}>{formatAmount(debt.next12MonthsInterest, currency)}</p>
                <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.interestLabel')}</p>
              </div>
            </div>
          </div>
        </div>

        {debt.current.value !== null && debt.projectedAfter12Months !== null ? (
          <div className="properties-only-debt-projection mt-2.5 rounded-[16px] border border-[#e5eaf0] p-2.5 dark:border-[#e5eaf0]">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${dashboardLightIconChipClass} ${primaryIconClassName}`}>
                <TrendingUp className="h-4 w-4" />
              </span>
              <h3 className={`text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.projectionTitle')}</h3>
            </div>
            <div className="properties-only-debt-projection-grid mt-2.5 grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-2">
              <div>
                <p className={`text-[1.25rem] font-bold leading-none tracking-[-0.03em] ${dashboardLightValueClass}`}>{formatAmount(debt.current.value, currency)}</p>
                <p className={`mt-1 text-[11.5px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.debtToday')}</p>
              </div>
              <div className="flex items-center px-1 text-blue-300 dark:text-blue-700" aria-hidden="true">
                <span className="h-px flex-1 bg-blue-200/80 dark:bg-blue-800/70" />
                <ArrowRight className="h-5 w-5 shrink-0" />
              </div>
              <div className="text-right">
                <p className={`text-[1.25rem] font-bold leading-none tracking-[-0.03em] ${dashboardLightValueClass}`}>{formatAmount(debt.projectedAfter12Months, currency)}</p>
                <p className={`mt-1 text-[11.5px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.debtIn12Months')}</p>
              </div>
            </div>
            {debtReduction !== null && debtReduction > 0 && debtReductionPercentage !== null ? (
              <div className="properties-only-debt-projection-badge mx-auto mt-2.5 flex w-fit items-center gap-2 rounded-full bg-[#ecfdf5] px-3 py-1.5 text-[12px] font-semibold text-[#168a54] dark:bg-[#064e3b] dark:text-[#a7f3d0]">
                <span>↓ {t('dashboardUi.propertiesOnly.amortizationBadge', { amount: formatAmount(debtReduction, currency) })}</span>
                <span className="h-4 w-px bg-emerald-200 dark:bg-emerald-800" />
                <span>-{formatPercentage(debtReductionPercentage)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Legacy progress-bar markup retained below for reference only. */}
        {/*
        {false && debtRemainingPercentage !== null && debt.current.value !== null && debt.projectedAfter12Months !== null ? (
            {(debtReduction ?? 0) > 0 ? (
              <p className="mt-2 text-right text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                ↓ {t('dashboardUi.propertiesOnly.principalRepaid', {
                  amount: formatAmount(debtReduction ?? 0, currency),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        */}
        <CoverageNote coverage={debt.projectionCoverage} t={t} />
      </div>
    </DashboardCard>
  );
};

export const PropertiesOnlyOwnCapitalCard: React.FC<{
  amount: DashboardCoveredAmount;
  currency: DisplayCurrency;
  t: Translate;
  properties?: PropertiesOnlyPropertyRow[];
  onOpenProperties?: () => void;
}> = ({ amount, currency, t, properties = [], onOpenProperties = () => undefined }) => {
  const allRows = properties
    .filter((property) => property.investedCapital !== null && property.investedCapital > 0)
    .sort((a, b) => (b.investedCapital ?? 0) - (a.investedCapital ?? 0));
  const rows = allRows.slice(0, 5);
  const total = amount.value ?? allRows.reduce((sum, property) => sum + (property.investedCapital ?? 0), 0);

  return (
    <DashboardCard className={`${panelClassName} properties-only-own-capital-card`}>
      <CardHeading
        title={t('dashboardUi.propertiesOnly.ownCapitalInvestedTitle')}
        icon={<Coins className="h-4 w-4" />}
        iconClassName={primaryIconClassName}
      />
      <CoveredAmount
        amount={amount}
        currency={currency}
        t={t}
        metricId="own-capital-invested"
        className={`properties-only-own-capital-value mt-3.5 text-[2.55rem] font-bold leading-none tracking-[-0.055em] 2xl:text-[2.85rem] ${dashboardLightValueClass}`}
      />
      {rows.length > 0 ? (
        <div className="mt-4" data-dashboard-breakdown="own-capital-by-property">
          <h3 className={`text-[12.5px] font-semibold ${dashboardLightMutedTextClass}`}>
            {t('dashboardUi.propertiesOnly.propertyBreakdownTitle')}
          </h3>
          <div className="mt-2 space-y-0">
            {rows.map((property) => {
              const value = property.investedCapital ?? 0;
              const percentage = total > 0 ? (value / total) * 100 : 0;
              const propertyLabel = ((property.city || property.name).split(',')[0] || property.name).trim();
              return (
                <div key={property.id} className="properties-only-own-capital-row grid grid-cols-[minmax(4.5rem,0.8fr)_minmax(3.5rem,1fr)_auto_auto] items-center gap-2 border-b border-slate-100/35 py-2 last:border-b-0 dark:border-slate-800/35" data-property-name={property.name} data-property-percentage={Math.round(percentage)}>
                  <span className={`min-w-0 truncate text-[12px] font-medium ${dashboardLightValueClass}`}>{propertyLabel}</span>
                  <div className="h-1 overflow-hidden rounded-full bg-slate-100/40 dark:bg-slate-800/30" role="progressbar" aria-label={`${propertyLabel}: ${Math.round(percentage)}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
                    <div className="h-full rounded-full bg-blue-400/80" style={{ width: `${clampPercentage(percentage)}%` }} />
                  </div>
                  <span className={`whitespace-nowrap text-right text-[11.5px] font-semibold tabular-nums ${dashboardLightValueClass}`}>{formatAmount(value, currency)}</span>
                  <span className="w-8 text-right text-[11.5px] font-normal tabular-nums text-slate-400 dark:text-slate-500">{Math.round(percentage)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {properties.length > 5 ? (
        <button type="button" onClick={onOpenProperties} className={`mt-3 inline-flex items-center gap-1 self-start text-[11.5px] font-semibold ${primaryIconClassName}`}>
          {t('dashboardUi.propertiesOnly.viewAllPropertiesCount', { count: properties.length })}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div className={`properties-only-own-capital-footer mt-4 border-t border-slate-200/70 pt-2.5 text-[11.5px] leading-[1.15rem] 2xl:text-[12px] dark:border-slate-800/70 ${dashboardLightMutedTextClass}`}>
        <p>{t('dashboardUi.propertiesOnly.ownCapitalInvestedDescription')}</p>
        <p className="mt-0.5">{t('dashboardUi.propertiesOnly.ownCapitalInvestedIncludes')}</p>
        <CoverageNote coverage={amount.coverage} t={t} />
      </div>
    </DashboardCard>
  );
};

const PropertyThumbnail: React.FC<{ row: PropertiesOnlyPropertyRow }> = ({ row }) => {
  const resolvedUrls = useResolvedGalleryUrls(row.imageRefs);
  const bundledImage = row.imageRefs.find((reference) => reference.startsWith('/property-images/'));
  const source = resolvedUrls[0] ?? bundledImage;

  return source ? (
    <img className="h-11 w-11 shrink-0 rounded-[10px] object-cover 2xl:h-12 2xl:w-12" src={source} alt="" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-500 2xl:h-12 2xl:w-12">
      <Building2 className="h-4 w-4" />
    </span>
  );
};

const getAlertTitle = (alert: PortfolioAlert, t: Translate) => {
  const keyByKind: Record<PortfolioAlert['kind'], string> = {
    'rent-update-upcoming': 'dashboardUi.alertsRentUpdateTitle',
    'lease-ending': 'dashboardUi.alertsLeaseEndingTitle',
    'lease-expired': 'dashboardUi.alertsLeaseExpiredTitle',
    'insurance-ending': 'dashboardUi.alertsInsuranceEndingTitle',
    'missing-lease-end-date': 'dashboardUi.alertsMissingDataTitle',
    'rent-overdue': 'dashboardUi.alertsRentOverdueTitle',
    'rent-payment-gap': 'dashboardUi.alertsPaymentGapTitle',
    'expense-overdue': 'nav.expenses',
  };

  return t(keyByKind[alert.kind]);
};

const getAlertTiming = (alert: PortfolioAlert, t: Translate) => {
  if (alert.daysUntil === undefined) return t('dashboardUi.alertsPending');
  if (alert.daysUntil === 0) return t('dashboardUi.alertsToday');
  if (alert.daysUntil < 0) {
    return t('dashboardUi.alertsOverdueDays', { count: Math.abs(alert.daysUntil) });
  }
  return t('dashboardUi.alertsInDays', { count: alert.daysUntil });
};

export const PropertiesOnlyDashboard: React.FC<PropertiesOnlyDashboardProps> = ({
  properties,
  mortgages,
  cashAccounts,
  onAddProperty,
  onOpenProperties,
  rentReceivables,
  rentPayments,
  onOpenRentCollection,
  expenseObligations,
  expensePayments,
  onOpenExpenses,
}) => {
  const { settings, t } = useSettings();
  const fxSnapshot = useMemo(
    () => Object.freeze({ ...getSettingsCurrencyRates(settings) }),
    [settings]
  );
  const propertyMetrics = useMemo(
    () => calculateAllPropertyMetrics(properties, mortgages, settings.currency, fxSnapshot),
    [fxSnapshot, mortgages, properties, settings.currency]
  );
  const hasTaxAssumptions = properties.length > 0 && properties.every((property) => {
    if (property.country === 'Spain') {
      return (property.spainEstimatedMarginalTaxRate ?? 0) > 0
        || (property.marginalTaxRate ?? 0) > 0
        || settings.taxProfile.estimatedMarginalTaxRate > 0;
    }

    return (property.estimatedAnnualTax ?? 0) > 0;
  });
  const taxProperties = useMemo(
    () => properties.map((property) =>
      property.country === 'Spain'
      && (property.spainEstimatedMarginalTaxRate ?? 0) <= 0
      && (property.marginalTaxRate ?? 0) <= 0
        ? {
            ...property,
            spainEstimatedMarginalTaxRate: settings.taxProfile.estimatedMarginalTaxRate,
          }
        : property
    ),
    [properties, settings.taxProfile.estimatedMarginalTaxRate]
  );
  const monthlyAfterTaxCashflow = useMemo(
    () => hasTaxAssumptions
      ? calculatePortfolioTaxPreview(taxProperties, mortgages, settings.currency, fxSnapshot)
        .estimatedMonthlyAfterTaxCashflow
      : null,
    [fxSnapshot, hasTaxAssumptions, mortgages, settings.currency, taxProperties]
  );
  const valuationDisplayCurrency = useMemo(
    () => getMostCommonCurrency(
      propertyMetrics.map((metric) => metric.valuationDisplayCurrency),
      settings.currency
    ),
    [propertyMetrics, settings.currency]
  );
  const operatingDisplayCurrency = settings.currency;
  const generatedRentReceivables = useMemo(
    () => generateRentReceivables(properties, rentReceivables, { payments: rentPayments }),
    [properties, rentPayments, rentReceivables]
  );
  const alerts = useMemo(
    () => generatePortfolioAlerts(properties, new Date(), generatedRentReceivables, rentPayments, expenseObligations, expensePayments),
    [expenseObligations, expensePayments, generatedRentReceivables, properties, rentPayments]
  );
  const debtPaydown = useMemo(
    () => calculateMortgageDebtPaydown({
      mortgages,
      properties,
      reportingCurrency: valuationDisplayCurrency,
      rateOverrides: fxSnapshot,
    }),
    [fxSnapshot, mortgages, properties, valuationDisplayCurrency]
  );
  const viewModel = useMemo(
    () => buildPropertiesOnlyDashboardViewModel({
      properties,
      propertyMetrics,
      cashAccounts,
      alerts,
      debtPaydown,
      valuationDisplayCurrency,
      operatingDisplayCurrency,
      fxRates: fxSnapshot,
      monthlyAfterTaxCashflow,
    }),
    [
      alerts,
      cashAccounts,
      debtPaydown,
      fxSnapshot,
      monthlyAfterTaxCashflow,
      operatingDisplayCurrency,
      properties,
      propertyMetrics,
      valuationDisplayCurrency,
    ]
  );
  const locale = settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US';
  const occupancyLegendSlices = [
    { key: 'occupied', label: t('dashboardUi.propertiesOnly.occupied'), value: viewModel.occupancy.occupiedCount, color: '#16a34a' },
    { key: 'vacant', label: t('dashboardUi.propertiesOnly.vacant'), value: viewModel.occupancy.vacantCount, color: '#94a3b8' },
    { key: 'pending', label: t('dashboardUi.propertiesOnly.pending'), value: viewModel.occupancy.pendingCount, color: '#f59e0b' },
    { key: 'unknown', label: t('dashboardUi.propertiesOnly.unknown'), value: viewModel.occupancy.unknownCount, color: '#e11d48' },
  ].filter((slice) => slice.key === 'occupied' || slice.key === 'vacant' || slice.value > 0);
  const occupancySlices = occupancyLegendSlices.filter((slice) => slice.value > 0);
  const occupancyHealthy = viewModel.occupancy.totalCount > 0 && viewModel.occupancy.rate >= 80 && viewModel.occupancy.pendingCount === 0 && viewModel.occupancy.unknownCount === 0;
  const equityPropertyRows = viewModel.properties
    .filter((property) => property.currentEstimatedValue !== null && property.currentEstimatedValue > 0)
    .sort((a, b) => (b.currentEstimatedValue ?? 0) - (a.currentEstimatedValue ?? 0));
  const equityVisiblePropertyRows = equityPropertyRows.slice(0, 5);
  const equityPropertyTotal = viewModel.valuation.value ?? equityPropertyRows.reduce((sum, property) => sum + (property.currentEstimatedValue ?? 0), 0);

  return (
    <div data-dashboard-variant="properties-only" className="properties-only-dashboard w-full min-w-0 pb-5">
      <header className="properties-only-header flex flex-col gap-3 px-0.5 py-1 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className={`properties-only-eyebrow text-[11.5px] font-semibold uppercase tracking-[0.15em] 2xl:text-[12px] ${dashboardLightLabelClass}`}>
            {t('dashboardUi.propertiesOnly.eyebrow')}
          </p>
          <h1 className={`properties-only-title mt-1 font-bold leading-tight tracking-[-0.04em] ${dashboardLightValueClass}`}>
            {t('dashboardUi.propertiesOnly.title')}
          </h1>
          <p className={`properties-only-subtitle mt-1.5 text-[14px] leading-5 2xl:text-[14.5px] ${dashboardLightMutedTextClass}`}>
            {t('dashboardUi.propertiesOnly.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center rounded-[11px] border border-[var(--dashboard-border)] bg-white px-3.5 text-[12.5px] font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {t('dashboardUi.propertiesOnly.mode')}
          </span>
          <button
            type="button"
            onClick={onAddProperty}
            className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[var(--app-button-primary-bg)] px-4 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[var(--app-button-primary-hover)]"
          >
            <Plus className="h-4 w-4" />
            {t('dashboardUi.propertiesOnly.addProperty')}
          </button>
        </div>
      </header>

      <section className="properties-only-kpi-grid grid items-stretch">
        <MetricCard
          title={t('dashboardUi.propertiesOnly.totalValueTitle')}
          description={t('dashboardUi.propertiesOnly.totalValueDescription')}
          amount={viewModel.valuation}
          currency={viewModel.valuationDisplayCurrency}
          icon={<Building2 className="h-5 w-5" />}
          metricId="valuation"
          t={t}
        />
        <MetricCard
          title={t('dashboardUi.propertiesOnly.grossRentTitle')}
          description={t('dashboardUi.propertiesOnly.grossRentDescription')}
          amount={viewModel.operating.grossRent}
          currency={viewModel.operatingDisplayCurrency}
          icon={<CircleDollarSign className="h-5 w-5" />}
          metricId="gross-rent"
          toneClassName={dashboardMetricToneClass.success}
          iconClassName={successIconClassName}
          t={t}
        />
        <MetricCard
          title={t('dashboardUi.propertiesOnly.totalMonthlyExpensesTitle')}
          description={t('dashboardUi.propertiesOnly.totalMonthlyExpensesDescription')}
          amount={viewModel.operating.totalMonthlyExpenses}
          currency={viewModel.operatingDisplayCurrency}
          icon={<WalletCards className="h-5 w-5" />}
          metricId="total-monthly-expenses"
          toneClassName="properties-only-expenses-value"
          iconClassName={expensesIconClassName}
          cardClassName="properties-only-expenses-card"
          t={t}
        />
        <MetricCard
          title={t('dashboardUi.propertiesOnly.netMonthlyCashflowTitle')}
          description={t('dashboardUi.propertiesOnly.netMonthlyCashflowDescription')}
          amount={viewModel.operating.netMonthlyCashflow}
          currency={viewModel.operatingDisplayCurrency}
          icon={<TrendingUp className="h-5 w-5" />}
          metricId="net-monthly-cashflow"
          toneClassName={(viewModel.operating.netMonthlyCashflow.value ?? 0) >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger}
          iconClassName={(viewModel.operating.netMonthlyCashflow.value ?? 0) >= 0 ? successIconClassName : warningIconClassName}
          badge={viewModel.operating.netMonthlyCashflow.value === null || viewModel.operating.grossRent.value === null || viewModel.operating.grossRent.value === 0 ? null : (
            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {t('dashboardUi.propertiesOnly.cashflowMargin', { value: formatPercentage((viewModel.operating.netMonthlyCashflow.value / viewModel.operating.grossRent.value) * 100) })}
            </span>
          )}
          t={t}
        />
        <MetricCard
          title={t('dashboardUi.propertiesOnly.afterTaxCashflowTitle')}
          description={t(hasTaxAssumptions ? 'dashboardUi.propertiesOnly.afterTaxCashflowDescription' : 'dashboardUi.propertiesOnly.setTaxAssumptions')}
          amount={viewModel.operating.afterTaxMonthlyCashflow}
          currency={viewModel.operatingDisplayCurrency}
          icon={<Landmark className="h-5 w-5" />}
          metricId="after-tax-monthly-cashflow"
          toneClassName={(viewModel.operating.afterTaxMonthlyCashflow.value ?? 0) >= 0 ? dashboardMetricToneClass.success : dashboardMetricToneClass.danger}
          iconClassName={primaryIconClassName}
          showUnavailableCurrency={hasTaxAssumptions}
          t={t}
        />
      </section>

      <section className="properties-only-summary-grid grid items-stretch">
        <DashboardCard className={`${panelClassName} properties-only-liquidity-card flex flex-col`}>
          <CardHeading
            title={t('dashboardUi.propertiesOnly.liquidityTitle')}
            icon={<Droplets className="h-4 w-4" />}
            iconClassName={primaryIconClassName}
          />
          <CoveredAmount
            amount={viewModel.liquidity}
            currency={viewModel.valuationDisplayCurrency}
            t={t}
            metricId="liquidity"
            className={`properties-only-summary-value mt-4 font-bold leading-none tracking-[-0.04em] ${dashboardLightValueClass}`}
          />
          <p className={`properties-only-liquidity-description mt-auto border-t border-[var(--dashboard-border)] pt-3.5 text-[12.5px] leading-[1.25rem] 2xl:text-[13px] ${dashboardLightMutedTextClass}`}>
            {viewModel.liquidity.coverage.totalCount === 0
              ? t('dashboardUi.propertiesOnly.liquidityEmpty')
              : t('dashboardUi.propertiesOnly.liquidityDescription')}
          </p>
        </DashboardCard>

        <PropertiesOnlyOwnCapitalCard
          amount={viewModel.ownCapitalInvested}
          currency={viewModel.valuationDisplayCurrency}
          properties={viewModel.properties}
          onOpenProperties={onOpenProperties}
          t={t}
        />

        <PropertiesOnlyMortgageDebtCard
          debt={viewModel.debt}
          currency={viewModel.valuationDisplayCurrency}
          t={t}
        />

        <DashboardCard className={`${panelClassName} properties-only-equity-card`}>
          <CardHeading
            title={t('dashboardUi.propertiesOnly.equityTitle')}
            icon={<Building2 className="h-4 w-4" />}
            iconClassName={primaryIconClassName}
          />
          <p className={`properties-only-summary-value mt-4 font-bold leading-none tracking-[-0.04em] ${dashboardLightValueClass}`}>
            {formatAmount(viewModel.equity.value, viewModel.valuationDisplayCurrency)}
          </p>
          <CoverageNote coverage={viewModel.equity.coverage} t={t} />
          <dl className="properties-only-equity-summary mt-3 space-y-2 border-t border-[var(--dashboard-border)] pt-2.5 text-[12.5px] 2xl:text-[13px]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><dt className={dashboardLightMutedTextClass}>{t('dashboardUi.propertiesOnly.propertyValue')}</dt><dd className={`whitespace-nowrap font-semibold tabular-nums ${dashboardLightValueClass}`}>{formatAmount(viewModel.valuation.value, viewModel.valuationDisplayCurrency)}</dd></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><dt className={dashboardLightMutedTextClass}>{t('dashboardUi.propertiesOnly.mortgageDebt')}</dt><dd className={`whitespace-nowrap font-semibold tabular-nums ${dashboardLightValueClass}`}>{formatBalanceSheetDebt(viewModel.debt.current.value, viewModel.valuationDisplayCurrency)}</dd></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--dashboard-border)] pt-2"><dt className={`font-medium ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.portfolioLtv')}</dt><dd className={`whitespace-nowrap font-bold tabular-nums ${dashboardLightValueClass}`}>{viewModel.equity.ltv === null ? '—' : formatPercentage(viewModel.equity.ltv)}</dd></div>
          </dl>
          {viewModel.equity.ltv !== null ? (
              <div className="properties-only-equity-ltv mt-2.5 border-t border-[var(--dashboard-border)] pt-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className={`font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.portfolioLtv')}</p>
                <p className={`font-bold tabular-nums ${dashboardLightValueClass}`}>{formatPercentage(viewModel.equity.ltv)}</p>
              </div>
              <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-700 dark:bg-slate-600" aria-label={t('dashboardUi.propertiesOnly.portfolioLtv')}>
                <div className="h-full bg-blue-500" style={{ width: `${clampPercentage(viewModel.equity.equityShare ?? 0)}%` }} />
                <div className="h-full flex-1 bg-slate-700 dark:bg-slate-600" />
              </div>
              <div className={`mt-0.5 flex justify-between text-[10.5px] 2xl:text-[11px] ${dashboardLightMutedTextClass}`}>
                <span>{formatPercentage(viewModel.equity.equityShare ?? 0)} {t('dashboardUi.propertiesOnly.equityShare')}</span>
                <span>{formatPercentage(viewModel.equity.ltv)} {t('dashboardUi.propertiesOnly.debtShare')}</span>
              </div>
            </div>
          ) : null}
          {equityPropertyRows.length > 0 ? (
            <div className="mt-2.5 border-t border-[var(--dashboard-border)] pt-2.5" data-dashboard-breakdown="property-values">
              <h3 className={`text-[13px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.propertyValuesTitle')}</h3>
              <div className="mt-1.5 space-y-0">
                {equityVisiblePropertyRows.map((property) => {
                  const value = property.currentEstimatedValue ?? 0;
                  const percentage = equityPropertyTotal > 0 ? (value / equityPropertyTotal) * 100 : 0;
                  const propertyLabel = property.name;
                  return (
                    <div key={property.id} className="properties-only-equity-row grid grid-cols-[minmax(4.5rem,0.8fr)_minmax(3.5rem,1fr)_auto_auto] items-center gap-2 border-b border-slate-100/60 py-1.25 last:border-b-0 dark:border-slate-800/50" data-property-name={property.name} data-property-percentage={percentage.toFixed(1)}>
                      <span className={`min-w-0 truncate text-[11.5px] font-medium ${dashboardLightValueClass}`}>{propertyLabel}</span>
                      <div className="h-1 overflow-hidden rounded-full bg-slate-100/70 dark:bg-slate-800/50" role="progressbar" aria-label={`${propertyLabel}: ${formatPercentage(percentage)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percentage.toFixed(1))}>
                        <div className="h-full rounded-full bg-blue-400/80" style={{ width: `${clampPercentage(percentage)}%` }} />
                      </div>
                      <span className={`whitespace-nowrap text-right text-[11px] font-semibold tabular-nums ${dashboardLightValueClass}`}>{formatAmount(value, viewModel.valuationDisplayCurrency)}</span>
                      <span className="w-8 text-right text-[11px] font-normal tabular-nums text-slate-400 dark:text-slate-500">{formatPercentage(percentage)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {viewModel.properties.length > 5 ? (
            <button type="button" onClick={onOpenProperties} className={`mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold ${primaryIconClassName}`}>
              {t('dashboardUi.propertiesOnly.viewAllPropertiesCount', { count: viewModel.properties.length })}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </DashboardCard>

      </section>

      <section className="properties-only-lower-grid grid items-stretch">
        <DashboardCard className={`${panelClassName} overflow-hidden`}>
          <CardHeading
            title={t('dashboardUi.propertiesOnly.resultsTitle')}
            icon={<CircleDollarSign className="h-4 w-4" />}
            iconClassName={successIconClassName}
          />
          <p className={`mt-2.5 text-[12px] leading-[1.2rem] 2xl:text-[12.5px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.resultsSubtitle')}</p>
          {viewModel.properties.length === 0 ? (
            <p className={`mt-8 text-center text-[13px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.propertiesEmpty')}</p>
          ) : (
            <div className="mt-3.5">
              <table className="w-full table-fixed text-left text-[12px] 2xl:text-[13px]">
                <colgroup>
                  <col className="w-[46%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead className={`border-b border-[var(--dashboard-border)] ${dashboardLightMutedTextClass}`}>
                  <tr><th className="pb-2 font-medium">{t('dashboardUi.propertiesOnly.property')}</th><th className="pb-2 pl-1 text-right font-medium">{t('dashboardUi.propertiesOnly.rent')}</th><th className="pb-2 pl-1 text-right font-medium">{t('dashboardUi.propertiesOnly.totalExpenses')}</th><th className="pb-2 pl-1 text-right font-medium">{t('dashboardUi.propertiesOnly.netCashflow')}</th></tr>
                </thead>
                <tbody>
                  {viewModel.properties.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--dashboard-border)] last:border-0">
                      <td className="py-3 2xl:py-3.5"><div className="flex min-w-0 items-center gap-3"><PropertyThumbnail row={row} /><div className="min-w-0"><p className={`truncate font-semibold ${dashboardLightValueClass}`}>{row.name}</p><p className={`mt-0.5 truncate text-[11.5px] ${dashboardLightMutedTextClass}`}>{row.city}</p></div></div></td>
                      {[row.monthlyRent, row.monthlyTotalExpenses, row.monthlyNetCashflow].map((value, index) => (
                        <td key={index} className={`whitespace-nowrap py-3 pl-1.5 text-right font-semibold tabular-nums 2xl:py-3.5 ${index === 2 && value !== null ? (value > 0 ? 'text-emerald-700 dark:text-emerald-300' : value < 0 ? 'text-rose-700 dark:text-rose-300' : dashboardLightValueClass) : dashboardLightValueClass}`} title={value === null ? t('dashboardUi.propertiesOnly.fxUnavailableCurrency', { currency: row.sourceOperatingCurrency }) : undefined}>
                          {value === null ? `— ${row.sourceOperatingCurrency}` : formatAmount(value, viewModel.operatingDisplayCurrency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[var(--dashboard-border)]">
                  <tr className={`font-bold ${dashboardLightValueClass}`}><td className="pt-3">{t('dashboardUi.propertiesOnly.portfolioTotal')}</td><td data-table-total="gross-rent" className="whitespace-nowrap pt-3 pl-1 text-right tabular-nums">{formatAmount(viewModel.operating.grossRent.value, viewModel.operatingDisplayCurrency)}</td><td data-table-total="total-monthly-expenses" className="whitespace-nowrap pt-3 pl-1 text-right tabular-nums">{formatAmount(viewModel.operating.totalMonthlyExpenses.value, viewModel.operatingDisplayCurrency)}</td><td data-table-total="net-monthly-cashflow" className={`whitespace-nowrap pt-3 pl-1 text-right tabular-nums ${(viewModel.operating.netMonthlyCashflow.value ?? 0) > 0 ? 'text-emerald-700 dark:text-emerald-300' : (viewModel.operating.netMonthlyCashflow.value ?? 0) < 0 ? 'text-rose-700 dark:text-rose-300' : ''}`}>{formatAmount(viewModel.operating.netMonthlyCashflow.value, viewModel.operatingDisplayCurrency)}</td></tr>
                </tfoot>
              </table>
              <CoverageNote coverage={viewModel.operating.netMonthlyCashflow.coverage} t={t} />
            </div>
          )}
        </DashboardCard>

        <DashboardCard className={panelClassName}>
          <CardHeading title={t('dashboardUi.propertiesOnly.topPropertiesTitle')} icon={<TrendingUp className="h-4 w-4" />} iconClassName={successIconClassName} action={<span className="rounded-[9px] border border-[var(--dashboard-border)] px-2.5 py-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 2xl:text-[11px]">{t('dashboardUi.propertiesOnly.grossYield')}</span>} />
          {viewModel.topProperties.length === 0 ? (
            <p className={`mt-8 text-center text-[13px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.rankingEmpty')}</p>
          ) : (
            <div className="mt-4 divide-y divide-[var(--dashboard-border)]">
              {viewModel.topProperties.map((row, index) => (
                <div key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-blue-50 text-[12.5px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{index + 1}</span>
                  <PropertyThumbnail row={row} />
                  <div className="min-w-0 flex-1"><p className={`truncate text-[12px] font-semibold 2xl:text-[12.5px] ${dashboardLightValueClass}`}>{row.name}</p><p className={`mt-0.5 truncate text-[11px] ${dashboardLightMutedTextClass}`}>{row.city}</p></div>
                  <span className="whitespace-nowrap text-[13.5px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300 2xl:text-[14px]">{formatPercentage(row.grossYield ?? Number.NaN)}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={onOpenProperties} className="mt-4.5 inline-flex items-center gap-2 text-[12.5px] font-semibold text-blue-700 dark:text-blue-300 2xl:text-[13px]">
            {t('dashboardUi.propertiesOnly.viewAllProperties')} <ArrowRight className="h-4 w-4" />
          </button>
        </DashboardCard>

        <div className="properties-only-lower-stack flex h-full flex-col">
        <DashboardCard className={`${panelClassName} flex-1`}>
          <CardHeading title={t('dashboardUi.propertiesOnly.occupancyTitle')} icon={<Building2 className="h-4 w-4" />} iconClassName={successIconClassName} />
          <div className="properties-only-occupancy-layout mt-3.5 grid items-center">
            <div className="properties-only-occupancy-chart relative">
              {viewModel.occupancy.totalCount > 0 ? (
                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={occupancySlices} dataKey="value" innerRadius={54} outerRadius={76} paddingAngle={2} stroke="white" strokeWidth={3}>{occupancySlices.map((slice) => <Cell key={slice.key} fill={slice.color} />)}</Pie></PieChart></ResponsiveContainer>
              ) : <div className="absolute inset-5 rounded-full border-[18px] border-slate-100 dark:border-slate-800" />}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className={`text-[1.625rem] font-bold ${dashboardLightValueClass}`}>{formatPercentage(viewModel.occupancy.rate, 0)}</span><span className={`text-[11px] ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.occupancy')}</span></div>
            </div>
            <div className="space-y-3">
              {occupancyLegendSlices.map((slice) => (
                <div key={slice.key} className="flex items-center justify-between gap-2 text-[12px] 2xl:text-[12.5px]"><span className={`flex min-w-0 items-center gap-2 ${dashboardLightMutedTextClass}`}><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} /><span className="leading-4">{slice.label}</span></span><span className={`shrink-0 font-bold tabular-nums ${dashboardLightValueClass}`}>{slice.value}</span></div>
              ))}
            </div>
          </div>
          <div className={`mt-3 flex items-center gap-2 rounded-[12px] px-3.5 py-2.5 ${occupancyHealthy ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'}`}>
            {occupancyHealthy ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
            <p className="text-[12px] font-semibold leading-4">{t(`dashboardUi.propertiesOnly.${occupancyHealthy ? 'occupancyExcellentTitle' : 'occupancyReviewTitle'}`)}</p>
          </div>
        </DashboardCard>
        <DashboardCard className={`${panelClassName} flex-1`}>
          <CardHeading
            title={t('dashboardUi.propertiesOnly.eventsTitle')}
            icon={<BellRing className="h-4 w-4" />}
            iconClassName={primaryIconClassName}
          />
          {viewModel.events.length === 0 ? (
            <div className="mt-4 rounded-[14px] bg-slate-50 px-4 py-4 text-center dark:bg-slate-800/60">
              <p className={`text-[12.5px] font-semibold ${dashboardLightValueClass}`}>{t('dashboardUi.propertiesOnly.eventsEmptyTitle')}</p>
              <p className={`mt-1 text-[11.5px] leading-5 ${dashboardLightMutedTextClass}`}>{t('dashboardUi.propertiesOnly.eventsEmptyBody')}</p>
            </div>
          ) : (
            <div className="mt-3.5 space-y-2">
              {viewModel.events.map((alert) => {
                const date = alert.dueDate ? new Date(`${alert.dueDate}T12:00:00`) : null;
                const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
                return (
                  <button type="button" key={alert.id} data-dashboard-event disabled={!['review-rent-collection', 'review-expenses'].includes(alert.action)} onClick={alert.action === 'review-rent-collection' ? onOpenRentCollection : alert.action === 'review-expenses' ? onOpenExpenses : undefined} className="flex w-full items-center gap-3 rounded-[13px] border border-[var(--dashboard-border)] px-3.5 py-3 text-left disabled:cursor-default">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] bg-slate-50 text-center dark:bg-slate-800">
                      {validDate ? <><span className="text-[8px] font-bold uppercase text-slate-500 dark:text-slate-400">{new Intl.DateTimeFormat(locale, { month: 'short' }).format(validDate)}</span><span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(validDate)}</span></> : <CalendarDays className="h-4 w-4 text-slate-500" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12.5px] font-semibold leading-4 2xl:text-[13px] ${dashboardLightValueClass}`}>{getAlertTitle(alert, t)}</p>
                      <p className={`mt-0.5 text-[11.5px] leading-4 ${dashboardLightMutedTextClass}`}>{alert.propertyName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${alert.severity === 'urgent' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : alert.severity === 'upcoming' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {getAlertTiming(alert, t)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardCard>
        </div>
      </section>
    </div>
  );
};
