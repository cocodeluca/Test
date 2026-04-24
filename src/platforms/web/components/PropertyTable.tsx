import React, { useMemo, useState } from 'react';
import { ArrowDownUp, Crown } from 'lucide-react';
import { PropertyMetrics } from '../../../common/types';
import { formatPercentage, formatPortfolioDisplayCurrency } from '../../../common/utils/formatting';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { useSettings } from '../context/SettingsContext';
import {
  dashboardLightLabelClass,
  dashboardLightMutedTextClass,
  dashboardLightValueClass,
  dashboardMetricToneClass,
} from '../styles/dashboardTheme';

interface PropertyTableProps {
  properties: PropertyMetrics[];
}

type SortKey =
  | 'name'
  | 'currentEstimatedValue'
  | 'mortgageBalance'
  | 'equity'
  | 'investedCapital'
  | 'equityPercentage'
  | 'annualRentalIncome'
  | 'netMonthlyCashflow'
  | 'grossYield'
  | 'roce';

export const PropertyTable: React.FC<PropertyTableProps> = ({ properties }) => {
  const { settings, t } = useSettings();
  const [sortKey, setSortKey] = useState<SortKey>('roce');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const fxRates = getSettingsCurrencyRates(settings);

  const bestPerformerId = useMemo(() => {
    if (properties.length === 0) {
      return null;
    }

    return [...properties].sort((left, right) => right.roce - left.roce)[0]?.id ?? null;
  }, [properties]);

  const sortedProperties = useMemo(() => {
    const sorted = [...properties].sort((left, right) => {
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];

      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        return leftValue.localeCompare(rightValue);
      }

      return Number(leftValue) - Number(rightValue);
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [properties, sortDirection, sortKey]);

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection('desc');
  };

  const headerButtonClass =
    `dashboard-hover-value inline-flex items-center gap-1 text-left font-semibold transition ${dashboardLightLabelClass}`;
  const formatValuationAmount = (value: number, currency: PropertyMetrics['valuationDisplayCurrency']) =>
    formatPortfolioDisplayCurrency(value, currency, 'valuation', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const formatOperatingAmount = (value: number, currency: PropertyMetrics['operatingDisplayCurrency']) =>
    formatPortfolioDisplayCurrency(value, currency, 'operating', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });

  const renderHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => (
    <th className={`px-6 py-4 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button className={headerButtonClass} onClick={() => handleSort(key)}>
        <span>{label}</span>
        <ArrowDownUp className="h-3.5 w-3.5" />
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm">
        <thead className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,251,253,0.98)_0%,rgba(241,246,250,0.98)_100%)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/80">
          <tr>
            {renderHeader(t('table.property'), 'name', 'left')}
            <th className={`px-6 py-4 text-left font-semibold ${dashboardLightLabelClass}`}>
              {t('table.location')}
            </th>
            {renderHeader(t('table.currentValue'), 'currentEstimatedValue')}
            {renderHeader(t('table.debt'), 'mortgageBalance')}
            {renderHeader(t('table.equity'), 'equity')}
            {renderHeader(t('table.investedCapital'), 'investedCapital')}
            {renderHeader(t('table.equityPercentage'), 'equityPercentage')}
            {renderHeader(t('table.monthlyRent'), 'annualRentalIncome')}
            {renderHeader(t('table.netMonthlyCashflow'), 'netMonthlyCashflow')}
            {renderHeader(t('table.grossYield'), 'grossYield')}
            {renderHeader(t('table.roce'), 'roce')}
          </tr>
        </thead>
        <tbody>
          {sortedProperties.map((property, index) => {
            const isBestPerformer = property.id === bestPerformerId;
            const isStrongCashflow = property.netMonthlyCashflow >= 250;
            const isWeakCashflow = property.netMonthlyCashflow < 0;
            const isStrongRoce = property.roce >= 12;

            return (
              <tr
                key={property.id}
                className={`border-b border-slate-200/80 transition-colors dark:border-slate-800 ${
                  isBestPerformer
                    ? 'bg-gradient-to-r from-emerald-50/95 to-white dark:from-emerald-500/10 dark:to-slate-950'
                    : index % 2 === 0
                    ? 'bg-white/85 dark:bg-slate-900/70'
                    : 'bg-slate-50/65 dark:bg-slate-950/80'
                } hover:bg-slate-100/70 dark:hover:bg-slate-900`}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-1 rounded-full ${isBestPerformer ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${dashboardLightValueClass}`}>{property.name}</span>
                        {isBestPerformer && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <Crown className="h-3 w-3" />
                            {t('dashboard.bestPerformer')}
                          </span>
                        )}
                      </div>
                      {(isStrongCashflow || isStrongRoce) && (
                        <p className={`mt-1 text-xs ${dashboardLightMutedTextClass}`}>
                          {isStrongCashflow
                            ? t('dashboard.strongerCashflow')
                            : t('dashboard.strongerRoce')}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className={`px-6 py-4 ${dashboardLightMutedTextClass}`}>
                  {property.city}, {property.country}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatValuationAmount(property.currentEstimatedValue, property.valuationDisplayCurrency)}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatValuationAmount(property.mortgageBalance, property.valuationDisplayCurrency)}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatValuationAmount(property.equity, property.valuationDisplayCurrency)}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatValuationAmount(property.investedCapital, property.valuationDisplayCurrency)}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatPercentage(property.equityPercentage)}
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatOperatingAmount(property.annualRentalIncome / 12, property.operatingDisplayCurrency)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isStrongCashflow
                        ? `bg-emerald-100 ${dashboardMetricToneClass.success} dark:bg-emerald-500/15`
                        : isWeakCashflow
                        ? `bg-rose-100 ${dashboardMetricToneClass.danger} dark:bg-rose-500/15`
                        : `bg-slate-100 ${dashboardLightLabelClass} dark:bg-slate-800`
                    }`}
                  >
                    {formatOperatingAmount(property.netMonthlyCashflow, property.operatingDisplayCurrency)}
                  </span>
                </td>
                <td className={`px-6 py-4 text-right font-medium ${dashboardLightValueClass}`}>
                  {formatPercentage(property.grossYield)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isStrongRoce
                        ? `bg-emerald-100 ${dashboardMetricToneClass.success} dark:bg-emerald-500/15`
                        : property.roce >= 6
                        ? `bg-amber-100 ${dashboardMetricToneClass.warning} dark:bg-amber-500/15`
                        : `bg-slate-100 ${dashboardLightLabelClass} dark:bg-slate-800`
                    }`}
                  >
                    {formatPercentage(property.roce)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
