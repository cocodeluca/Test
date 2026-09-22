import React, { useMemo, useState } from 'react';
import { ArrowDownUp, Building2, ChevronRight, MapPin, Search } from 'lucide-react';
import type { OccupancyStatus } from '../../../common/types';
import { formatPercentage, formatPortfolioDisplayCurrency } from '../../../common/utils/formatting';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonPrimaryClass,
  appBorderClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';
import {
  filterAndSortPropertyDirectoryItems,
  type PropertyDirectoryItem,
  type PropertyDirectorySort,
} from '../pages/propertiesDirectoryViewModel';

interface PropertyDirectoryProps {
  items: PropertyDirectoryItem[];
  onOpenProperty: (propertyId: string) => void;
  onAddProperty: () => void;
}

const occupancyTone: Record<OccupancyStatus, string> = {
  occupied: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  vacant: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'tenant-to-be-confirmed': 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
};

export const PropertyDirectory: React.FC<PropertyDirectoryProps> = ({ items, onOpenProperty, onAddProperty }) => {
  const { settings, t } = useSettings();
  const [query, setQuery] = useState('');
  const [occupancy, setOccupancy] = useState<OccupancyStatus | 'all'>('all');
  const [sort, setSort] = useState<PropertyDirectorySort>('name');
  const fxRates = getSettingsCurrencyRates(settings);
  const visibleItems = useMemo(
    () => filterAndSortPropertyDirectoryItems(items, query, occupancy, sort),
    [items, occupancy, query, sort]
  );
  const formatValue = (value: number, currency: PropertyDirectoryItem['metrics']['valuationDisplayCurrency']) =>
    formatPortfolioDisplayCurrency(value, currency, 'valuation', { reportingCurrency: settings.currency, rateOverrides: fxRates });
  const formatOperating = (value: number, currency: PropertyDirectoryItem['metrics']['operatingDisplayCurrency']) =>
    formatPortfolioDisplayCurrency(value, currency, 'operating', { reportingCurrency: settings.currency, rateOverrides: fxRates });
  const occupancyLabel = (status: OccupancyStatus) => t(`properties.directory.occupancy.${status}`);

  return (
    <section aria-label={t('properties.directory.title')} className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('properties.directory.title')}</h2>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('properties.directory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'occupied', 'vacant', 'tenant-to-be-confirmed'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setOccupancy(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${occupancy === status ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900' : `${appBorderClass} ${appTextMutedClass} hover:border-sky-300`}`}
            >
              {t(status === 'all' ? 'properties.directory.filters.all' : `properties.directory.occupancy.${status}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--app-border)] bg-white/55 p-3 dark:bg-slate-950/20 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${appTextMutedClass}`} />
          <span className="sr-only">{t('properties.directory.searchLabel')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('properties.directory.searchPlaceholder')}
            className={`w-full rounded-xl border bg-white/80 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 dark:bg-slate-950/40 ${appBorderClass} ${appTextStrongClass}`}
          />
        </label>
        <label className={`flex items-center gap-2 text-sm ${appTextMutedClass}`}>
          <ArrowDownUp className="h-4 w-4" />
          <span className="sr-only">{t('properties.directory.sortLabel')}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as PropertyDirectorySort)} className={`rounded-xl border bg-white/80 px-3 py-2.5 text-sm ${appBorderClass} ${appTextStrongClass} dark:bg-slate-950/40`}>
            <option value="name">{t('properties.directory.sort.name')}</option>
            <option value="value">{t('properties.directory.sort.value')}</option>
            <option value="cashflow">{t('properties.directory.sort.cashflow')}</option>
            <option value="rent">{t('properties.directory.sort.rent')}</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <div className={`${appPanelClass} px-6 py-14 text-center`}>
          <Building2 className={`mx-auto h-9 w-9 ${appTextMutedClass}`} />
          <h3 className={`mt-4 text-xl font-semibold ${appTextStrongClass}`}>{t('propertiesUi.emptyTitle')}</h3>
          <p className={`mx-auto mt-2 max-w-lg text-sm ${appTextMutedClass}`}>{t('propertiesUi.emptyBody')}</p>
          <button type="button" onClick={onAddProperty} className={`mt-6 px-4 py-2.5 text-sm font-semibold ${appButtonPrimaryClass}`}>
            {t('properties.addProperty')}
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className={`${appPanelClass} px-6 py-14 text-center`}>
          <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('properties.directory.noResultsTitle')}</h3>
          <p className={`mt-2 text-sm ${appTextMutedClass}`}>{t('properties.directory.noResultsBody')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {visibleItems.map((item) => {
            const { property, metrics } = item;
            const ltvLabel = item.ltv === null ? t('common.notProvided') : formatPercentage(item.ltv);
            return (
              <article key={property.id} className={`${appPanelClass} group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-26px_rgba(15,23,42,0.45)]`}>
                <button type="button" onClick={() => onOpenProperty(property.id)} className="block w-full text-left" aria-label={`${t('properties.directory.open')} ${property.name}`}>
                  <div className="relative h-40 overflow-hidden border-b border-[var(--app-border)] bg-[var(--app-panel-inset)]">
                    {item.heroImageUrl ? <img src={item.heroImageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><Building2 className={`h-10 w-10 ${appTextMutedClass}`} /></div>}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${occupancyTone[property.occupancyStatus]}`}>{occupancyLabel(property.occupancyStatus)}</span>
                      {item.propertyType ? <span className="rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{item.propertyType}</span> : null}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className={`truncate text-base font-semibold ${appTextStrongClass}`}>{property.name}</h3>
                        <p className={`mt-1 flex items-center gap-1 truncate text-xs ${appTextMutedClass}`}><MapPin className="h-3.5 w-3.5 shrink-0" />{item.shortLocation || t('common.notProvided')}</p>
                      </div>
                      <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${appTextMutedClass}`} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className={`${appPanelInsetClass} rounded-xl p-2.5`}><p className={`text-[11px] ${appTextMutedClass}`}>{t('properties.directory.metrics.value')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatValue(metrics.currentEstimatedValue, metrics.valuationDisplayCurrency)}</p></div>
                      <div className={`${appPanelInsetClass} rounded-xl p-2.5`}><p className={`text-[11px] ${appTextMutedClass}`}>{t('properties.directory.metrics.rent')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{formatOperating(metrics.annualRentalIncome / 12, metrics.operatingDisplayCurrency)}</p></div>
                      <div className={`${appPanelInsetClass} rounded-xl p-2.5`}><p className={`text-[11px] ${appTextMutedClass}`}>{t('properties.directory.metrics.cashflow')}</p><p className={`mt-1 text-sm font-semibold ${metrics.netMonthlyCashflow >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{formatOperating(metrics.netMonthlyCashflow, metrics.operatingDisplayCurrency)}</p></div>
                      <div className={`${appPanelInsetClass} rounded-xl p-2.5`}><p className={`text-[11px] ${appTextMutedClass}`}>{item.ltv === null ? t('properties.directory.metrics.equity') : t('properties.directory.metrics.ltv')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{item.ltv === null ? formatValue(metrics.equity, metrics.valuationDisplayCurrency) : ltvLabel}</p></div>
                    </div>
                    <div className={`mt-4 flex items-center justify-between border-t pt-3 text-sm font-semibold ${appBorderClass} ${appTextStrongClass}`}><span>{t('properties.directory.open')}</span><span className="text-sky-600 dark:text-sky-300">{t('properties.directory.openDetails')}</span></div>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
