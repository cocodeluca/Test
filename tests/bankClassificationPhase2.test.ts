import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { mockProperties } from '../src/common/data/mockData';
import type {
  BankTransaction,
  BankTransactionReconciliation,
  ExpenseObligation,
  ExpensePayment,
  Property,
  PropertyExpenseRule,
  RentPayment,
  RentReceivable,
} from '../src/common/types';
import {
  suggestBankTransactionMatch,
  type BankReconciliationContext,
} from '../src/common/utils/bankReconciliation';
import {
  extractConfirmedBankTransactionPatterns,
  normalizeBankPatternText,
} from '../src/common/utils/bankTransactionPatterns';
import { createLinkedCashAccount } from '../src/common/utils/cashAccounts';
import {
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
} from '../src/platforms/web/services/localAccountStore';

const leaseA = {
  ...mockProperties[0].leases![0],
  id: 'lease-a',
  name: 'Tenant Alice',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 1450,
  monthlyRentCurrency: 'EUR' as const,
  rentDueDay: 5,
  rentTrackingStartDate: '2026-01-01',
  active: true,
};
const propertyA: Property = {
  ...mockProperties[0],
  id: 'property-a',
  name: 'Central Apartment',
  address: '10 Central Street',
  leases: [leaseA],
  activeLeaseId: leaseA.id,
};
const leaseB = { ...leaseA, id: 'lease-b', name: 'Tenant Bruno' };
const propertyB: Property = {
  ...mockProperties[1],
  id: 'property-b',
  name: 'Riverside Home',
  address: '20 Riverside Road',
  leases: [leaseB],
  activeLeaseId: leaseB.id,
};

const account = createLinkedCashAccount({
  id: 'cash-phase2',
  connectionId: 'connection-phase2',
  providerName: 'plaid',
  externalAccountId: 'external-phase2',
  currency: 'EUR',
});

const bankTransaction = (id: string, overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id,
  providerName: 'plaid',
  connectionId: 'connection-phase2',
  externalTransactionId: `external-${id}`,
  cashAccountId: account.id,
  externalAccountId: 'external-phase2',
  bookingDate: '2026-09-03',
  amount: 1450,
  currency: 'EUR',
  normalizedAmount: 1450,
  normalizedCurrency: 'EUR',
  fxCoverage: 'same-currency',
  description: 'Monthly transfer',
  counterparty: 'Tenant Alice',
  pending: false,
  lifecycleStatus: 'active',
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-03T12:00:00.000Z',
  syncedAt: '2026-09-03T12:00:00.000Z',
  ...overrides,
});

const receivable = (
  id: string,
  propertyId: string,
  leaseId: string,
  period: string,
  dueDate: string,
  currency: RentReceivable['currency'] = 'EUR'
): RentReceivable => ({
  id, propertyId, leaseId, period, dueDate, expectedAmount: 1450, currency,
});

const augustRent = receivable('rent-a-aug', propertyA.id, leaseA.id, '2026-08', '2026-08-05');
const septemberRentA = receivable('rent-a-sep', propertyA.id, leaseA.id, '2026-09', '2026-09-05');
const septemberRentB = receivable('rent-b-sep', propertyB.id, leaseB.id, '2026-09', '2026-09-05');

const communityRuleA: PropertyExpenseRule = {
  id: 'community-rule-a', propertyId: propertyA.id, category: 'COMMUNITY', label: 'Community fee',
  amount: 90, currency: 'EUR', frequency: 'MONTHLY', startDate: '2026-01-01',
  trackingStartDate: '2026-01-01', dueDay: 10, isActive: true,
};
const communityRuleB: PropertyExpenseRule = {
  ...communityRuleA, id: 'community-rule-b', propertyId: propertyB.id,
};
const expense = (
  id: string,
  rule: PropertyExpenseRule,
  period: string,
  dueDate: string
): ExpenseObligation => ({
  id,
  propertyId: rule.propertyId,
  expenseRuleId: rule.id,
  category: rule.category,
  label: rule.label,
  period,
  dueDate,
  expectedAmount: rule.amount,
  currency: rule.currency,
});
const augustCommunityA = expense('community-a-aug', communityRuleA, '2026-08', '2026-08-10');
const septemberCommunityA = expense('community-a-sep', communityRuleA, '2026-09', '2026-09-10');
const septemberCommunityB = expense('community-b-sep', communityRuleB, '2026-09', '2026-09-10');

const matched = (
  transactionId: string,
  targetType: 'rent-receivable' | 'expense-obligation',
  targetId: string,
  paymentId: string,
  overrides: Partial<BankTransactionReconciliation> = {}
): BankTransactionReconciliation => ({
  bankTransactionId: transactionId,
  status: 'matched',
  targetType,
  targetId,
  paymentId,
  paymentLinkType: 'created-bank-sync',
  createdAt: '2026-08-05T13:00:00.000Z',
  updatedAt: '2026-08-05T13:00:00.000Z',
  ...overrides,
});

const rentPayment = (
  id: string,
  target: RentReceivable,
  amount = 1450
): RentPayment => ({
  id,
  propertyId: target.propertyId,
  leaseId: target.leaseId,
  receivedDate: target.dueDate,
  amount,
  currency: target.currency,
  source: 'bank_sync',
  allocations: [{ receivableId: target.id, amount }],
});

const expensePayment = (
  id: string,
  target: ExpenseObligation,
  amount = 90
): ExpensePayment => ({
  id,
  propertyId: target.propertyId,
  paidDate: target.dueDate,
  amount,
  currency: target.currency,
  source: 'bank_sync',
  allocations: [{ obligationId: target.id, amount }],
});

const historyRentTransaction = bankTransaction('history-rent', {
  bookingDate: '2026-08-05',
  description: 'Transfer August 884211',
  counterparty: 'TENANT, ALICE',
});
const historyRentPayment = rentPayment('payment-history-rent', augustRent);
const historyRentMatch = matched(
  historyRentTransaction.id,
  'rent-receivable',
  augustRent.id,
  historyRentPayment.id
);

const emptyPatterns = {
  rent: [],
  expense: [],
  ambiguousRentFingerprints: [],
  ambiguousExpenseFingerprints: [],
};

const baseContext = (overrides: Partial<BankReconciliationContext> = {}): BankReconciliationContext => ({
  properties: [propertyA, propertyB],
  rentReceivables: [augustRent, septemberRentA, septemberRentB],
  rentPayments: [historyRentPayment],
  propertyExpenseRules: [communityRuleA, communityRuleB],
  expenseObligations: [augustCommunityA, septemberCommunityA, septemberCommunityB],
  expensePayments: [],
  cashAccounts: [account],
  bankTransactions: [historyRentTransaction],
  ...overrides,
});

test('confirmed rent payer strengthens a future same-property suggestion', () => {
  const suggestion = suggestBankTransactionMatch(
    bankTransaction('future-rent', { counterparty: ' tenant   alice ', description: 'Incoming transfer' }),
    baseContext(),
    [historyRentMatch]
  );
  assert.equal(suggestion?.targetId, septemberRentA.id);
  assert.ok(suggestion?.reasons.includes('previously-confirmed-payer'));
});

test('unconfirmed suggestions and ignored decisions create no patterns', () => {
  const context = baseContext();
  const ignored = matched(historyRentTransaction.id, 'rent-receivable', augustRent.id, historyRentPayment.id, {
    status: 'ignored', targetType: null, targetId: null, paymentId: null, paymentLinkType: null,
  });
  assert.deepEqual(extractConfirmedBankTransactionPatterns(context, []), emptyPatterns);
  assert.deepEqual(extractConfirmedBankTransactionPatterns(context, [ignored]), emptyPatterns);
});

test('undoing a match immediately removes its historical evidence', () => {
  const before = extractConfirmedBankTransactionPatterns(baseContext(), [historyRentMatch]);
  const after = extractConfirmedBankTransactionPatterns(baseContext(), []);
  assert.equal(before.rent.length > 0, true);
  assert.deepEqual(after, emptyPatterns);
});

test('removed or reversed provider transactions contribute no evidence', () => {
  for (const lifecycleStatus of ['removed', 'reversed', 'reversal'] as const) {
    const context = baseContext({
      bankTransactions: [{ ...historyRentTransaction, lifecycleStatus }],
    });
    assert.deepEqual(extractConfirmedBankTransactionPatterns(context, [historyRentMatch]), emptyPatterns);
  }
});

test('confirmed expense merchant/property/category is reused without generic description matching', () => {
  const historical = bankTransaction('history-expense', {
    bookingDate: '2026-08-10', amount: -90, normalizedAmount: -90,
    description: 'Direct debit 884211', counterparty: 'Administración Sol',
  });
  const payment = expensePayment('payment-history-expense', augustCommunityA);
  const reconciliation = matched(historical.id, 'expense-obligation', augustCommunityA.id, payment.id);
  const context = baseContext({
    bankTransactions: [historical], rentPayments: [], expensePayments: [payment],
  });
  const suggestion = suggestBankTransactionMatch(bankTransaction('future-expense', {
    bookingDate: '2026-09-10', amount: -90, normalizedAmount: -90,
    description: 'Sep charge 7722', counterparty: 'ADMINISTRACION SOL',
  }), context, [reconciliation]);
  assert.equal(suggestion?.targetId, septemberCommunityA.id);
  assert.ok(suggestion?.reasons.includes('previously-confirmed-merchant'));
});

test('the same merchant confirmed across two properties becomes ambiguous', () => {
  const historicalA = bankTransaction('history-expense-a', {
    bookingDate: '2026-08-10', amount: -90, normalizedAmount: -90,
    description: 'Debit A', counterparty: 'Shared Manager',
  });
  const historicalObligationB = expense('community-b-aug', communityRuleB, '2026-08', '2026-08-10');
  const historicalB = bankTransaction('history-expense-b', {
    bookingDate: '2026-08-10', amount: -90, normalizedAmount: -90,
    description: 'Debit B', counterparty: 'Shared Manager',
  });
  const paymentA = expensePayment('payment-expense-a', augustCommunityA);
  const paymentB = expensePayment('payment-expense-b', historicalObligationB);
  const context = baseContext({
    expenseObligations: [augustCommunityA, historicalObligationB, septemberCommunityA, septemberCommunityB],
    expensePayments: [paymentA, paymentB],
    bankTransactions: [historicalA, historicalB],
  });
  const reconciliations = [
    matched(historicalA.id, 'expense-obligation', augustCommunityA.id, paymentA.id),
    matched(historicalB.id, 'expense-obligation', historicalObligationB.id, paymentB.id),
  ];
  const suggestion = suggestBankTransactionMatch(bankTransaction('future-expense', {
    bookingDate: '2026-09-10', amount: -90, normalizedAmount: -90,
    description: 'Debit A', counterparty: 'Shared Manager',
  }), context, reconciliations);
  assert.equal(suggestion, null);
});

test('the same payer confirmed across two active leases becomes ambiguous', () => {
  const augustRentB = receivable('rent-b-aug', propertyB.id, leaseB.id, '2026-08', '2026-08-05');
  const historicalB = bankTransaction('history-rent-b', {
    bookingDate: '2026-08-05', description: 'Transfer B', counterparty: 'Tenant Alice',
  });
  const paymentB = rentPayment('payment-history-rent-b', augustRentB);
  const context = baseContext({
    rentReceivables: [augustRent, augustRentB, septemberRentA, septemberRentB],
    rentPayments: [historyRentPayment, paymentB],
    bankTransactions: [historyRentTransaction, historicalB],
  });
  const suggestion = suggestBankTransactionMatch(bankTransaction('future-rent', {
    counterparty: 'Tenant Alice', description: 'Transfer August 884211',
  }), context, [
    historyRentMatch,
    matched(historicalB.id, 'rent-receivable', augustRentB.id, paymentB.id),
  ]);
  assert.equal(suggestion, null);
});

test('currency, amount, date, and active-target rules still fail closed', () => {
  const reconciliations = [historyRentMatch];
  assert.equal(suggestBankTransactionMatch(
    bankTransaction('wrong-currency', { currency: 'USD', normalizedCurrency: 'USD' }),
    baseContext(), reconciliations
  ), null);
  assert.equal(suggestBankTransactionMatch(
    bankTransaction('wrong-amount', { amount: 1600, normalizedAmount: 1600 }),
    baseContext(), reconciliations
  ), null);
  assert.equal(suggestBankTransactionMatch(
    bankTransaction('wrong-date', { bookingDate: '2026-11-01' }),
    baseContext(), reconciliations
  ), null);
  const inactiveA = { ...propertyA, leases: [{ ...leaseA, active: false }] };
  assert.equal(suggestBankTransactionMatch(
    bankTransaction('inactive-target'),
    baseContext({
      properties: [inactiveA],
      rentReceivables: [augustRent, septemberRentA],
    }), reconciliations
  ), null);
});

test('historical merchant evidence cannot manufacture an expense obligation', () => {
  const standaloneHistoricalObligation = { ...augustCommunityA, expenseRuleId: undefined };
  const historical = bankTransaction('history-expense', {
    bookingDate: '2026-08-10', amount: -90, normalizedAmount: -90,
    description: 'Debit', counterparty: 'Known Manager',
  });
  const payment = expensePayment('payment-history-expense', standaloneHistoricalObligation);
  const reconciliation = matched(
    historical.id,
    'expense-obligation',
    standaloneHistoricalObligation.id,
    payment.id
  );
  const context = baseContext({
    bankTransactions: [historical], expensePayments: [payment],
    propertyExpenseRules: [],
    expenseObligations: [standaloneHistoricalObligation],
  });
  assert.equal(suggestBankTransactionMatch(bankTransaction('future-expense', {
    bookingDate: '2026-09-10', amount: -90, normalizedAmount: -90,
    description: 'Debit', counterparty: 'Known Manager',
  }), context, [reconciliation]), null);
});

test('pattern extraction is deterministic, normalized, and non-mutating', () => {
  const context = baseContext();
  const beforeContext = structuredClone(context);
  const beforeReconciliations = structuredClone([historyRentMatch]);
  const first = extractConfirmedBankTransactionPatterns(context, [historyRentMatch]);
  const second = extractConfirmedBankTransactionPatterns(context, [historyRentMatch]);
  assert.deepEqual(second, first);
  assert.deepEqual(context, beforeContext);
  assert.deepEqual([historyRentMatch], beforeReconciliations);
  assert.equal(normalizeBankPatternText('  ADMINISTRACIÓN,  SOL!! '), 'administracion sol');
  assert.equal(normalizeBankPatternText('123456'), null);
});

test('excluded linked accounts and invalid payment provenance do not create learning', () => {
  const excluded = { ...account, isIncludedInPortfolio: false };
  assert.deepEqual(extractConfirmedBankTransactionPatterns(
    baseContext({ cashAccounts: [excluded] }),
    [historyRentMatch]
  ), emptyPatterns);
  assert.deepEqual(extractConfirmedBankTransactionPatterns(
    baseContext({ rentPayments: [{ ...historyRentPayment, source: 'bank_import' }] }),
    [historyRentMatch]
  ), emptyPatterns);
});

test('confirmed history remains the learning source after a canonical persistence round trip', async () => {
  globalThis.indexedDB = new IDBFactory();
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
  await saveUserPortfolio('bank-classification-phase2', {
    ...structuredClone(emptyPortfolioData),
    properties: [propertyA, propertyB],
    cashAccounts: [account],
    bankTransactions: [historyRentTransaction],
    bankTransactionReconciliations: [historyRentMatch],
    rentReceivables: [augustRent, septemberRentA, septemberRentB],
    rentPayments: [historyRentPayment],
  });
  const loaded = await loadUserPortfolio('bank-classification-phase2');
  const suggestion = suggestBankTransactionMatch(bankTransaction('future-rent', {
    counterparty: 'Tenant Alice', description: 'Incoming transfer',
  }), {
    properties: loaded.properties,
    cashAccounts: loaded.cashAccounts,
    bankTransactions: loaded.bankTransactions,
    rentReceivables: loaded.rentReceivables ?? [],
    rentPayments: loaded.rentPayments ?? [],
    propertyExpenseRules: loaded.propertyExpenseRules,
    expenseObligations: loaded.expenseObligations ?? [],
    expensePayments: loaded.expensePayments ?? [],
  }, loaded.bankTransactionReconciliations ?? []);
  assert.equal(suggestion?.targetId, septemberRentA.id);
  assert.ok(suggestion?.reasons.includes('previously-confirmed-payer'));
});
