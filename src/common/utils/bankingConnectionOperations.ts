import type {
  BankConnection,
  BankTransaction,
  BankTransactionReconciliation,
  BankTransactionSyncState,
  CashAccount,
  ExpensePayment,
  RentPayment,
} from '../types';
import {
  canRefreshBankConnection,
  deactivateLinkedCashAccountsForConnection,
  getLinkedCashAccountIdentity,
  upsertLinkedCashAccounts,
} from './cashAccounts';
import {
  applyBankTransactionProviderLifecycle,
  type ProviderRemovedTransactionRecord,
  upsertBankTransactionSyncState,
} from './bankTransactions';
import { applyBankTransactionLifecycleToReconciliation } from './bankReconciliation';

export interface BankingConnectionOperationState {
  cashAccounts: CashAccount[];
  bankConnections: BankConnection[];
  bankTransactions: BankTransaction[];
  bankTransactionReconciliations: BankTransactionReconciliation[];
  bankTransactionSyncStates: BankTransactionSyncState[];
  rentPayments: RentPayment[];
  expensePayments: ExpensePayment[];
}

const upsertConnection = (
  connections: BankConnection[],
  connection: BankConnection
) => connections.some((item) => item.id === connection.id)
  ? connections.map((item) => (item.id === connection.id ? connection : item))
  : [...connections, connection];

export const applyBankConnectionAccountResult = (
  state: BankingConnectionOperationState,
  connection: BankConnection,
  incomingAccounts: CashAccount[]
): BankingConnectionOperationState => {
  const cashAccounts = upsertLinkedCashAccounts(state.cashAccounts, incomingAccounts);
  const linkedAccountIds = incomingAccounts
    .map((candidate) => {
      const identity = getLinkedCashAccountIdentity(candidate);
      return cashAccounts.find((account) => getLinkedCashAccountIdentity(account) === identity)?.id;
    })
    .filter((id): id is string => Boolean(id));
  const nextConnection = { ...connection, linkedAccountIds };

  return {
    ...state,
    cashAccounts,
    bankConnections: upsertConnection(state.bankConnections, nextConnection),
  };
};

export const applyBankConnectionTransactionResult = (
  state: BankingConnectionOperationState,
  args: {
    connection: BankConnection;
    incomingTransactions: BankTransaction[];
    removedTransactions?: ProviderRemovedTransactionRecord[];
    cursor?: string | null;
    syncedAt: string;
  }
): BankingConnectionOperationState => {
  const lifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: state.bankTransactions,
    incomingTransactions: args.incomingTransactions,
    removedTransactions: args.removedTransactions,
    providerName: args.connection.providerName,
    connectionId: args.connection.id,
    syncedAt: args.syncedAt,
  });
  const reconciliationLifecycle = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: lifecycle.lifecycleEvents,
    reconciliations: state.bankTransactionReconciliations,
    rentPayments: state.rentPayments,
    expensePayments: state.expensePayments,
    timestamp: args.syncedAt,
  });

  return {
    ...state,
    bankTransactions: lifecycle.transactions,
    bankTransactionReconciliations: reconciliationLifecycle.reconciliations,
    rentPayments: reconciliationLifecycle.rentPayments,
    expensePayments: reconciliationLifecycle.expensePayments,
    bankTransactionSyncStates: upsertBankTransactionSyncState(
      state.bankTransactionSyncStates,
      {
        connectionId: args.connection.id,
        providerName: args.connection.providerName,
        cursor: args.cursor,
        syncStatus: 'success',
        syncedAt: args.syncedAt,
      }
    ),
  };
};

export const applyBankConnectionSyncFailure = (
  state: BankingConnectionOperationState,
  args: {
    connection: BankConnection;
    errorMessage: string;
    syncedAt: string;
  }
): BankingConnectionOperationState => ({
  ...state,
  bankTransactionSyncStates: upsertBankTransactionSyncState(
    state.bankTransactionSyncStates,
    {
      connectionId: args.connection.id,
      providerName: args.connection.providerName,
      syncStatus: 'error',
      errorMessage: args.errorMessage,
      syncedAt: args.syncedAt,
    }
  ),
});

export const applyBankConnectionDisconnect = (
  state: BankingConnectionOperationState,
  disconnectedConnection: BankConnection,
  timestamp = new Date().toISOString()
): BankingConnectionOperationState => ({
  ...state,
  bankConnections: upsertConnection(state.bankConnections, disconnectedConnection),
  cashAccounts: deactivateLinkedCashAccountsForConnection(
    state.cashAccounts,
    disconnectedConnection.id,
    timestamp
  ),
});

export const canRunBankConnectionRefresh = (
  state: BankingConnectionOperationState,
  connectionId: string
) => {
  const connection = state.bankConnections.find((item) => item.id === connectionId);
  return Boolean(connection && canRefreshBankConnection(connection));
};
