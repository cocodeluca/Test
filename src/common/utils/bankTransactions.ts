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
  /** Explicit provider evidence that this transaction reverses the named posted transaction. */
  reversesExternalTransactionId?: string | null;
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
  removedTransactions?: ProviderRemovedTransactionRecord[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface ProviderRemovedTransactionRecord {
  externalTransactionId: string;
  externalAccountId: string;
  reason?: string | null;
}

export interface BankTransactionLifecycleEvent {
  bankTransactionId: string;
  reason: 'provider-removed' | 'provider-reversed';
  relatedBankTransactionId?: string | null;
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
  transaction: Pick<BankTransaction, 'providerName' | 'externalAccountId' | 'externalTransactionId'> &
    Partial<Pick<BankTransaction, 'cashAccountId'>>
) => {
  const accountIdentity = transaction.externalAccountId
    ? `external:${transaction.externalAccountId}`
    : `cash:${transaction.cashAccountId ?? 'unknown-account'}`;
  return `${transaction.providerName}:${accountIdentity}:${transaction.externalTransactionId}`;
};

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
      .filter((account) =>
        account.connectionId === context.connectionId && account.status === 'active'
      )
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
      reversesExternalTransactionId: record.reversesExternalTransactionId ?? null,
      reversesBankTransactionId: null,
      reversedByBankTransactionId: null,
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
      lifecycleStatus: record.reversesExternalTransactionId ? 'reversal' : 'active',
      lifecycleUpdatedAt: null,
      removedAt: null,
      removalReason: null,
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
  const lastIncomingIndexByIdentity = new Map<string, number>();
  incomingTransactions.forEach((transaction, index) => {
    lastIncomingIndexByIdentity.set(getBankTransactionIdentity(transaction), index);
  });
  const deduplicatedIncomingTransactions = incomingTransactions.filter(
    (transaction, index) =>
      lastIncomingIndexByIdentity.get(getBankTransactionIdentity(transaction)) === index
  );
  const existingByIdentity = new Map(
    existingTransactions.map((transaction) => [getBankTransactionIdentity(transaction), transaction])
  );
  const incomingByIdentity = new Map(
    deduplicatedIncomingTransactions.map((transaction) => [getBankTransactionIdentity(transaction), transaction])
  );
  const incomingIdentities = new Set(
    deduplicatedIncomingTransactions.map(getBankTransactionIdentity)
  );
  const explicitlyReplacedPendingIdentities = new Set(
    deduplicatedIncomingTransactions.flatMap((transaction) => {
      if (transaction.pending || !transaction.pendingExternalTransactionId) return [];
      const pendingIdentity = getBankTransactionIdentity({
        providerName: transaction.providerName,
        externalAccountId: transaction.externalAccountId,
        cashAccountId: transaction.cashAccountId,
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
  const upserted = deduplicatedIncomingTransactions
    .filter((transaction) => !explicitlyReplacedPendingIdentities.has(getBankTransactionIdentity(transaction)))
    .map((transaction) => {
      const exactExisting = existingByIdentity.get(getBankTransactionIdentity(transaction));
      const linkedPendingIdentity = !transaction.pending && transaction.pendingExternalTransactionId
        ? getBankTransactionIdentity({
          providerName: transaction.providerName,
          externalAccountId: transaction.externalAccountId,
          cashAccountId: transaction.cashAccountId,
          externalTransactionId: transaction.pendingExternalTransactionId,
        })
        : null;
      const linkedPending = linkedPendingIdentity
        ? existingByIdentity.get(linkedPendingIdentity) ?? incomingByIdentity.get(linkedPendingIdentity)
        : undefined;
      const existing = exactExisting ?? (linkedPending?.pending ? linkedPending : undefined);
      const preserveTerminalLifecycle = exactExisting &&
        (exactExisting.lifecycleStatus === 'removed' || exactExisting.lifecycleStatus === 'reversed');
      const preserveReversalAudit = exactExisting?.lifecycleStatus === 'reversal' &&
        transaction.lifecycleStatus === 'reversal';
      return {
        ...existing,
        ...transaction,
        id: existing?.id ?? transaction.id,
        createdAt: existing?.createdAt ?? transaction.createdAt,
        ...(preserveTerminalLifecycle ? {
          lifecycleStatus: exactExisting.lifecycleStatus,
          lifecycleUpdatedAt: exactExisting.lifecycleUpdatedAt ?? null,
          removedAt: exactExisting.removedAt ?? null,
          removalReason: exactExisting.removalReason ?? null,
          reversesBankTransactionId: exactExisting.reversesBankTransactionId ?? null,
          reversedByBankTransactionId: exactExisting.reversedByBankTransactionId ?? null,
        } : {}),
        ...(preserveReversalAudit ? {
          reversesBankTransactionId: exactExisting.reversesBankTransactionId ?? null,
          lifecycleUpdatedAt: exactExisting.lifecycleUpdatedAt ?? null,
        } : {}),
      };
    });
  return [...retained, ...upserted];
};

export const applyBankTransactionProviderLifecycle = (args: {
  existingTransactions: BankTransaction[];
  incomingTransactions: BankTransaction[];
  removedTransactions?: ProviderRemovedTransactionRecord[];
  providerName: OpenBankingProviderName;
  syncedAt: string;
}): { transactions: BankTransaction[]; lifecycleEvents: BankTransactionLifecycleEvent[] } => {
  let transactions = upsertBankTransactions(args.existingTransactions, args.incomingTransactions);
  const lifecycleEvents = new Map<string, BankTransactionLifecycleEvent>();

  for (const removed of args.removedTransactions ?? []) {
    const identity = getBankTransactionIdentity({
      providerName: args.providerName,
      externalAccountId: removed.externalAccountId,
      externalTransactionId: removed.externalTransactionId,
    });
    const existing = transactions.find((transaction) => getBankTransactionIdentity(transaction) === identity);
    if (!existing) continue;
    transactions = transactions.map((transaction) => transaction.id === existing.id ? {
      ...transaction,
      lifecycleStatus: 'removed',
      lifecycleUpdatedAt: transaction.lifecycleStatus === 'removed'
        ? transaction.lifecycleUpdatedAt ?? args.syncedAt
        : args.syncedAt,
      removedAt: transaction.removedAt ?? args.syncedAt,
      removalReason: transaction.removalReason ?? removed.reason ?? null,
    } : transaction);
    lifecycleEvents.set(existing.id, {
      bankTransactionId: existing.id,
      reason: 'provider-removed',
    });
  }

  const reversalTransactions = transactions.filter((transaction) =>
    transaction.lifecycleStatus === 'reversal' && transaction.reversesExternalTransactionId
  );
  for (const reversal of reversalTransactions) {
    const originalIdentity = getBankTransactionIdentity({
      providerName: reversal.providerName,
      externalAccountId: reversal.externalAccountId,
      cashAccountId: reversal.cashAccountId,
      externalTransactionId: reversal.reversesExternalTransactionId!,
    });
    const original = transactions.find((transaction) =>
      transaction.id !== reversal.id && getBankTransactionIdentity(transaction) === originalIdentity
    );
    if (!original) continue;
    transactions = transactions.map((transaction) => {
      if (transaction.id === reversal.id) {
        return {
          ...transaction,
          reversesBankTransactionId: original.id,
          lifecycleUpdatedAt: transaction.lifecycleUpdatedAt ?? args.syncedAt,
        };
      }
      if (transaction.id === original.id) {
        const alreadyLinked = transaction.lifecycleStatus === 'reversed' &&
          transaction.reversedByBankTransactionId === reversal.id;
        return {
          ...transaction,
          lifecycleStatus: 'reversed',
          reversedByBankTransactionId: reversal.id,
          lifecycleUpdatedAt: alreadyLinked
            ? transaction.lifecycleUpdatedAt ?? args.syncedAt
            : args.syncedAt,
        };
      }
      return transaction;
    });
    lifecycleEvents.set(original.id, {
      bankTransactionId: original.id,
      reason: 'provider-reversed',
      relatedBankTransactionId: reversal.id,
    });
  }

  return { transactions, lifecycleEvents: [...lifecycleEvents.values()] };
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
