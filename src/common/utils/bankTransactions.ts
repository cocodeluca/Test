import type {
  BankTransaction,
  BankTransactionSyncState,
  CashAccount,
  OpenBankingProviderName,
  SyncStatus,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { convertCurrencyWithCoverage, type CurrencyRates } from './currency';
import { getLinkedCashAccountIdentity } from './cashAccounts';

export interface ProviderTransactionRecord {
  externalTransactionId: string;
  /** Explicit provider evidence that this posted record replaces the named pending record. */
  pendingExternalTransactionId?: string | null;
  externalAccountId: string;
  bookingDate: string;
  authorizedDate?: string | null;
  amount: number;
  direction: 'credit' | 'debit';
  currency: DisplayCurrency;
  description: string;
  counterparty?: string | null;
  pending: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ProviderTransactionPage {
  transactions: ProviderTransactionRecord[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface BankTransactionNormalizationContext {
  providerName: OpenBankingProviderName;
  connectionId: string;
  accounts: CashAccount[];
  reportingCurrency: DisplayCurrency;
  fxRates: Readonly<Partial<CurrencyRates>>;
  fxRateTimestamp?: string | null;
  syncedAt: string;
}

export const getBankTransactionIdentity = (
  transaction: Pick<BankTransaction, 'providerName' | 'externalAccountId' | 'externalTransactionId'>
) => `${transaction.providerName}:${transaction.externalAccountId ?? 'unknown-account'}:${transaction.externalTransactionId}`;

const buildTransactionId = (
  providerName: OpenBankingProviderName,
  externalAccountId: string,
  externalTransactionId: string
) => `bank-tx:${encodeURIComponent(providerName)}:${encodeURIComponent(externalAccountId)}:${encodeURIComponent(externalTransactionId)}`;

export const normalizeProviderTransactions = (
  records: ProviderTransactionRecord[],
  context: BankTransactionNormalizationContext
): BankTransaction[] => {
  const accountsByExternalIdentity = new Map(
    context.accounts
      .filter((account) => account.connectionId === context.connectionId)
      .map((account) => [getLinkedCashAccountIdentity(account), account] as const)
      .filter((entry): entry is readonly [string, CashAccount] => Boolean(entry[0]))
  );

  return records.map((record) => {
    const account = accountsByExternalIdentity.get(
      `${context.providerName}:${record.externalAccountId}`
    );
    if (!account) {
      throw new Error(`Provider transaction references an unknown linked account: ${record.externalAccountId}`);
    }

    const absoluteAmount = Math.abs(record.amount);
    const amount = record.direction === 'credit' ? absoluteAmount : -absoluteAmount;
    const conversion = convertCurrencyWithCoverage(
      amount,
      record.currency,
      context.reportingCurrency,
      context.fxRates
    );
    const rateConversion = convertCurrencyWithCoverage(
      1,
      record.currency,
      context.reportingCurrency,
      context.fxRates
    );
    const sameCurrency = record.currency === context.reportingCurrency;

    return {
      id: buildTransactionId(context.providerName, record.externalAccountId, record.externalTransactionId),
      providerName: context.providerName,
      connectionId: context.connectionId,
      externalTransactionId: record.externalTransactionId,
      pendingExternalTransactionId: record.pendingExternalTransactionId ?? null,
      cashAccountId: account.id,
      externalAccountId: record.externalAccountId,
      bookingDate: record.bookingDate,
      authorizedDate: record.authorizedDate ?? null,
      amount,
      currency: record.currency,
      normalizedAmount: conversion.available ? conversion.value : null,
      normalizedCurrency: context.reportingCurrency,
      fxCoverage: sameCurrency ? 'same-currency' : conversion.available ? 'snapshot' : 'unavailable',
      fxRate: rateConversion.available ? rateConversion.value : null,
      fxRateTimestamp: sameCurrency ? null : conversion.available ? context.fxRateTimestamp ?? null : null,
      description: record.description,
      counterparty: record.counterparty ?? null,
      pending: record.pending,
      ...(record.metadata ? { providerMetadata: record.metadata } : {}),
      createdAt: context.syncedAt,
      updatedAt: context.syncedAt,
      syncedAt: context.syncedAt,
    };
  });
};

export const upsertBankTransactions = (
  existingTransactions: BankTransaction[],
  incomingTransactions: BankTransaction[]
): BankTransaction[] => {
  const existingByIdentity = new Map(
    existingTransactions.map((transaction) => [getBankTransactionIdentity(transaction), transaction])
  );
  const incomingByIdentity = new Map(
    incomingTransactions.map((transaction) => [getBankTransactionIdentity(transaction), transaction])
  );
  const incomingIdentities = new Set(incomingTransactions.map(getBankTransactionIdentity));
  const explicitlyReplacedPendingIdentities = new Set(
    incomingTransactions.flatMap((transaction) => {
      if (transaction.pending || !transaction.pendingExternalTransactionId) return [];
      const pendingIdentity = getBankTransactionIdentity({
        providerName: transaction.providerName,
        externalAccountId: transaction.externalAccountId,
        externalTransactionId: transaction.pendingExternalTransactionId,
      });
      const pendingTransaction = existingByIdentity.get(pendingIdentity) ?? incomingByIdentity.get(pendingIdentity);
      return pendingTransaction?.pending ? [pendingIdentity] : [];
    })
  );
  const retained = existingTransactions.filter(
    (transaction) => {
      const identity = getBankTransactionIdentity(transaction);
      return !incomingIdentities.has(identity) && !explicitlyReplacedPendingIdentities.has(identity);
    }
  );
  const upserted = incomingTransactions
    .filter((transaction) => !explicitlyReplacedPendingIdentities.has(getBankTransactionIdentity(transaction)))
    .map((transaction) => {
      const exactExisting = existingByIdentity.get(getBankTransactionIdentity(transaction));
      const linkedPendingIdentity = !transaction.pending && transaction.pendingExternalTransactionId
        ? getBankTransactionIdentity({
            providerName: transaction.providerName,
            externalAccountId: transaction.externalAccountId,
            externalTransactionId: transaction.pendingExternalTransactionId,
          })
        : null;
      const linkedPending = linkedPendingIdentity
        ? existingByIdentity.get(linkedPendingIdentity) ?? incomingByIdentity.get(linkedPendingIdentity)
        : undefined;
      const existing = exactExisting ?? (linkedPending?.pending ? linkedPending : undefined);
      return {
        ...existing,
        ...transaction,
        id: existing?.id ?? transaction.id,
        createdAt: existing?.createdAt ?? transaction.createdAt,
      };
    });
  return [...retained, ...upserted];
};

export const upsertBankTransactionSyncState = (
  states: BankTransactionSyncState[],
  next: {
    connectionId: string;
    providerName: OpenBankingProviderName;
    cursor?: string | null;
    syncStatus: SyncStatus;
    errorMessage?: string | null;
    syncedAt: string;
  }
): BankTransactionSyncState[] => {
  const value: BankTransactionSyncState = {
    connectionId: next.connectionId,
    providerName: next.providerName,
    cursor: next.cursor ?? null,
    lastSuccessfulSyncAt: next.syncStatus === 'success' ? next.syncedAt : null,
    syncStatus: next.syncStatus,
    errorMessage: next.errorMessage ?? null,
    updatedAt: next.syncedAt,
  };
  const existing = states.find((state) => state.connectionId === next.connectionId);
  if (existing && next.syncStatus !== 'success') {
    value.lastSuccessfulSyncAt = existing.lastSuccessfulSyncAt ?? null;
    value.cursor = existing.cursor ?? value.cursor;
  }
  return [
    ...states.filter((state) => state.connectionId !== next.connectionId),
    value,
  ];
};
