import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Eye,
  EyeOff,
  Landmark,
  Link2,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlink,
  Wallet,
  X,
} from 'lucide-react';
import type {
  BankConnection,
  BankTransaction,
  BankTransactionReconciliation,
  BankReconciliationTargetType,
  BankTransactionSyncState,
  CashAccount,
  CashAccountType,
  ExpenseObligation,
  ExpensePayment,
  OpenBankingProviderName,
  Property,
  PropertyExpenseRule,
  RentPayment,
  RentReceivable,
} from '../../../common/types';
import {
  calculateCashAccountSummary,
  canRefreshBankConnection,
  cashAccountTypeLabels,
  createManualCashAccount,
  getCashAccountBalance,
  getCashAccountDisplayName,
  getBankConnectionReconnectMode,
  isCashAccountIncludedInPortfolio,
  providerLabels,
  setLinkedCashAccountPortfolioInclusion,
  syncStatusLabels,
} from '../../../common/utils/cashAccounts';
import { normalizeProviderTransactions } from '../../../common/utils/bankTransactions';
import {
  confirmBankTransactionMatch,
  ignoreBankTransaction,
  unmatchBankTransaction,
} from '../../../common/utils/bankReconciliation';
import {
  applyBankConnectionAccountResult,
  applyBankConnectionDeletion,
  applyBankConnectionDisconnect,
  applyBankConnectionSyncFailure,
  applyBankConnectionTransactionResult,
  canRunBankConnectionRefresh,
  getBankConnectionDeletionEligibility,
  type BankingConnectionOperationState,
} from '../../../common/utils/bankingConnectionOperations';
import { getActiveFxSnapshot, getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { currencyOptions } from '../../../common/utils/currency';
import { formatCurrencyValue, getLocalizedCurrencyLabel } from '../../../common/utils/formatting';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';
import { CompactEditModal } from '../components/CompactEditModal';
import { BankTransactionsView } from '../components/BankTransactionsView';
import { useSettings } from '../context/SettingsContext';
import { openBankingAdapters } from '../services/openBanking';

interface CashAccountsPageProps {
  userId: string;
  cashAccounts: CashAccount[];
  bankConnections: BankConnection[];
  bankTransactions: BankTransaction[];
  bankTransactionReconciliations: BankTransactionReconciliation[];
  bankTransactionSyncStates: BankTransactionSyncState[];
  properties: Property[];
  rentReceivables: RentReceivable[];
  rentPayments: RentPayment[];
  propertyExpenseRules: PropertyExpenseRule[];
  expenseObligations: ExpenseObligation[];
  expensePayments: ExpensePayment[];
  onUpdateCashAccounts: (accounts: CashAccount[]) => void;
  onUpdateBankConnections: (connections: BankConnection[]) => void;
  onUpdateBankTransactions: (transactions: BankTransaction[]) => void;
  onUpdateBankTransactionReconciliations: (reconciliations: BankTransactionReconciliation[]) => void;
  onUpdateBankTransactionSyncStates: (states: BankTransactionSyncState[]) => void;
  onUpdateRentCollection: (receivables: RentReceivable[], payments: RentPayment[]) => void;
  onUpdatePropertyExpenses: (rules: PropertyExpenseRule[], obligations: ExpenseObligation[], payments: ExpensePayment[]) => void;
}

type CashTab = 'accounts' | 'transactions' | 'connections' | 'settings';
type ManualAccountEditorSection = 'basic' | 'balances' | 'notes';

const inputClass = `w-full ${appInputClass}`;
const labelClass = `mb-2 block text-sm font-medium ${appTextMutedClass}`;
const accountTypes: CashAccountType[] = ['checking', 'savings', 'cash', 'brokerage-cash', 'wallet', 'other'];
const providers: OpenBankingProviderName[] = ['mock-bank', 'tink', 'truelayer', 'yapily', 'plaid'];

const formatNativeCurrency = (value: number, currency: CashAccount['currency']) =>
  formatCurrencyValue(value, currency);

const formatCurrencyBreakdown = (totals: Record<string, number>) =>
  Object.entries(totals)
    .map(([currency, value]) => `${currency} ${formatNativeCurrency(value, currency as CashAccount['currency'])}`)
    .join('  ·  ');

const SummaryCard: React.FC<{ label: string; value: string; subtitle: string }> = ({ label, value, subtitle }) => (
  <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{label}</p>
    <p className={`mt-3 text-[1.7rem] font-semibold tracking-tight ${appTextStrongClass}`}>{value}</p>
    <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{subtitle}</p>
  </div>
);

export const CashAccountsPage: React.FC<CashAccountsPageProps> = ({
  userId,
  cashAccounts,
  bankConnections,
  bankTransactions,
  bankTransactionReconciliations,
  bankTransactionSyncStates,
  properties,
  rentReceivables,
  rentPayments,
  propertyExpenseRules,
  expenseObligations,
  expensePayments,
  onUpdateCashAccounts,
  onUpdateBankConnections,
  onUpdateBankTransactions,
  onUpdateBankTransactionReconciliations,
  onUpdateBankTransactionSyncStates,
  onUpdateRentCollection,
  onUpdatePropertyExpenses,
}) => {
  const { settings, t } = useSettings();
  const [activeTab, setActiveTab] = useState<CashTab>('accounts');
  const [transactionAccountId, setTransactionAccountId] = useState('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(cashAccounts[0]?.id ?? null);
  const [editingAccount, setEditingAccount] = useState<CashAccount | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualEditorMode, setManualEditorMode] = useState<'section' | 'full'>('section');
  const [manualEditorSection, setManualEditorSection] = useState<ManualAccountEditorSection>('basic');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [refreshingConnectionIds, setRefreshingConnectionIds] = useState<Set<string>>(() => new Set());
  const [providerName, setProviderName] = useState<OpenBankingProviderName>('mock-bank');
  const [institutionName, setInstitutionName] = useState('Linked institution');
  const [mockScenario, setMockScenario] = useState<'success' | 'needs-reauth' | 'error'>('success');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const connectionOperationQueuesRef = useRef(new Map<string, Promise<void>>());
  const bankingStateRef = useRef<BankingConnectionOperationState>({
    cashAccounts,
    bankConnections,
    bankTransactions,
    bankTransactionReconciliations,
    bankTransactionSyncStates,
    rentPayments,
    expensePayments,
  });
  bankingStateRef.current = {
    cashAccounts,
    bankConnections,
    bankTransactions,
    bankTransactionReconciliations,
    bankTransactionSyncStates,
    rentPayments,
    expensePayments,
  };

  const commitBankingState = (
    update: (current: BankingConnectionOperationState) => BankingConnectionOperationState
  ) => {
    const current = bankingStateRef.current;
    const next = update(current);
    bankingStateRef.current = next;
    if (next.cashAccounts !== current.cashAccounts) onUpdateCashAccounts(next.cashAccounts);
    if (next.bankConnections !== current.bankConnections) onUpdateBankConnections(next.bankConnections);
    if (next.bankTransactions !== current.bankTransactions) onUpdateBankTransactions(next.bankTransactions);
    if (next.bankTransactionReconciliations !== current.bankTransactionReconciliations) {
      onUpdateBankTransactionReconciliations(next.bankTransactionReconciliations);
    }
    if (next.bankTransactionSyncStates !== current.bankTransactionSyncStates) {
      onUpdateBankTransactionSyncStates(next.bankTransactionSyncStates);
    }
    if (next.rentPayments !== current.rentPayments) {
      onUpdateRentCollection(rentReceivables, next.rentPayments);
    }
    if (next.expensePayments !== current.expensePayments) {
      onUpdatePropertyExpenses(propertyExpenseRules, expenseObligations, next.expensePayments);
    }
    return next;
  };

  const runConnectionOperation = async (
    connectionId: string,
    operation: () => Promise<void>
  ) => {
    setRefreshingConnectionIds((current) => new Set(current).add(connectionId));
    const previous = connectionOperationQueuesRef.current.get(connectionId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tracked = result.then(() => undefined, () => undefined);
    connectionOperationQueuesRef.current.set(connectionId, tracked);
    try {
      await result;
    } finally {
      if (connectionOperationQueuesRef.current.get(connectionId) === tracked) {
        connectionOperationQueuesRef.current.delete(connectionId);
        setRefreshingConnectionIds((current) => {
          const next = new Set(current);
          next.delete(connectionId);
          return next;
        });
      }
    }
  };

  const summary = useMemo(() => calculateCashAccountSummary(cashAccounts), [cashAccounts]);
  const portfolioAccounts = useMemo(
    () => cashAccounts.filter(isCashAccountIncludedInPortfolio),
    [cashAccounts]
  );
  const excludedLinkedAccounts = useMemo(
    () => cashAccounts.filter((account) => !isCashAccountIncludedInPortfolio(account)),
    [cashAccounts]
  );
  const selectedAccount = cashAccounts.find((account) => account.id === selectedAccountId) ?? portfolioAccounts[0] ?? excludedLinkedAccounts[0] ?? null;
  const selectedAccountConnection = selectedAccount?.connectionId
    ? bankConnections.find((connection) => connection.id === selectedAccount.connectionId) ?? null
    : null;
  const mockConnection = bankConnections.find(
    (connection) => connection.providerName === 'mock-bank' && connection.connectionStatus !== 'disconnected'
  );
  const reconciliationContext = {
    properties,
    rentReceivables,
    rentPayments,
    expenseObligations,
    expensePayments,
    cashAccounts,
  };
  const handleConfirmTransaction = (
    transaction: BankTransaction,
    targetType: BankReconciliationTargetType,
    targetId: string
  ) => {
    const current = bankingStateRef.current;
    const result = confirmBankTransactionMatch({
      transaction,
      targetType,
      targetId,
      reconciliations: current.bankTransactionReconciliations,
      context: {
        properties,
        rentReceivables,
        rentPayments: current.rentPayments,
        expenseObligations,
        expensePayments: current.expensePayments,
      },
    });
    if (!result) return;
    commitBankingState((latest) => ({
      ...latest,
      bankTransactionReconciliations: result.reconciliations,
      rentPayments: result.rentPayments,
      expensePayments: result.expensePayments,
    }));
  };

  const handleIgnoreTransaction = (transaction: BankTransaction) => {
    commitBankingState((current) => ({
      ...current,
      bankTransactionReconciliations: ignoreBankTransaction(
        current.bankTransactionReconciliations,
        transaction.id
      ),
    }));
  };

  const handleUnmatchTransaction = (transaction: BankTransaction) => {
    const current = bankingStateRef.current;
    const reconciliation = current.bankTransactionReconciliations.find(
      (item) => item.bankTransactionId === transaction.id && item.status === 'matched'
    );
    const result = unmatchBankTransaction({
      bankTransactionId: transaction.id,
      reconciliations: current.bankTransactionReconciliations,
      rentPayments: current.rentPayments,
      expensePayments: current.expensePayments,
    });
    commitBankingState((latest) => ({
      ...latest,
      bankTransactionReconciliations: result.reconciliations,
      rentPayments: reconciliation?.targetType === 'rent-receivable'
        ? result.rentPayments
        : latest.rentPayments,
      expensePayments: reconciliation?.targetType === 'expense-obligation'
        ? result.expensePayments
        : latest.expensePayments,
    }));
  };

  const syncMockTransactions = async (connection: BankConnection) => {
    const adapter = openBankingAdapters[connection.providerName];
    if (!adapter.fetchTransactions || connection.providerName !== 'mock-bank') {
      return;
    }
    const beforeFetch = bankingStateRef.current;
    const previousState = beforeFetch.bankTransactionSyncStates.find(
      (state) => state.connectionId === connection.id
    );
    const syncedAt = new Date().toISOString();
    try {
      const connectionAccounts = beforeFetch.cashAccounts.filter(
        (account) => account.connectionId === connection.id
      );
      const page = await adapter.fetchTransactions(connection, connectionAccounts, previousState?.cursor);
      const snapshot = getActiveFxSnapshot(settings);
      const normalized = normalizeProviderTransactions(page.transactions, {
        providerName: connection.providerName,
        connectionId: connection.id,
        accounts: bankingStateRef.current.cashAccounts,
        reportingCurrency: settings.currency,
        fxRates: getSettingsCurrencyRates(settings),
        fxRateTimestamp: snapshot?.lastSuccessfulUpdateAt ?? null,
        syncedAt,
      });
      commitBankingState((current) => applyBankConnectionTransactionResult(current, {
        connection,
        incomingTransactions: normalized,
        removedTransactions: page.removedTransactions,
        cursor: page.nextCursor,
        syncedAt,
      }));
    } catch (error) {
      commitBankingState((current) => applyBankConnectionSyncFailure(current, {
        connection,
        errorMessage: error instanceof Error ? error.message : 'Mock transaction sync failed.',
        syncedAt,
      }));
      throw error;
    }
  };

  useEffect(() => {
    if (cashAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    if (!selectedAccountId || !cashAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(cashAccounts[0].id);
    }
  }, [cashAccounts, selectedAccountId]);

  const buildSummaryValue = (totals: Record<string, number>) => {
    const entries = Object.entries(totals);
    if (entries.length === 0) {
      return t('cashAccounts.noBalance');
    }
    if (entries.length === 1) {
      const [currency, value] = entries[0];
      return formatNativeCurrency(value, currency as CashAccount['currency']);
    }
    return t('cashAccounts.multiCurrency');
  };

  const openManualCreate = () => {
    setManualEditorMode('section');
    setManualEditorSection('basic');
    setEditingAccount(
      createManualCashAccount({
        userId,
        nickname: t('cashAccounts.defaults.newAccount'),
        institutionName: t('cashAccounts.defaults.manualAccount'),
        accountType: 'checking',
      })
    );
    setShowManualModal(true);
  };

  const handleSaveManualAccount = () => {
    if (!editingAccount) {
      return;
    }

    const nextAccount = {
      ...editingAccount,
      updatedAt: new Date().toISOString(),
      name: editingAccount.nickname,
      balance: editingAccount.currentBalance,
      isManual: true,
    };

    commitBankingState((current) => ({
      ...current,
      cashAccounts: current.cashAccounts.some((account) => account.id === editingAccount.id)
        ? current.cashAccounts.map((account) => (
          account.id === editingAccount.id ? nextAccount : account
        ))
        : [...current.cashAccounts, nextAccount],
    }));
    setSelectedAccountId(editingAccount.id);
    setShowManualModal(false);
    setEditingAccount(null);
  };

  const handleDeleteManualAccount = (accountId: string) => {
    const next = commitBankingState((current) => ({
      ...current,
      cashAccounts: current.cashAccounts.filter((account) => account.id !== accountId),
    }));
    if (selectedAccountId === accountId) {
      setSelectedAccountId(next.cashAccounts[0]?.id ?? null);
    }
  };

  const handleSetPortfolioInclusion = (
    account: CashAccount,
    isIncludedInPortfolio: boolean
  ) => {
    if (
      !isIncludedInPortfolio &&
      !window.confirm(t('cashAccounts.excludeFromPortfolioConfirm', {
        account: getCashAccountDisplayName(account),
      }))
    ) {
      return;
    }
    commitBankingState((current) => ({
      ...current,
      cashAccounts: setLinkedCashAccountPortfolioInclusion(
        current.cashAccounts,
        account.id,
        isIncludedInPortfolio
      ),
    }));
  };

  const handleConnectProvider = async () => {
    setIsConnecting(true);
    setConnectionMessage(null);
    try {
      const adapter = openBankingAdapters[providerName];
      const session = await adapter.createConnectionSession({
        userId,
        institutionName,
        scenario: mockScenario,
      });
      const result = await adapter.completeConnection(session, {
        userId,
        institutionName,
        scenario: mockScenario,
      });

      let connectedAccountId: string | null = null;
      await runConnectionOperation(result.connection.id, async () => {
        const next = commitBankingState((current) => applyBankConnectionAccountResult(
          current,
          result.connection,
          result.accounts
        ));
        const connected = next.bankConnections.find((item) => item.id === result.connection.id)!;
        connectedAccountId = connected.linkedAccountIds[0] ?? null;
        await syncMockTransactions(connected);
      });
      setSelectedAccountId(connectedAccountId ?? selectedAccountId);
      setActiveTab('connections');
      setShowConnectModal(false);
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : t('cashAccounts.errors.connectUnavailable')
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshConnection = async (connection: BankConnection) => {
    if (!canRefreshBankConnection(connection)) return;
    setConnectionMessage(null);
    try {
      await runConnectionOperation(connection.id, async () => {
        if (!canRunBankConnectionRefresh(bankingStateRef.current, connection.id)) return;
        const currentConnection = bankingStateRef.current.bankConnections.find(
          (item) => item.id === connection.id
        );
        if (!currentConnection) return;
        const adapter = openBankingAdapters[currentConnection.providerName];
        const linkedAccounts = bankingStateRef.current.cashAccounts.filter(
          (account) => account.connectionId === currentConnection.id
        );
        const result = await adapter.refreshConnection(currentConnection, linkedAccounts);
        const next = commitBankingState((current) => applyBankConnectionAccountResult(
          current,
          result.connection,
          result.accounts
        ));
        const refreshed = next.bankConnections.find((item) => item.id === connection.id)!;
        await syncMockTransactions(refreshed);
      });
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : t('cashAccounts.errors.refreshUnavailable')
      );
    }
  };

  const handleReconnectConnection = async (connection: BankConnection) => {
    setConnectionMessage(null);
    try {
      await runConnectionOperation(connection.id, async () => {
        const currentConnection = bankingStateRef.current.bankConnections.find(
          (item) => item.id === connection.id
        );
        if (!currentConnection) return;
        const adapter = openBankingAdapters[currentConnection.providerName];
        const session = await adapter.createConnectionSession({
          userId,
          institutionName: currentConnection.institutionName,
          institutionId: currentConnection.institutionId,
          scenario: 'success',
          connectionId: currentConnection.id,
          connectionStatus: currentConnection.connectionStatus,
        });
        const result = await adapter.completeConnection(session, {
          userId,
          institutionName: currentConnection.institutionName,
          institutionId: currentConnection.institutionId,
          scenario: 'success',
          connectionId: currentConnection.id,
        });
        const next = commitBankingState((current) => applyBankConnectionAccountResult(
          current,
          { ...result.connection, id: connection.id },
          result.accounts.map((account) => ({ ...account, connectionId: connection.id }))
        ));
        const reconnected = next.bankConnections.find((item) => item.id === connection.id)!;
        await syncMockTransactions(reconnected);
      });
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : t('cashAccounts.errors.reconnectUnavailable')
      );
    }
  };

  const handleDisconnectConnection = async (connection: BankConnection) => {
    setConnectionMessage(null);
    try {
      await runConnectionOperation(connection.id, async () => {
        const currentConnection = bankingStateRef.current.bankConnections.find(
          (item) => item.id === connection.id
        );
        if (!currentConnection) return;
        const adapter = openBankingAdapters[currentConnection.providerName];
        const disconnected = await adapter.disconnectConnection(currentConnection);
        commitBankingState((current) => applyBankConnectionDisconnect(
          current,
          disconnected
        ));
      });
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : t('cashAccounts.errors.disconnectUnavailable')
      );
    }
  };

  const handleDeleteConnection = async (connection: BankConnection) => {
    setConnectionMessage(null);
    const initialEligibility = getBankConnectionDeletionEligibility(
      bankingStateRef.current,
      connection.id
    );
    if (!initialEligibility.eligible) {
      setConnectionMessage(t(
        initialEligibility.reason === 'not-disconnected'
          ? 'cashAccounts.deleteConnectionRequiresDisconnected'
          : 'cashAccounts.deleteConnectionBlockedHistory'
      ));
      return;
    }
    if (
      typeof window === 'undefined' ||
      !window.confirm(t('cashAccounts.deleteConnectionConfirm'))
    ) return;

    try {
      await runConnectionOperation(connection.id, async () => {
        const currentEligibility = getBankConnectionDeletionEligibility(
          bankingStateRef.current,
          connection.id
        );
        if (!currentEligibility.eligible) {
          setConnectionMessage(t(
            currentEligibility.reason === 'not-disconnected'
              ? 'cashAccounts.deleteConnectionRequiresDisconnected'
              : 'cashAccounts.deleteConnectionBlockedHistory'
          ));
          return;
        }
        const adapter = openBankingAdapters[currentEligibility.connection.providerName];
        await adapter.deleteConnection(currentEligibility.connection);
        const next = commitBankingState((current) =>
          applyBankConnectionDeletion(current, connection.id)
        );
        if (next.bankConnections.some((item) => item.id === connection.id)) {
          setConnectionMessage(t('cashAccounts.deleteConnectionBlockedHistory'));
          return;
        }
        setSelectedAccountId((current) =>
          current && next.cashAccounts.some((account) => account.id === current)
            ? current
            : next.cashAccounts[0]?.id ?? null
        );
      });
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : t('cashAccounts.errors.deleteConnectionUnavailable')
      );
    }
  };

  return (
    <>
      <div className="space-y-5">
        <section className={`${appPanelClass} rounded-[32px] p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>{t('cashAccounts.title')}</p>
              <h1 className={`mt-2 text-[2rem] font-semibold tracking-tight ${appTextStrongClass}`}>{t('cashAccounts.heroTitle')}</h1>
              <p className={`mt-3 max-w-3xl text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.heroBody')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openManualCreate} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><Plus className="h-4 w-4" />{t('cashAccounts.addManualAccount')}</button>
              <button type="button" onClick={() => setShowConnectModal(true)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}><Link2 className="h-4 w-4" />{t('cashAccounts.connectBankAccount')}</button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label={t('cashAccounts.totalCash')} value={buildSummaryValue(summary.totalsByCurrency)} subtitle={formatCurrencyBreakdown(summary.totalsByCurrency) || t('cashAccounts.addLiquidityHelp')} />
            <SummaryCard label={t('cashAccounts.linkedCash')} value={buildSummaryValue(summary.linkedTotalsByCurrency)} subtitle={summary.linkedCount > 0 ? t('cashAccounts.linkedAccountsCount', { count: summary.linkedCount }) : t('cashAccounts.noLinkedAccounts')} />
            <SummaryCard label={t('cashAccounts.manualCash')} value={buildSummaryValue(summary.manualTotalsByCurrency)} subtitle={summary.manualCount > 0 ? t('cashAccounts.manualAccountsCount', { count: summary.manualCount }) : t('cashAccounts.noManualAccounts')} />
            <SummaryCard label={t('cashAccounts.numberOfAccounts')} value={String(summary.totalAccounts)} subtitle={summary.totalAccounts > 0 ? t('cashAccounts.workspaceUpdateHelp') : t('cashAccounts.startWithManualHelp')} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(summary.totalsByCurrency).length > 0 ? Object.entries(summary.totalsByCurrency).map(([currency, value]) => (
              <span key={currency} className={`rounded-full border px-3 py-1.5 text-sm ${appButtonMutedClass} ${appTextStrongClass}`}>
                {t('cashAccounts.totalByCurrency', { currency, value: formatNativeCurrency(value, currency as CashAccount['currency']) })}
              </span>
            )) : (
              <span className={`rounded-full border px-3 py-1.5 text-sm ${appButtonMutedClass} ${appTextMutedClass}`}>{t('cashAccounts.noBalancesYet')}</span>
            )}
          </div>
          {connectionMessage ? (
            <div className="mt-4 rounded-[18px] border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              {connectionMessage}
            </div>
          ) : null}
        </section>

        <section className={`${appPanelClass} rounded-[32px] p-5 sm:p-6`}>
          <div className="flex flex-wrap gap-2">
            {(['accounts', 'transactions', 'connections', 'settings'] as CashTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2.5 text-sm font-medium ${activeTab === tab ? appButtonPrimaryClass : `${appButtonMutedClass} ${appTextStrongClass}`}`}
              >
                {tab === 'accounts'
                  ? t('common.accounts')
                  : tab === 'transactions'
                  ? t('cashAccounts.transactionsTab')
                  : tab === 'connections'
                  ? t('common.connections')
                  : t('settings.title')}
              </button>
            ))}
          </div>

          {activeTab === 'accounts' ? (
            cashAccounts.length === 0 ? (
              <div className={`mt-6 rounded-[28px] border border-dashed p-10 text-center ${appBorderClass}`}>
                <Wallet className="mx-auto h-10 w-10 text-cyan-600 dark:text-cyan-300" />
                <h2 className={`mt-5 text-[1.6rem] font-semibold ${appTextStrongClass}`}>{t('cashAccounts.emptyTitle')}</h2>
                <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.emptyBody')}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={openManualCreate} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('cashAccounts.addManualAccount')}</button>
                  <button type="button" onClick={() => setShowConnectModal(true)} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>{t('cashAccounts.connectBankAccount')}</button>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-3">
                  {portfolioAccounts.map((account) => {
                    const connection = bankConnections.find((item) => item.id === account.connectionId);
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setSelectedAccountId(account.id)}
                        className={`w-full rounded-[24px] border p-4 text-left transition ${selectedAccountId === account.id ? 'border-cyan-400/45 bg-cyan-500/8 shadow-[0_22px_46px_-34px_rgba(6,182,212,0.28)]' : `${appPanelInsetClass} hover:-translate-y-[1px]`}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`truncate text-base font-semibold ${appTextStrongClass}`}>{getCashAccountDisplayName(account)}</p>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${account.sourceType === 'manual' ? 'border border-slate-300/80 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300' : 'border border-cyan-300/70 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300'}`}>{account.sourceType === 'manual' ? t('cashAccounts.sourceOptions.manual') : t('cashAccounts.sourceOptions.linked')}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${account.syncStatus === 'error' ? 'border border-rose-300/70 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300' : account.syncStatus === 'needs-reauth' ? 'border border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' : 'border border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{syncStatusLabels[account.syncStatus]}</span>
                            </div>
                            <p className={`mt-2 text-sm ${appTextMutedClass}`}>{account.institutionName}</p>
                          </div>
                          <p className={`text-base font-semibold ${appTextStrongClass}`}>{formatNativeCurrency(getCashAccountBalance(account), account.currency)}</p>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <div><p className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${appTextSoftClass}`}>{t('cashAccounts.type')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{cashAccountTypeLabels[account.accountType]}</p></div>
                          <div><p className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${appTextSoftClass}`}>{t('common.currency')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{account.currency}</p></div>
                          <div><p className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${appTextSoftClass}`}>{t('cashAccounts.available')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{account.availableBalance === null || account.availableBalance === undefined ? t('common.notProvided') : formatNativeCurrency(account.availableBalance, account.currency)}</p></div>
                          <div><p className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${appTextSoftClass}`}>{t('cashAccounts.lastUpdate')}</p><p className={`mt-1 text-sm font-semibold ${appTextStrongClass}`}>{new Intl.DateTimeFormat(settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US', { dateStyle: 'medium' }).format(new Date(account.lastSyncedAt ?? account.updatedAt))}</p></div>
                        </div>
                        {connection ? <p className={`mt-3 text-xs ${appTextMutedClass}`}>{t('cashAccounts.connectedThrough', { provider: providerLabels[connection.providerName] })}</p> : null}
                      </button>
                    );
                  })}
                  {excludedLinkedAccounts.length > 0 ? (
                    <div className={`rounded-[24px] border border-dashed p-4 ${appBorderClass}`}>
                      <div className="flex items-start gap-3">
                        <EyeOff className="mt-0.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
                        <div>
                          <h3 className={`text-sm font-semibold ${appTextStrongClass}`}>{t('cashAccounts.excludedAccounts')}</h3>
                          <p className={`mt-1 text-xs leading-5 ${appTextMutedClass}`}>{t('cashAccounts.excludedAccountsHelp')}</p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {excludedLinkedAccounts.map((account) => (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => setSelectedAccountId(account.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-[18px] border px-3 py-3 text-left ${selectedAccountId === account.id ? 'border-amber-400/55 bg-amber-500/8' : appPanelInsetClass}`}
                          >
                            <span className="min-w-0">
                              <span className={`block truncate text-sm font-semibold ${appTextStrongClass}`}>{getCashAccountDisplayName(account)}</span>
                              <span className={`mt-1 block text-xs ${appTextMutedClass}`}>{account.institutionName}</span>
                            </span>
                            <span className={`shrink-0 text-sm font-semibold ${appTextMutedClass}`}>{formatNativeCurrency(getCashAccountBalance(account), account.currency)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <aside className={`${appPanelInsetClass} rounded-[26px] p-5`}>
                  {selectedAccount ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>{t('cashAccounts.accountDetail')}</p>
                          <h3 className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{getCashAccountDisplayName(selectedAccount)}</h3>
                          <p className={`mt-2 text-sm ${appTextMutedClass}`}>{selectedAccount.institutionName}</p>
                          {!isCashAccountIncludedInPortfolio(selectedAccount) ? <span className="mt-3 inline-flex rounded-full border border-amber-300/70 bg-amber-50/80 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">{t('cashAccounts.excludedFromPortfolio')}</span> : null}
                        </div>
                        <div className={`${appPanelClass} rounded-[18px] p-3`}>
                          {selectedAccount.sourceType === 'manual' ? <Wallet className="h-5 w-5 text-cyan-600 dark:text-cyan-300" /> : <Landmark className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
                        </div>
                      </div>
                      <div className="mt-5 space-y-3">
                        {[
                          [t('cashAccounts.currentBalance'), formatNativeCurrency(getCashAccountBalance(selectedAccount), selectedAccount.currency)],
                          [t('cashAccounts.availableBalance'), selectedAccount.availableBalance === null || selectedAccount.availableBalance === undefined ? t('common.notProvided') : formatNativeCurrency(selectedAccount.availableBalance, selectedAccount.currency)],
                          [t('cashAccounts.source'), selectedAccount.sourceType === 'manual' ? t('cashAccounts.manualAccount') : t('cashAccounts.linkedVia', { provider: providerLabels[selectedAccount.providerName ?? 'mock-bank'] })],
                          [t('cashAccounts.maskedReference'), selectedAccount.maskedReference || t('common.notProvided')],
                          [t('cashAccounts.syncStatus'), syncStatusLabels[selectedAccount.syncStatus]],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between rounded-[18px] border border-slate-200/70 px-3 py-3 dark:border-slate-800">
                            <span className={`text-sm ${appTextMutedClass}`}>{label}</span>
                            <span className={`text-sm font-semibold ${appTextStrongClass}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <p className={`mt-4 text-sm leading-6 ${appTextMutedClass}`}>{selectedAccount.notes || t('cashAccounts.notesFallback')}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedAccount.sourceType === 'manual' ? (
                          <>
                            <button type="button" onClick={() => { setEditingAccount(selectedAccount); setManualEditorMode('section'); setManualEditorSection('basic'); setShowManualModal(true); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><PencilLine className="h-4 w-4" />{t('common.edit')}</button>
                            <button type="button" onClick={() => handleDeleteManualAccount(selectedAccount.id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} text-rose-600 dark:text-rose-300`}><Trash2 className="h-4 w-4" />{t('common.delete')}</button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={!selectedAccountConnection || !canRefreshBankConnection(selectedAccountConnection)} onClick={() => { if (selectedAccountConnection) { void handleRefreshConnection(selectedAccountConnection); } }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><RefreshCw className="h-4 w-4" />{t('cashAccounts.refreshLinkedBalance')}</button>
                            {selectedAccount.status === 'active' ? (
                              <button type="button" onClick={() => handleSetPortfolioInclusion(selectedAccount, !isCashAccountIncludedInPortfolio(selectedAccount))} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${isCashAccountIncludedInPortfolio(selectedAccount) ? 'text-amber-700 dark:text-amber-300' : appTextStrongClass}`}>
                                {isCashAccountIncludedInPortfolio(selectedAccount) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                {t(isCashAccountIncludedInPortfolio(selectedAccount) ? 'cashAccounts.excludeFromPortfolio' : 'cashAccounts.includeInPortfolio')}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[280px] items-center justify-center text-center">
                      <div>
                        <Building2 className="mx-auto h-8 w-8 text-cyan-600 dark:text-cyan-300" />
                        <p className={`mt-3 text-sm ${appTextMutedClass}`}>{t('cashAccounts.selectAccountEmpty')}</p>
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            )
          ) : activeTab === 'connections' ? (
            <div className="mt-6 space-y-3">
              {bankConnections.length === 0 ? (
                <div className={`rounded-[28px] border border-dashed p-10 text-center ${appBorderClass}`}>
                  <ShieldCheck className="mx-auto h-10 w-10 text-cyan-600 dark:text-cyan-300" />
                  <h2 className={`mt-5 text-[1.5rem] font-semibold ${appTextStrongClass}`}>{t('cashAccounts.noConnectedInstitutions')}</h2>
                  <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.noConnectedInstitutionsBody')}</p>
                </div>
              ) : bankConnections.map((connection) => (
                <div key={connection.id} className={`${appPanelInsetClass} rounded-[24px] p-5`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{connection.institutionName}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${connection.needsReauth ? 'border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' : connection.syncStatus === 'error' ? 'border-rose-300/70 bg-rose-50/80 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300' : 'border-emerald-300/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{connection.connectionStatus.replace(/-/g, ' ')}</span>
                      </div>
                      <p className={`mt-2 text-sm ${appTextMutedClass}`}>{providerLabels[connection.providerName]} · {connection.linkedAccountIds.length} linked account{connection.linkedAccountIds.length === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={refreshingConnectionIds.has(connection.id) || !canRefreshBankConnection(connection)} onClick={() => void handleRefreshConnection(connection)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><RefreshCw className="h-4 w-4" />{t('common.refresh')}</button>
                      <button type="button" disabled={refreshingConnectionIds.has(connection.id)} onClick={() => void handleReconnectConnection(connection)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}><Link2 className="h-4 w-4" />{t(getBankConnectionReconnectMode(connection) === 'connect-again' ? 'common.connectAgain' : 'common.reconnect')}</button>
                      <button type="button" disabled={refreshingConnectionIds.has(connection.id)} onClick={() => void handleDisconnectConnection(connection)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} text-rose-600 dark:text-rose-300`}><Unlink className="h-4 w-4" />{t('common.disconnect')}</button>
                      {connection.connectionStatus === 'disconnected' ? <button type="button" disabled={refreshingConnectionIds.has(connection.id)} onClick={() => void handleDeleteConnection(connection)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 ${appButtonMutedClass} text-rose-600 dark:text-rose-300`}><Trash2 className="h-4 w-4" />{t('cashAccounts.deleteConnection')}</button> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className={`${appPanelClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>{t('cashAccounts.provider')}</p><p className={`mt-2 text-sm font-semibold ${appTextStrongClass}`}>{providerLabels[connection.providerName]}</p></div>
                    <div className={`${appPanelClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>{t('cashAccounts.syncStatus')}</p><p className={`mt-2 text-sm font-semibold ${appTextStrongClass}`}>{syncStatusLabels[connection.syncStatus]}</p></div>
                    <div className={`${appPanelClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>{t('cashAccounts.lastSynced')}</p><p className={`mt-2 text-sm font-semibold ${appTextStrongClass}`}>{connection.lastSyncedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.lastSyncedAt)) : t('cashAccounts.notSyncedYet')}</p></div>
                    <div className={`${appPanelClass} rounded-[18px] p-3`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>{t('cashAccounts.reauth')}</p><p className={`mt-2 text-sm font-semibold ${appTextStrongClass}`}>{connection.needsReauth ? t('cashAccounts.required') : t('cashAccounts.notRequired')}</p></div>
                  </div>
                  {connection.errorMessage ? <div className="mt-4 rounded-[18px] border border-rose-300/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{connection.errorMessage}</div> : null}
                </div>
              ))}
            </div>
          ) : activeTab === 'transactions' ? (
            <BankTransactionsView
              transactions={bankTransactions}
              cashAccounts={cashAccounts}
              reconciliations={bankTransactionReconciliations}
              reconciliationContext={reconciliationContext}
              selectedAccountId={transactionAccountId}
              onSelectedAccountIdChange={setTransactionAccountId}
              onSyncMock={mockConnection ? () => void handleRefreshConnection(mockConnection) : undefined}
              isSyncing={Boolean(mockConnection && refreshingConnectionIds.has(mockConnection.id))}
              onConfirmMatch={handleConfirmTransaction}
              onIgnore={handleIgnoreTransaction}
              onUnmatch={handleUnmatchTransaction}
              language={settings.language}
              t={t}
            />
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className={`${appPanelInsetClass} rounded-[24px] p-5`}>
                <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('cashAccounts.startSimpleTitle')}</h3>
                <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.startSimpleBody')}</p>
              </div>
              <div className={`${appPanelInsetClass} rounded-[24px] p-5`}>
                <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>{t('cashAccounts.laterTitle')}</h3>
                <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>{t('cashAccounts.laterBody')}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {showManualModal && editingAccount ? (
        <CompactEditModal
          eyebrow={t('cashAccounts.manualAccountEyebrow')}
          title={cashAccounts.some((account) => account.id === editingAccount.id) ? t('cashAccounts.editManualAccount') : t('cashAccounts.addManualAccountTitle')}
          subtitle={t('cashAccounts.manualAccountSubtitle')}
          onClose={() => { setShowManualModal(false); setEditingAccount(null); }}
          sections={[
            { id: 'basic', label: t('cashAccounts.basicInfo') },
            { id: 'balances', label: t('cashAccounts.balances') },
            { id: 'notes', label: t('common.notes') },
          ]}
          activeSection={manualEditorSection}
          onSectionChange={(sectionId) => setManualEditorSection(sectionId as ManualAccountEditorSection)}
          mode={manualEditorMode}
          onModeChange={setManualEditorMode}
          sectionWidthClassName="sm:max-w-xl"
          fullWidthClassName="sm:max-w-2xl"
        >
          <div className="space-y-5 p-4 sm:p-6">
            {manualEditorMode === 'full' || manualEditorSection === 'basic' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>{t('cashAccounts.accountNickname')}</label><input value={editingAccount.nickname} onChange={(event) => setEditingAccount({ ...editingAccount, nickname: event.target.value, name: event.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>{t('cashAccounts.institutionName')}</label><input value={editingAccount.institutionName} onChange={(event) => setEditingAccount({ ...editingAccount, institutionName: event.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>{t('cashAccounts.accountType')}</label><select value={editingAccount.accountType} onChange={(event) => setEditingAccount({ ...editingAccount, accountType: event.target.value as CashAccountType })} className={inputClass}>{accountTypes.map((type) => <option key={type} value={type}>{cashAccountTypeLabels[type]}</option>)}</select></div>
                <div><label className={labelClass}>{t('common.currency')}</label><select value={editingAccount.currency} onChange={(event) => setEditingAccount({ ...editingAccount, currency: event.target.value as CashAccount['currency'] })} className={inputClass}>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{getLocalizedCurrencyLabel(currency.code)}</option>)}</select></div>
              </div>
            ) : null}
            {manualEditorMode === 'full' || manualEditorSection === 'balances' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={labelClass}>{t('cashAccounts.currentBalance')}</label><input type="number" value={editingAccount.currentBalance} onChange={(event) => setEditingAccount({ ...editingAccount, currentBalance: Number(event.target.value) || 0, balance: Number(event.target.value) || 0 })} className={inputClass} /></div>
                <div><label className={labelClass}>{t('cashAccounts.availableBalance')}</label><input type="number" value={editingAccount.availableBalance ?? ''} onChange={(event) => setEditingAccount({ ...editingAccount, availableBalance: event.target.value === '' ? null : Number(event.target.value) || 0 })} className={inputClass} /></div>
              </div>
            ) : null}
            {manualEditorMode === 'full' || manualEditorSection === 'notes' ? (
              <div><label className={labelClass}>{t('common.notes')}</label><textarea rows={4} value={editingAccount.notes} onChange={(event) => setEditingAccount({ ...editingAccount, notes: event.target.value })} className={inputClass} /></div>
            ) : null}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => { setShowManualModal(false); setEditingAccount(null); }} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>Cancel</button>
              <button type="button" onClick={handleSaveManualAccount} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>Save Account</button>
            </div>
          </div>
        </CompactEditModal>
      ) : null}

      {showConnectModal ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/56 p-4 backdrop-blur-sm">
          <div className={`${appPanelClass} w-full max-w-2xl rounded-[30px] p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${appTextSoftClass}`}>{t('cashAccounts.openBanking')}</p>
                <h2 className={`mt-2 text-[1.6rem] font-semibold ${appTextStrongClass}`}>{t('cashAccounts.connectBankTitle')}</h2>
                <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>Real secure authentication should happen through the provider’s hosted flow. This development version uses a mock provider so we can validate the UX and state architecture first.</p>
              </div>
              <button type="button" onClick={() => setShowConnectModal(false)} className={`rounded-xl p-2 ${appButtonMutedClass} ${appTextMutedClass}`}><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>{t('cashAccounts.provider')}</label><select value={providerName} onChange={(event) => setProviderName(event.target.value as OpenBankingProviderName)} className={inputClass}>{providers.map((provider) => <option key={provider} value={provider}>{providerLabels[provider]}</option>)}</select></div>
              <div><label className={labelClass}>{t('cashAccounts.institutionName')}</label><input value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>{t('cashAccounts.developmentScenario')}</label><select value={mockScenario} onChange={(event) => setMockScenario(event.target.value as 'success' | 'needs-reauth' | 'error')} className={inputClass}><option value="success">{t('cashAccounts.connectionSuccess')}</option><option value="needs-reauth">{t('cashAccounts.needsReauthentication')}</option><option value="error">{t('cashAccounts.providerError')}</option></select></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConnectModal(false)} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}>Cancel</button>
              <button type="button" disabled={isConnecting} onClick={() => void handleConnectProvider()} className={`rounded-xl px-4 py-2.5 ${appButtonPrimaryClass}`}>{isConnecting ? t('cashAccounts.connecting') : t('cashAccounts.startSecureConnection')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
