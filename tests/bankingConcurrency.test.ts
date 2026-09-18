import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import type { BankConnection, BankTransaction, CashAccount } from '../src/common/types';
import {
  applyBankConnectionAccountResult,
  applyBankConnectionDeletion,
  applyBankConnectionDisconnect,
  applyBankConnectionTransactionResult,
  getBankConnectionDeletionEligibility,
  type BankingConnectionOperationState,
} from '../src/common/utils/bankingConnectionOperations';
import {
  createBankConnection,
  createLinkedCashAccount,
  createManualCashAccount,
} from '../src/common/utils/cashAccounts';
import {
  normalizeProviderTransactions,
  type ProviderTransactionRecord,
} from '../src/common/utils/bankTransactions';
import {
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
} from '../src/platforms/web/services/localAccountStore';

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const connectionA = createBankConnection({
  id: 'connection-a',
  providerName: 'mock-bank',
  institutionId: 'institution-a',
  institutionName: 'Institution A',
});
const connectionB = createBankConnection({
  id: 'connection-b',
  providerName: 'mock-bank',
  institutionId: 'institution-b',
  institutionName: 'Institution B',
});

const accountFor = (
  connection: BankConnection,
  overrides: Partial<CashAccount> = {}
) => createLinkedCashAccount({
  id: `cash-${connection.id}`,
  providerName: connection.providerName,
  connectionId: connection.id,
  institutionId: connection.institutionId,
  institutionName: connection.institutionName,
  externalAccountId: `${connection.institutionId}:checking`,
  currency: 'EUR',
  ...overrides,
});

const transactionFor = (
  connection: BankConnection,
  account: CashAccount,
  overrides: Partial<ProviderTransactionRecord> = {}
): BankTransaction => normalizeProviderTransactions([{
  externalTransactionId: `transaction-${connection.id}`,
  externalAccountId: account.externalAccountId!,
  bookingDate: '2026-09-17',
  amount: 100,
  direction: 'credit',
  currency: 'EUR',
  description: `Transaction ${connection.id}`,
  pending: false,
  ...overrides,
}], {
  providerName: connection.providerName,
  connectionId: connection.id,
  accounts: [account],
  reportingCurrency: 'EUR',
  fxRates: { EUR: 1 },
  syncedAt: '2026-09-17T12:00:00.000Z',
})[0];

const initialState = (): BankingConnectionOperationState => ({
  cashAccounts: [accountFor(connectionA), accountFor(connectionB)],
  bankConnections: [connectionA, connectionB],
  bankTransactions: [],
  bankTransactionReconciliations: [],
  bankTransactionSyncStates: [],
  rentPayments: [],
  expensePayments: [],
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

interface RefreshCompletion {
  connection: BankConnection;
  account: CashAccount;
  transaction: BankTransaction;
  cursor: string;
  syncedAt: string;
}

const applyRefreshCompletion = (
  state: BankingConnectionOperationState,
  completion: RefreshCompletion
) => {
  const withAccounts = applyBankConnectionAccountResult(
    state,
    completion.connection,
    [completion.account]
  );
  const currentConnection = withAccounts.bankConnections.find(
    (item) => item.id === completion.connection.id
  )!;
  return applyBankConnectionTransactionResult(withAccounts, {
    connection: currentConnection,
    incomingTransactions: [completion.transaction],
    cursor: completion.cursor,
    syncedAt: completion.syncedAt,
  });
};

const completionFor = (
  connection: BankConnection,
  balance: number,
  syncedAt: string
): RefreshCompletion => {
  const account = accountFor(connection, {
    id: `provider-${connection.id}-${balance}`,
    currentBalance: balance,
  });
  return {
    connection: { ...connection, lastSyncedAt: syncedAt, updatedAt: syncedAt },
    account,
    transaction: transactionFor(connection, account),
    cursor: `cursor-${connection.id}`,
    syncedAt,
  };
};

test('concurrent connection refreshes preserve both results in reversed completion order', async () => {
  let state = initialState();
  const pendingA = deferred<RefreshCompletion>();
  const pendingB = deferred<RefreshCompletion>();
  const refreshA = pendingA.promise.then((completion) => {
    state = applyRefreshCompletion(state, completion);
  });
  const refreshB = pendingB.promise.then((completion) => {
    state = applyRefreshCompletion(state, completion);
  });

  pendingB.resolve(completionFor(connectionB, 2200, '2026-09-17T13:00:00.000Z'));
  await refreshB;
  pendingA.resolve(completionFor(connectionA, 1100, '2026-09-17T14:00:00.000Z'));
  await refreshA;

  assert.deepEqual(
    state.cashAccounts.map(({ connectionId, currentBalance }) => ({ connectionId, currentBalance })).sort(
      (left, right) => left.connectionId!.localeCompare(right.connectionId!)
    ),
    [
      { connectionId: connectionA.id, currentBalance: 1100 },
      { connectionId: connectionB.id, currentBalance: 2200 },
    ]
  );
  assert.deepEqual(
    state.bankTransactions.map((item) => item.connectionId).sort(),
    [connectionA.id, connectionB.id]
  );
  assert.deepEqual(
    state.bankTransactionSyncStates.map((item) => item.connectionId).sort(),
    [connectionA.id, connectionB.id]
  );

  await saveUserPortfolio('concurrent-bank-refresh-user', {
    ...structuredClone(emptyPortfolioData),
    cashAccounts: state.cashAccounts,
    bankConnections: state.bankConnections,
    bankTransactions: state.bankTransactions,
    bankTransactionReconciliations: state.bankTransactionReconciliations,
    bankTransactionSyncStates: state.bankTransactionSyncStates,
  });
  const reloaded = await loadUserPortfolio('concurrent-bank-refresh-user');
  assert.deepEqual(reloaded.cashAccounts, state.cashAccounts);
  assert.deepEqual(reloaded.bankTransactions, state.bankTransactions);
  assert.deepEqual(reloaded.bankTransactionSyncStates, state.bankTransactionSyncStates);
});

test('repeated concurrent refreshes remain idempotent with stable record IDs', async () => {
  let state = initialState();
  const runRound = async (first: RefreshCompletion, second: RefreshCompletion) => {
    const pendingFirst = deferred<RefreshCompletion>();
    const pendingSecond = deferred<RefreshCompletion>();
    const firstRun = pendingFirst.promise.then((completion) => {
      state = applyRefreshCompletion(state, completion);
    });
    const secondRun = pendingSecond.promise.then((completion) => {
      state = applyRefreshCompletion(state, completion);
    });
    pendingSecond.resolve(second);
    await secondRun;
    pendingFirst.resolve(first);
    await firstRun;
  };

  await runRound(
    completionFor(connectionA, 1100, '2026-09-17T13:00:00.000Z'),
    completionFor(connectionB, 2200, '2026-09-17T13:00:00.000Z')
  );
  const stableAccountIds = state.cashAccounts.map((item) => item.id).sort();
  const stableTransactionIds = state.bankTransactions.map((item) => item.id).sort();
  await runRound(
    completionFor(connectionB, 2300, '2026-09-17T14:00:00.000Z'),
    completionFor(connectionA, 1200, '2026-09-17T14:00:00.000Z')
  );

  assert.equal(state.cashAccounts.length, 2);
  assert.equal(state.bankTransactions.length, 2);
  assert.equal(state.bankTransactionSyncStates.length, 2);
  assert.deepEqual(state.cashAccounts.map((item) => item.id).sort(), stableAccountIds);
  assert.deepEqual(state.bankTransactions.map((item) => item.id).sort(), stableTransactionIds);
});

test('a refresh on one connection preserves reconciliation data owned by another', () => {
  const accountB = accountFor(connectionB);
  const transactionB = transactionFor(connectionB, accountB);
  const reconciliation = {
    bankTransactionId: transactionB.id,
    status: 'ignored' as const,
    createdAt: '2026-09-17T12:00:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
  };
  const state = initialState();
  state.bankTransactions = [transactionB];
  state.bankTransactionReconciliations = [reconciliation];

  const refreshed = applyRefreshCompletion(
    state,
    completionFor(connectionA, 1100, '2026-09-17T13:00:00.000Z')
  );

  assert.deepEqual(refreshed.bankTransactionReconciliations, [reconciliation]);
  assert.ok(refreshed.bankTransactions.some((item) => item.id === transactionB.id));
});

test('a disconnected empty-history connection deletes only its inactive linked accounts', () => {
  const disconnectedA = {
    ...connectionA,
    connectionStatus: 'disconnected' as const,
    linkedAccountIds: [],
  };
  const inactiveA = accountFor(disconnectedA, { status: 'inactive' });
  const unrelatedAccount = accountFor(connectionB);
  const manualAccount = createManualCashAccount({ id: 'manual-cash', currentBalance: 500 });
  const state: BankingConnectionOperationState = {
    ...initialState(),
    cashAccounts: [inactiveA, unrelatedAccount, manualAccount],
    bankConnections: [disconnectedA, connectionB],
    bankTransactionSyncStates: [
      {
        connectionId: disconnectedA.id,
        providerName: disconnectedA.providerName,
        syncStatus: 'success',
        updatedAt: '2026-09-17T12:00:00.000Z',
      },
      {
        connectionId: connectionB.id,
        providerName: connectionB.providerName,
        syncStatus: 'success',
        updatedAt: '2026-09-17T12:00:00.000Z',
      },
    ],
  };

  assert.equal(getBankConnectionDeletionEligibility(state, disconnectedA.id).eligible, true);
  const deleted = applyBankConnectionDeletion(state, disconnectedA.id);

  assert.deepEqual(deleted.bankConnections, [connectionB]);
  assert.deepEqual(deleted.cashAccounts, [unrelatedAccount, manualAccount]);
  assert.deepEqual(
    deleted.bankTransactionSyncStates.map((syncState) => syncState.connectionId),
    [connectionB.id]
  );
  assert.strictEqual(deleted.bankTransactions, state.bankTransactions);
  assert.strictEqual(deleted.bankTransactionReconciliations, state.bankTransactionReconciliations);
  assert.strictEqual(deleted.rentPayments, state.rentPayments);
  assert.strictEqual(deleted.expensePayments, state.expensePayments);
});

test('an active connection cannot be deleted', () => {
  const state = initialState();
  const eligibility = getBankConnectionDeletionEligibility(state, connectionA.id);

  assert.deepEqual(eligibility, {
    eligible: false,
    reason: 'not-disconnected',
    connection: connectionA,
  });
  assert.strictEqual(applyBankConnectionDeletion(state, connectionA.id), state);
});

test('a disconnected connection with transactions cannot be deleted', () => {
  const disconnectedA = {
    ...connectionA,
    connectionStatus: 'disconnected' as const,
    linkedAccountIds: [],
  };
  const inactiveA = accountFor(disconnectedA, { status: 'inactive' });
  const transaction = transactionFor(disconnectedA, accountFor(disconnectedA));
  const state: BankingConnectionOperationState = {
    ...initialState(),
    cashAccounts: [inactiveA, accountFor(connectionB)],
    bankConnections: [disconnectedA, connectionB],
    bankTransactions: [transaction],
  };

  const eligibility = getBankConnectionDeletionEligibility(state, disconnectedA.id);

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.eligible ? null : eligibility.reason, 'dependent-history');
  assert.deepEqual(eligibility.eligible ? null : eligibility.dependencies, {
    activeLinkedAccounts: 0,
    bankTransactions: 1,
    reconciliations: 0,
    rentPayments: 0,
    expensePayments: 0,
  });
  assert.strictEqual(applyBankConnectionDeletion(state, disconnectedA.id), state);
});

test('reconciliation and rent or expense payment provenance block connection deletion', () => {
  const disconnectedA = {
    ...connectionA,
    connectionStatus: 'disconnected' as const,
    linkedAccountIds: [],
  };
  const inactiveA = accountFor(disconnectedA, { status: 'inactive' });
  const activeA = accountFor(disconnectedA);
  const rentTransaction = transactionFor(disconnectedA, activeA);
  const expenseTransaction = transactionFor(disconnectedA, activeA, {
    externalTransactionId: 'expense-transaction',
    direction: 'debit',
  });
  const state: BankingConnectionOperationState = {
    ...initialState(),
    cashAccounts: [inactiveA, accountFor(connectionB)],
    bankConnections: [disconnectedA, connectionB],
    bankTransactions: [rentTransaction, expenseTransaction],
    bankTransactionReconciliations: [
      {
        bankTransactionId: rentTransaction.id,
        status: 'matched',
        targetType: 'rent-receivable',
        targetId: 'receivable-1',
        paymentId: 'rent-payment-1',
        paymentLinkType: 'created-bank-sync',
        createdAt: '2026-09-17T12:00:00.000Z',
        updatedAt: '2026-09-17T12:00:00.000Z',
      },
      {
        bankTransactionId: expenseTransaction.id,
        status: 'matched',
        targetType: 'expense-obligation',
        targetId: 'expense-obligation-1',
        paymentId: 'expense-payment-1',
        paymentLinkType: 'created-bank-sync',
        createdAt: '2026-09-17T12:00:00.000Z',
        updatedAt: '2026-09-17T12:00:00.000Z',
      },
    ],
    rentPayments: [{
      id: 'rent-payment-1',
      propertyId: 'property-1',
      leaseId: 'lease-1',
      receivedDate: '2026-09-17',
      amount: 100,
      currency: 'EUR',
      source: 'bank_sync',
      allocations: [{ receivableId: 'receivable-1', amount: 100 }],
    }],
    expensePayments: [{
      id: 'expense-payment-1',
      propertyId: 'property-1',
      paidDate: '2026-09-17',
      amount: 100,
      currency: 'EUR',
      source: 'bank_sync',
      allocations: [{ obligationId: 'expense-obligation-1', amount: 100 }],
    }],
  };

  const eligibility = getBankConnectionDeletionEligibility(state, disconnectedA.id);

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.eligible ? null : eligibility.reason, 'dependent-history');
  assert.deepEqual(eligibility.eligible ? null : eligibility.dependencies, {
    activeLinkedAccounts: 0,
    bankTransactions: 2,
    reconciliations: 2,
    rentPayments: 1,
    expensePayments: 1,
  });
  assert.strictEqual(applyBankConnectionDeletion(state, disconnectedA.id), state);
  assert.equal(state.rentPayments.length, 1);
  assert.equal(state.expensePayments.length, 1);
});

test('disconnect and connect again preserve logical history and another concurrent refresh', async () => {
  let state = initialState();
  const historicalAccount = accountFor(connectionA);
  const historicalTransaction = transactionFor(connectionA, historicalAccount);
  const historicalReconciliation = {
    bankTransactionId: historicalTransaction.id,
    status: 'ignored' as const,
    createdAt: '2026-09-17T12:00:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
  };
  state.bankTransactions = [historicalTransaction];
  state.bankTransactionReconciliations = [historicalReconciliation];
  const pendingRefresh = deferred<RefreshCompletion>();
  const pendingDisconnect = deferred<BankConnection>();
  const refreshB = pendingRefresh.promise.then((completion) => {
    state = applyRefreshCompletion(state, completion);
  });
  const disconnectA = pendingDisconnect.promise.then((disconnected) => {
    state = applyBankConnectionDisconnect(state, disconnected, '2026-09-17T13:00:00.000Z');
  });

  pendingDisconnect.resolve({
    ...connectionA,
    connectionStatus: 'disconnected',
    syncStatus: 'idle',
    linkedAccountIds: [],
  });
  await disconnectA;
  pendingRefresh.resolve(completionFor(connectionB, 2200, '2026-09-17T14:00:00.000Z'));
  await refreshB;

  assert.equal(
    state.cashAccounts.find((item) => item.connectionId === connectionA.id)?.status,
    'inactive'
  );
  assert.ok(state.bankTransactions.some((item) => item.connectionId === connectionB.id));

  const reconnectedAccount = accountFor(connectionA, {
    id: 'provider-reconnected-a',
    status: 'active',
    currentBalance: 1300,
  });
  state = applyBankConnectionAccountResult(
    state,
    { ...connectionA, connectionStatus: 'connected' },
    [reconnectedAccount]
  );

  assert.equal(
    state.cashAccounts.find((item) => item.connectionId === connectionA.id)?.status,
    'active'
  );
  assert.equal(
    state.cashAccounts.filter((item) => item.connectionId === connectionA.id).length,
    1
  );
  assert.equal(
    state.bankTransactions.find((item) => item.id === historicalTransaction.id)?.connectionId,
    connectionA.id
  );
  assert.deepEqual(state.bankTransactionReconciliations, [historicalReconciliation]);
  assert.ok(state.bankTransactions.some((item) => item.connectionId === connectionB.id));
  assert.ok(state.bankTransactionSyncStates.some((item) => item.connectionId === connectionB.id));
});
