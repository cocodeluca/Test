import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { mockProperties } from '../src/common/data/mockData';
import type {
  BankTransaction,
  BankTransactionReconciliation,
  ExpenseObligation,
  RentReceivable,
} from '../src/common/types';
import {
  confirmBankTransactionMatch,
  getBankReconciliationView,
  ignoreBankTransaction,
  suggestBankTransactionMatch,
  unmatchBankTransaction,
  type BankReconciliationContext,
} from '../src/common/utils/bankReconciliation';
import { upsertBankTransactions } from '../src/common/utils/bankTransactions';
import { buildExpenseObligationViews } from '../src/common/utils/propertyExpenses';
import { buildRentReceivableViews } from '../src/common/utils/rentCollection';
import {
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
} from '../src/platforms/web/services/localAccountStore';

const property = { ...mockProperties[0], id: 'property-1', name: 'Central Apartment' };
const receivable: RentReceivable = {
  id: 'rent-receivable-2026-09',
  propertyId: property.id,
  leaseId: 'lease-1',
  period: '2026-09',
  dueDate: '2026-09-05',
  expectedAmount: 1450,
  currency: 'EUR',
};
const expenseObligation: ExpenseObligation = {
  id: 'expense-obligation-1',
  propertyId: property.id,
  category: 'HOME_INSURANCE',
  label: 'Property insurance',
  dueDate: '2026-09-08',
  expectedAmount: 185,
  currency: 'EUR',
};
const transaction = (overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 'bank-tx-1',
  providerName: 'mock-bank',
  connectionId: 'connection-1',
  externalTransactionId: 'provider-tx-1',
  cashAccountId: 'cash-1',
  externalAccountId: 'external-cash-1',
  bookingDate: '2026-09-03',
  amount: 1450,
  currency: 'EUR',
  normalizedAmount: 1450,
  normalizedCurrency: 'EUR',
  fxCoverage: 'same-currency',
  description: 'September rent',
  counterparty: 'Tenant transfer',
  pending: false,
  createdAt: '2026-09-16T10:00:00.000Z',
  updatedAt: '2026-09-16T10:00:00.000Z',
  syncedAt: '2026-09-16T10:00:00.000Z',
  ...overrides,
});
const context = (overrides: Partial<BankReconciliationContext> = {}): BankReconciliationContext => ({
  properties: [property],
  rentReceivables: [receivable],
  rentPayments: [],
  expenseObligations: [expenseObligation],
  expensePayments: [],
  today: new Date('2026-09-16T12:00:00Z'),
  ...overrides,
});

test.beforeEach(() => {
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
});

test('a transaction without a candidate is unmatched', () => {
  const view = getBankReconciliationView(transaction({ pending: true }), [], context());
  assert.equal(view.status, 'unmatched');
  assert.equal(view.suggestion, null);
});

test('an incoming transaction suggests one relevant unpaid rent receivable', () => {
  const suggestion = suggestBankTransactionMatch(transaction(), context());
  assert.equal(suggestion?.targetType, 'rent-receivable');
  assert.equal(suggestion?.targetId, receivable.id);
  assert.deepEqual(suggestion?.reasons, ['exact-amount', 'date-proximity']);
});

test('an outgoing transaction only suggests an existing canonical expense obligation', () => {
  const outgoing = transaction({ amount: -185, bookingDate: '2026-09-09' });
  const suggestion = suggestBankTransactionMatch(outgoing, context());
  assert.equal(suggestion?.targetType, 'expense-obligation');
  assert.equal(suggestion?.targetId, expenseObligation.id);
  assert.equal(suggestBankTransactionMatch(outgoing, context({ expenseObligations: [] })), null);
});

test('confirm creates one linked canonical rent payment', () => {
  const result = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(result);
  assert.equal(result.rentPayments.length, 1);
  assert.equal(result.rentPayments[0].source, 'bank_sync');
  assert.deepEqual(result.rentPayments[0].allocations, [{ receivableId: receivable.id, amount: 1450 }]);
  assert.equal(result.reconciliations[0].status, 'matched');
  assert.equal(result.reconciliations[0].targetId, receivable.id);
  assert.equal(result.reconciliations[0].paymentId, result.rentPayments[0].id);
});

test('repeated confirm is idempotent and does not duplicate the payment', () => {
  const first = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(first);
  const second = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: first.reconciliations,
    context: context({ rentPayments: first.rentPayments }),
    timestamp: '2026-09-16T13:00:00.000Z',
  });
  assert.ok(second);
  assert.equal(second.rentPayments.length, 1);
  assert.equal(second.reconciliations.length, 1);
  assert.equal(second.reconciliations[0].paymentId, first.reconciliations[0].paymentId);
});

test('ignore persists without deleting the bank transaction', async () => {
  const reconciliation = ignoreBankTransaction([], transaction().id, '2026-09-16T12:00:00.000Z');
  await saveUserPortfolio('reconciliation-ignore-user', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    bankTransactions: [transaction()],
    bankTransactionReconciliations: reconciliation,
  });
  const reloaded = await loadUserPortfolio('reconciliation-ignore-user');
  assert.equal(reloaded.bankTransactions?.length, 1);
  assert.deepEqual(reloaded.bankTransactionReconciliations, reconciliation);
  assert.equal(reloaded.bankTransactionReconciliations?.[0].status, 'ignored');
});

test('transaction sync updates do not reset persisted reconciliation state', () => {
  const reconciliation: BankTransactionReconciliation[] = ignoreBankTransaction(
    [], transaction().id, '2026-09-16T12:00:00.000Z'
  );
  const synced = upsertBankTransactions([transaction()], [
    transaction({ description: 'Updated provider description', syncedAt: '2026-09-16T13:00:00.000Z' }),
  ]);
  const view = getBankReconciliationView(synced[0], reconciliation, context());
  assert.equal(synced[0].description, 'Updated provider description');
  assert.equal(view.status, 'ignored');
});

test('a transaction outside conservative amount and date rules remains unmatched', () => {
  const invalid = transaction({ amount: 1200, bookingDate: '2026-07-01' });
  const view = getBankReconciliationView(invalid, [], context());
  assert.equal(view.status, 'unmatched');
  assert.equal(view.suggestion, null);
});

test('confirm rent match then unmatch removes only its bank payment and restores outstanding rent', () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  assert.equal(buildRentReceivableViews(
    [receivable], confirmed.rentPayments, [property], new Date('2026-09-16T12:00:00Z')
  )[0].status, 'PAID');

  const unmatched = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });
  const restored = buildRentReceivableViews(
    [receivable], unmatched.rentPayments, [property], new Date('2026-09-16T12:00:00Z')
  )[0];
  assert.equal(unmatched.reconciliations.length, 0);
  assert.equal(unmatched.rentPayments.length, 0);
  assert.equal(restored.outstandingAmount, 1450);
  assert.equal(restored.status, 'OVERDUE');
  assert.equal(getBankReconciliationView(transaction(), unmatched.reconciliations, context()).status, 'suggested');
});

test('confirm expense match then unmatch restores the expense obligation', () => {
  const outgoing = transaction({ amount: -185, bookingDate: '2026-09-09' });
  const confirmed = confirmBankTransactionMatch({
    transaction: outgoing, targetType: 'expense-obligation', targetId: expenseObligation.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  assert.equal(buildExpenseObligationViews(
    [expenseObligation], confirmed.expensePayments, new Date('2026-09-16T12:00:00Z')
  )[0].status, 'PAID');

  const unmatched = unmatchBankTransaction({
    bankTransactionId: outgoing.id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });
  const restored = buildExpenseObligationViews(
    [expenseObligation], unmatched.expensePayments, new Date('2026-09-16T12:00:00Z')
  )[0];
  assert.equal(unmatched.expensePayments.length, 0);
  assert.equal(restored.outstandingAmount, 185);
  assert.equal(restored.status, 'OVERDUE');
});

test('unmatch preserves unrelated manual payments', () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const manualPayment = {
    ...confirmed.rentPayments[0],
    id: 'manual-payment-unrelated',
    source: 'manual' as const,
    amount: 500,
    allocations: [{ receivableId: 'other-receivable', amount: 500 }],
    reference: 'Manual receipt',
  };
  const unmatched = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: confirmed.reconciliations,
    rentPayments: [...confirmed.rentPayments, manualPayment],
    expensePayments: confirmed.expensePayments,
  });
  assert.deepEqual(unmatched.rentPayments, [manualPayment]);
});

test('repeated unmatch is idempotent and sync does not recreate the removed payment', () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const first = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });
  const second = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: first.reconciliations,
    rentPayments: first.rentPayments,
    expensePayments: first.expensePayments,
  });
  const syncedTransactions = upsertBankTransactions([transaction()], [
    transaction({ syncedAt: '2026-09-17T10:00:00.000Z' }),
  ]);
  assert.strictEqual(second.reconciliations, first.reconciliations);
  assert.strictEqual(second.rentPayments, first.rentPayments);
  assert.equal(second.rentPayments.length, 0);
  assert.equal(syncedTransactions.length, 1);
  assert.equal(getBankReconciliationView(syncedTransactions[0], second.reconciliations, context()).status, 'suggested');
});

test('the bank transaction remains persisted after unmatch', async () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context(), timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const unmatched = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });
  await saveUserPortfolio('reconciliation-unmatch-user', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    bankTransactions: [transaction()],
    bankTransactionReconciliations: unmatched.reconciliations,
    rentReceivables: [receivable],
    rentPayments: unmatched.rentPayments,
  });
  const reloaded = await loadUserPortfolio('reconciliation-unmatch-user');
  assert.equal(reloaded.bankTransactions?.[0].id, transaction().id);
  assert.deepEqual(reloaded.bankTransactionReconciliations, []);
  assert.deepEqual(reloaded.rentPayments, []);
});
