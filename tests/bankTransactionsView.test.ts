import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import type { BankTransaction, CashAccount, Property, RentReceivable } from '../src/common/types';
import { createBankConnection, createLinkedCashAccount } from '../src/common/utils/cashAccounts';
import {
  applyBankTransactionProviderLifecycle,
  normalizeProviderTransactions,
  upsertBankTransactions,
} from '../src/common/utils/bankTransactions';
import { BankTransactionsView } from '../src/platforms/web/components/BankTransactionsView';
import { openBankingAdapters } from '../src/platforms/web/services/openBanking';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const account = createLinkedCashAccount({
  id: 'cash-account-1',
  userId: 'transactions-ui-user',
  nickname: 'Main Checking',
  institutionName: 'Mock Institution',
  institutionId: 'mock-institution-ui',
  connectionId: 'connection-ui',
  providerName: 'mock-bank',
  externalAccountId: 'mock-institution-ui:checking',
  currency: 'EUR',
});

const transaction = (overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 'mock-bank:provider-transaction-1',
  providerName: 'mock-bank',
  connectionId: 'connection-ui',
  externalTransactionId: 'provider-transaction-1',
  cashAccountId: account.id,
  externalAccountId: account.externalAccountId,
  bookingDate: '2026-09-15',
  authorizedDate: null,
  amount: 1450,
  currency: 'EUR',
  normalizedAmount: 1450,
  normalizedCurrency: 'EUR',
  fxCoverage: 'same-currency',
  fxRate: 1,
  fxRateTimestamp: null,
  description: 'September rent',
  counterparty: 'Tenant transfer',
  pending: false,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
  syncedAt: '2026-09-16T12:00:00.000Z',
  ...overrides,
});

const translations: Record<string, string> = {
  'cashAccounts.transactionsTitle': 'Bank transactions',
  'cashAccounts.transactionsDescription': 'Synced transaction records.',
  'cashAccounts.transactionDate': 'Date',
  'cashAccounts.transactionAccount': 'Account',
  'cashAccounts.transactionDescription': 'Description',
  'cashAccounts.transactionAmount': 'Amount',
  'cashAccounts.transactionCurrency': 'Currency',
  'cashAccounts.transactionState': 'State',
  'cashAccounts.transactionPending': 'Pending',
  'cashAccounts.transactionPosted': 'Posted',
  'cashAccounts.transactionLifecycle.pending': 'Pending',
  'cashAccounts.transactionLifecycle.posted': 'Posted',
  'cashAccounts.transactionLifecycle.removed': 'Removed',
  'cashAccounts.transactionLifecycle.reversed': 'Reversed',
  'cashAccounts.transactionLifecycle.reversal': 'Reversal',
  'cashAccounts.transactionEmptyTitle': 'No bank transactions yet',
  'cashAccounts.transactionEmptyBody': 'Sync a mock account.',
  'cashAccounts.transactionAllAccounts': 'All accounts',
  'cashAccounts.transactionUnknownAccount': 'Unknown account',
  'cashAccounts.transactionSyncMock': 'Sync mock transactions',
  'cashAccounts.transactionSyncing': 'Syncing...',
  'cashAccounts.reconciliation': 'Reconciliation',
  'cashAccounts.reconciliationConfirm': 'Confirm',
  'cashAccounts.reconciliationIgnore': 'Ignore',
  'cashAccounts.reconciliationUnmatch': 'Undo match',
  'cashAccounts.reconciliationStatus.suggested': 'Suggested match',
  'cashAccounts.reconciliationTarget.rent-receivable': 'Rent',
  'cashAccounts.reconciliationReason.exact-amount': 'Exact amount',
  'cashAccounts.reconciliationReason.date-proximity': 'Nearby date',
};

const t = (key: string) => translations[key] ?? key;

const renderView = (
  transactions: BankTransaction[],
  cashAccounts: CashAccount[] = [account],
  selectedAccountId = 'all'
) => renderToStaticMarkup(React.createElement(BankTransactionsView, {
  transactions,
  cashAccounts,
  selectedAccountId,
  onSelectedAccountIdChange: () => undefined,
  isSyncing: false,
  language: 'en',
  t,
}));

test.beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout },
  });
});

test('renders persisted transaction details with the stable linked account', () => {
  const html = renderView([transaction()]);

  assert.match(html, /September rent/);
  assert.match(html, /Tenant transfer/);
  assert.match(html, /Main Checking/);
  assert.match(html, /EUR/);
  assert.match(html, /Sep 15, 2026/);
  assert.match(html, /data-bank-transaction-id="mock-bank:provider-transaction-1"/);
});

test('account filter does not leak transactions from another account', () => {
  const savings = createLinkedCashAccount({
    ...account,
    id: 'cash-account-2',
    nickname: 'Reserve Savings',
    externalAccountId: 'mock-institution-ui:savings',
    currency: 'USD',
  });
  const checkingTransaction = transaction({ description: 'Checking only' });
  const savingsTransaction = transaction({
    id: 'mock-bank:provider-transaction-2',
    externalTransactionId: 'provider-transaction-2',
    cashAccountId: savings.id,
    externalAccountId: savings.externalAccountId,
    description: 'Savings only',
    amount: 25,
    currency: 'USD',
    normalizedAmount: 22.5,
  });
  const html = renderView(
    [checkingTransaction, savingsTransaction],
    [account, savings],
    savings.id
  );

  assert.match(html, /Savings only/);
  assert.match(html, /Reserve Savings/);
  assert.doesNotMatch(html, /Checking only/);
  assert.equal((html.match(/data-bank-transaction-id=/g) ?? []).length, 1);
});

test('renders pending state and signed inflow and outflow amounts', () => {
  const html = renderView([
    transaction({ pending: true }),
    transaction({
      id: 'mock-bank:provider-transaction-2',
      externalTransactionId: 'provider-transaction-2',
      amount: -185,
      description: 'Property insurance',
    }),
  ]);

  assert.match(html, /data-state="pending"/);
  assert.match(html, />Pending</);
  assert.match(html, /data-direction="inflow"/);
  assert.match(html, /data-raw-amount="1450"/);
  assert.match(html, /\+1450/);
  assert.match(html, /data-direction="outflow"/);
  assert.match(html, /data-raw-amount="-185"/);
  assert.match(html, /−185/);
});

test('renders an empty state when no persisted transactions exist', () => {
  const html = renderView([]);

  assert.match(html, /No bank transactions yet/);
  assert.match(html, /Sync a mock account\./);
  assert.doesNotMatch(html, /data-bank-transaction-id=/);
});

test('renders a conservative rent suggestion with explicit confirm and ignore actions', () => {
  const receivable: RentReceivable = {
    id: 'rent-receivable-ui',
    propertyId: 'property-ui',
    leaseId: 'lease-ui',
    period: '2026-09',
    dueDate: '2026-09-15',
    expectedAmount: 1450,
    currency: 'EUR',
  };
  const html = renderToStaticMarkup(React.createElement(BankTransactionsView, {
    transactions: [transaction()],
    cashAccounts: [account],
    reconciliations: [],
    reconciliationContext: {
      properties: [{ id: 'property-ui', name: 'Central Apartment' } as Property],
      rentReceivables: [receivable],
      rentPayments: [],
      expenseObligations: [],
      expensePayments: [],
      today: new Date('2026-09-16T12:00:00Z'),
    },
    selectedAccountId: 'all',
    onSelectedAccountIdChange: () => undefined,
    onConfirmMatch: () => undefined,
    onIgnore: () => undefined,
    isSyncing: false,
    language: 'en',
    t,
  }));

  assert.match(html, /data-reconciliation-status="suggested"/);
  assert.match(html, /Suggested match/);
  assert.match(html, /Central Apartment/);
  assert.match(html, />Confirm</);
  assert.match(html, />Ignore</);
});

test('renders Undo match only for a matched reconciliation', () => {
  const html = renderToStaticMarkup(React.createElement(BankTransactionsView, {
    transactions: [transaction()],
    cashAccounts: [account],
    reconciliations: [{
      bankTransactionId: transaction().id,
      status: 'matched',
      targetType: 'rent-receivable',
      targetId: 'rent-receivable-ui',
      paymentId: 'bank-payment-ui',
      createdAt: '2026-09-16T12:00:00.000Z',
      updatedAt: '2026-09-16T12:00:00.000Z',
    }],
    reconciliationContext: {
      properties: [],
      rentReceivables: [],
      rentPayments: [],
      expenseObligations: [],
      expensePayments: [],
    },
    selectedAccountId: 'all',
    onSelectedAccountIdChange: () => undefined,
    onUnmatch: () => undefined,
    isSyncing: false,
    language: 'en',
    t,
  }));

  assert.match(html, /data-reconciliation-status="matched"/);
  assert.match(html, />Undo match</);
  assert.doesNotMatch(html, />Confirm</);
});

test('repeated mock sync remains idempotent in the rendered rows', async () => {
  const connection = createBankConnection({
    id: 'connection-ui',
    userId: 'transactions-ui-user',
    providerName: 'mock-bank',
    institutionName: 'Mock Institution',
    institutionId: 'mock-institution-ui',
  });
  const savings = createLinkedCashAccount({
    ...account,
    id: 'cash-account-2',
    nickname: 'Reserve Savings',
    externalAccountId: 'mock-institution-ui:savings',
    currency: 'USD',
  });
  const accounts = [account, savings];
  const adapter = openBankingAdapters['mock-bank'];
  assert.ok(adapter.fetchTransactions);
  const firstPage = await adapter.fetchTransactions(connection, accounts, null);
  const first = upsertBankTransactions([], normalizeProviderTransactions(firstPage.transactions, {
    providerName: 'mock-bank',
    connectionId: connection.id,
    accounts,
    reportingCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9 },
    fxRateTimestamp: '2026-09-16T00:00:00.000Z',
    syncedAt: '2026-09-16T12:00:00.000Z',
  }));
  const secondPage = await adapter.fetchTransactions(connection, accounts, firstPage.nextCursor);
  const normalized = normalizeProviderTransactions(secondPage.transactions, {
    providerName: 'mock-bank',
    connectionId: connection.id,
    accounts,
    reportingCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9 },
    fxRateTimestamp: '2026-09-16T00:00:00.000Z',
    syncedAt: '2026-09-16T13:00:00.000Z',
  });
  const twiceSynced = applyBankTransactionProviderLifecycle({
    existingTransactions: first,
    incomingTransactions: normalized,
    removedTransactions: secondPage.removedTransactions,
    providerName: 'mock-bank',
    syncedAt: '2026-09-16T13:00:00.000Z',
  }).transactions;
  const html = renderView(twiceSynced, accounts);

  assert.equal(twiceSynced.length, 8);
  assert.equal((html.match(/data-bank-transaction-id=/g) ?? []).length, 8);
  assert.match(html, /data-state="removed"/);
  assert.match(html, /data-state="reversed"/);
  assert.match(html, /data-state="reversal"/);
});
