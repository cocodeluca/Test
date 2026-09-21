import type {
  BankTransaction,
  BankTransactionSyncState,
  CashAccount,
  OpenBankingProviderName,
  PlaidEnvironment,
  SyncStatus,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { convertCurrencyWithCoverage, type CurrencyRates } from './currency';

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
  /** Some providers, including Plaid sync, omit the account ID from removal records. */
  externalAccountId?: string | null;
  reason?: string | null;
}

export interface BankTransactionLifecycleEvent {
  bankTransactionId: string;
  reason: 'provider-removed' | 'provider-reversed';
  relatedBankTransactionId?: string | null;
}

export interface BankTransactionNormalizationContext {
  providerName: OpenBankingProviderName;
  providerEnvironment?: PlaidEnvironment | null;
  connectionId: string;
  accounts: CashAccount[];
  reportingCurrency: DisplayCurrency;
  fxRates: Readonly<Partial<CurrencyRates>>;
  fxRateTimestamp?: string | null;
  syncedAt: string;
}

export const getBankTransactionIdentity = (
  transaction: Pick<BankTransaction, 'providerName' | 'providerEnvironment' | 'externalAccountId' | 'externalTransactionId'> &
    Partial<Pick<BankTransaction, 'cashAccountId' | 'connectionId'>>
) => {
  const accountIdentity = transaction.externalAccountId
    ? `external:${transaction.externalAccountId}`
    : `cash:${transaction.cashAccountId ?? 'unknown-account'}`;
  const connectionIdentity = transaction.connectionId
    ? `connection:${transaction.connectionId}`
    : 'legacy-connection';
  const environmentIdentity = transaction.providerEnvironment ??
    (transaction.providerName === 'plaid' ? 'sandbox' : 'local');
  return `${environmentIdentity}:${connectionIdentity}:${transaction.providerName}:${accountIdentity}:${transaction.externalTransactionId}`;
};

const getLegacyBankTransactionIdentity = (
  transaction: Pick<BankTransaction, 'providerName' | 'providerEnvironment' | 'externalAccountId' | 'externalTransactionId'> &
    Partial<Pick<BankTransaction, 'cashAccountId'>>
) => {
  const accountIdentity = transaction.externalAccountId
    ? `external:${transaction.externalAccountId}`
    : `cash:${transaction.cashAccountId ?? 'unknown-account'}`;
  const environmentIdentity = transaction.providerEnvironment ??
    (transaction.providerName === 'plaid' ? 'sandbox' : 'local');
  return `${environmentIdentity}:${transaction.providerName}:${accountIdentity}:${transaction.externalTransactionId}`;
};

const buildTransactionId = (
  providerEnvironment: PlaidEnvironment | null | undefined,
  connectionId: string,
  providerName: OpenBankingProviderName,
  externalAccountId: string,
  externalTransactionId: string
) => `bank-tx:${encodeURIComponent(providerEnvironment ?? (providerName === 'plaid' ? 'sandbox' : 'local'))}:${encodeURIComponent(connectionId)}:${encodeURIComponent(providerName)}:${encodeURIComponent(externalAccountId)}:${encodeURIComponent(externalTransactionId)}`;

export const normalizeProviderTransactions = (
  records: ProviderTransactionRecord[],
  context: BankTransactionNormalizationContext
): BankTransaction[] => {
  const accountsByExternalIdentity = new Map(
    context.accounts
      .filter((account) =>
        account.connectionId === context.connectionId &&
        account.providerName === context.providerName &&
        (context.providerName !== 'plaid' ||
          (account.providerEnvironment ?? 'sandbox') ===
            (context.providerEnvironment ?? 'sandbox')) &&
        account.status === 'active'
      )
      .map((account) => [account.externalAccountId, account] as const)
      .filter((entry): entry is readonly [string, CashAccount] => Boolean(entry[0]))
  );

  return records.map((record) => {
    const account = accountsByExternalIdentity.get(record.externalAccountId);
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
      id: buildTransactionId(
        context.providerEnvironment,
        context.connectionId,
        context.providerName,
        record.externalAccountId,
        record.externalTransactionId
      ),
      providerName: context.providerName,
      providerEnvironment:
        context.providerEnvironment ?? (context.providerName === 'plaid' ? 'sandbox' : null),
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
  const legacyExistingByIdentity = new Map(
    existingTransactions
      .filter((transaction) => !transaction.connectionId)
      .map((transaction) => [getLegacyBankTransactionIdentity(transaction), transaction])
  );
  const incomingByIdentity = new Map(
    deduplicatedIncomingTransactions.map((transaction) => [getBankTransactionIdentity(transaction), transaction])
  );
  const incomingIdentities = new Set(
    deduplicatedIncomingTransactions.map(getBankTransactionIdentity)
  );
  const claimedLegacyTransactionIds = new Set<string>();
  const matchedExistingByIncomingIdentity = new Map<string, BankTransaction>();
  for (const transaction of deduplicatedIncomingTransactions) {
    const identity = getBankTransactionIdentity(transaction);
    const exact = existingByIdentity.get(identity);
    if (exact) {
      matchedExistingByIncomingIdentity.set(identity, exact);
      continue;
    }
    const legacy = legacyExistingByIdentity.get(getLegacyBankTransactionIdentity(transaction));
    if (legacy && !claimedLegacyTransactionIds.has(legacy.id)) {
      claimedLegacyTransactionIds.add(legacy.id);
      matchedExistingByIncomingIdentity.set(identity, legacy);
    }
  }
  const matchedExistingIds = new Set(
    [...matchedExistingByIncomingIdentity.values()].map((transaction) => transaction.id)
  );
  const explicitlyReplacedPendingIdentities = new Set(
    deduplicatedIncomingTransactions.flatMap((transaction) => {
      if (transaction.pending || !transaction.pendingExternalTransactionId) return [];
      const pendingIdentity = getBankTransactionIdentity({
        providerName: transaction.providerName,
        providerEnvironment: transaction.providerEnvironment,
        externalAccountId: transaction.externalAccountId,
        cashAccountId: transaction.cashAccountId,
        connectionId: transaction.connectionId,
        externalTransactionId: transaction.pendingExternalTransactionId,
      });
      const pendingTransaction = existingByIdentity.get(pendingIdentity) ??
        legacyExistingByIdentity.get(getLegacyBankTransactionIdentity({
          providerName: transaction.providerName,
          providerEnvironment: transaction.providerEnvironment,
          externalAccountId: transaction.externalAccountId,
          cashAccountId: transaction.cashAccountId,
          externalTransactionId: transaction.pendingExternalTransactionId,
        })) ??
        incomingByIdentity.get(pendingIdentity);
      return pendingTransaction?.pending
        ? [getBankTransactionIdentity(pendingTransaction)]
        : [];
    })
  );
  const retained = existingTransactions.filter(
    (transaction) => {
      const identity = getBankTransactionIdentity(transaction);
      return !incomingIdentities.has(identity) &&
        !explicitlyReplacedPendingIdentities.has(identity) &&
        !matchedExistingIds.has(transaction.id);
    }
  );
  const upserted = deduplicatedIncomingTransactions
    .filter((transaction) => !explicitlyReplacedPendingIdentities.has(getBankTransactionIdentity(transaction)))
    .map((transaction) => {
      const exactExisting = matchedExistingByIncomingIdentity.get(
        getBankTransactionIdentity(transaction)
      );
      const linkedPendingIdentity = !transaction.pending && transaction.pendingExternalTransactionId
        ? getBankTransactionIdentity({
          providerName: transaction.providerName,
          providerEnvironment: transaction.providerEnvironment,
          externalAccountId: transaction.externalAccountId,
          cashAccountId: transaction.cashAccountId,
          connectionId: transaction.connectionId,
          externalTransactionId: transaction.pendingExternalTransactionId,
        })
        : null;
      const linkedPending = linkedPendingIdentity
        ? existingByIdentity.get(linkedPendingIdentity) ??
          legacyExistingByIdentity.get(getLegacyBankTransactionIdentity({
            providerName: transaction.providerName,
            providerEnvironment: transaction.providerEnvironment,
            externalAccountId: transaction.externalAccountId,
            cashAccountId: transaction.cashAccountId,
            externalTransactionId: transaction.pendingExternalTransactionId!,
          })) ??
          incomingByIdentity.get(linkedPendingIdentity)
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
  providerEnvironment?: PlaidEnvironment | null;
  connectionId: string;
  syncedAt: string;
}): { transactions: BankTransaction[]; lifecycleEvents: BankTransactionLifecycleEvent[] } => {
  let transactions = upsertBankTransactions(args.existingTransactions, args.incomingTransactions);
  const lifecycleEvents = new Map<string, BankTransactionLifecycleEvent>();

  for (const removed of args.removedTransactions ?? []) {
    const candidates = transactions.filter((transaction) =>
      transaction.providerName === args.providerName &&
      (transaction.providerEnvironment ?? (transaction.providerName === 'plaid' ? 'sandbox' : null)) ===
        (args.providerEnvironment ?? (args.providerName === 'plaid' ? 'sandbox' : null)) &&
      (!transaction.connectionId || transaction.connectionId === args.connectionId) &&
      transaction.externalTransactionId === removed.externalTransactionId &&
      (!removed.externalAccountId || transaction.externalAccountId === removed.externalAccountId)
    );
    const existing = candidates.length === 1 ? candidates[0] : undefined;
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
      providerEnvironment: reversal.providerEnvironment,
      connectionId: reversal.connectionId,
      externalAccountId: reversal.externalAccountId,
      cashAccountId: reversal.cashAccountId,
      externalTransactionId: reversal.reversesExternalTransactionId!,
    });
    const originalLegacyIdentity = getLegacyBankTransactionIdentity({
      providerName: reversal.providerName,
      providerEnvironment: reversal.providerEnvironment,
      externalAccountId: reversal.externalAccountId,
      cashAccountId: reversal.cashAccountId,
      externalTransactionId: reversal.reversesExternalTransactionId!,
    });
    const original = transactions.find((transaction) =>
      transaction.id !== reversal.id &&
      (getBankTransactionIdentity(transaction) === originalIdentity ||
        (!transaction.connectionId &&
          getLegacyBankTransactionIdentity(transaction) === originalLegacyIdentity))
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
    providerEnvironment?: PlaidEnvironment | null;
    syncStatus: SyncStatus;
    errorMessage?: string | null;
    errorCode?: string | null;
    syncedAt: string;
  }
): BankTransactionSyncState[] => {
  const providerEnvironment = next.providerEnvironment ??
    (next.providerName === 'plaid' ? 'sandbox' : null);
  const value: BankTransactionSyncState = {
    connectionId: next.connectionId,
    providerName: next.providerName,
    providerEnvironment,
    lastSuccessfulSyncAt: next.syncStatus === 'success' ? next.syncedAt : null,
    syncStatus: next.syncStatus,
    errorMessage: next.errorMessage ?? null,
    errorCode: next.errorCode ?? null,
    updatedAt: next.syncedAt,
  };
  const isSameProviderSyncState = (state: BankTransactionSyncState) =>
    state.connectionId === next.connectionId &&
    state.providerName === next.providerName &&
    (state.providerEnvironment ?? (state.providerName === 'plaid' ? 'sandbox' : null)) ===
      providerEnvironment;
  const existing = states.find(isSameProviderSyncState);
  if (existing && next.syncStatus !== 'success') {
    value.lastSuccessfulSyncAt = existing.lastSuccessfulSyncAt ?? null;
  }
  return [
    ...states.filter((state) => !isSameProviderSyncState(state)),
    value,
  ];
};
