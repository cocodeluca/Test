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
  applyBankTransactionLifecycleToReconciliation,
  confirmBankTransactionMatch,
  getBankReconciliationView,
  ignoreBankTransaction,
  suggestBankTransactionMatch,
  unmatchBankTransaction,
  type BankReconciliationContext,
} from '../src/common/utils/bankReconciliation';
import {
  applyBankTransactionProviderLifecycle,
  upsertBankTransactions,
} from '../src/common/utils/bankTransactions';
import { createLinkedCashAccount } from '../src/common/utils/cashAccounts';
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
  description: (overrides.amount ?? 1450) < 0 ? 'Property insurance' : 'September rent',
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
  assert.ok(suggestion?.reasons.includes('exact-amount'));
  assert.ok(suggestion?.reasons.includes('date-proximity'));
});

test('an excluded linked account keeps transactions but receives no reconciliation suggestion', () => {
  const bankTransaction = transaction();
  const snapshot = structuredClone(bankTransaction);
  const suggestion = suggestBankTransactionMatch(bankTransaction, context({
    cashAccounts: [createLinkedCashAccount({
      id: bankTransaction.cashAccountId,
      connectionId: bankTransaction.connectionId,
      providerName: bankTransaction.providerName,
      externalAccountId: bankTransaction.externalAccountId,
      isIncludedInPortfolio: false,
    })],
  }));

  assert.equal(suggestion, null);
  assert.deepEqual(bankTransaction, snapshot);
});

test('an outgoing transaction only suggests an existing canonical expense obligation', () => {
  const outgoing = transaction({ amount: -185, bookingDate: '2026-09-09' });
  const suggestion = suggestBankTransactionMatch(outgoing, context());
  assert.equal(suggestion?.targetType, 'expense-obligation');
  assert.equal(suggestion?.targetId, expenseObligation.id);
  assert.equal(suggestBankTransactionMatch(outgoing, context({ expenseObligations: [] })), null);
});

test('EUR transaction reconciles against an EUR obligation', () => {
  const outgoing = transaction({ amount: -185, currency: 'EUR', bookingDate: '2026-09-09' });
  const result = confirmBankTransactionMatch({
    transaction: outgoing,
    targetType: 'expense-obligation',
    targetId: expenseObligation.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });

  assert.ok(result);
  assert.equal(result.expensePayments[0].amount, 185);
  assert.equal(result.expensePayments[0].currency, 'EUR');
  assert.equal(result.reconciliations[0].bankTransactionId, outgoing.id);
});

test('USD transaction reconciles against a USD obligation using the original amount', () => {
  const usdReceivable: RentReceivable = {
    ...receivable,
    id: 'rent-receivable-usd',
    expectedAmount: 1450,
    currency: 'USD',
  };
  const usdTransaction = transaction({
    id: 'bank-tx-usd',
    externalTransactionId: 'provider-tx-usd',
    amount: 1450,
    currency: 'USD',
    normalizedAmount: 1305,
    normalizedCurrency: 'EUR',
    fxCoverage: 'snapshot',
    fxRate: 0.9,
  });
  const usdContext = context({ rentReceivables: [usdReceivable] });
  const result = confirmBankTransactionMatch({
    transaction: usdTransaction,
    targetType: 'rent-receivable',
    targetId: usdReceivable.id,
    reconciliations: [],
    context: usdContext,
    timestamp: '2026-09-16T12:00:00.000Z',
  });

  assert.ok(result);
  assert.equal(result.rentPayments[0].amount, 1450);
  assert.equal(result.rentPayments[0].currency, 'USD');
  assert.equal(result.reconciliations[0].bankTransactionId, usdTransaction.id);
});

test('cross-currency reconciliation is rejected even when normalized values match', () => {
  const usdTransaction = transaction({
    id: 'bank-tx-cross-currency',
    amount: 1611.11,
    currency: 'USD',
    normalizedAmount: 1450,
    normalizedCurrency: 'EUR',
    fxCoverage: 'snapshot',
    fxRate: 0.9,
  });

  assert.equal(suggestBankTransactionMatch(usdTransaction, context()), null);
  assert.equal(confirmBankTransactionMatch({
    transaction: usdTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
  }), null);
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
  assert.equal(result.reconciliations[0].paymentLinkType, 'created-bank-sync');
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

test('pending to posted lifecycle enables suggestion without losing ignored state', () => {
  const pending = transaction({
    id: 'bank-tx-lifecycle-stable',
    externalTransactionId: 'provider-pending-lifecycle',
    pending: true,
  });
  assert.equal(suggestBankTransactionMatch(pending, context()), null);
  const ignored = ignoreBankTransaction([], pending.id, '2026-09-16T12:00:00.000Z');
  const [posted] = upsertBankTransactions([pending], [transaction({
    id: 'provider-generated-posted-id',
    externalTransactionId: 'provider-posted-lifecycle',
    pendingExternalTransactionId: pending.externalTransactionId,
    pending: false,
    updatedAt: '2026-09-17T12:00:00.000Z',
    syncedAt: '2026-09-17T12:00:00.000Z',
  })]);

  assert.equal(posted.id, pending.id);
  assert.equal(suggestBankTransactionMatch(posted, context())?.targetId, receivable.id);
  assert.equal(getBankReconciliationView(posted, ignored, context()).status, 'ignored');
});

test('matched lifecycle transaction remains matched and cannot create a duplicate payment after sync', () => {
  const pending = transaction({
    id: 'bank-tx-matched-lifecycle',
    externalTransactionId: 'provider-matched-pending',
    pending: true,
  });
  const [posted] = upsertBankTransactions([pending], [transaction({
    id: 'provider-generated-matched-posted-id',
    externalTransactionId: 'provider-matched-posted',
    pendingExternalTransactionId: pending.externalTransactionId,
    pending: false,
  })]);
  const confirmed = confirmBankTransactionMatch({
    transaction: posted,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const [resynced] = upsertBankTransactions([posted], [transaction({
    id: 'another-provider-generated-id',
    externalTransactionId: 'provider-matched-posted',
    pendingExternalTransactionId: pending.externalTransactionId,
    pending: false,
    description: 'Final posted description',
  })]);
  const repeated = confirmBankTransactionMatch({
    transaction: resynced,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: confirmed.reconciliations,
    context: context({ rentPayments: confirmed.rentPayments }),
    timestamp: '2026-09-18T12:00:00.000Z',
  });

  assert.equal(resynced.id, pending.id);
  assert.equal(getBankReconciliationView(resynced, confirmed.reconciliations, context()).status, 'matched');
  assert.ok(repeated);
  assert.equal(repeated.rentPayments.length, 1);
  assert.equal(repeated.reconciliations.length, 1);
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

test('a smaller incoming transaction suggests one clear rent obligation', () => {
  const suggestion = suggestBankTransactionMatch(
    transaction({ amount: 800 }),
    context({ today: new Date('2026-09-05T12:00:00Z') })
  );
  assert.equal(suggestion?.targetType, 'rent-receivable');
  assert.equal(suggestion?.targetId, receivable.id);
  assert.ok(suggestion?.reasons.includes('partial-amount'));
  assert.ok(suggestion?.reasons.includes('date-proximity'));
});

test('a smaller outgoing transaction suggests one clear expense obligation', () => {
  const suggestion = suggestBankTransactionMatch(
    transaction({ amount: -100, bookingDate: '2026-09-09' }),
    context()
  );
  assert.equal(suggestion?.targetType, 'expense-obligation');
  assert.equal(suggestion?.targetId, expenseObligation.id);
  assert.ok(suggestion?.reasons.includes('partial-amount'));
  assert.ok(suggestion?.reasons.includes('date-proximity'));
});

test('confirm creates one idempotent partial payment and leaves rent partially outstanding', () => {
  const partialTransaction = transaction({ amount: 800 });
  const partialContext = context({ today: new Date('2026-09-05T12:00:00Z') });
  const first = confirmBankTransactionMatch({
    transaction: partialTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: partialContext,
    timestamp: '2026-09-05T12:00:00.000Z',
  });
  assert.ok(first);
  assert.equal(first.rentPayments.length, 1);
  assert.equal(first.rentPayments[0].amount, 800);
  assert.deepEqual(first.rentPayments[0].allocations, [{ receivableId: receivable.id, amount: 800 }]);
  const view = buildRentReceivableViews(
    [receivable], first.rentPayments, [property], new Date('2026-09-05T12:00:00Z')
  )[0];
  assert.equal(view.outstandingAmount, 650);
  assert.equal(view.status, 'PARTIAL');

  const repeated = confirmBankTransactionMatch({
    transaction: partialTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: first.reconciliations,
    context: context({ rentPayments: first.rentPayments, today: new Date('2026-09-05T12:00:00Z') }),
    timestamp: '2026-09-05T13:00:00.000Z',
  });
  assert.ok(repeated);
  assert.equal(repeated.rentPayments.length, 1);
  assert.equal(repeated.reconciliations.length, 1);
});

test('partial expense confirmation decreases outstanding and remains partial', () => {
  const partialTransaction = transaction({ amount: -100, bookingDate: '2026-09-09' });
  const confirmed = confirmBankTransactionMatch({
    transaction: partialTransaction,
    targetType: 'expense-obligation',
    targetId: expenseObligation.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  assert.equal(confirmed.expensePayments[0].amount, 100);
  assert.deepEqual(confirmed.expensePayments[0].allocations, [{ obligationId: expenseObligation.id, amount: 100 }]);
  const view = buildExpenseObligationViews(
    [expenseObligation], confirmed.expensePayments, new Date('2026-09-16T12:00:00Z')
  )[0];
  assert.equal(view.outstandingAmount, 85);
  assert.equal(view.status, 'PARTIAL');
});

test('undoing a partial match restores prior outstanding and preserves manual payments', () => {
  const manualPayment = {
    id: 'manual-partial-payment',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-04',
    amount: 200,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 200 }],
  };
  const partialTransaction = transaction({ amount: 800 });
  const beforeContext = context({
    rentPayments: [manualPayment],
    today: new Date('2026-09-05T12:00:00Z'),
  });
  const confirmed = confirmBankTransactionMatch({
    transaction: partialTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: beforeContext,
    timestamp: '2026-09-05T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const unmatched = unmatchBankTransaction({
    bankTransactionId: partialTransaction.id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });
  const restored = buildRentReceivableViews(
    [receivable], unmatched.rentPayments, [property], new Date('2026-09-05T12:00:00Z')
  )[0];
  assert.deepEqual(unmatched.rentPayments, [manualPayment]);
  assert.equal(restored.outstandingAmount, 1250);
  assert.equal(restored.status, 'PARTIAL');
});

test('an amount greater than outstanding is never suggested', () => {
  assert.equal(suggestBankTransactionMatch(transaction({ amount: 1600 }), context()), null);
  assert.equal(suggestBankTransactionMatch(transaction({ amount: 1450.001 }), context()), null);
});

test('multiple eligible partial candidates remain unmatched', () => {
  const secondReceivable: RentReceivable = {
    ...receivable,
    id: 'rent-receivable-ambiguous',
    leaseId: 'lease-ambiguous',
    dueDate: '2026-09-06',
    expectedAmount: 1200,
  };
  const ambiguousContext = context({
    rentReceivables: [receivable, secondReceivable],
    today: new Date('2026-09-06T12:00:00Z'),
  });
  const view = getBankReconciliationView(
    transaction({ amount: 800 }), [], ambiguousContext
  );
  assert.equal(view.status, 'unmatched');
  assert.equal(view.suggestion, null);
});

test('provider removal reverses only the matched rent bank payment and preserves audit history', () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const manualPayment = {
    id: 'manual-rent-after-bank-match',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-16',
    amount: 200,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 200 }],
  };
  const removed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [{ bankTransactionId: transaction().id, reason: 'provider-removed' }],
    reconciliations: confirmed.reconciliations,
    rentPayments: [...confirmed.rentPayments, manualPayment],
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  const restored = buildRentReceivableViews(
    [receivable], removed.rentPayments, [property], new Date('2026-09-17T12:00:00Z')
  )[0];

  assert.deepEqual(removed.rentPayments, [manualPayment]);
  assert.equal(restored.outstandingAmount, 1250);
  assert.equal(restored.status, 'OVERDUE');
  assert.equal(removed.reconciliations[0].status, 'removed');
  assert.equal(removed.reconciliations[0].paymentId, null);
  assert.equal(removed.reconciliations[0].paymentLinkType, null);
  assert.equal(
    removed.reconciliations[0].historicalPaymentId,
    confirmed.reconciliations[0].paymentId
  );
  assert.equal(
    removed.reconciliations[0].historicalPaymentLinkType,
    'created-bank-sync'
  );
  assert.equal(removed.reconciliations[0].targetId, receivable.id);
  assert.equal(removed.reconciliations[0].lifecycleReason, 'provider-removed');

  const repeated = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [{ bankTransactionId: transaction().id, reason: 'provider-removed' }],
    reconciliations: removed.reconciliations,
    rentPayments: removed.rentPayments,
    expensePayments: removed.expensePayments,
    timestamp: '2026-09-18T12:00:00.000Z',
  });
  assert.deepEqual(repeated, removed);
});

test('provider removal restores a matched expense and leaves its manual payment untouched', () => {
  const outgoing = transaction({ amount: -185, bookingDate: '2026-09-09' });
  const confirmed = confirmBankTransactionMatch({
    transaction: outgoing,
    targetType: 'expense-obligation',
    targetId: expenseObligation.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const manualPayment = {
    id: 'manual-expense-after-bank-match',
    propertyId: property.id,
    obligationId: expenseObligation.id,
    paidDate: '2026-09-16',
    amount: 25,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ obligationId: expenseObligation.id, amount: 25 }],
  };
  const removed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [{ bankTransactionId: outgoing.id, reason: 'provider-removed' }],
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: [...confirmed.expensePayments, manualPayment],
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  const restored = buildExpenseObligationViews(
    [expenseObligation], removed.expensePayments, new Date('2026-09-17T12:00:00Z')
  )[0];

  assert.deepEqual(removed.expensePayments, [manualPayment]);
  assert.equal(restored.outstandingAmount, 160);
  assert.equal(restored.status, 'PARTIAL');
  assert.equal(removed.reconciliations[0].status, 'removed');
  assert.equal(removed.reconciliations[0].lifecycleReason, 'provider-removed');
});

test('explicit reversal removes one matched payment once and preserves reconciliation provenance', () => {
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const lifecycleEvent = {
    bankTransactionId: transaction().id,
    reason: 'provider-reversed' as const,
    relatedBankTransactionId: 'bank-tx-reversal-1',
  };
  const reversed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [lifecycleEvent],
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  const repeated = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [lifecycleEvent],
    reconciliations: reversed.reconciliations,
    rentPayments: reversed.rentPayments,
    expensePayments: reversed.expensePayments,
    timestamp: '2026-09-18T12:00:00.000Z',
  });

  assert.deepEqual(reversed.rentPayments, []);
  assert.equal(reversed.reconciliations[0].status, 'reversed');
  assert.equal(reversed.reconciliations[0].paymentId, null);
  assert.equal(reversed.reconciliations[0].paymentLinkType, null);
  assert.equal(
    reversed.reconciliations[0].historicalPaymentId,
    confirmed.reconciliations[0].paymentId
  );
  assert.equal(
    reversed.reconciliations[0].historicalPaymentLinkType,
    'created-bank-sync'
  );
  assert.equal(reversed.reconciliations[0].lifecycleReason, 'provider-reversed');
  assert.equal(reversed.reconciliations[0].lifecycleTransactionId, 'bank-tx-reversal-1');
  assert.deepEqual(repeated, reversed);
});

test('explicit reversal clears an expense payment link and retains historical provenance', () => {
  const outgoing = transaction({
    id: 'bank-tx-expense-reversal',
    externalTransactionId: 'provider-expense-reversal',
    amount: -185,
    bookingDate: '2026-09-09',
  });
  const confirmed = confirmBankTransactionMatch({
    transaction: outgoing,
    targetType: 'expense-obligation',
    targetId: expenseObligation.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const lifecycleEvent = {
    bankTransactionId: outgoing.id,
    reason: 'provider-reversed' as const,
    relatedBankTransactionId: 'bank-tx-expense-reversal-record',
  };
  const reversed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [lifecycleEvent],
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  const repeated = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [lifecycleEvent],
    reconciliations: reversed.reconciliations,
    rentPayments: reversed.rentPayments,
    expensePayments: reversed.expensePayments,
    timestamp: '2026-09-18T12:00:00.000Z',
  });
  const restored = buildExpenseObligationViews(
    [expenseObligation], reversed.expensePayments, new Date('2026-09-18T12:00:00Z')
  )[0];

  assert.deepEqual(reversed.expensePayments, []);
  assert.equal(restored.outstandingAmount, expenseObligation.expectedAmount);
  assert.equal(reversed.reconciliations[0].status, 'reversed');
  assert.equal(reversed.reconciliations[0].paymentId, null);
  assert.equal(reversed.reconciliations[0].paymentLinkType, null);
  assert.equal(
    reversed.reconciliations[0].historicalPaymentId,
    confirmed.reconciliations[0].paymentId
  );
  assert.equal(
    reversed.reconciliations[0].historicalPaymentLinkType,
    'created-bank-sync'
  );
  assert.deepEqual(repeated, reversed);
});

test('ignored removal retains ignored reconciliation audit metadata and creates no payment', () => {
  const ignored = ignoreBankTransaction([], transaction().id, '2026-09-16T12:00:00.000Z');
  const removed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: [{ bankTransactionId: transaction().id, reason: 'provider-removed' }],
    reconciliations: ignored,
    rentPayments: [],
    expensePayments: [],
    timestamp: '2026-09-17T12:00:00.000Z',
  });

  assert.equal(removed.reconciliations[0].status, 'ignored');
  assert.equal(removed.reconciliations[0].lifecycleReason, 'provider-removed');
  assert.deepEqual(removed.rentPayments, []);
  assert.deepEqual(removed.expensePayments, []);
});

test('removed, reversed, and reversal records cannot produce reconciliation suggestions', () => {
  assert.equal(suggestBankTransactionMatch(transaction({ lifecycleStatus: 'removed' }), context()), null);
  assert.equal(suggestBankTransactionMatch(transaction({ lifecycleStatus: 'reversed' }), context()), null);
  assert.equal(suggestBankTransactionMatch(transaction({
    lifecycleStatus: 'reversal',
    reversesExternalTransactionId: transaction().externalTransactionId,
    amount: -1450,
  }), context()), null);
});

test('cold load preserves removed transaction and reversed reconciliation audit provenance', async () => {
  const bankTransaction = transaction();
  const confirmed = confirmBankTransactionMatch({
    transaction: bankTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const lifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: [bankTransaction],
    incomingTransactions: [],
    removedTransactions: [{
      externalTransactionId: bankTransaction.externalTransactionId,
      externalAccountId: bankTransaction.externalAccountId!,
      reason: 'provider-deleted',
    }],
    providerName: bankTransaction.providerName,
    connectionId: bankTransaction.connectionId,
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  const reversed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: lifecycle.lifecycleEvents,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  await saveUserPortfolio('removed-reconciliation-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    rentReceivables: [receivable],
    rentPayments: reversed.rentPayments,
    bankTransactions: lifecycle.transactions,
    bankTransactionReconciliations: reversed.reconciliations,
  });
  const reloaded = await loadUserPortfolio('removed-reconciliation-cold-load-user');

  assert.equal(reloaded.bankTransactions?.[0].lifecycleStatus, 'removed');
  assert.equal(reloaded.bankTransactions?.[0].removalReason, 'provider-deleted');
  assert.equal(reloaded.bankTransactionReconciliations?.[0].status, 'removed');
  assert.equal(reloaded.bankTransactionReconciliations?.[0].paymentId, null);
  assert.equal(reloaded.bankTransactionReconciliations?.[0].paymentLinkType, null);
  assert.equal(
    reloaded.bankTransactionReconciliations?.[0].historicalPaymentId,
    confirmed.reconciliations[0].paymentId
  );
  assert.equal(
    reloaded.bankTransactionReconciliations?.[0].historicalPaymentLinkType,
    'created-bank-sync'
  );
  assert.equal(reloaded.bankTransactionReconciliations?.[0].lifecycleReason, 'provider-removed');
  assert.deepEqual(reloaded.rentPayments, []);
});

test('cold load preserves an active matched bank-sync payment and obligation allocation', async () => {
  const bankTransaction = transaction();
  const confirmed = confirmBankTransactionMatch({
    transaction: bankTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context(),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  await saveUserPortfolio('active-bank-sync-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    rentReceivables: [receivable],
    rentPayments: confirmed.rentPayments,
    bankTransactions: [bankTransaction],
    bankTransactionReconciliations: confirmed.reconciliations,
  });
  const reloaded = await loadUserPortfolio('active-bank-sync-cold-load-user');
  const reloadedPayment = reloaded.rentPayments?.[0];
  const reloadedReconciliation = reloaded.bankTransactionReconciliations?.[0];
  const reloadedView = buildRentReceivableViews(
    reloaded.rentReceivables ?? [],
    reloaded.rentPayments ?? [],
    reloaded.properties,
    new Date('2026-09-16T12:00:00Z')
  )[0];

  assert.deepEqual(reloaded.bankTransactions, [bankTransaction]);
  assert.equal(reloadedReconciliation?.status, 'matched');
  assert.equal(reloadedReconciliation?.paymentId, reloadedPayment?.id);
  assert.equal(reloadedReconciliation?.paymentLinkType, 'created-bank-sync');
  assert.equal(reloadedPayment?.source, 'bank_sync');
  assert.deepEqual(reloadedPayment?.allocations, [{
    receivableId: receivable.id,
    amount: receivable.expectedAmount,
  }]);
  assert.equal(reloadedView.outstandingAmount, 0);
  assert.equal(reloadedView.status, 'PAID');
});

test('exact existing manual rent payment is linked without duplication or mutation', () => {
  const manualPayment = {
    id: 'manual-rent-existing',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const paymentContext = context({ rentPayments: [manualPayment] });
  const suggestion = suggestBankTransactionMatch(transaction(), paymentContext);
  assert.equal(suggestion?.targetId, receivable.id);
  assert.equal(suggestion?.existingPaymentId, manualPayment.id);
  assert.ok(suggestion?.reasons.includes('existing-manual-payment'));

  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: paymentContext,
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  assert.deepEqual(confirmed.rentPayments, [manualPayment]);
  assert.equal(confirmed.rentPayments[0].source, 'manual');
  assert.equal(confirmed.reconciliations[0].paymentId, manualPayment.id);
  assert.equal(confirmed.reconciliations[0].paymentLinkType, 'linked-manual');
});

test('exact existing manual expense payment is linked without duplication or mutation', () => {
  const manualPayment = {
    id: 'manual-expense-existing',
    propertyId: property.id,
    paidDate: '2026-09-09',
    amount: 185,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ obligationId: expenseObligation.id, amount: 185 }],
  };
  const outgoing = transaction({ amount: -185, bookingDate: '2026-09-09' });
  const paymentContext = context({ expensePayments: [manualPayment] });
  const suggestion = suggestBankTransactionMatch(outgoing, paymentContext);
  assert.equal(suggestion?.targetId, expenseObligation.id);
  assert.equal(suggestion?.existingPaymentId, manualPayment.id);

  const confirmed = confirmBankTransactionMatch({
    transaction: outgoing,
    targetType: 'expense-obligation',
    targetId: expenseObligation.id,
    reconciliations: [],
    context: paymentContext,
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  assert.deepEqual(confirmed.expensePayments, [manualPayment]);
  assert.equal(confirmed.expensePayments[0].source, 'manual');
  assert.equal(confirmed.reconciliations[0].paymentId, manualPayment.id);
  assert.equal(confirmed.reconciliations[0].paymentLinkType, 'linked-manual');
});

test('provider removal and reversal preserve a linked manual payment and coherent provenance', () => {
  const manualPayment = {
    id: 'manual-rent-lifecycle',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const bankTransaction = transaction();
  const confirmed = confirmBankTransactionMatch({
    transaction: bankTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context({ rentPayments: [manualPayment] }),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  const removedLifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: [bankTransaction],
    incomingTransactions: [],
    removedTransactions: [{
      externalTransactionId: bankTransaction.externalTransactionId,
      externalAccountId: bankTransaction.externalAccountId!,
      reason: 'provider-deleted',
    }],
    providerName: bankTransaction.providerName,
    connectionId: bankTransaction.connectionId,
    syncedAt: '2026-09-17T12:00:00.000Z',
  });
  const removed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: removedLifecycle.lifecycleEvents,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T12:00:00.000Z',
  });
  const reversalTransaction = transaction({
    id: 'bank-tx-manual-link-reversal',
    externalTransactionId: 'provider-manual-link-reversal',
    reversesExternalTransactionId: bankTransaction.externalTransactionId,
    amount: -1450,
    lifecycleStatus: 'reversal',
  });
  const reversedLifecycle = applyBankTransactionProviderLifecycle({
    existingTransactions: [bankTransaction],
    incomingTransactions: [reversalTransaction],
    providerName: bankTransaction.providerName,
    connectionId: bankTransaction.connectionId,
    syncedAt: '2026-09-17T13:00:00.000Z',
  });
  const reversed = applyBankTransactionLifecycleToReconciliation({
    lifecycleEvents: reversedLifecycle.lifecycleEvents,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
    timestamp: '2026-09-17T13:00:00.000Z',
  });

  for (const result of [removed, reversed]) {
    assert.deepEqual(result.rentPayments, [manualPayment]);
    assert.equal(result.reconciliations[0].paymentId, manualPayment.id);
    assert.equal(result.reconciliations[0].paymentLinkType, 'linked-manual');
    assert.equal(result.reconciliations[0].historicalPaymentId, undefined);
  }
  assert.equal(removed.reconciliations[0].status, 'removed');
  assert.equal(removed.reconciliations[0].lifecycleReason, 'provider-removed');
  assert.equal(reversed.reconciliations[0].status, 'reversed');
  assert.equal(reversed.reconciliations[0].lifecycleReason, 'provider-reversed');
  assert.equal(
    reversed.reconciliations[0].lifecycleTransactionId,
    reversalTransaction.id
  );
});

test('undo removes a manual-payment reconciliation link but preserves the manual payment', () => {
  const manualPayment = {
    id: 'manual-rent-undo',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context({ rentPayments: [manualPayment] }),
  });
  assert.ok(confirmed);
  const unmatched = unmatchBankTransaction({
    bankTransactionId: transaction().id,
    reconciliations: confirmed.reconciliations,
    rentPayments: confirmed.rentPayments,
    expensePayments: confirmed.expensePayments,
  });

  assert.deepEqual(unmatched.reconciliations, []);
  assert.deepEqual(unmatched.rentPayments, [manualPayment]);
});

test('repeated confirm against an existing manual payment remains idempotent', () => {
  const manualPayment = {
    id: 'manual-rent-repeat',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const first = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: [], context: context({ rentPayments: [manualPayment] }),
  });
  assert.ok(first);
  const second = confirmBankTransactionMatch({
    transaction: transaction(), targetType: 'rent-receivable', targetId: receivable.id,
    reconciliations: first.reconciliations,
    context: context({ rentPayments: first.rentPayments }),
  });
  assert.ok(second);
  assert.deepEqual(second.rentPayments, [manualPayment]);
  assert.deepEqual(second.reconciliations, first.reconciliations);
});

test('multiple matching manual payments are not guessed', () => {
  const makePayment = (id: string, receivedDate: string) => ({
    id,
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate,
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  });
  const suggestion = suggestBankTransactionMatch(transaction(), context({
    rentPayments: [
      makePayment('manual-rent-ambiguous-1', '2026-09-03'),
      makePayment('manual-rent-ambiguous-2', '2026-09-04'),
    ],
  }));
  assert.equal(suggestion, null);
});

test('different manual amount does not falsely link', () => {
  const manualPayment = {
    id: 'manual-rent-different-amount',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1400,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1400 }],
  };
  const suggestion = suggestBankTransactionMatch(
    transaction(), context({ rentPayments: [manualPayment] })
  );
  assert.notEqual(suggestion?.existingPaymentId, manualPayment.id);
});

test('manual payment allocated to a different obligation does not falsely link', () => {
  const manualPayment = {
    id: 'manual-rent-different-obligation',
    propertyId: property.id,
    leaseId: 'other-lease',
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: 'other-receivable', amount: 1450 }],
  };
  const suggestion = suggestBankTransactionMatch(
    transaction(), context({ rentPayments: [manualPayment] })
  );
  assert.equal(suggestion?.targetId, receivable.id);
  assert.equal(suggestion?.existingPaymentId, undefined);
});

test('an existing manual payment already linked to another transaction is not reused', () => {
  const manualPayment = {
    id: 'manual-rent-already-linked',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const reconciliation: BankTransactionReconciliation = {
    bankTransactionId: 'other-bank-transaction',
    status: 'matched',
    targetType: 'rent-receivable',
    targetId: receivable.id,
    paymentId: manualPayment.id,
    paymentLinkType: 'linked-manual',
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
  };
  const suggestion = suggestBankTransactionMatch(
    transaction(),
    context({ rentPayments: [manualPayment] }),
    [reconciliation]
  );
  assert.notEqual(suggestion?.existingPaymentId, manualPayment.id);
});

test('partial manual payment links without changing canonical outstanding balance', () => {
  const manualPayment = {
    id: 'manual-rent-partial-existing',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 800,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 800 }],
  };
  const bankTransaction = transaction({ amount: 800 });
  const paymentContext = context({
    rentPayments: [manualPayment],
    today: new Date('2026-09-05T12:00:00Z'),
  });
  const confirmed = confirmBankTransactionMatch({
    transaction: bankTransaction,
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: paymentContext,
  });
  assert.ok(confirmed);
  const view = buildRentReceivableViews(
    [receivable], confirmed.rentPayments, [property], new Date('2026-09-05T12:00:00Z')
  )[0];

  assert.deepEqual(confirmed.rentPayments, [manualPayment]);
  assert.equal(confirmed.reconciliations[0].paymentLinkType, 'linked-manual');
  assert.equal(view.outstandingAmount, 650);
  assert.equal(view.status, 'PARTIAL');
});

test('different currency or distant payment date does not link a manual payment', () => {
  const makePayment = (id: string, currency: 'EUR' | 'USD', receivedDate: string) => ({
    id,
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate,
    amount: 1450,
    currency,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  });
  const wrongCurrency = makePayment('manual-rent-wrong-currency', 'USD', '2026-09-03');
  const distantDate = makePayment('manual-rent-distant-date', 'EUR', '2026-08-01');

  assert.notEqual(
    suggestBankTransactionMatch(transaction(), context({ rentPayments: [wrongCurrency] }))?.existingPaymentId,
    wrongCurrency.id
  );
  assert.notEqual(
    suggestBankTransactionMatch(transaction(), context({ rentPayments: [distantDate] }))?.existingPaymentId,
    distantDate.id
  );
});

test('manual payment link provenance survives an IndexedDB cold load', async () => {
  const manualPayment = {
    id: 'manual-rent-persisted-link',
    propertyId: property.id,
    leaseId: receivable.leaseId,
    receivedDate: '2026-09-03',
    amount: 1450,
    currency: 'EUR' as const,
    source: 'manual' as const,
    allocations: [{ receivableId: receivable.id, amount: 1450 }],
  };
  const confirmed = confirmBankTransactionMatch({
    transaction: transaction(),
    targetType: 'rent-receivable',
    targetId: receivable.id,
    reconciliations: [],
    context: context({ rentPayments: [manualPayment] }),
    timestamp: '2026-09-16T12:00:00.000Z',
  });
  assert.ok(confirmed);
  await saveUserPortfolio('manual-payment-link-cold-load-user', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    rentReceivables: [receivable],
    rentPayments: confirmed.rentPayments,
    bankTransactions: [transaction()],
    bankTransactionReconciliations: confirmed.reconciliations,
  });
  const reloaded = await loadUserPortfolio('manual-payment-link-cold-load-user');

  assert.deepEqual(reloaded.rentPayments, [manualPayment]);
  assert.equal(reloaded.rentPayments?.[0].source, 'manual');
  assert.equal(reloaded.bankTransactionReconciliations?.[0].paymentId, manualPayment.id);
  assert.equal(reloaded.bankTransactionReconciliations?.[0].paymentLinkType, 'linked-manual');
});
