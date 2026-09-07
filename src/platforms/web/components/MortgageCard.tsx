import React from 'react';
import {
  BadgePercent,
  CheckCircle2,
  Circle,
  Edit,
  Trash2,
} from 'lucide-react';
import { Mortgage, MortgageBonification, Property } from '../../../common/types';
import { formatCurrency, formatPercentage, formatShortDate } from '../../../common/utils/formatting';
import { buildMortgageViewModel } from '../../../common/utils/mortgageViewModel';
import { useSettings } from '../context/SettingsContext';
import { appButtonMutedClass, appPanelClass, appTextMutedClass, appTextSoftClass, appTextStrongClass } from '../styles/dashboardTheme';

interface MortgageCardProps {
  mortgage: Mortgage;
  property: Property | undefined;
  selectorItems: Array<{
    id: string;
    title: string;
    subtitle?: string;
    meta?: string;
  }>;
  selectedMortgageId: string | null;
  onSelectMortgage: (id: string) => void;
  onEdit: (mortgage: Mortgage, section?: string | null) => void;
  onDelete: (id: string) => void;
}

const getBonificationCostLabel = (item: MortgageBonification): string | null => {
  if (item.notes && /eur|cost|monthly|annual|year/i.test(item.notes)) {
    return item.notes;
  }
  return null;
};

const formatPoints = (points: number | null): string => (points === null ? 'Not specified' : `${points.toFixed(2)} pts`);

const MetricCell: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
  compact?: boolean;
}> = ({ label, value, accent = false, compact = false }) => (
  <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4 first:pl-5 last:pr-5 sm:px-4 lg:px-5">
    <p className={`text-[10px] font-semibold uppercase tracking-[0.15em] leading-none ${appTextMutedClass}`}>{label}</p>
    <p
      className={`mt-2 min-w-0 break-words tracking-[-0.04em] leading-[1.05] ${
        compact ? 'text-[1.55rem] font-semibold lg:text-[1.7rem]' : 'text-[1.85rem] font-semibold lg:text-[2.05rem]'
      } ${accent ? 'text-amber-500 dark:text-amber-300' : appTextStrongClass}`}
    >
      {value}
    </p>
  </div>
);

const MetadataItem: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
    <span className={`shrink-0 text-[0.92rem] ${appTextMutedClass}`}>{label}:</span>
    <span className={`truncate text-[0.92rem] font-semibold ${appTextStrongClass}`}>{value}</span>
  </div>
);

const SectionEyebrow: React.FC<{
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'teal';
}> = ({ children, tone = 'default' }) => (
  <p
    className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
      tone === 'accent'
        ? 'text-amber-500 dark:text-amber-300'
        : tone === 'teal'
        ? 'text-teal-600 dark:text-teal-300'
        : appTextSoftClass
    }`}
  >
    {children}
  </p>
);

const BonificationList: React.FC<{
  title: string;
  titleTone: 'teal' | 'amber';
  summaryLabel?: string;
  items: MortgageBonification[];
  emptyLabel: string;
}> = ({ title, titleTone, summaryLabel, items, emptyLabel }) => {
  const iconTone =
    titleTone === 'teal'
      ? 'text-teal-600 dark:text-teal-300'
      : 'text-amber-500 dark:text-amber-300';
  const pointsTone =
    titleTone === 'teal'
      ? 'text-teal-600 dark:text-teal-300'
      : 'text-amber-500 dark:text-amber-300';
  const panelHeaderTone =
    titleTone === 'teal'
      ? 'text-teal-700 dark:text-teal-200'
      : 'text-amber-600 dark:text-amber-200';
  const iconBgTone =
    titleTone === 'teal'
      ? 'bg-teal-500/8'
      : 'bg-amber-500/8';

  return (
    <section className="rounded-[8px] border border-[color:var(--app-border)]/70 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--app-border)]/70 px-5 py-3.5">
        <h4 className={`text-[0.98rem] font-semibold tracking-[-0.02em] ${panelHeaderTone}`}>
          {title}
        </h4>
        {summaryLabel ? <span className={`text-[0.74rem] font-semibold uppercase tracking-[0.13em] ${appTextMutedClass}`}>{summaryLabel}</span> : null}
      </div>

      <div className="px-5 py-3">
        {items.length > 0 ? (
          <div className="divide-y divide-dashed divide-[color:var(--app-border)]/72">
            {items.map((item) => {
              const secondaryLabel = getBonificationCostLabel(item);

              return (
                <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4 first:pt-2.5 last:pb-2.5">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      {titleTone === 'teal' ? (
                        <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${iconBgTone} ${iconTone}`} />
                      ) : (
                        <Circle className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${iconBgTone} ${iconTone}`} />
                      )}
                      <div className="min-w-0">
                        <p className={`truncate text-[0.97rem] font-medium tracking-[-0.01em] ${appTextStrongClass}`}>{item.label}</p>
                        {secondaryLabel ? <p className={`mt-1.5 text-[0.86rem] leading-[1.35] ${appTextMutedClass}`}>{secondaryLabel}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-[86px] text-right">
                    <p className={`text-[1.02rem] font-semibold tracking-[-0.02em] ${pointsTone}`}>{formatPoints(item.bonusPoints)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`py-4 text-sm ${appTextMutedClass}`}>{emptyLabel}</div>
        )}
      </div>
    </section>
  );
};

export const MortgageCard: React.FC<MortgageCardProps> = ({
  mortgage,
  property,
  onEdit,
  onDelete,
}) => {
  const { t } = useSettings();
  const viewModel = buildMortgageViewModel(mortgage, property);
  const activeBonifications = viewModel.bonificationSummary.activeBonifications;
  const availableBonifications = viewModel.bonificationSummary.availableBonifications;

  const monthlySavingLabel =
    viewModel.savings.monthlySaving !== null
      ? `${formatCurrency(viewModel.savings.monthlySaving, mortgage.currency)} / month`
      : t('common.notSpecified');

  const yearlySavingLabel =
    viewModel.savings.yearlySaving !== null
      ? `${formatCurrency(viewModel.savings.yearlySaving, mortgage.currency)} / year`
      : null;

  const totalPotentialLabel =
    viewModel.bonificationSummary.maxTotalBonificationPoints !== null &&
    Number.isFinite(viewModel.bonificationSummary.maxTotalBonificationPoints)
      ? `Up to ${viewModel.bonificationSummary.maxTotalBonificationPoints.toFixed(2)} pts`
      : t('mortgages.card.maxTotalBonification');

  const primaryMetrics = [
    {
      label: 'Monthly Payment',
      value:
        viewModel.summary.monthlyPayment !== null
          ? formatCurrency(viewModel.summary.monthlyPayment, mortgage.currency)
          : t('common.notSpecified'),
    },
    {
      label: 'Current Rate',
      value:
        viewModel.displayedRate !== null
          ? formatPercentage(viewModel.displayedRate, 2)
          : t('common.notSpecified'),
    },
    {
      label: t('mortgages.card.currentBalance'),
      value: formatCurrency(viewModel.summary.balance, mortgage.currency),
    },
    {
      label: 'Bonification Savings',
      value: viewModel.summary.savingsLabel ?? t('common.notSpecified'),
      accent: true,
    },
    {
      label: 'Time Left',
      value: viewModel.summary.remainingTermLabel,
      compact: true,
    },
  ] as const;

  const baseRate = viewModel.rateSummary.sections.find((item) => item.label === 'Base Rate')?.value ?? t('common.notSpecified');
  const currentRate =
    viewModel.rateSummary.sections.find((item) => item.label === 'Displayed / Current Rate')?.value ?? t('common.notSpecified');

  const activeBonificationValue = activeBonifications.length > 0 ? `- ${viewModel.summary.activeBonificationLabel}` : t('common.notSpecified');
  const withoutBonificationsLabel =
    viewModel.savings.paymentWithoutBonifications !== null
      ? `${formatCurrency(viewModel.savings.paymentWithoutBonifications, mortgage.currency)} / month`
      : t('common.notSpecified');

  return (
    <article
      className={`overflow-hidden rounded-[16px] border border-[color:var(--app-border)]/70 bg-white shadow-[0_18px_44px_-34px_rgba(16,24,38,0.18)] ${appPanelClass}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--app-border)]/70 px-5 py-3.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-500/14 bg-teal-500/7 text-teal-700 dark:text-teal-300">
            <BadgePercent className="h-[15px] w-[15px]" />
          </div>
          <div className="min-w-0">
            <h3 className={`truncate text-[1.04rem] font-semibold leading-[1.15] tracking-[-0.025em] ${appTextStrongClass}`}>{mortgage.lenderName}</h3>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(mortgage, 'rate')}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold ${appButtonMutedClass} ${appTextStrongClass}`}
          >
            <Edit className="h-3.5 w-3.5" />
            Edit Mortgage
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this mortgage? This cannot be undone.')) {
                onDelete(mortgage.id);
              }
            }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold ${appButtonMutedClass} text-rose-700 dark:text-rose-300`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Mortgage
          </button>
        </div>
      </header>

      <div className="px-5 py-3.5 lg:px-6">
        <div className="overflow-hidden rounded-[12px] border border-[color:var(--app-border)]/70 bg-[linear-gradient(180deg,rgba(251,252,254,0.98),rgba(255,255,255,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          <div className="flex flex-col divide-y divide-[color:var(--app-border)]/70 lg:flex-row lg:divide-x lg:divide-y-0">
            {primaryMetrics.map((metric) => (
              <MetricCell
                key={metric.label}
                label={metric.label}
                value={metric.value}
                accent={'accent' in metric && Boolean(metric.accent)}
                compact={'compact' in metric && Boolean(metric.compact)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1.5 py-3.5 text-sm">
          <MetadataItem label="Original Loan" value={formatCurrency(mortgage.originalLoanAmount, mortgage.currency)} />
          <span className="hidden h-3.5 w-px bg-[color:var(--app-border)]/85 sm:block" />
          <MetadataItem label="Mortgage Type" value={viewModel.mortgageTypeLabel} />
          <span className="hidden h-3.5 w-px bg-[color:var(--app-border)]/85 sm:block" />
          <MetadataItem
            label={t('mortgages.card.amortized')}
            value={`${formatCurrency(viewModel.summary.amortizedAmount, mortgage.currency)} (${viewModel.summary.amortizedPercentage.toFixed(1)}%)`}
          />
          {viewModel.summary.hasMaterialBalanceDifference ? <>
            <span className="hidden h-3.5 w-px bg-[color:var(--app-border)]/85 xl:block" />
            <MetadataItem
              label={t('mortgages.card.savedBalance')}
              value={formatCurrency(viewModel.summary.savedBalance, mortgage.currency)}
            />
          </> : null}
          <span className="hidden h-3.5 w-px bg-[color:var(--app-border)]/85 xl:block" />
          <MetadataItem label="Property" value={property?.name ?? t('common.notSpecified')} />
          <span className="hidden h-3.5 w-px bg-[color:var(--app-border)]/85 xl:block" />
          <MetadataItem
            label="Start date"
            value={mortgage.mortgageStartDate ? formatShortDate(mortgage.mortgageStartDate) : t('common.notSpecified')}
          />
        </div>
        {viewModel.summary.hasMaterialBalanceDifference && viewModel.summary.savedBalanceDifference !== null ? (
          <p className="mx-1.5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t('mortgages.card.savedBalanceDifference', {
              amount: formatCurrency(viewModel.summary.savedBalanceDifference, mortgage.currency),
            })}
          </p>
        ) : null}
      </div>

      <div className="border-t border-[color:var(--app-border)]/70">
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[0.82fr_1.18fr] lg:px-6 lg:py-5">
          <section className="lg:self-start">
        <div className="border-b border-[color:var(--app-border)]/70 px-5 py-3 lg:px-6">
          <h4 className={`text-[1.05rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>Rate & Bonifications</h4>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_0.92fr]">
          <div className="px-5 py-3 lg:px-6">
            <div className="rounded-[14px] border border-[color:var(--app-border)]/60 bg-[linear-gradient(180deg,rgba(251,252,254,0.92),rgba(255,255,255,0.98))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.7fr)]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 border-b border-dashed border-[color:var(--app-border)]/75 pb-2">
                    <span className={`text-[0.92rem] ${appTextMutedClass}`}>Base Rate</span>
                    <span className={`text-[1.01rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{baseRate}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-b border-dashed border-[color:var(--app-border)]/75 pb-2">
                    <span className={`text-[0.92rem] ${appTextMutedClass}`}>Current Rate</span>
                    <span className={`text-[1.01rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{currentRate}</span>
                  </div>
                </div>

                <div className="border-t border-[color:var(--app-border)]/70 pt-2.5 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="flex h-full flex-col justify-center gap-0.5">
                    <p className={`text-[0.75rem] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>Active Bonifications</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-[1rem] ${appTextSoftClass}`}>-</span>
                      <span className={`truncate text-[1.01rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{activeBonificationValue}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 border-t border-[color:var(--app-border)]/70 pt-2.5 text-teal-700 dark:text-teal-300">
                <span className={`text-[0.75rem] font-semibold uppercase tracking-[0.15em] ${appTextMutedClass}`}>Savings</span>
                <span className="text-[0.98rem] font-semibold tracking-[-0.02em] text-teal-800 dark:text-teal-200">
                  {monthlySavingLabel}
                </span>
                {yearlySavingLabel ? (
                  <>
                    <span className="text-teal-500/65 dark:text-teal-300/55">|</span>
                    <span className="text-[0.92rem] font-medium tracking-[-0.01em] text-teal-700/85 dark:text-teal-300/80">
                      {yearlySavingLabel}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-[color:var(--app-border)]/70 px-5 py-3 lg:border-l lg:border-t-0 lg:px-6">
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-x-4">
              <div className="border-b border-dashed border-[color:var(--app-border)]/75 pb-2.5">
                <p className={`text-[0.75rem] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>Without Bonifications</p>
                <p className={`mt-1 text-[1.01rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{withoutBonificationsLabel}</p>
              </div>

              <div className="border-b border-dashed border-[color:var(--app-border)]/75 pb-2.5">
                <p className={`text-[0.75rem] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>Total Potential Bonification</p>
                <p className={`mt-1 text-[1.01rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{totalPotentialLabel}</p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0">
                  <span className={`text-[0.75rem] font-semibold uppercase tracking-[0.14em] ${appTextMutedClass}`}>Next Review</span>
                  <span className={`text-[0.96rem] font-semibold text-teal-700 dark:text-teal-300`}>Low Risk</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          </section>

          {viewModel.sections.showBonifications ? (
            <div className="grid gap-4 lg:self-start">
              <div className="grid gap-4 lg:grid-cols-2">
                <BonificationList
                  title="Active Bonifications"
                  titleTone="teal"
                  summaryLabel={viewModel.summary.activeBonificationLabel}
                  items={activeBonifications}
                  emptyLabel={t('mortgages.card.noActiveBonifications')}
                />

                <BonificationList
                  title="Available Bonifications"
                  titleTone="amber"
                  summaryLabel={totalPotentialLabel}
                  items={availableBonifications}
                  emptyLabel={t('mortgages.card.noAvailableBonifications')}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 border-t border-[color:var(--app-border)]/70 px-5 py-4 lg:grid-cols-[1.12fr_0.88fr] lg:px-6">
        {viewModel.sections.showPaymentBreakdown ? (
          <section className="rounded-[8px] border border-[color:var(--app-border)]/70 bg-white">
            <div className="border-b border-[color:var(--app-border)]/70 px-5 py-4">
              <h4 className={`text-[1.02rem] font-semibold ${appTextStrongClass}`}>Payment Breakdown</h4>
            </div>

            <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-stretch">
              <div className="grid gap-3 border-b border-[color:var(--app-border)]/70 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
                <div className="flex items-center justify-between gap-4">
                  <span className={`text-[0.98rem] ${appTextMutedClass}`}>Interest</span>
                  <span className={`text-[1rem] font-semibold ${appTextStrongClass}`}>
                    {viewModel.paymentBreakdown?.interestPortion != null
                      ? formatCurrency(viewModel.paymentBreakdown.interestPortion, mortgage.currency)
                      : t('common.notSpecified')}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className={`text-[0.98rem] ${appTextMutedClass}`}>Principal</span>
                  <span className={`text-[1rem] font-semibold ${appTextStrongClass}`}>
                    {viewModel.paymentBreakdown?.principalPortion != null
                      ? formatCurrency(viewModel.paymentBreakdown.principalPortion, mortgage.currency)
                      : t('common.notSpecified')}
                  </span>
                </div>
              </div>

              <div className="flex min-w-[170px] items-center justify-between gap-4 sm:pl-6">
                <div>
                  <SectionEyebrow>Total</SectionEyebrow>
                </div>
                <span className={`text-[1.9rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                  {formatCurrency(
                    viewModel.paymentBreakdown?.totalPayment ?? viewModel.summary.monthlyPayment ?? 0,
                    mortgage.currency
                  )}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        <section
          className={`rounded-[8px] border border-[color:var(--app-border)]/70 bg-white ${
            viewModel.sections.showPaymentBreakdown ? '' : 'lg:col-span-2'
          }`}
        >
          <div className="border-b border-[color:var(--app-border)]/70 px-5 py-4">
            <h4 className={`text-[1.02rem] font-semibold ${appTextStrongClass}`}>Mortgage Insight</h4>
          </div>

          <div className="px-5 py-4">
            <ul className="space-y-2.5 text-[0.98rem]">
              {viewModel.insightItems.map((item) => (
                <li key={item} className={`flex items-start gap-2.5 ${appTextMutedClass}`}>
                  <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300" />
                  <span className="leading-6">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </article>
  );
};
