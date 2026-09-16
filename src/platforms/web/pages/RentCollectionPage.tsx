import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Settings2, Trash2, X } from 'lucide-react';
import type { Property, RentPayment, RentReceivable, RentReceivableStatus } from '../../../common/types';
import {
  buildRentReceivableViews,
  createManualRentPayment,
  generateRentReceivables,
  shiftRentPeriod,
  summarizeRentPeriod,
  summarizeOverdueRentByProperty,
  toRentPeriod,
} from '../../../common/utils/rentCollection';
import { getActiveLease } from '../../../common/utils/leaseUpdates';
import { formatCurrencyValue } from '../../../common/utils/formatting';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { useSettings } from '../context/SettingsContext';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface RentCollectionPageProps {
  properties: Property[];
  receivables: RentReceivable[];
  payments: RentPayment[];
  onUpdate: (receivables: RentReceivable[], payments: RentPayment[]) => void;
  onOpenProperties?: (propertyId?: string, setup?: { propertyIds: string[]; currentIndex: number }) => void;
}

const statusClasses: Record<RentReceivableStatus, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  OVERDUE: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  PARTIAL: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  DUE: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  UPCOMING: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const formatPeriod = (period: string, locale: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1, 12)
  );
};

export const RentCollectionPage: React.FC<RentCollectionPageProps> = ({
  properties,
  receivables,
  payments,
  onUpdate,
  onOpenProperties,
}) => {
  const { settings, t } = useSettings();
  const locale = settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US';
  const currentPeriod = toRentPeriod(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [paymentModal, setPaymentModal] = useState<{ initialReceivableId?: string } | null>(null);
  const [reviewPropertyId, setReviewPropertyId] = useState<string | null>(null);
  const reviewReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const throughPeriod = selectedPeriod > currentPeriod ? selectedPeriod : currentPeriod;
  const generatedReceivables = useMemo(
    () => generateRentReceivables(properties, receivables, { throughPeriod, payments }),
    [properties, receivables, throughPeriod, payments]
  );
  const views = useMemo(
    () => buildRentReceivableViews(generatedReceivables, payments, properties),
    [generatedReceivables, payments, properties]
  );
  const periodViews = views.filter((view) => view.period === selectedPeriod);
  const summary = summarizeRentPeriod(views, selectedPeriod, {
    targetCurrency: settings.currency,
    rateOverrides: getSettingsCurrencyRates(settings),
  });
  const attention = summarizeOverdueRentByProperty(views);
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const missingDueDay = properties.filter((property) => {
    const lease = getActiveLease(property);
    return lease?.active && !lease.rentDueDay;
  });
  const primaryCurrency = settings.currency;
  const money = (amount: number, currency = primaryCurrency) =>
    formatCurrencyValue(amount, currency, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const kpis = [
    { label: t('rentCollectionUi.expectedRent'), value: money(summary.expectedAmount), helper: t('rentCollectionUi.expectedRentHelp'), icon: CalendarDays, tone: 'text-blue-600 dark:text-blue-300', iconSurface: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
    { label: t('rentCollectionUi.receivedRent'), value: money(summary.receivedAmount), helper: t('rentCollectionUi.receivedRentHelp'), icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-300', iconSurface: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
    { label: t('rentCollectionUi.outstandingRent'), value: money(summary.outstandingAmount), helper: t('rentCollectionUi.outstandingRentHelp'), icon: AlertTriangle, tone: summary.outstandingAmount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500', iconSurface: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
    { label: t('rentCollectionUi.paidExpected'), value: `${summary.paidCount} / ${summary.expectedCount}`, helper: t('rentCollectionUi.paidExpectedHelp'), icon: BarChart3, tone: summary.expectedCount > 0 && summary.paidCount === summary.expectedCount ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500', iconSurface: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
  ];
  const openDueDaySetup = () => onOpenProperties?.(missingDueDay[0]?.id, { propertyIds: missingDueDay.map((property) => property.id), currentIndex: 0 });

  const openPaymentReview = (propertyId: string, trigger: HTMLButtonElement) => {
    reviewReturnFocusRef.current = trigger;
    setReviewPropertyId(propertyId);
  };

  const restoreReviewTriggerFocus = () => {
    const trigger = reviewReturnFocusRef.current;
    if (typeof window !== 'undefined') window.setTimeout(() => trigger?.isConnected && trigger.focus(), 0);
  };

  const closePaymentReview = () => {
    setReviewPropertyId(null);
    restoreReviewTriggerFocus();
  };

  const openPaymentForReceivable = (receivableId: string) => {
    setReviewPropertyId(null);
    setPaymentModal({ initialReceivableId: receivableId });
  };

  const handleRecordPayment = (payload: {
    receivableId: string;
    receivedDate: string;
    amount: number;
    reference: string;
    note: string;
  }) => {
    const receivable = generatedReceivables.find((candidate) => candidate.id === payload.receivableId);
    if (!receivable) return;
    const payment = createManualRentPayment({ receivable, ...payload });
    onUpdate(generatedReceivables, [...payments, payment]);
    setPaymentModal(null);
    restoreReviewTriggerFocus();
  };

  const handleDeletePayment = (paymentId: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('rentCollectionUi.removePaymentConfirm'))) return;
    onUpdate(receivables, payments.filter((payment) => payment.id !== paymentId));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextMutedClass}`}>{t('rentCollectionUi.eyebrow')}</p>
          <h1 className={`mt-1 text-3xl font-semibold tracking-[-0.04em] ${appTextStrongClass}`}>{t('rentCollectionUi.title')}</h1>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('rentCollectionUi.subtitle')}</p>
        </div>
        <button type="button" onClick={() => setPaymentModal({})} disabled={views.length === 0} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${appButtonPrimaryClass}`}>
          <CreditCard className="h-4 w-4" /> {t('rentCollectionUi.recordPayment')}
        </button>
      </header>

      {missingDueDay.length > 0 ? (
        <section className="flex items-start gap-3 rounded-2xl border border-[#F3C76B] bg-[#FFF8E6] px-4 py-3 text-[#5F4300]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D99A00]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#5F4300]">{t('rentCollectionUi.rentDueDayRequired')}</p>
            <p className="mt-0.5 text-xs leading-5 text-[#6B5A2E]">{t('rentCollectionUi.rentDueDayDescription', { properties: missingDueDay.map((property) => property.name).join(', ') })}</p>
          </div>
          {onOpenProperties ? <button type="button" onClick={openDueDaySetup} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#D8B45A] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-semibold text-[#6A4A00] shadow-sm transition hover:bg-[#FFF4D6]"><Settings2 className="h-3.5 w-3.5" /> {t('rentCollectionUi.setDueDays')}</button> : null}
        </section>
      ) : null}

      {attention.length > 0 ? (
        <section className={`rounded-2xl border px-4 py-3 ${appBorderClass} ${appPanelClass}`}>
          <div className="flex items-center justify-between gap-3"><div><h2 className={`text-sm font-semibold ${appTextStrongClass}`}>{t('rentCollectionUi.needsAttention')}</h2><p className={`mt-0.5 text-xs ${appTextMutedClass}`}>{t('rentCollectionUi.needsAttentionHelp')}</p></div><span className="rounded-full bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">{attention.length}</span></div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {attention.map((item) => <div key={item.propertyId} className="flex items-center justify-between gap-3 rounded-xl border border-rose-200/70 bg-rose-50/45 px-3 py-2 dark:border-rose-500/20 dark:bg-rose-500/5"><div className="min-w-0"><p className={`truncate text-sm font-semibold ${appTextStrongClass}`}>{propertyById.get(item.propertyId)?.name ?? item.propertyId}</p><p className={`mt-0.5 text-xs ${appTextMutedClass}`}>{t(item.overdueCount === 1 ? 'rentCollectionUi.overdueCount_one' : 'rentCollectionUi.overdueCount_other', { count: item.overdueCount })} · {money(item.totalOutstanding, item.currency)} {t('rentCollectionUi.outstanding')} · {t('rentCollectionUi.oldestOverdue', { period: formatPeriod(item.oldestOverduePeriod, locale) })}</p></div><button type="button" onClick={(event) => openPaymentReview(item.propertyId, event.currentTarget)} aria-label={t('rentCollectionUi.reviewPaymentsFor', { property: propertyById.get(item.propertyId)?.name ?? item.propertyId })} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${appButtonMutedClass}`}>{t('rentCollectionUi.reviewPayments')}</button></div>)}
          </div>
        </section>
      ) : null}

      <section className={`overflow-hidden rounded-3xl border ${appBorderClass} ${appPanelClass}`}>
        <div className={`flex items-center justify-between border-b px-4 py-2.5 ${appBorderClass}`}>
          <button type="button" aria-label={t('rentCollectionUi.previousMonth')} onClick={() => setSelectedPeriod(shiftRentPeriod(selectedPeriod, -1))} className={`rounded-xl p-2 ${appButtonMutedClass}`}><ChevronLeft className="h-4 w-4" /></button>
          <h2 className={`inline-flex items-center gap-2 text-lg font-semibold capitalize ${appTextStrongClass}`}><CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-300" />{formatPeriod(selectedPeriod, locale)}</h2>
          <button type="button" aria-label={t('rentCollectionUi.nextMonth')} onClick={() => setSelectedPeriod(shiftRentPeriod(selectedPeriod, 1))} className={`rounded-xl p-2 ${appButtonMutedClass}`}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 bg-[var(--app-panel-inset)] p-3 md:grid-cols-4">
          {kpis.map(({ label, value, helper, icon: Icon, tone, iconSurface }) => <div key={label} className={`rounded-2xl border bg-[var(--app-panel)] px-3 py-3 ${appBorderClass}`}><div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconSurface}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className={`text-[11px] font-medium ${appTextMutedClass}`}>{label}</p><Icon className={`h-4 w-4 ${tone}`} /></div><p className={`mt-1 text-xl font-semibold tracking-tight ${appTextStrongClass}`}>{value}</p><p className={`mt-0.5 text-[11px] ${appTextMutedClass}`}>{helper}</p></div></div></div>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-[var(--app-panel-inset)]"><tr>{['property', 'expected', 'received', 'outstandingLabel', 'statusLabel'].map((key) => <th key={key} className={`px-4 py-2.5 text-xs font-semibold ${appTextMutedClass}`}>{t(`rentCollectionUi.${key}`)}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {periodViews.map((view) => <tr key={view.id}>
                <td className={`px-4 py-3 font-medium ${appTextStrongClass}`}>{propertyById.get(view.propertyId)?.name ?? view.propertyId}</td>
                <td className="px-4 py-3">{money(view.expectedAmount, view.currency)}</td>
                <td className="px-4 py-3">{money(view.allocatedAmount, view.currency)}</td>
                <td className="px-4 py-3">{money(view.outstandingAmount, view.currency)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[view.status]}`}>{t(`rentCollectionUi.status.${view.status.toLowerCase()}`)}</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {periodViews.length === 0 ? <div className={`border-t px-4 py-4 text-center ${appBorderClass}`}><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><CalendarDays className="h-6 w-6" /></div><p className={`mt-2 text-sm font-semibold ${appTextStrongClass}`}>{t('rentCollectionUi.noReceivables', { period: formatPeriod(selectedPeriod, locale) })}</p><p className={`mt-0.5 text-xs ${appTextMutedClass}`}>{missingDueDay.length > 0 ? t('rentCollectionUi.configureDueDaysHelp') : t('rentCollectionUi.noRentExpected')}</p>{missingDueDay.length > 0 && onOpenProperties ? <button type="button" onClick={openDueDaySetup} className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${appButtonPrimaryClass}`}><Settings2 className="h-3.5 w-3.5" /> {t('rentCollectionUi.configureLeaseDueDays')}</button> : null}</div> : null}
      </section>

      {payments.length > 0 ? (
        <section className={`rounded-3xl border p-4 ${appBorderClass} ${appPanelClass}`}>
          <h2 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('rentCollectionUi.recordedPayments')}</h2>
          <div className="mt-2 divide-y divide-[var(--app-border)]">
            {[...payments].sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)).slice(0, 12).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 py-2.5"><div><p className={`text-sm font-medium ${appTextStrongClass}`}>{propertyById.get(payment.propertyId)?.name ?? payment.propertyId} · {money(payment.amount, payment.currency)}</p><p className={`text-xs ${appTextMutedClass}`}>{formatDueDate(payment.receivedDate, locale)}{payment.reference ? ` · ${payment.reference}` : ''}</p></div><button type="button" onClick={() => handleDeletePayment(payment.id)} aria-label={t('rentCollectionUi.removePayment')} className={`rounded-xl p-2 text-rose-600 ${appButtonMutedClass}`}><Trash2 className="h-4 w-4" /></button></div>)}
          </div>
        </section>
      ) : null}

      {reviewPropertyId ? <PaymentReviewModal property={propertyById.get(reviewPropertyId)} views={views.filter((view) => view.propertyId === reviewPropertyId && view.status === 'OVERDUE')} locale={locale} money={money} onClose={closePaymentReview} onRecordPayment={openPaymentForReceivable} /> : null}
      {paymentModal ? <RecordPaymentModal views={views} properties={properties} locale={locale} initialReceivableId={paymentModal.initialReceivableId} onClose={() => { setPaymentModal(null); restoreReviewTriggerFocus(); }} onSave={handleRecordPayment} /> : null}
    </div>
  );
};

const formatDueDate = (value: string, locale: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, day, 12)
  );
};

export const PaymentReviewModal: React.FC<{
  property?: Property;
  views: ReturnType<typeof buildRentReceivableViews>;
  locale: string;
  money: (amount: number, currency?: RentReceivable['currency']) => string;
  onClose: () => void;
  onRecordPayment: (receivableId: string) => void;
}> = ({ property, views, locale, money, onClose, onRecordPayment }) => {
  const { t } = useSettings();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const orderedViews = [...views].sort((left, right) => left.period.localeCompare(right.period));

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const propertyName = property?.name ?? t('rentCollectionUi.unknownProperty');
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="payment-review-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border p-5 shadow-2xl ${appBorderClass} ${appPanelClass}`}>
      <div className="flex items-start justify-between gap-4"><div><h2 id="payment-review-title" className={`text-xl font-semibold ${appTextStrongClass}`}>{t('rentCollectionUi.paymentReviewTitle', { property: propertyName })}</h2><p className={`mt-1 text-sm ${appTextMutedClass}`}>{t('rentCollectionUi.paymentReviewHelp')}</p></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={t('rentCollectionUi.closePaymentReview')} className={`rounded-xl p-2 ${appButtonMutedClass}`}><X className="h-4 w-4" /></button></div>
      <div className="mt-5 space-y-3">
        {orderedViews.map((view) => <article key={view.id} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-inset)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={`font-semibold capitalize ${appTextStrongClass}`}>{formatPeriod(view.period, locale)}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[view.status]}`}>{t(`rentCollectionUi.status.${view.status.toLowerCase()}`)}</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-5">
            <div><dt className={appTextMutedClass}>{t('rentCollectionUi.expected')}</dt><dd className={`font-semibold ${appTextStrongClass}`}>{money(view.expectedAmount, view.currency)}</dd></div>
            <div><dt className={appTextMutedClass}>{t('rentCollectionUi.received')}</dt><dd className={`font-semibold ${appTextStrongClass}`}>{money(view.allocatedAmount, view.currency)}</dd></div>
            <div><dt className={appTextMutedClass}>{t('rentCollectionUi.outstandingLabel')}</dt><dd className={`font-semibold ${appTextStrongClass}`}>{money(view.outstandingAmount, view.currency)}</dd></div>
            <div><dt className={appTextMutedClass}>{t('rentCollectionUi.dueDate')}</dt><dd className={`font-semibold ${appTextStrongClass}`}>{formatDueDate(view.dueDate, locale)}</dd></div>
            <div className="col-span-2 flex items-end sm:col-span-1"><button type="button" onClick={() => onRecordPayment(view.id)} aria-label={t('rentCollectionUi.recordPaymentFor', { property: propertyName, period: formatPeriod(view.period, locale) })} className={`w-full rounded-xl px-3 py-2 text-sm font-semibold ${appButtonPrimaryClass}`}>{t('rentCollectionUi.recordPayment')}</button></div>
          </dl>
        </article>)}
        {orderedViews.length === 0 ? <p className={`rounded-2xl border border-[var(--app-border)] p-4 text-sm ${appTextMutedClass}`}>{t('rentCollectionUi.noOverduePeriods')}</p> : null}
      </div>
    </section>
  </div>;
};

export const RecordPaymentModal: React.FC<{
  views: ReturnType<typeof buildRentReceivableViews>;
  properties: Property[];
  locale: string;
  initialReceivableId?: string;
  onClose: () => void;
  onSave: (payload: { receivableId: string; receivedDate: string; amount: number; reference: string; note: string }) => void;
}> = ({ views, properties, locale, initialReceivableId, onClose, onSave }) => {
  const { t } = useSettings();
  const outstanding = views.filter((view) => view.outstandingAmount > 0).sort((a, b) => a.period.localeCompare(b.period));
  const initialId = outstanding.some((view) => view.id === initialReceivableId) ? initialReceivableId! : outstanding[0]?.id ?? '';
  const [receivableId, setReceivableId] = useState(initialId);
  const selected = outstanding.find((view) => view.id === receivableId);
  const [receivedDate, setReceivedDate] = useState(toRentPeriod(new Date()) + `-${String(new Date().getDate()).padStart(2, '0')}`);
  const [amount, setAmount] = useState(selected?.outstandingAmount ?? 0);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="record-payment-title">
    <form onSubmit={(event) => { event.preventDefault(); if (selected && amount > 0 && receivedDate) onSave({ receivableId, receivedDate, amount, reference, note }); }} className={`w-full max-w-lg rounded-3xl border p-5 shadow-2xl ${appBorderClass} ${appPanelClass}`}>
      <div className="flex items-center justify-between"><h2 id="record-payment-title" className={`text-xl font-semibold ${appTextStrongClass}`}>{t('rentCollectionUi.recordPayment')}</h2><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={t('rentCollectionUi.closeRecordPayment')} className={`rounded-xl p-2 ${appButtonMutedClass}`}><X className="h-4 w-4" /></button></div>
      <div className="mt-5 space-y-4">
        <label className={`block text-xs font-semibold ${appTextMutedClass}`}>{t('rentCollectionUi.rentPeriodReceivable')}<select required value={receivableId} onChange={(event) => { const id = event.target.value; setReceivableId(id); setAmount(outstanding.find((view) => view.id === id)?.outstandingAmount ?? 0); }} className={`mt-1.5 w-full rounded-xl px-3 py-2.5 ${appInputClass}`}>{outstanding.map((view) => <option key={view.id} value={view.id}>{propertyById.get(view.propertyId)?.name ?? view.propertyId} · {formatPeriod(view.period, locale)} · {t('rentCollectionUi.outstandingOption', { amount: formatCurrencyValue(view.outstandingAmount, view.currency) })}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className={`block text-xs font-semibold ${appTextMutedClass}`}>{t('rentCollectionUi.paymentDate')}<input required type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} className={`mt-1.5 w-full rounded-xl px-3 py-2.5 ${appInputClass}`} /></label><label className={`block text-xs font-semibold ${appTextMutedClass}`}>{t('rentCollectionUi.amount')}<input required type="number" min="0.01" step="0.01" max={selected?.outstandingAmount} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className={`mt-1.5 w-full rounded-xl px-3 py-2.5 ${appInputClass}`} /></label></div>
        <label className={`block text-xs font-semibold ${appTextMutedClass}`}>{t('rentCollectionUi.referenceOptional')}<input value={reference} onChange={(event) => setReference(event.target.value)} className={`mt-1.5 w-full rounded-xl px-3 py-2.5 ${appInputClass}`} /></label>
        <label className={`block text-xs font-semibold ${appTextMutedClass}`}>{t('rentCollectionUi.noteOptional')}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`mt-1.5 w-full rounded-xl px-3 py-2.5 ${appInputClass}`} /></label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 text-sm ${appButtonMutedClass}`}>{t('common.cancel')}</button><button type="submit" disabled={!selected || amount <= 0} className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${appButtonPrimaryClass}`}>{t('rentCollectionUi.savePayment')}</button></div>
    </form>
  </div>;
};
