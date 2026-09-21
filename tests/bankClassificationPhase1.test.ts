import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { mockProperties } from '../src/common/data/mockData';
import type {
  BankTransaction,
  ExpenseObligation,
  ExpensePayment,
  Property,
  PropertyExpenseRule,
  RentPayment,
  RentReceivable,
} from '../src/common/types';
import {
  confirmBankTransactionMatch,
  getBankReconciliationView,
  ignoreBankTransaction,
  suggestBankTransactionMatch,
  type BankReconciliationContext,
} from '../src/common/utils/bankReconciliation';
import { normalizeProviderTransactions } from '../src/common/utils/bankTransactions';
import { createLinkedCashAccount } from '../src/common/utils/cashAccounts';
import {
  emptyPortfolioData,
  loadUserPortfolio,
  saveUserPortfolio,
} from '../src/platforms/web/services/localAccountStore';

const lease = {
  ...mockProperties[0].leases![0],
  id: 'lease-central',
  name: 'Tenant Alice',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 1450,
  monthlyRentCurrency: 'EUR' as const,
  rentDueDay: 5,
  rentTrackingStartDate: '2026-01-01',
  active: true,
};
const property: Property = {
  ...mockProperties[0],
  id: 'property-central',
  name: 'Central Apartment',
  address: '10 Central Street',
  leases: [lease],
  activeLeaseId: lease.id,
};
const secondLease = { ...lease, id: 'lease-riverside', name: 'Tenant Bruno' };
const secondProperty: Property = {
  ...mockProperties[1],
  id: 'property-riverside',
  name: 'Riverside Home',
  address: '20 Riverside Road',
  leases: [secondLease],
  activeLeaseId: secondLease.id,
};

const rent: RentReceivable = {
  id: 'rent-central-2026-09',
  propertyId: property.id,
  leaseId: lease.id,
  period: '2026-09',
  dueDate: '2026-09-05',
  expectedAmount: 1450,
  currency: 'EUR',
};

const communityRule: PropertyExpenseRule = {
  id: 'rule-community', propertyId: property.id, category: 'COMMUNITY', label: 'Community fee',
  amount: 90, currency: 'EUR', frequency: 'MONTHLY', startDate: '2026-01-01',
  trackingStartDate: '2026-01-01', dueDay: 10, isActive: true,
};
const taxRule: PropertyExpenseRule = {
  id: 'rule-ibi', propertyId: property.id, category: 'PROPERTY_TAX', label: 'IBI municipal tax',
  amount: 480, currency: 'EUR', frequency: 'ANNUAL', startDate: '2026-01-01',
  trackingStartDate: '2026-01-01', dueDay: 20, dueMonth: 9, isActive: true,
};
const insuranceRule: PropertyExpenseRule = {
  id: 'rule-insurance', propertyId: property.id, category: 'HOME_INSURANCE', label: 'Home insurance',
  amount: 185, currency: 'EUR', frequency: 'ANNUAL', startDate: '2026-01-01',
  trackingStartDate: '2026-01-01', dueDay: 8, dueMonth: 9, isActive: true,
};
const obligation = (
  rule: PropertyExpenseRule,
  id: string,
  dueDate: string,
  period: string
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
const community = obligation(communityRule, 'community-2026-09', '2026-09-10', '2026-09');
const ibi = obligation(taxRule, 'ibi-2026', '2026-09-20', '2026');
const insurance = obligation(insuranceRule, 'insurance-2026', '2026-09-08', '2026');

const transaction = (overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 'bank-phase1-1',
  providerName: 'plaid',
  connectionId: 'connection-phase1',
  externalTransactionId: 'provider-phase1-1',
  cashAccountId: 'cash-phase1',
  externalAccountId: 'external-phase1',
  bookingDate: '2026-09-03',
  amount: 1450,
  currency: 'EUR',
  normalizedAmount: 1450,
  normalizedCurrency: 'EUR',
  fxCoverage: 'same-currency',
  description: 'September rent',
  counterparty: 'Tenant Alice',
  pending: false,
  createdAt: '2026-09-03T12:00:00.000Z',
  updatedAt: '2026-09-03T12:00:00.000Z',
  syncedAt: '2026-09-03T12:00:00.000Z',
  ...overrides,
});

const context = (overrides: Partial<BankReconciliationContext> = {}): BankReconciliationContext => ({
  properties: [property],
  rentReceivables: [rent],
  rentPayments: [],
  propertyExpenseRules: [communityRule, taxRule, insuranceRule],
  expenseObligations: [community, ibi, insurance],
  expensePayments: [],
  today: new Date('2026-09-03T12:00:00Z'),
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

test('rent: exact amount selects the correct canonical period with explicit evidence', () => {
  const suggestion = suggestBankTransactionMatch(transaction(), context());
  assert.equal(suggestion?.targetId, rent.id);
  assert.equal(suggestion?.period, '2026-09');
  assert.equal(suggestion?.expectedAmount, 1450);
  assert.equal(suggestion?.transactionAmount, 1450);
  assert.deepEqual(suggestion?.reasons.includes('exact-amount'), true);
  assert.deepEqual(suggestion?.reasons.includes('active-lease'), true);
  assert.deepEqual(suggestion?.reasons.includes('unique-eligible-obligation'), true);
});

test('rent: a posted payment before the due date uses deterministic date proximity', () => {
  const suggestion = suggestBankTransactionMatch(
    transaction({ bookingDate: '2026-09-03' }),
    context({ today: new Date('2026-09-01T12:00:00Z') })
  );
  assert.equal(suggestion?.targetId, rent.id);
  assert.equal(suggestion?.dateDistanceDays, 2);
  assert.ok(suggestion?.reasons.includes('date-proximity'));
});

test('rent: fully paid periods are excluded', () => {
  const paid: RentPayment = {
    id: 'imported-rent-payment', propertyId: property.id, leaseId: lease.id,
    receivedDate: '2026-09-02', amount: 1450, currency: 'EUR', source: 'bank_import',
    allocations: [{ receivableId: rent.id, amount: 1450 }],
  };
  assert.equal(suggestBankTransactionMatch(transaction(), context({ rentPayments: [paid] })), null);
});

test('rent: a remaining partial balance is suggested and confirmation uses the canonical pipeline', () => {
  const prior: RentPayment = {
    id: 'prior-partial-rent', propertyId: property.id, leaseId: lease.id,
    receivedDate: '2026-09-01', amount: 450, currency: 'EUR', source: 'manual',
    allocations: [{ receivableId: rent.id, amount: 450 }],
  };
  const bankTransaction = transaction({ amount: 1000 });
  const partialContext = context({ rentPayments: [prior] });
  const suggestion = suggestBankTransactionMatch(bankTransaction, partialContext);
  assert.equal(suggestion?.outstandingAmount, 1000);
  assert.ok(suggestion?.reasons.includes('exact-amount'));
  const confirmed = confirmBankTransactionMatch({
    transaction: bankTransaction,
    targetType: 'rent-receivable',
    targetId: rent.id,
    reconciliations: [],
    context: partialContext,
    timestamp: '2026-09-03T13:00:00.000Z',
  });
  assert.equal(confirmed?.rentPayments.length, 2);
  assert.equal(confirmed?.rentPayments[1].source, 'bank_sync');
  assert.equal(confirmed?.reconciliations[0].status, 'matched');
});

test('rent: identical plausible rents remain unmatched without property evidence', () => {
  const otherRent: RentReceivable = {
    ...rent, id: 'rent-riverside-2026-09', propertyId: secondProperty.id, leaseId: secondLease.id,
  };
  const suggestion = suggestBankTransactionMatch(
    transaction({ counterparty: null }),
    context({ properties: [property, secondProperty], rentReceivables: [rent, otherRent] })
  );
  assert.equal(suggestion, null);
});

test('rent: wrong currency, inactive lease, expired lease, and excluded account fail closed', () => {
  assert.equal(suggestBankTransactionMatch(transaction({ currency: 'USD' }), context()), null);
  const inactiveProperty = { ...property, leases: [{ ...lease, active: false }] };
  assert.equal(suggestBankTransactionMatch(transaction(), context({ properties: [inactiveProperty] })), null);
  const expiredProperty = { ...property, leases: [{ ...lease, endDate: '2026-08-31' }] };
  assert.equal(suggestBankTransactionMatch(transaction(), context({ properties: [expiredProperty] })), null);
  const excludedAccount = createLinkedCashAccount({
    id: 'cash-phase1', connectionId: 'connection-phase1', providerName: 'plaid',
    externalAccountId: 'external-phase1', isIncludedInPortfolio: false,
  });
  assert.equal(suggestBankTransactionMatch(transaction(), context({ cashAccounts: [excludedAccount] })), null);
});

test('expenses: exact known home-insurance obligation is suggested', () => {
  const suggestion = suggestBankTransactionMatch(transaction({
    amount: -185, bookingDate: '2026-09-09', description: 'Annual home insurance', counterparty: 'Insurer',
  }), context());
  assert.equal(suggestion?.targetId, insurance.id);
  assert.ok(suggestion?.reasons.includes('description-match'));
  assert.ok(suggestion?.reasons.includes('recurring-obligation'));
});

test('expenses: annual IBI text selects only the configured annual tax obligation', () => {
  const suggestion = suggestBankTransactionMatch(transaction({
    amount: -480, bookingDate: '2026-09-19', description: 'IBI municipal 2026', counterparty: 'Ayuntamiento',
  }), context());
  assert.equal(suggestion?.targetId, ibi.id);
  assert.equal(suggestion?.period, '2026');
});

test('expenses: recurring community text selects the configured monthly obligation', () => {
  const suggestion = suggestBankTransactionMatch(transaction({
    amount: -90, bookingDate: '2026-09-10', description: 'Comunidad septiembre', counterparty: 'Administracion',
  }), context());
  assert.equal(suggestion?.targetId, community.id);
  assert.equal(suggestion?.period, '2026-09');
});

test('expenses: ambiguous configured expenses and unknown debits remain unmatched', () => {
  const otherRule = { ...communityRule, id: 'rule-community-2', propertyId: secondProperty.id };
  const otherCommunity = { ...community, id: 'community-riverside', propertyId: secondProperty.id, expenseRuleId: otherRule.id };
  const ambiguous = context({
    properties: [property, secondProperty],
    propertyExpenseRules: [communityRule, otherRule],
    expenseObligations: [community, otherCommunity],
  });
  assert.equal(suggestBankTransactionMatch(transaction({
    amount: -90, bookingDate: '2026-09-10', description: 'Community fee', counterparty: null,
  }), ambiguous), null);
  assert.equal(suggestBankTransactionMatch(transaction({
    amount: -90, bookingDate: '2026-09-10', description: 'Card purchase', counterparty: 'Unknown merchant',
  }), context()), null);
});

test('expenses: an already-recorded obligation produces no new suggestion or duplicate', () => {
  const paid: ExpensePayment = {
    id: 'imported-community-payment', propertyId: property.id, paidDate: '2026-09-10',
    amount: 90, currency: 'EUR', source: 'bank_import',
    allocations: [{ obligationId: community.id, amount: 90 }],
  };
  assert.equal(suggestBankTransactionMatch(transaction({
    amount: -90, bookingDate: '2026-09-10', description: 'Community fee',
  }), context({ expensePayments: [paid] })), null);
});

test('general: pending transactions and persisted matched or ignored decisions are preserved', () => {
  assert.equal(suggestBankTransactionMatch(transaction({ pending: true }), context()), null);
  const ignored = ignoreBankTransaction([], transaction().id, '2026-09-03T13:00:00.000Z');
  assert.equal(getBankReconciliationView(transaction(), ignored, context()).status, 'ignored');
  const matched = [{
    bankTransactionId: transaction().id,
    status: 'matched' as const,
    targetType: 'rent-receivable' as const,
    targetId: rent.id,
    paymentId: 'payment-existing',
    createdAt: '2026-09-03T13:00:00.000Z',
    updatedAt: '2026-09-03T13:00:00.000Z',
  }];
  assert.equal(getBankReconciliationView(transaction(), matched, context()).status, 'matched');
});

test('general: suggestion generation is deterministic and does not mutate canonical data', () => {
  const bankTransaction = transaction();
  const suggestionContext = context();
  const beforeTransaction = structuredClone(bankTransaction);
  const beforeContext = structuredClone(suggestionContext);
  const first = suggestBankTransactionMatch(bankTransaction, suggestionContext);
  const second = suggestBankTransactionMatch(bankTransaction, suggestionContext);
  assert.deepEqual(second, first);
  assert.deepEqual(bankTransaction, beforeTransaction);
  assert.deepEqual(suggestionContext, beforeContext);
});

test('general: deterministic suggestions survive the canonical persistence round trip', async () => {
  await saveUserPortfolio('bank-classification-phase1', {
    ...structuredClone(emptyPortfolioData),
    properties: [property],
    rentReceivables: [rent],
    propertyExpenseRules: [communityRule, taxRule, insuranceRule],
    expenseObligations: [community, ibi, insurance],
    bankTransactions: [transaction()],
  });
  const loaded = await loadUserPortfolio('bank-classification-phase1');
  const suggestion = suggestBankTransactionMatch(loaded.bankTransactions![0], {
    properties: loaded.properties,
    rentReceivables: loaded.rentReceivables ?? [],
    rentPayments: loaded.rentPayments ?? [],
    propertyExpenseRules: loaded.propertyExpenseRules ?? [],
    expenseObligations: loaded.expenseObligations ?? [],
    expensePayments: loaded.expensePayments ?? [],
    today: new Date('2026-09-03T12:00:00Z'),
  });
  assert.equal(suggestion?.targetId, rent.id);
  assert.equal(suggestion?.dateDistanceDays, 2);
});

test('general: Plaid normalization remains unchanged and suggestion evaluation is read-only', () => {
  const account = createLinkedCashAccount({
    id: 'cash-phase1', connectionId: 'connection-phase1', providerName: 'plaid',
    externalAccountId: 'external-phase1', currency: 'EUR',
  });
  const [normalized] = normalizeProviderTransactions([{
    externalTransactionId: 'provider-phase1-1', externalAccountId: 'external-phase1',
    bookingDate: '2026-09-03', amount: 1450, currency: 'EUR', direction: 'credit',
    description: 'September rent', counterparty: 'Tenant Alice', pending: false,
  }], {
    providerName: 'plaid', connectionId: 'connection-phase1', accounts: [account],
    reportingCurrency: 'EUR', fxRates: {}, syncedAt: '2026-09-03T12:00:00.000Z',
  });
  const before = structuredClone(normalized);
  assert.equal(suggestBankTransactionMatch(normalized, context({ cashAccounts: [account] }))?.targetId, rent.id);
  assert.deepEqual(normalized, before);
  assert.equal(normalized.providerName, 'plaid');
  assert.equal(normalized.externalTransactionId, 'provider-phase1-1');
});
