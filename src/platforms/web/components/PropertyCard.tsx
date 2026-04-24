import React, { useState } from 'react';
import { Property } from '../../../common/types';
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Landmark,
  MapPin,
  Receipt,
  StickyNote,
  Trash2,
  Wallet,
} from 'lucide-react';
import { formatDate, formatPortfolioDisplayCurrency } from '../../../common/utils/formatting';
import { calculatePropertyDetails } from '../../../common/utils/calculations';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import {
  appBorderClass,
  appButtonMutedClass,
  appPanelClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';
import { useSettings } from '../context/SettingsContext';

interface PropertyCardProps {
  property: Property;
  onDelete: (id: string) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onDelete,
}) => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState('overview');
  const details = calculatePropertyDetails(property);
  const fxRates = getSettingsCurrencyRates(settings);
  const operatingCurrency = property.operatingCurrency ?? property.currency ?? 'EUR';
  const propertyValueCurrency =
    property.propertyValueCurrency ??
    property.currentEstimatedValueCurrency ??
    property.purchasePriceCurrency ??
    operatingCurrency;
  const purchasePriceCurrency = property.purchasePriceCurrency ?? propertyValueCurrency;
  const currentEstimatedValueCurrency =
    property.currentEstimatedValueCurrency ?? propertyValueCurrency;
  const formatOperatingAmount = (value: number, sourceCurrency = operatingCurrency) =>
    formatPortfolioDisplayCurrency(value, sourceCurrency, 'operating', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const formatValuationAmount = (value: number, sourceCurrency = propertyValueCurrency) =>
    formatPortfolioDisplayCurrency(value, sourceCurrency, 'valuation', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const tabMeta = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'financials', label: 'Financials', icon: Wallet },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'mortgage', label: 'Mortgage', icon: Landmark },
    { id: 'taxes', label: 'Taxes', icon: CalendarDays },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ] as const;

  const heroMetricCards = [
    {
      label: 'Current Value',
      value: formatValuationAmount(property.currentEstimatedValue, currentEstimatedValueCurrency),
      tone: 'text-[var(--app-text-strong)]',
      glow: 'from-slate-50 via-white to-sky-50/70',
    },
    {
      label: 'Monthly Rent',
      value: formatOperatingAmount(details.monthlyRent),
      tone: 'text-[var(--dashboard-value-success)]',
      glow: 'from-emerald-50 via-white to-emerald-50/60',
    },
    {
      label: 'Net Cashflow',
      value: formatOperatingAmount(details.netMonthlyCashflow),
      tone:
        details.netMonthlyCashflow >= 0
          ? 'text-[var(--dashboard-value-success)]'
          : 'text-[var(--dashboard-value-danger)]',
      glow:
        details.netMonthlyCashflow >= 0
          ? 'from-emerald-50 via-white to-teal-50/60'
          : 'from-rose-50 via-white to-rose-50/60',
    },
  ];

  const statCardClass =
    `group rounded-[22px] border p-4 sm:p-5 ${appBorderClass} ` +
    'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,251,0.9))] ' +
    'shadow-[0_14px_30px_-24px_rgba(15,23,42,0.18)] transition-all duration-300 ' +
    'hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-28px_rgba(15,23,42,0.2)]';
  const sectionGridClass = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4';
  const notesCardClass =
    `rounded-[22px] border p-5 ${appBorderClass} ` +
    'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,251,0.9))] ' +
    'shadow-[0_14px_30px_-24px_rgba(15,23,42,0.18)]';

  return (
    <div
      className={
        `${appPanelClass} rounded-[30px] border p-4 sm:p-6 ${appBorderClass} ` +
        'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] ' +
        'shadow-[0_26px_60px_-40px_rgba(15,23,42,0.2)] transition-all duration-300 ' +
        'hover:-translate-y-1 hover:shadow-[0_34px_70px_-42px_rgba(15,23,42,0.24)]'
      }
    >
      <div className="overflow-hidden rounded-[26px] border border-[rgba(21,43,71,0.08)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,246,252,0.96)_58%,rgba(228,238,248,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="relative p-5 sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(32,63,101,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(21,43,71,0.08)] bg-white/80 px-3 py-1.5 backdrop-blur">
                <Building2 className="h-4 w-4 text-[var(--app-nav-active-fg)]" />
                <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                  Portfolio Property
                </span>
              </div>
              <h3 className={`mt-4 text-[1.45rem] font-semibold tracking-tight sm:text-[1.7rem] ${appTextStrongClass}`}>
                {property.name}
              </h3>
              <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${appTextMutedClass}`}>
                <span className="inline-flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  {[property.address, property.city, property.country].filter(Boolean).join(', ')}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                <span className="text-sm">Purchased {formatDate(property.purchaseDate)}</span>
              </div>
              <p className={`mt-3 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
                Review value, cashflow, expenses, financing, and notes in one cleaner workspace.
              </p>
            </div>

            <button
              onClick={() => onDelete(property.id)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${appButtonMutedClass} ` +
                'border border-white/70 bg-white/80 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.2)] ' +
                'transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:hover:text-rose-300'}
              title="Delete property"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-5 grid gap-3 md:grid-cols-3">
            {heroMetricCards.map((item) => (
              <div
                key={item.label}
                className={`rounded-[22px] border border-white/80 bg-gradient-to-br ${item.glow} p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.24)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                  {item.label}
                </p>
                <p className={`mt-3 text-[1.65rem] font-semibold tracking-tight sm:text-[1.85rem] ${item.tone}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-5 border-b ${appBorderClass}`}>
        <nav className="flex flex-wrap gap-2 pb-3">
          {tabMeta.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                activeTab === id
                  ? 'border border-[rgba(21,43,71,0.10)] bg-[linear-gradient(135deg,rgba(21,43,71,0.09),rgba(21,43,71,0.04))] text-[var(--app-nav-active-fg)] shadow-[0_12px_24px_-18px_rgba(15,23,42,0.18)]'
                  : `border border-transparent bg-white/60 ${appTextMutedClass} hover:-translate-y-0.5 hover:border-[rgba(21,43,71,0.08)] hover:bg-white hover:text-[var(--app-text-strong)]`
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-5">
        {activeTab === 'overview' && (
          <div className={sectionGridClass}>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Current Value
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatValuationAmount(property.currentEstimatedValue, currentEstimatedValueCurrency)}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>Latest working valuation for this asset.</p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Monthly Rent
              </p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--dashboard-value-success)]">
                {formatOperatingAmount(details.monthlyRent)}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>Income currently feeding portfolio cashflow.</p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Total Monthly Expenses
              </p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--dashboard-value-danger)]">
                {formatOperatingAmount(details.totalMonthlyExpenses)}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>Combined recurring outflow across the property.</p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Net Cashflow
              </p>
              <p
                className={`mt-3 text-xl font-semibold tracking-tight ${
                  details.netMonthlyCashflow >= 0
                    ? 'text-[var(--dashboard-value-success)]'
                    : 'text-[var(--dashboard-value-danger)]'
                }`}
              >
                {formatOperatingAmount(details.netMonthlyCashflow)}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>What remains after rent, expenses, and financing.</p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Purchase Date
              </p>
              <p className={`mt-3 text-base font-semibold ${appTextStrongClass}`}>
                {formatDate(property.purchaseDate)}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>Anchor date for performance and hold period.</p>
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className={sectionGridClass}>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Purchase Price
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatValuationAmount(property.purchasePrice, purchasePriceCurrency)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Total Investment
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatValuationAmount(details.investedCapital)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Equity
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatValuationAmount(details.equity)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Equity %
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {details.equityPercentage.toFixed(2)}%
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                ROCE
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {details.roce.toFixed(2)}%
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Gross Yield
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {details.grossYield.toFixed(2)}%
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Net Yield
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {details.netYield.toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className={sectionGridClass}>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                IBI
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatOperatingAmount(property.annualIBI)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Insurance
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatOperatingAmount(
                  property.annualHomeInsurance +
                    (property.annualLifeInsurance ?? 0) +
                    (property.annualRentDefaultInsurance ?? property.annualNonPaymentInsurance)
                )}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Community Fees
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatOperatingAmount(property.annualCommunityFees)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Maintenance
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatOperatingAmount(property.annualMaintenance)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Other Expenses
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {formatOperatingAmount(property.annualOtherExpenses)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Total Annual Expenses
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight text-[var(--dashboard-value-danger)]`}>
                {formatOperatingAmount(details.annualRecurringExpenses)}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'mortgage' && (
          <div className={sectionGridClass}>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Lender Name
              </p>
              <p className={`mt-3 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>
                {property.lenderName || 'N/A'}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Current Balance
              </p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--dashboard-value-danger)]">
                {formatValuationAmount(details.currentMortgageBalance)}
              </p>
            </div>
            <div className={statCardClass}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                Monthly Payment
              </p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--dashboard-value-danger)]">
                {formatOperatingAmount(details.monthlyMortgagePayment)}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'taxes' && (
          <div className={notesCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
                  Taxes
                </p>
                <p className={`mt-3 text-base font-semibold ${appTextStrongClass}`}>
                  Taxes Section (Labels Only)
                </p>
              </div>
              <ChevronRight className={`h-5 w-5 ${appTextSoftClass}`} />
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className={notesCardClass}>
            <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
              Notes
            </p>
            <p className={`text-lg font-semibold ${appTextStrongClass}`}>Notes</p>
            <p className={`mt-3 text-sm leading-7 ${appTextMutedClass}`}>
              {property.notes || 'No notes have been added for this property yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
