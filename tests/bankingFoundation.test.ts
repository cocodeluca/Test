import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import type { BankTransaction, CashAccount } from '../src/common/types';
import {
  createBankConnection,
  createLinkedCashAccount,
  createManualCashAccount,
  deactivateLinkedCashAccountsForConnection,
  upsertLinkedCashAccounts,
} from '../src/common/utils/cashAccounts';
import {
  applyBankTransactionProviderLifecycle,
  normalizeProviderTransactions,
  type ProviderTransactionRecord,
  upsertBankTransactions,
  upsertBankTransactionSyncState,
} from '../src/common/utils/bankTransactions';
import { openBankingAdapters } from '../src/platforms/web/services/openBanking';
import {
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
} from '../src/platforms/web/services/localAccountStore';

const connection = createBankConnection({
  id: 'connection-mock-1',
  userId: 'banking-test-user',
  providerName: 'mock-bank',
  institutionName: 'Mock Institution',
  institutionId: 'mock-institution-1',
});

const linkedAccount = (overrides: Partial<CashAccount> = {}) => createLinkedCashAccount({
  id: 'cash-stable-1',
  userId: 'banking-test-user',
  providerName: 'mock-bank',
  connectionId: connection.id,
  institutionId: connection.institutionId,
  institutionName: connection.institutionName,
  externalAccountId: `${connection.institutionId}:checking`,
  currency: 'EUR',
  ...overrides,
});

const normalize = (
  records: ProviderTransactionRecord[],
  accounts: CashAccount[] = [linkedAccount()],
  syncedAt = '2026-09-16T12:00:00.000Z'
) => normalizeProviderTransactions(records, {
  providerName: 'mock-bank',
  connectionId: connection.id,
  accounts,
  reportingCurrency: 'EUR',
  fxRates: { EUR: 1, USD: 0.5 },
  fxRateTimestamp: '2026-09-16T00:00:00.000Z',
  syncedAt,
});

const providerRecord = (
  overrides: Partial<ProviderTransactionRecord> = {}
): ProviderTransactionRecord => ({
  externalTransactionId: 'provider-tx-1',
  externalAccountId: `${connection.institutionId}:checking`,
  bookingDate: '2026-09-15',
  amount: 100,
  direction: 'credit',
  currency: 'EUR',
  description: 'Incoming transfer',
  pending: false,
  ...overrides,
});

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
});

test('repeated linked-account sync preserves internal IDs and leaves manual accounts untouched', () => {
  const manual = createManualCashAccount({ id: 'manual-1', currentBalance: 500 });
  const existing = linkedAccount({ id: 'internal-original', currentBalance: 1000 });
  const firstIncoming = linkedAccount({ id: 'provider-generated-1', currentBalance: 1100 });
  const secondIncoming = linkedAccount({ id: 'provider-generated-2', currentBalance: 1200 });

  const first = upsertLinkedCashAccounts([manual, existing], [firstIncoming]);
  const second = upsertLinkedCashAccounts(first, [secondIncoming]);
  const synced = second.find((account) => account.sourceType === 'linked');

  assert.equal(synced?.id, 'internal-original');
  assert.equal(synced?.currentBalance, 1200);
  assert.equal(second.filter((account) => account.sourceType === 'linked').length, 1);
  assert.strictEqual(second.find((account) => account.id === manual.id), manual);
});

test('same external transaction ID on two accounts remains account-scoped and idempotent', () => {
  const checking = linkedAccount({ id: 'cash-checking', externalAccountId: 'shared-bank:checking' });
  const savings = linkedAccount({ id: 'cash-savings', externalAccountId: 'shared-bank:savings' });
  const records = [
    providerRecord({ externalTransactionId: 'shared-transaction', externalAccountId: 'shared-bank:checking' }),
    providerRecord({ externalTransactionId: 'shared-transaction', externalAccountId: 'shared-bank:savings' }),
  ];
  const first = upsertBankTransactions([], normalize(records, [checking, savings]));
  const repeated = upsertBankTransactions(
    first,
    normalize(records, [checking, savings], '2026-09-16T13:00:00.000Z')
  );

  assert.equal(first.length, 2);
  assert.equal(new Set(first.map((item) => item.id)).size, 2);
  assert.deepEqual(
    first.map((item) => item.cashAccountId).sort(),
    ['cash-checking', 'cash-savings']
  );
  assert.equal(repeated.length, 2);
  assert.deepEqual(
    repeated.map((item) => item.id).sort(),
    first.map((item) => item.id).sort()
  );
});

test('same external account ID under different providers does not collide', () => {
  const externalAccountId = 'provider-shared-account';
  const mockAccount = linkedAccount({
    id: 'cash-mock-provider',
    externalAccountId,
  });
  const tinkConnection = createBankConnection({
    id: 'connection-tink',
    providerName: 'tink',
    institutionId: 'institution-tink',
  });
  const tinkAccount = createLinkedCashAccount({
    id: 'cash-tink-provider',
    providerName: 'tink',
    connectionId: tinkConnection.id,
    externalAccountId,
    currency: 'EUR',
  });
  const accounts = upsertLinkedCashAccounts([], [mockAccount, tinkAccount]);
  const mockTransaction = normalizeProviderTransactions([providerRecord({ externalAccountId })], {
    providerName: 'mock-bank',
    connectionId: connection.id,
    accounts,
    reportingCurrency: 'EUR',
    fxRates: { EUR: 1 },
    syncedAt: '2026-09-16T12:00:00.000Z',
  })[0];
  const tinkTransaction = normalizeProviderTransactions([providerRecord({ externalAccountId })], {
    providerName: 'tink',
    connectionId: tinkConnection.id,
    accounts,
    reportingCurrency: 'EUR',
    fxRates: { EUR: 1 },
    syncedAt: '2026-09-16T12:00:00.000Z',
  })[0];
  const transactions = upsertBankTransactions([], [mockTransaction, tinkTransaction]);

  assert.equal(accounts.length, 2);
  assert.equal(mockTransaction.cashAccountId, mockAccount.id);
  assert.equal(tinkTransaction.cashAccountId, tinkAccount.id);
  assert.equal(transactions.length, 2);
  assert.notEqual(mockTransaction.id, tinkTransaction.id);
});

test('inactive linked account rejects new transaction normalization', () => {
  const inactive = linkedAccount({ status: 'inactive' });

  assert.throws(
    () => normalize([providerRecord()], [inactive]),
    /unknown linked account/
  );
});

test('repeated mock transaction fetch is idempotent', async () => {
  const adapter = openBankingAdapters['mock-bank'];
  assert.ok(adapter.fetchTransactions);
  assert.equal(openBankingAdapters.plaid.fetchTransactions, undefined);
  const accounts = [
    linkedAccount(),
    linkedAccount({
      id: 'cash-stable-2',
      externalAccountId: `${connection.institutionId}:savings`,
      currency: 'USD',
    }),
  ];
  const firstPage = await adapter.fetchTransactions(connection, accounts, null);
  const secondPage = await adapter.fetchTransactions(connection, accounts, firstPage.nextCursor);
  const first = upsertBankTransactions([], normalize(firstPage.transactions, accounts));
  const secondLifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: first,
    incomingTransactions: normalize(secondPage.transactions, accounts, '2026-09-16T13:00:00.000Z'),
    removedTransactions: secondPage.removedTransactions,
    providerName: 'mock-bank',
    syncedAt: '2026-09-16T13:00:00.000Z',
  });
  const second = secondLifecycle.transactions;
  const thirdPage = await adapter.fetchTransactions(connection, accounts, secondPage.nextCursor);
  const third = applyBankTransactionProviderLifecycle({
    existingTransactions: second,
    incomingTransactions: normalize(thirdPage.transactions, accounts, '2026-09-16T14:00:00.000Z'),
    removedTransactions: thirdPage.removedTransactions,
    providerName: 'mock-bank',
    syncedAt: '2026-09-16T14:00:00.000Z',
  }).transactions;

  assert.equal(firstPage.transactions.length, 7);
  assert.equal(second.length, 8);
  assert.equal(third.length, 8);
  assert.deepEqual(
    third.map((transaction) => transaction.id).sort(),
    second.map((transaction) => transaction.id).sort()
  );
  assert.deepEqual(
    third.map(({ id, lifecycleStatus, lifecycleUpdatedAt, removedAt, reversesBankTransactionId, reversedByBankTransactionId }) => ({
      id,
      lifecycleStatus,
      lifecycleUpdatedAt,
      removedAt,
      reversesBankTransactionId,
      reversedByBankTransactionId,
    })),
    second.map(({ id, lifecycleStatus, lifecycleUpdatedAt, removedAt, reversesBankTransactionId, reversedByBankTransactionId }) => ({
      id,
      lifecycleStatus,
      lifecycleUpdatedAt,
      removedAt,
      reversesBankTransactionId,
      reversedByBankTransactionId,
    }))
  );
  assert.ok(second.some((transaction) => transaction.amount > 0));
  assert.ok(second.some((transaction) => transaction.amount < 0));
  assert.ok(second.some((transaction) => transaction.pending));
  assert.ok(second.some((transaction) => transaction.currency === 'USD'));
  const pendingLifecycle = first.find((transaction) =>
    transaction.externalTransactionId.endsWith(':card-lifecycle-pending')
  );
  const postedLifecycle = second.find((transaction) =>
    transaction.externalTransactionId.endsWith(':card-lifecycle-posted')
  );
  assert.ok(pendingLifecycle);
  assert.ok(postedLifecycle);
  assert.equal(postedLifecycle.id, pendingLifecycle.id);
  assert.equal(postedLifecycle.pending, false);
  assert.equal(
    postedLifecycle.pendingExternalTransactionId,
    pendingLifecycle.externalTransactionId
  );
  assert.ok(second.some((transaction) =>
    transaction.externalTransactionId.endsWith(':maintenance-pending') && transaction.pending
  ));
  assert.ok(second.some((transaction) =>
    transaction.externalTransactionId.endsWith(':card-similar-unrelated')
  ));
  assert.equal(second.filter((transaction) => transaction.lifecycleStatus === 'removed').length, 4);
  const reversed = second.find((transaction) =>
    transaction.externalTransactionId.endsWith(':usd-interest')
  );
  const reversal = second.find((transaction) =>
    transaction.externalTransactionId.endsWith(':usd-interest-reversal')
  );
  assert.equal(reversed?.lifecycleStatus, 'reversed');
  assert.equal(reversal?.lifecycleStatus, 'reversal');
  assert.equal(reversed?.reversedByBankTransactionId, reversal?.id);
  assert.equal(reversal?.reversesBankTransactionId, reversed?.id);
});

test('changed provider transaction data updates instead of duplicating', () => {
  const initial = normalize([providerRecord()]);
  const updated = normalize([
    providerRecord({ amount: 125, description: 'Updated transfer', pending: true }),
  ], undefined, '2026-09-16T14:00:00.000Z');
  const result = upsertBankTransactions(initial, updated);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, initial[0].id);
  assert.equal(result[0].createdAt, initial[0].createdAt);
  assert.equal(result[0].amount, 125);
  assert.equal(result[0].description, 'Updated transfer');
  assert.equal(result[0].pending, true);
  assert.equal(result[0].updatedAt, '2026-09-16T14:00:00.000Z');
});

test('explicit provider linkage replaces pending with posted while preserving internal identity', () => {
  const pending = normalize([
    providerRecord({
      externalTransactionId: 'provider-pending-1',
      pending: true,
      metadata: { lifecycle: 'pending' },
    }),
  ], undefined, '2026-09-16T12:00:00.000Z');
  const posted = normalize([
    providerRecord({
      externalTransactionId: 'provider-posted-1',
      pendingExternalTransactionId: 'provider-pending-1',
      bookingDate: '2026-09-16',
      description: 'Posted transfer',
      pending: false,
      metadata: { lifecycle: 'posted' },
    }),
  ], undefined, '2026-09-17T12:00:00.000Z');

  const result = upsertBankTransactions(pending, posted);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, pending[0].id);
  assert.equal(result[0].externalTransactionId, 'provider-posted-1');
  assert.equal(result[0].pendingExternalTransactionId, 'provider-pending-1');
  assert.equal(result[0].pending, false);
  assert.equal(result[0].description, 'Posted transfer');
  assert.equal(result[0].createdAt, '2026-09-16T12:00:00.000Z');
  assert.equal(result[0].updatedAt, '2026-09-17T12:00:00.000Z');
  assert.deepEqual(result[0].providerMetadata, { lifecycle: 'posted' });

  const repeated = upsertBankTransactions(result, normalize([
    providerRecord({
      externalTransactionId: 'provider-posted-1',
      pendingExternalTransactionId: 'provider-pending-1',
      bookingDate: '2026-09-16',
      description: 'Posted transfer',
      pending: false,
      metadata: { lifecycle: 'posted' },
    }),
  ], undefined, '2026-09-18T12:00:00.000Z'));
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].id, pending[0].id);
  assert.equal(repeated[0].createdAt, pending[0].createdAt);
});

test('similar transaction without explicit provider linkage is not merged', () => {
  const pending = normalize([providerRecord({
    externalTransactionId: 'provider-pending-similar',
    bookingDate: '2026-09-15',
    description: 'Similar transfer',
    pending: true,
  })]);
  const unrelatedPosted = normalize([providerRecord({
    externalTransactionId: 'provider-posted-unrelated',
    bookingDate: '2026-09-15',
    description: 'Similar transfer',
    pending: false,
  })]);
  const result = upsertBankTransactions(pending, unrelatedPosted);

  assert.equal(result.length, 2);
  assert.ok(result.some((item) => item.externalTransactionId === 'provider-pending-similar'));
  assert.ok(result.some((item) => item.externalTransactionId === 'provider-posted-unrelated'));
});

test('explicitly linked pending and posted records in one provider page coalesce safely', () => {
  const page = normalize([
    providerRecord({ externalTransactionId: 'same-page-pending', pending: true }),
    providerRecord({
      externalTransactionId: 'same-page-posted',
      pendingExternalTransactionId: 'same-page-pending',
      pending: false,
    }),
  ]);
  const result = upsertBankTransactions([], page);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, page[0].id);
  assert.equal(result[0].externalTransactionId, 'same-page-posted');
  assert.equal(result[0].pending, false);
});

test('explicit removal persists a tombstone while absence alone does not remove a transaction', () => {
  const existing = normalize([providerRecord({ externalTransactionId: 'provider-removal-1' })]);
  const absent = applyBankTransactionProviderLifecycle({
    existingTransactions: existing,
    incomingTransactions: [],
    removedTransactions: [],
    providerName: 'mock-bank',
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  assert.equal(absent.transactions[0].lifecycleStatus, 'active');
  assert.deepEqual(absent.lifecycleEvents, []);

  const removedRecord = {
    externalTransactionId: 'provider-removal-1',
    externalAccountId: `${connection.institutionId}:checking`,
    reason: 'provider-deleted',
  };
  const removed = applyBankTransactionProviderLifecycle({
    existingTransactions: existing,
    incomingTransactions: [],
    removedTransactions: [removedRecord],
    providerName: 'mock-bank',
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  assert.equal(removed.transactions.length, 1);
  assert.equal(removed.transactions[0].id, existing[0].id);
  assert.equal(removed.transactions[0].lifecycleStatus, 'removed');
  assert.equal(removed.transactions[0].removedAt, '2026-09-17T12:00:00.000Z');
  assert.equal(removed.transactions[0].removalReason, 'provider-deleted');
  assert.deepEqual(removed.lifecycleEvents, [{
    bankTransactionId: existing[0].id,
    reason: 'provider-removed',
  }]);

  const repeated = applyBankTransactionProviderLifecycle({
    existingTransactions: removed.transactions,
    incomingTransactions: [],
    removedTransactions: [removedRecord],
    providerName: 'mock-bank',
    syncedAt: '2026-09-18T12:00:00.000Z',
  });
  assert.equal(repeated.transactions[0].removedAt, removed.transactions[0].removedAt);
  assert.equal(repeated.transactions[0].lifecycleUpdatedAt, removed.transactions[0].lifecycleUpdatedAt);
});

test('explicit reversal links both records and retains a coherent opposite financial effect', () => {
  const original = normalize([providerRecord({
    externalTransactionId: 'provider-original-1',
    amount: 1450,
    direction: 'credit',
  })]);
  const reversal = normalize([providerRecord({
    externalTransactionId: 'provider-reversal-1',
    reversesExternalTransactionId: 'provider-original-1',
    amount: 1450,
    direction: 'debit',
  })], undefined, '2026-09-17T12:00:00.000Z');
  const result = applyBankTransactionProviderLifecycle({
    existingTransactions: original,
    incomingTransactions: reversal,
    providerName: 'mock-bank',
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  const storedOriginal = result.transactions.find((item) => item.externalTransactionId === 'provider-original-1');
  const storedReversal = result.transactions.find((item) => item.externalTransactionId === 'provider-reversal-1');

  assert.equal(storedOriginal?.lifecycleStatus, 'reversed');
  assert.equal(storedReversal?.lifecycleStatus, 'reversal');
  assert.equal(storedOriginal?.reversedByBankTransactionId, storedReversal?.id);
  assert.equal(storedReversal?.reversesBankTransactionId, storedOriginal?.id);
  assert.equal((storedOriginal?.amount ?? 0) + (storedReversal?.amount ?? 0), 0);
  assert.deepEqual(result.lifecycleEvents, [{
    bankTransactionId: storedOriginal?.id,
    reason: 'provider-reversed',
    relatedBankTransactionId: storedReversal?.id,
  }]);
});

test('multi-currency normalization uses existing FX coverage and never falls back to 1:1', () => {
  const accounts = [
    linkedAccount({ currency: 'USD' }),
    linkedAccount({
      id: 'cash-gbp',
      externalAccountId: `${connection.institutionId}:gbp`,
      currency: 'GBP',
    }),
  ];
  const transactions = normalize([
    providerRecord({ currency: 'USD', amount: 100 }),
    providerRecord({
      externalTransactionId: 'provider-tx-gbp',
      externalAccountId: `${connection.institutionId}:gbp`,
      currency: 'GBP',
      amount: 100,
    }),
  ], accounts);

  assert.equal(transactions[0].amount, 100);
  assert.equal(transactions[0].normalizedAmount, 50);
  assert.equal(transactions[0].fxCoverage, 'snapshot');
  assert.equal(transactions[0].fxRateTimestamp, '2026-09-16T00:00:00.000Z');
  assert.equal(transactions[1].amount, 100);
  assert.equal(transactions[1].normalizedAmount, null);
  assert.equal(transactions[1].fxCoverage, 'unavailable');
  assert.equal(transactions[1].fxRate, null);
});

test('pending transaction state survives an idempotent upsert', () => {
  const pending = normalize([providerRecord({ pending: true })]);
  const result = upsertBankTransactions([], pending);
  assert.equal(result.length, 1);
  assert.equal(result[0].pending, true);
});

test('bank transactions and incremental sync metadata survive an IndexedDB cold load', async () => {
  const transaction: BankTransaction = normalize([providerRecord({ pending: true })])[0];
  const syncStates = upsertBankTransactionSyncState([], {
    connectionId: connection.id,
    providerName: 'mock-bank',
    cursor: 'mock-cursor-1',
    syncStatus: 'success',
    syncedAt: '2026-09-16T12:00:00.000Z',
  });
  await saveUserPortfolio('banking-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: [linkedAccount()],
    bankConnections: [connection],
    bankTransactions: [transaction],
    bankTransactionSyncStates: syncStates,
  });

  const reloaded = await loadUserPortfolio('banking-cold-load-user');
  assert.deepEqual(reloaded.bankTransactions, [transaction]);
  assert.deepEqual(reloaded.bankTransactionSyncStates, syncStates);
  assert.equal(reloaded.bankTransactions?.[0].pending, true);
  assert.equal(reloaded.bankTransactions?.[0].cashAccountId, 'cash-stable-1');
  assert.equal(reloaded.bankTransactionSyncStates?.[0].cursor, 'mock-cursor-1');
  assert.equal(reloaded.bankTransactionSyncStates?.[0].lastSuccessfulSyncAt, '2026-09-16T12:00:00.000Z');
});

test('disconnected account preserves transaction and reconciliation history', async () => {
  const manual = createManualCashAccount({ id: 'manual-alongside-linked', currency: 'ARS' });
  const activeLinked = linkedAccount();
  const disconnectedAt = '2026-09-17T12:00:00.000Z';
  const accounts = deactivateLinkedCashAccountsForConnection(
    [manual, activeLinked],
    connection.id,
    disconnectedAt
  );
  const bankTransaction = normalize([providerRecord()], [activeLinked])[0];
  const reconciliation = {
    bankTransactionId: bankTransaction.id,
    status: 'ignored' as const,
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
  };
  const disconnectedConnection = {
    ...connection,
    connectionStatus: 'disconnected' as const,
    syncStatus: 'idle' as const,
    linkedAccountIds: [],
    updatedAt: disconnectedAt,
  };

  await saveUserPortfolio('banking-disconnected-history-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: accounts,
    bankConnections: [disconnectedConnection],
    bankTransactions: [bankTransaction],
    bankTransactionReconciliations: [reconciliation],
  });
  const reloaded = await loadUserPortfolio('banking-disconnected-history-user');

  assert.equal(reloaded.cashAccounts?.length, 2);
  assert.equal(reloaded.cashAccounts?.find((item) => item.id === activeLinked.id)?.status, 'inactive');
  assert.equal(reloaded.cashAccounts?.find((item) => item.id === manual.id)?.status, 'active');
  assert.equal(reloaded.bankTransactions?.[0].cashAccountId, activeLinked.id);
  assert.deepEqual(reloaded.bankTransactionReconciliations, [reconciliation]);
});

test('mixed-currency accounts and original transaction values survive an IndexedDB cold load', async () => {
  const currencies = ['EUR', 'USD', 'ARS', 'GBP'] as const;
  const accounts = currencies.map((currency) => linkedAccount({
    id: `cash-${currency.toLowerCase()}`,
    externalAccountId: `mixed:${currency.toLowerCase()}`,
    currency,
  }));
  const records = currencies.map((currency, index) => providerRecord({
    externalTransactionId: `mixed-transaction-${currency.toLowerCase()}`,
    externalAccountId: `mixed:${currency.toLowerCase()}`,
    amount: 100 + index,
    currency,
  }));
  const transactions = normalizeProviderTransactions(records, {
    providerName: 'mock-bank',
    connectionId: connection.id,
    accounts,
    reportingCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9, ARS: 0.0007 },
    fxRateTimestamp: '2026-09-16T00:00:00.000Z',
    syncedAt: '2026-09-16T12:00:00.000Z',
  });

  await saveUserPortfolio('banking-mixed-currency-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: accounts,
    bankConnections: [connection],
    bankTransactions: transactions,
  });
  const reloaded = await loadUserPortfolio('banking-mixed-currency-user');

  assert.deepEqual(reloaded.cashAccounts, accounts);
  assert.deepEqual(reloaded.bankTransactions, transactions);
  assert.deepEqual(
    reloaded.bankTransactions?.map(({ amount, currency, cashAccountId }) => ({ amount, currency, cashAccountId })),
    currencies.map((currency, index) => ({
      amount: 100 + index,
      currency,
      cashAccountId: `cash-${currency.toLowerCase()}`,
    }))
  );
  const gbp = reloaded.bankTransactions?.find((item) => item.currency === 'GBP');
  assert.equal(gbp?.normalizedAmount, null);
  assert.equal(gbp?.fxCoverage, 'unavailable');
  assert.equal(gbp?.fxRate, null);
});

test('IndexedDB cold load preserves the final posted lifecycle state', async () => {
  const pending = normalize([providerRecord({
    externalTransactionId: 'provider-cold-pending',
    pending: true,
  })], undefined, '2026-09-16T12:00:00.000Z');
  const posted = normalize([providerRecord({
    externalTransactionId: 'provider-cold-posted',
    pendingExternalTransactionId: 'provider-cold-pending',
    bookingDate: '2026-09-17',
    pending: false,
  })], undefined, '2026-09-17T12:00:00.000Z');
  const finalTransactions = upsertBankTransactions(pending, posted);

  await saveUserPortfolio('banking-posted-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: [linkedAccount()],
    bankConnections: [connection],
    bankTransactions: finalTransactions,
  });
  const reloaded = await loadUserPortfolio('banking-posted-cold-load-user');

  assert.deepEqual(reloaded.bankTransactions, finalTransactions);
  assert.equal(reloaded.bankTransactions?.length, 1);
  assert.equal(reloaded.bankTransactions?.[0].id, pending[0].id);
  assert.equal(reloaded.bankTransactions?.[0].externalTransactionId, 'provider-cold-posted');
  assert.equal(reloaded.bankTransactions?.[0].pending, false);
});

test('IndexedDB cold load preserves removed and explicitly reversed transaction audit state', async () => {
  const original = normalize([
    providerRecord({ externalTransactionId: 'cold-removed' }),
    providerRecord({ externalTransactionId: 'cold-original', amount: 25 }),
  ]);
  const incoming = normalize([providerRecord({
    externalTransactionId: 'cold-reversal',
    reversesExternalTransactionId: 'cold-original',
    amount: 25,
    direction: 'debit',
  })], undefined, '2026-09-17T12:00:00.000Z');
  const lifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: original,
    incomingTransactions: incoming,
    removedTransactions: [{
      externalTransactionId: 'cold-removed',
      externalAccountId: `${connection.institutionId}:checking`,
      reason: 'provider-deleted',
    }],
    providerName: 'mock-bank',
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  await saveUserPortfolio('banking-lifecycle-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: [linkedAccount()],
    bankConnections: [connection],
    bankTransactions: lifecycle.transactions,
  });
  const reloaded = await loadUserPortfolio('banking-lifecycle-cold-load-user');

  assert.deepEqual(reloaded.bankTransactions, lifecycle.transactions);
  assert.equal(reloaded.bankTransactions?.find((item) => item.externalTransactionId === 'cold-removed')?.lifecycleStatus, 'removed');
  assert.equal(reloaded.bankTransactions?.find((item) => item.externalTransactionId === 'cold-original')?.lifecycleStatus, 'reversed');
  assert.equal(reloaded.bankTransactions?.find((item) => item.externalTransactionId === 'cold-reversal')?.lifecycleStatus, 'reversal');
});
