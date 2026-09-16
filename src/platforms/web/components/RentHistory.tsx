import React, { useMemo } from 'react';
import type { Property, RentPayment, RentReceivable, RentReceivableStatus } from '../../../common/types';
import { buildRentReceivableViews, generateRentReceivables, toRentPeriod } from '../../../common/utils/rentCollection';
import { formatCurrencyValue } from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import { appTextMutedClass, appTextStrongClass } from '../styles/dashboardTheme';

const statusClasses: Record<RentReceivableStatus, string> = {
  PAID: 'text-emerald-700 dark:text-emerald-300',
  OVERDUE: 'text-rose-700 dark:text-rose-300',
  PARTIAL: 'text-amber-700 dark:text-amber-300',
  DUE: 'text-blue-700 dark:text-blue-300',
  UPCOMING: 'text-slate-500 dark:text-slate-400',
};

export const RentHistory: React.FC<{
  property: Property;
  receivables: RentReceivable[];
  payments: RentPayment[];
}> = ({ property, receivables, payments }) => {
  const { settings } = useSettings();
  const locale = settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US';
  const views = useMemo(() => {
    const generated = generateRentReceivables([property], receivables, {
      throughPeriod: toRentPeriod(new Date()),
      payments,
    });
    return buildRentReceivableViews(generated, payments, [property])
      .filter((view) => view.propertyId === property.id)
      .sort((left, right) => right.period.localeCompare(left.period))
      .slice(0, 12);
  }, [payments, property, receivables]);

  if (views.length === 0) {
    return <p className={`mt-3 text-xs leading-5 ${appTextMutedClass}`}>Set a rent due day to begin the monthly rent history.</p>;
  }

  return <div className="mt-3 border-t border-[var(--app-border)] pt-3">
    <div className="mb-2 flex items-center justify-between"><p className={`text-xs font-semibold ${appTextStrongClass}`}>Rent History</p><span className={`text-[11px] ${appTextMutedClass}`}>Last {views.length} months</span></div>
    <div className="divide-y divide-[var(--app-border)]">
      {views.map((view) => {
        const [year, month] = view.period.split('-').map(Number);
        const label = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1, 12));
        return <div key={view.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-xs">
          <div><p className={`font-medium capitalize ${appTextStrongClass}`}>{label}</p>{view.paymentDates.length > 0 ? <p className={`mt-0.5 text-[10px] ${appTextMutedClass}`}>Paid {view.paymentDates.join(', ')}</p> : null}</div>
          <p className={`text-right ${appTextMutedClass}`}>{formatCurrencyValue(view.allocatedAmount, view.currency, { maximumFractionDigits: 2 })} / {formatCurrencyValue(view.expectedAmount, view.currency, { maximumFractionDigits: 2 })}{view.outstandingAmount > 0 ? <span className="block text-[10px]">{formatCurrencyValue(view.outstandingAmount, view.currency, { maximumFractionDigits: 2 })} outstanding</span> : null}</p>
          <span className={`text-[10px] font-semibold ${statusClasses[view.status]}`}>{view.status}</span>
        </div>;
      })}
    </div>
  </div>;
};
