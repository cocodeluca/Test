import type {
  BankConnection,
  BankTransaction,
  BankTransactionReconciliation,
  BankTransactionSyncState,
  CashAccount,
  ExpensePayment,
  ExpenseObligation,
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
  expenseObligations?: ExpenseObligation[];
}

export type BankConnectionDeletionBlockReason =
  | 'not-found'
  | 'not-disconnected'
  | 'dependent-history';

export type BankConnectionDeletionEligibility =
  | { eligible: true; connection: BankConnection }
  | {
    eligible: false;
    reason: BankConnectionDeletionBlockReason;
    connection: BankConnection | null;
    dependencies?: {
      activeLinkedAccounts: number;
      bankTransactions: number;
      reconciliations: number;
      rentPayments: number;
      expensePayments: number;
    };
  };

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

export const applyRecoveredBankConnectionResults = (
  state: Pick<BankingConnectionOperationState, 'cashAccounts' | 'bankConnections'>,
  results: Array<{ connection: BankConnection; accounts: CashAccount[] }>
) => results.reduce(
  (current, result) => {
    const cashAccounts = upsertLinkedCashAccounts(current.cashAccounts, result.accounts);
    const linkedAccountIds = result.accounts
      .map((candidate) => {
        const identity = getLinkedCashAccountIdentity(candidate);
        return cashAccounts.find(
          (account) => getLinkedCashAccountIdentity(account) === identity
        )?.id;
      })
      .filter((id): id is string => Boolean(id));
    return {
      cashAccounts,
      bankConnections: upsertConnection(current.bankConnections, {
        ...result.connection,
        linkedAccountIds,
      }),
    };
  },
  state
);

export const applyBankConnectionTransactionResult = (
  state: BankingConnectionOperationState,
  args: {
    connection: BankConnection;
    incomingTransactions: BankTransaction[];
    removedTransactions?: ProviderRemovedTransactionRecord[];
    syncedAt: string;
  }
): BankingConnectionOperationState => {
  const lifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: state.bankTransactions,
    incomingTransactions: args.incomingTransactions,
    removedTransactions: args.removedTransactions,
    providerName: args.connection.providerName,
    providerEnvironment: args.connection.providerEnvironment,
    connectionId: args.connection.id,
    syncedAt: args.syncedAt,
  });
  const reconciliationLifecycle = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: lifecycle.lifecycleEvents,
    reconciliations: state.bankTransactionReconciliations,
    rentPayments: state.rentPayments,
    expensePayments: state.expensePayments,
    expenseObligations: state.expenseObligations,
    timestamp: args.syncedAt,
  });

  return {
    ...state,
    bankTransactions: lifecycle.transactions,
    bankTransactionReconciliations: reconciliationLifecycle.reconciliations,
    rentPayments: reconciliationLifecycle.rentPayments,
    expensePayments: reconciliationLifecycle.expensePayments,
    expenseObligations: reconciliationLifecycle.expenseObligations,
    bankTransactionSyncStates: upsertBankTransactionSyncState(
      state.bankTransactionSyncStates,
      {
        connectionId: args.connection.id,
        providerName: args.connection.providerName,
        providerEnvironment: args.connection.providerEnvironment,
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
    errorCode?: string | null;
    syncedAt: string;
  }
): BankingConnectionOperationState => ({
  ...state,
  bankTransactionSyncStates: upsertBankTransactionSyncState(
    state.bankTransactionSyncStates,
    {
      connectionId: args.connection.id,
      providerName: args.connection.providerName,
      providerEnvironment: args.connection.providerEnvironment,
      syncStatus: 'error',
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
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

export const getBankConnectionDeletionEligibility = (
  state: BankingConnectionOperationState,
  connectionId: string
): BankConnectionDeletionEligibility => {
  const connection = state.bankConnections.find((item) => item.id === connectionId) ?? null;
  if (!connection) return { eligible: false, reason: 'not-found', connection };
  if (connection.connectionStatus !== 'disconnected') {
    return { eligible: false, reason: 'not-disconnected', connection };
  }

  const connectionAccountIds = new Set(
    state.cashAccounts
      .filter((account) => account.sourceType === 'linked' && account.connectionId === connectionId)
      .map((account) => account.id)
  );
  const activeLinkedAccountCount = state.cashAccounts.filter(
    (account) =>
      account.sourceType === 'linked' &&
      account.connectionId === connectionId &&
      account.status !== 'inactive'
  ).length;
  const dependentTransactions = state.bankTransactions.filter(
    (transaction) =>
      transaction.connectionId === connectionId || connectionAccountIds.has(transaction.cashAccountId)
  );
  const dependentTransactionIds = new Set(dependentTransactions.map((transaction) => transaction.id));
  const dependentReconciliations = state.bankTransactionReconciliations.filter(
    (reconciliation) =>
      dependentTransactionIds.has(reconciliation.bankTransactionId) ||
      (reconciliation.lifecycleTransactionId
        ? dependentTransactionIds.has(reconciliation.lifecycleTransactionId)
        : false)
  );
  const dependentPaymentIds = new Set(
    dependentReconciliations.flatMap((reconciliation) =>
      [reconciliation.paymentId, reconciliation.historicalPaymentId]
        .filter((paymentId): paymentId is string => Boolean(paymentId))
    )
  );
  const dependentRentPaymentCount = state.rentPayments.filter(
    (payment) => dependentPaymentIds.has(payment.id)
  ).length;
  const dependentExpensePaymentCount = state.expensePayments.filter(
    (payment) => dependentPaymentIds.has(payment.id)
  ).length;

  if (
    activeLinkedAccountCount > 0 ||
    dependentTransactions.length > 0 ||
    dependentReconciliations.length > 0 ||
    dependentRentPaymentCount > 0 ||
    dependentExpensePaymentCount > 0
  ) {
    return {
      eligible: false,
      reason: 'dependent-history',
      connection,
      dependencies: {
        activeLinkedAccounts: activeLinkedAccountCount,
        bankTransactions: dependentTransactions.length,
        reconciliations: dependentReconciliations.length,
        rentPayments: dependentRentPaymentCount,
        expensePayments: dependentExpensePaymentCount,
      },
    };
  }

  return { eligible: true, connection };
};

export const applyBankConnectionDeletion = (
  state: BankingConnectionOperationState,
  connectionId: string
): BankingConnectionOperationState => {
  if (!getBankConnectionDeletionEligibility(state, connectionId).eligible) return state;

  return {
    ...state,
    bankConnections: state.bankConnections.filter((connection) => connection.id !== connectionId),
    cashAccounts: state.cashAccounts.filter(
      (account) =>
        !(
          account.sourceType === 'linked' &&
          account.connectionId === connectionId &&
          account.status === 'inactive'
        )
    ),
    bankTransactionSyncStates: state.bankTransactionSyncStates.filter(
      (syncState) => syncState.connectionId !== connectionId
    ),
  };
};

export const canRunBankConnectionRefresh = (
  state: BankingConnectionOperationState,
  connectionId: string
) => {
  const connection = state.bankConnections.find((item) => item.id === connectionId);
  return Boolean(connection && canRefreshBankConnection(connection));
};
