import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, RefreshCw } from 'lucide-react';
import type {
  BankReconciliationTargetType,
  BankTransaction,
  BankTransactionReconciliation,
  CashAccount,
  PropertyExpenseCategory,
} from '../../../common/types';
import type { AppLanguage } from '../../../common/types/settings';
import {
  getBankReconciliationView,
  type BankReconciliationContext,
} from '../../../common/utils/bankReconciliation';
import { getCashAccountDisplayName } from '../../../common/utils/cashAccounts';
import { formatCurrencyValue } from '../../../common/utils/formatting';
import {
  appBorderClass,
  appButtonMutedClass,
  appInputClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface BankTransactionsViewProps {
  transactions: BankTransaction[];
  cashAccounts: CashAccount[];
  reconciliations?: BankTransactionReconciliation[];
  reconciliationContext?: BankReconciliationContext;
  selectedAccountId: string;
  onSelectedAccountIdChange: (accountId: string) => void;
  onSyncMock?: () => void;
  onConfirmMatch?: (transaction: BankTransaction, targetType: BankReconciliationTargetType, targetId: string) => void;
  onIgnore?: (transaction: BankTransaction) => void;
  onUnmatch?: (transaction: BankTransaction) => void;
  onCategorize?: (transaction: BankTransaction, propertyId: string, category: PropertyExpenseCategory) => void;
  isSyncing: boolean;
  language: AppLanguage;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const localeByLanguage: Record<AppLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-PT',
};

const expenseCategories: PropertyExpenseCategory[] = [
  'COMMUNITY', 'PROPERTY_TAX', 'HOME_INSURANCE', 'RENT_DEFAULT_INSURANCE',
  'PROPERTY_MANAGEMENT', 'MAINTENANCE', 'ELECTRICITY', 'WATER', 'GAS',
  'UTILITIES', 'INTERNET', 'MUNICIPAL_TAX', 'SPECIAL_ASSESSMENT', 'OTHER',
];

const formatTransactionDate = (date: string, language: AppLanguage) => {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(localeByLanguage[language], { dateStyle: 'medium' }).format(parsed);
};

export const BankTransactionsView: React.FC<BankTransactionsViewProps> = ({
  transactions,
  cashAccounts,
  reconciliations = [],
  reconciliationContext,
  selectedAccountId,
  onSelectedAccountIdChange,
  onSyncMock,
  onConfirmMatch,
  onIgnore,
  onUnmatch,
  onCategorize,
  isSyncing,
  language,
  t,
}) => {
  const [assignment, setAssignment] = useState<{
    transaction: BankTransaction; propertyId: string; category: PropertyExpenseCategory;
  } | null>(null);
  const accountsById = useMemo(
    () => new Map(cashAccounts.map((account) => [account.id, account])),
    [cashAccounts]
  );
  const visibleTransactions = useMemo(
    () => transactions
      .filter((transaction) => selectedAccountId === 'all' || transaction.cashAccountId === selectedAccountId)
      .sort((left, right) => right.bookingDate.localeCompare(left.bookingDate) || left.id.localeCompare(right.id)),
    [selectedAccountId, transactions]
  );

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${appTextStrongClass}`}>{t('cashAccounts.transactionsTitle')}</h2>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.transactionsDescription')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {cashAccounts.length > 1 ? (
            <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>
              {t('cashAccounts.transactionAccount')}
              <select
                aria-label={t('cashAccounts.transactionAccount')}
                value={selectedAccountId}
                onChange={(event) => onSelectedAccountIdChange(event.target.value)}
                className={`mt-2 min-w-48 ${appInputClass}`}
              >
                <option value="all">{t('cashAccounts.transactionAllAccounts')}</option>
                {cashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{getCashAccountDisplayName(account)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {onSyncMock ? (
            <button
              type="button"
              disabled={isSyncing}
              onClick={onSyncMock}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? t('cashAccounts.transactionSyncing') : t('cashAccounts.transactionSyncMock')}
            </button>
          ) : null}
        </div>
      </div>

      {visibleTransactions.length === 0 ? (
        <div className={`mt-6 rounded-[28px] border border-dashed p-10 text-center ${appBorderClass}`}>
          <Receipt className="mx-auto h-10 w-10 text-cyan-600 dark:text-cyan-300" />
          <h3 className={`mt-5 text-[1.5rem] font-semibold ${appTextStrongClass}`}>{t('cashAccounts.transactionEmptyTitle')}</h3>
          <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.transactionEmptyBody')}</p>
        </div>
      ) : (
        <div className={`mt-6 overflow-x-auto rounded-[24px] ${appPanelInsetClass}`}>
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className={`border-b ${appBorderClass}`}>
                {[
                  t('cashAccounts.transactionDate'),
                  t('cashAccounts.transactionAccount'),
                  t('cashAccounts.transactionDescription'),
                  t('cashAccounts.transactionAmount'),
                  t('cashAccounts.transactionCurrency'),
                  t('cashAccounts.transactionState'),
                  t('cashAccounts.reconciliation'),
                ].map((label) => (
                  <th key={label} scope="col" className={`whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => {
                const account = accountsById.get(transaction.cashAccountId);
                const isInflow = transaction.amount > 0;
                const isOutflow = transaction.amount < 0;
                const direction = isInflow ? 'inflow' : isOutflow ? 'outflow' : 'neutral';
                const amountPrefix = isInflow ? '+' : isOutflow ? '\u2212' : '';
                const transactionState = transaction.lifecycleStatus === 'removed'
                  ? 'removed'
                  : transaction.lifecycleStatus === 'reversed'
                    ? 'reversed'
                    : transaction.lifecycleStatus === 'reversal'
                      ? 'reversal'
                      : transaction.pending ? 'pending' : 'posted';
                const transactionStateClass = transactionState === 'pending'
                  ? 'border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
                  : transactionState === 'posted'
                    ? 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-slate-300/80 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300';
                const reconciliation = reconciliationContext
                  ? getBankReconciliationView(transaction, reconciliations, reconciliationContext)
                  : null;
                const matchedObligation = reconciliation?.reconciliation?.targetType === 'expense-obligation'
                  ? reconciliationContext?.expenseObligations.find((item) => item.id === reconciliation.reconciliation?.targetId)
                  : null;
                const suggestedObligation = reconciliation?.suggestion?.targetType === 'expense-obligation'
                  ? reconciliationContext?.expenseObligations.find((item) => item.id === reconciliation.suggestion?.targetId)
                  : null;
                const openAssignment = () => setAssignment({
                  transaction, propertyId: matchedObligation?.propertyId ?? reconciliation?.suggestion?.propertyId ?? '',
                  category: reconciliation?.reconciliation?.expenseCategory ?? matchedObligation?.category ?? reconciliation?.suggestion?.expenseCategory ?? suggestedObligation?.category ??
                    (expenseCategories.includes(reconciliation?.suggestion?.targetLabel as PropertyExpenseCategory)
                      ? reconciliation!.suggestion!.targetLabel as PropertyExpenseCategory : 'OTHER'),
                });
                return (
                  <tr
                    key={transaction.id}
                    data-bank-transaction-id={transaction.id}
                    data-direction={direction}
                    data-state={transactionState}
                    className={`border-b last:border-b-0 ${appBorderClass}`}
                  >
                    <td className={`whitespace-nowrap px-4 py-4 text-sm ${appTextMutedClass}`}>{formatTransactionDate(transaction.bookingDate, language)}</td>
                    <td className={`whitespace-nowrap px-4 py-4 text-sm font-medium ${appTextStrongClass}`}>{account ? getCashAccountDisplayName(account) : t('cashAccounts.transactionUnknownAccount')}</td>
                    <td className="min-w-64 px-4 py-4">
                      <p className={`text-sm font-medium ${appTextStrongClass}`}>{transaction.description}</p>
                      {transaction.counterparty ? <p className={`mt-1 text-xs ${appTextMutedClass}`}>{transaction.counterparty}</p> : null}
                    </td>
                    <td
                      data-raw-amount={transaction.amount}
                      className={`whitespace-nowrap px-4 py-4 text-sm font-semibold ${isInflow ? 'text-emerald-600 dark:text-emerald-300' : isOutflow ? 'text-rose-600 dark:text-rose-300' : appTextStrongClass}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isInflow ? <ArrowDownLeft className="h-4 w-4" /> : isOutflow ? <ArrowUpRight className="h-4 w-4" /> : null}
                        {amountPrefix}{formatCurrencyValue(Math.abs(transaction.amount), transaction.currency)}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-4 text-sm ${appTextMutedClass}`}>{transaction.currency}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${transactionStateClass}`}>
                        {t(`cashAccounts.transactionLifecycle.${transactionState}`)}
                      </span>
                    </td>
                    <td className="min-w-72 px-4 py-4">
                      {reconciliation ? (
                        <div data-reconciliation-status={reconciliation.status}>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${reconciliation.status === 'matched' ? 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' : reconciliation.status === 'suggested' ? 'border-cyan-300/70 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300' : 'border-slate-300/80 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300'}`}>
                            {t(`cashAccounts.reconciliationStatus.${reconciliation.status}`)}
                          </span>
                          {reconciliation.suggestion ? (
                            <div className="mt-3">
                              <p className={`text-sm font-medium ${appTextStrongClass}`}>
                                {t(`cashAccounts.reconciliationTarget.${reconciliation.suggestion.targetType}`)}: {reconciliation.suggestion.propertyName} · {reconciliation.suggestion.expenseCategory
                                  ? t(`cashAccounts.expenseCategory.${reconciliation.suggestion.expenseCategory}`)
                                  : suggestedObligation
                                  ? t(`cashAccounts.expenseCategory.${suggestedObligation.category}`)
                                  : expenseCategories.includes(reconciliation.suggestion.targetLabel as PropertyExpenseCategory)
                                    ? t(`cashAccounts.expenseCategory.${reconciliation.suggestion.targetLabel}`)
                                    : reconciliation.suggestion.targetLabel}
                              </p>
                              <p className={`mt-1 text-xs ${appTextMutedClass}`} data-reconciliation-obligation-details>
                                {reconciliation.suggestion.period
                                  ? `${t('cashAccounts.reconciliationPeriod')}: ${reconciliation.suggestion.period} · `
                                  : ''}
                                {t('cashAccounts.reconciliationDueDate')}: {formatTransactionDate(reconciliation.suggestion.dueDate, language)}
                              </p>
                              <p className={`mt-1 text-xs ${appTextMutedClass}`} data-reconciliation-amount-details>
                                {t('cashAccounts.reconciliationExpectedAmount')}: {formatCurrencyValue(reconciliation.suggestion.expectedAmount, reconciliation.suggestion.currency)} ·{' '}
                                {t('cashAccounts.reconciliationTransactionAmount')}: {formatCurrencyValue(reconciliation.suggestion.transactionAmount, reconciliation.suggestion.currency)}
                              </p>
                              <p className={`mt-1 text-xs ${appTextMutedClass}`}>
                                {reconciliation.suggestion.reasons.map((reason) =>
                                  reason === 'date-proximity'
                                    ? `${t(`cashAccounts.reconciliationReason.${reason}`)} (${reconciliation.suggestion!.dateDistanceDays} ${t('cashAccounts.reconciliationDays')})`
                                    : t(`cashAccounts.reconciliationReason.${reason}`)
                                ).join(' · ')}
                              </p>
                            </div>
                          ) : null}
                          {reconciliation.status === 'matched' && matchedObligation ? (
                            <p className={`mt-3 text-sm ${appTextStrongClass}`}>
                              {reconciliationContext?.properties.find((item) => item.id === matchedObligation.propertyId)?.name ?? matchedObligation.propertyId} · {t(`cashAccounts.expenseCategory.${reconciliation.reconciliation?.expenseCategory ?? matchedObligation.category}`)}
                            </p>
                          ) : null}
                          {(reconciliation.status === 'unmatched' || reconciliation.status === 'suggested') && onIgnore ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {reconciliation.suggestion && onConfirmMatch ? (
                                <button
                                  type="button"
                                  onClick={() => onConfirmMatch(transaction, reconciliation.suggestion!.targetType, reconciliation.suggestion!.targetId)}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                                >
                                  {t('cashAccounts.reconciliationConfirm')}
                                </button>
                              ) : null}
                              {isOutflow && !transaction.pending && transactionState === 'posted' && onCategorize ? (
                                <button type="button" onClick={openAssignment}
                                  className={`rounded-lg px-3 py-1.5 text-xs ${appButtonMutedClass} ${appTextStrongClass}`}>
                                  {t(reconciliation.status === 'suggested' ? 'cashAccounts.reconciliationChange' : 'cashAccounts.reconciliationCategorize')}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => onIgnore(transaction)}
                                className={`rounded-lg px-3 py-1.5 text-xs ${appButtonMutedClass} ${appTextStrongClass}`}
                              >
                                {t('cashAccounts.reconciliationIgnore')}
                              </button>
                            </div>
                          ) : null}
                          {reconciliation.status === 'matched' && (onUnmatch || (matchedObligation && onCategorize)) ? (
                            <div className="mt-3 flex gap-2">{matchedObligation && onCategorize ? <button type="button" onClick={openAssignment}
                              className={`rounded-lg px-3 py-1.5 text-xs ${appButtonMutedClass} ${appTextStrongClass}`}>
                              {t('cashAccounts.reconciliationChange')}
                            </button> : null}{onUnmatch ? <button
                              type="button"
                              onClick={() => onUnmatch(transaction)}
                              className={`rounded-lg px-3 py-1.5 text-xs ${appButtonMutedClass} ${appTextStrongClass}`}
                            >
                              {t('cashAccounts.reconciliationUnmatch')}
                            </button> : null}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className={`text-sm ${appTextMutedClass}`}>{t('cashAccounts.reconciliationStatus.unmatched')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {assignment && reconciliationContext && onCategorize ? (
        <div role="dialog" aria-modal="true" aria-label={t('cashAccounts.assignExpense')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className={`w-full max-w-md rounded-2xl p-5 ${appPanelInsetClass}`}>
            <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('cashAccounts.assignExpense')}</h3>
            <p className={`mt-3 text-sm ${appTextMutedClass}`}>{formatTransactionDate(assignment.transaction.bookingDate, language)} · {formatCurrencyValue(Math.abs(assignment.transaction.amount), assignment.transaction.currency)}</p>
            <p className={`mt-1 text-sm ${appTextStrongClass}`}>{assignment.transaction.description}</p>
            <label className={`mt-4 block text-sm ${appTextStrongClass}`}>{t('cashAccounts.expenseProperty')}
              <select className={`mt-1 w-full ${appInputClass}`} value={assignment.propertyId}
                onChange={(event) => setAssignment({ ...assignment, propertyId: event.target.value })}>
                <option value="">{t('cashAccounts.selectProperty')}</option>
                {reconciliationContext.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </label>
            <label className={`mt-3 block text-sm ${appTextStrongClass}`}>{t('cashAccounts.expenseCategoryLabel')}
              <select className={`mt-1 w-full ${appInputClass}`} value={assignment.category}
                onChange={(event) => setAssignment({ ...assignment, category: event.target.value as PropertyExpenseCategory })}>
                {expenseCategories.map((category) => <option key={category} value={category}>{t(`cashAccounts.expenseCategory.${category}`)}</option>)}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAssignment(null)} className={`rounded-lg px-3 py-2 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>{t('cashAccounts.reconciliationCancel')}</button>
              <button type="button" disabled={!assignment.propertyId} onClick={() => {
                onCategorize(assignment.transaction, assignment.propertyId, assignment.category);
                setAssignment(null);
              }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('cashAccounts.reconciliationConfirm')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
