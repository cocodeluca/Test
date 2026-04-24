import React, { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DisplayCurrency } from '../../../common/types/settings';
import type { PropertyMetrics } from '../../../common/types';
import { formatCurrencyValue, formatPercentage } from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import {
  chartTooltipSurfaceClass,
  dashboardLightCardClass,
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
  dashboardSurfaceClass,
} from '../styles/dashboardTheme';

type PortfolioMetricKey = 'value' | 'rent' | 'cashflow';

interface PropertyPortfolioOverviewProps {
  properties: PropertyMetrics[];
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
}

const chartPalette = ['#234a6a', '#3b6486', '#5b7f9a', '#7f98ad', '#a4b7c4', '#c5d2da'];

const getConcentrationTone = (share: number) => {
  if (share >= 65) {
    return dashboardMetricToneClass.warning;
  }

  if (share >= 40) {
    return dashboardMetricToneClass.default;
  }

  return dashboardMetricToneClass.success;
};

export const PropertyPortfolioOverview: React.FC<PropertyPortfolioOverviewProps> = ({
  properties,
  valuationDisplayCurrency,
  operatingDisplayCurrency,
}) => {
  const { t } = useSettings();
  const [selectedMetric, setSelectedMetric] = useState<PortfolioMetricKey>('value');

  const metricOptions = useMemo(
    () => [
      { id: 'value' as const, label: t('dashboardUi.portfolioViewMetricValue') },
      { id: 'rent' as const, label: t('dashboardUi.portfolioViewMetricRent') },
      { id: 'cashflow' as const, label: t('dashboardUi.portfolioViewMetricCashflow') },
    ],
    [t]
  );

  const metricDefinition = useMemo(() => {
    if (selectedMetric === 'rent') {
      return {
        label: t('dashboardUi.portfolioViewMetricRent'),
        subtitle: t('dashboardUi.portfolioViewRentSubtitle'),
        currency: operatingDisplayCurrency,
        getValue: (property: PropertyMetrics) => property.annualRentalIncome / 12,
        getChartValue: (property: PropertyMetrics) => Math.max(property.annualRentalIncome / 12, 0),
      };
    }

    if (selectedMetric === 'cashflow') {
      return {
        label: t('dashboardUi.portfolioViewMetricCashflow'),
        subtitle: t('dashboardUi.portfolioViewCashflowSubtitle'),
        currency: operatingDisplayCurrency,
        getValue: (property: PropertyMetrics) => property.netMonthlyCashflow,
        getChartValue: (property: PropertyMetrics) => Math.abs(property.netMonthlyCashflow),
      };
    }

    return {
      label: t('dashboardUi.portfolioViewMetricValue'),
      subtitle: t('dashboardUi.portfolioViewValueSubtitle'),
      currency: valuationDisplayCurrency,
      getValue: (property: PropertyMetrics) => property.currentEstimatedValue,
      getChartValue: (property: PropertyMetrics) => Math.max(property.currentEstimatedValue, 0),
    };
  }, [operatingDisplayCurrency, selectedMetric, t, valuationDisplayCurrency]);

  const chartItems = useMemo(() => {
    const baseItems = properties.map((property, index) => {
      const rawValue = metricDefinition.getValue(property);
      const chartValue = metricDefinition.getChartValue(property);

      return {
        key: property.id,
        name: property.name,
        city: property.city,
        rawValue,
        chartValue,
        color: chartPalette[index % chartPalette.length],
      };
    });
    const total = baseItems.reduce((sum, item) => sum + item.chartValue, 0);

    return {
      total,
      items: baseItems.map((item) => ({
        ...item,
        percentage: total > 0 ? (item.chartValue / total) * 100 : 0,
      })),
    };
  }, [metricDefinition, properties]);

  const hasMetricData = chartItems.items.some((item) => item.chartValue > 0);
  const bestValueProperty = useMemo(
    () =>
      properties.reduce(
        (best, property) =>
          !best || property.currentEstimatedValue > best.currentEstimatedValue ? property : best,
        properties[0] ?? null
      ),
    [properties]
  );
  const bestRentProperty = useMemo(
    () =>
      properties.reduce(
        (best, property) =>
          !best || property.annualRentalIncome > best.annualRentalIncome ? property : best,
        properties[0] ?? null
      ),
    [properties]
  );
  const bestCashflowProperty = useMemo(
    () =>
      properties.reduce(
        (best, property) =>
          !best || property.netMonthlyCashflow > best.netMonthlyCashflow ? property : best,
        properties[0] ?? null
      ),
    [properties]
  );

  const concentrationShare = chartItems.total > 0
    ? Math.max(...chartItems.items.map((item) => item.chartValue)) / chartItems.total
    : 0;
  const concentrationLabel =
    concentrationShare >= 0.65
      ? t('dashboardUi.portfolioViewConcentrationHigh')
      : concentrationShare >= 0.4
      ? t('dashboardUi.portfolioViewConcentrationMedium')
      : t('dashboardUi.portfolioViewConcentrationLow');
  const rankingItems = [...chartItems.items]
    .sort((left, right) => right.chartValue - left.chartValue)
    .slice(0, 4);

  const formatMetricAmount = (value: number) =>
    formatCurrencyValue(value, metricDefinition.currency, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  const currentLeader = rankingItems[0] ?? null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) {
      return null;
    }

    const item = payload[0]?.payload;

    return (
      <div className={`min-w-[176px] rounded-[20px] px-4 py-3 ${chartTooltipSurfaceClass}`}>
        <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>{item.name}</p>
        <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>{item.city}</p>
        <p className={`mt-2 text-[15px] font-semibold ${dashboardLightValueClass}`}>
          {formatMetricAmount(item.rawValue)}
        </p>
        <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>
          {formatPercentage(item.percentage, 1)}
        </p>
      </div>
    );
  };

  return (
    <section className={`${dashboardSurfaceClass} ${dashboardLightCardClass} rounded-[28px] p-5 sm:p-6`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
            {t('dashboardUi.portfolioViewEyebrow')}
          </p>
          <h2 className={`mt-3 text-[1.2rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>
            {t('dashboardUi.portfolioViewTitle')}
          </h2>
          <p className={`mt-2 max-w-2xl text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>
            {t('dashboardUi.portfolioViewBody')}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] p-1">
          {metricOptions.map((option) => {
            const isActive = option.id === selectedMetric;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedMetric(option.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[rgba(29,75,134,0.1)] text-[var(--app-nav-active-fg)] shadow-[0_12px_24px_-20px_rgba(29,75,134,0.22)]'
                    : `${dashboardLightMutedTextClass} hover:text-[var(--app-text-strong)]`
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-[24px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] p-5">
          {properties.length === 1 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {metricDefinition.label}
              </p>
              <p className={`mt-4 text-[1.85rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>
                {formatMetricAmount(metricDefinition.getValue(properties[0]))}
              </p>
              <p className={`mt-4 max-w-md text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>
                {t('dashboardUi.portfolioViewSingleProperty')}
              </p>
            </div>
          ) : !hasMetricData ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {metricDefinition.label}
              </p>
              <p className={`mt-4 text-[1.12rem] font-semibold ${dashboardLightValueClass}`}>
                {t('dashboardUi.portfolioViewEmptyMetricTitle')}
              </p>
              <p className={`mt-3 max-w-md text-[14px] leading-6 ${dashboardLightMutedTextClass}`}>
                {t('dashboardUi.portfolioViewEmptyMetricBody', { metric: metricDefinition.label.toLowerCase() })}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(220px,1.05fr)] lg:items-center">
              <div className="relative h-[300px]">
                <div className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(29,75,134,0.08)_0%,rgba(255,255,255,0)_72%)]" />
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartItems.items}
                      dataKey="chartValue"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={104}
                      paddingAngle={2}
                      stroke="var(--dashboard-chart-stroke)"
                      strokeWidth={5}
                    >
                      {chartItems.items.map((item) => (
                        <Cell key={item.key} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${dashboardLightLabelClass}`}>
                    {metricDefinition.label}
                  </p>
                  <p className={`mt-3 text-[1.7rem] font-semibold tracking-tight ${dashboardLightValueClass}`}>
                    {formatMetricAmount(chartItems.items.reduce((sum, item) => sum + item.rawValue, 0))}
                  </p>
                  <p className={`mt-2 max-w-[190px] text-[13px] leading-5 ${dashboardLightMutedTextClass}`}>
                    {metricDefinition.subtitle}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {rankingItems.map((item) => (
                  <div key={item.key} className="rounded-[18px] border border-[var(--dashboard-border)] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <p className={`truncate text-[14px] font-semibold ${dashboardLightValueClass}`}>{item.name}</p>
                        </div>
                        <p className={`mt-1 text-[12px] ${dashboardLightMutedTextClass}`}>
                          {formatPercentage(item.percentage, 1)}
                        </p>
                      </div>
                      <p className={`text-[14px] font-semibold ${dashboardLightValueClass}`}>
                        {formatMetricAmount(item.rawValue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-[var(--dashboard-border)] bg-[var(--chart-legend-surface)] p-5">
          <div className="space-y-3">
            <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-white px-4 py-3">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {t('dashboardUi.portfolioViewTopValue')}
              </p>
              <p className={`mt-2 text-[15px] font-semibold ${dashboardLightValueClass}`}>
                {bestValueProperty?.name ?? '—'}
              </p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>
                {bestValueProperty
                  ? formatCurrencyValue(bestValueProperty.currentEstimatedValue, valuationDisplayCurrency, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </p>
            </div>

            <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-white px-4 py-3">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {t('dashboardUi.portfolioViewTopRent')}
              </p>
              <p className={`mt-2 text-[15px] font-semibold ${dashboardLightValueClass}`}>
                {bestRentProperty?.name ?? '—'}
              </p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>
                {bestRentProperty
                  ? formatCurrencyValue(bestRentProperty.annualRentalIncome / 12, operatingDisplayCurrency, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </p>
            </div>

            <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-white px-4 py-3">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {t('dashboardUi.portfolioViewTopCashflow')}
              </p>
              <p className={`mt-2 text-[15px] font-semibold ${dashboardLightValueClass}`}>
                {bestCashflowProperty?.name ?? '—'}
              </p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>
                {bestCashflowProperty
                  ? formatCurrencyValue(bestCashflowProperty.netMonthlyCashflow, operatingDisplayCurrency, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </p>
            </div>

            <div className="rounded-[18px] border border-[var(--dashboard-border)] bg-white px-4 py-3">
              <p className={`text-[12px] font-medium ${dashboardLightLabelClass}`}>
                {t('dashboardUi.portfolioViewConcentration')}
              </p>
              <p className={`mt-2 text-[15px] font-semibold ${getConcentrationTone(concentrationShare * 100)}`}>
                {concentrationLabel}
              </p>
              <p className={`mt-1 text-[13px] ${dashboardLightMutedTextClass}`}>
                {currentLeader
                  ? t('dashboardUi.portfolioViewConcentrationBody', {
                      property: currentLeader.name,
                      share: formatPercentage(concentrationShare * 100, 1),
                    })
                  : t('dashboardUi.portfolioViewConcentrationEmpty')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
