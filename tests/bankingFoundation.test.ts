import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import type { BankTransaction, CashAccount } from '../src/common/types';
import {
  createBankConnection,
  createLinkedCashAccount,
  createManualCashAccount,
  upsertLinkedCashAccounts,
} from '../src/common/utils/cashAccounts';
import {
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
  const second = upsertBankTransactions(
    first,
    normalize(secondPage.transactions, accounts, '2026-09-16T13:00:00.000Z')
  );

  assert.equal(firstPage.transactions.length, 4);
  assert.equal(second.length, 4);
  assert.deepEqual(
    second.map((transaction) => transaction.id).sort(),
    first.map((transaction) => transaction.id).sort()
  );
  assert.ok(second.some((transaction) => transaction.amount > 0));
  assert.ok(second.some((transaction) => transaction.amount < 0));
  assert.ok(second.some((transaction) => transaction.pending));
  assert.ok(second.some((transaction) => transaction.currency === 'USD'));
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
