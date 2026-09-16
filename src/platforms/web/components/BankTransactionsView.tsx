import React, { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, RefreshCw } from 'lucide-react';
import type { BankTransaction, CashAccount } from '../../../common/types';
import type { AppLanguage } from '../../../common/types/settings';
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
  selectedAccountId: string;
  onSelectedAccountIdChange: (accountId: string) => void;
  onSyncMock?: () => void;
  isSyncing: boolean;
  language: AppLanguage;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const localeByLanguage: Record<AppLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-PT',
};

const formatTransactionDate = (date: string, language: AppLanguage) => {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(localeByLanguage[language], { dateStyle: 'medium' }).format(parsed);
};

export const BankTransactionsView: React.FC<BankTransactionsViewProps> = ({
  transactions,
  cashAccounts,
  selectedAccountId,
  onSelectedAccountIdChange,
  onSyncMock,
  isSyncing,
  language,
  t,
}) => {
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
                return (
                  <tr
                    key={transaction.id}
                    data-bank-transaction-id={transaction.id}
                    data-direction={direction}
                    data-state={transaction.pending ? 'pending' : 'posted'}
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
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${transaction.pending ? 'border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' : 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                        {transaction.pending ? t('cashAccounts.transactionPending') : t('cashAccounts.transactionPosted')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
