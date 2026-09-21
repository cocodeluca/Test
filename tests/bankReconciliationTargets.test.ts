import assert from 'node:assert/strict';
import test from 'node:test';
import { mockProperties } from '../src/common/data/mockData';
import type { BankTransaction, Lease, Property, PropertyExpenseRule, RentPayment } from '../src/common/types';
import { suggestBankTransactionMatch, type BankReconciliationContext } from '../src/common/utils/bankReconciliation';
import {
  deriveBankReconciliationTargets,
  getBankReconciliationTargetDiagnostics,
} from '../src/common/utils/bankReconciliationTargets';
import { generateRentReceivables } from '../src/common/utils/rentCollection';

const today = new Date('2026-09-15T12:00:00.000Z');
const lease = (overrides: Partial<Lease> = {}): Lease => ({
  ...mockProperties[0].leases![0],
  id: 'lease-bank-targets',
  name: 'Tenant bank targets',
  startDate: '2026-01-15',
  endDate: '2026-12-31',
  monthlyRent: 1200,
  monthlyRentCurrency: 'EUR',
  rentDueDay: 9,
  rentTrackingStartDate: '2026-09-01',
  rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 1200 },
  adjustmentHistory: [],
  active: true,
  ...overrides,
});
const property = (leaseOverrides: Partial<Lease> = {}, overrides: Partial<Property> = {}): Property => ({
  ...mockProperties[0],
  id: 'property-bank-targets',
  name: 'Bank Targets Home',
  currency: 'EUR',
  operatingCurrency: 'EUR',
  leases: [lease(leaseOverrides)],
  activeLeaseId: 'lease-bank-targets',
  ...overrides,
});
const context = (overrides: Partial<BankReconciliationContext> = {}): BankReconciliationContext => ({
  properties: [property()],
  rentReceivables: [],
  rentPayments: [],
  propertyExpenseRules: [],
  expenseObligations: [],
  expensePayments: [],
  today,
  ...overrides,
});
const rentTransaction = (overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 'bank-target-rent', providerName: 'plaid', connectionId: 'connection', externalTransactionId: 'external',
  cashAccountId: 'cash', externalAccountId: 'account', bookingDate: '2026-09-09', amount: 1200,
  currency: 'EUR', normalizedAmount: 1200, normalizedCurrency: 'EUR', fxCoverage: 'same-currency',
  description: 'September rent', counterparty: 'Tenant bank targets', pending: false,
  createdAt: '2026-09-09T12:00:00.000Z', updatedAt: '2026-09-09T12:00:00.000Z', syncedAt: '2026-09-09T12:00:00.000Z',
  ...overrides,
});

test('bank targets reuse Rent Collection periods, tracking, lease boundaries, and due date exactly', () => {
  const configured = property({ startDate: '2026-08-15', endDate: '2026-09-20', rentTrackingStartDate: '2026-09-01', rentDueDay: 17 });
  const matchingContext = context({ properties: [configured] });
  const canonical = generateRentReceivables([configured], [], { today, throughPeriod: '2026-09', payments: [] });
  const targets = deriveBankReconciliationTargets(matchingContext);

  assert.deepEqual(targets.rentReceivables, canonical);
  assert.deepEqual(targets.rentReceivableViews.map((target) => ({ period: target.period, dueDate: target.dueDate })), [
    { period: '2026-09', dueDate: '2026-09-17' },
  ]);
});

test('bank targets exclude fully paid rent and expose only the partial outstanding balance without persistence', () => {
  const before = context();
  const target = deriveBankReconciliationTargets(before).rentReceivables[0];
  const partial: RentPayment = {
    id: 'partial', propertyId: target.propertyId, leaseId: target.leaseId, receivedDate: '2026-09-09',
    amount: 200, currency: 'EUR', source: 'manual', allocations: [{ receivableId: target.id, amount: 200 }],
  };
  const partialTargets = deriveBankReconciliationTargets(context({ rentPayments: [partial] }));
  assert.equal(partialTargets.rentReceivableViews[0].outstandingAmount, 1000);
  assert.equal(before.rentReceivables.length, 0);

  const paid: RentPayment = { ...partial, id: 'paid', amount: 1200, allocations: [{ receivableId: target.id, amount: 1200 }] };
  assert.equal(getBankReconciliationTargetDiagnostics(context({ rentPayments: [paid] })).derivedRentTargetCount, 0);
});

test('bank targets follow a changed canonical lease rent without a reconciliation-specific amount model', () => {
  const changed = property({ monthlyRent: 1350, rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 1350 } });
  assert.equal(deriveBankReconciliationTargets(context({ properties: [changed] })).rentReceivableViews[0].expectedAmount, 1350);
});

test('expense targets require a canonical dated rule and never turn a budget assumption into a bill', () => {
  const rule: PropertyExpenseRule = {
    id: 'rule-insurance', propertyId: 'property-bank-targets', category: 'HOME_INSURANCE', label: 'Home insurance',
    amount: 180, currency: 'EUR', frequency: 'ANNUAL', startDate: '2026-09-01', trackingStartDate: '2026-09-01',
    dueDay: 12, dueMonth: 9, isActive: true,
  };
  const withRule = deriveBankReconciliationTargets(context({ propertyExpenseRules: [rule] }));
  assert.deepEqual(withRule.expenseObligationViews.map((target) => ({ dueDate: target.dueDate, expectedAmount: target.expectedAmount })), [
    { dueDate: '2026-09-12', expectedAmount: 180 },
  ]);

  const budgetOnly = property({}, {
    recurringExpenses: [{
      id: 'annual-budget', expenseType: 'home-insurance', label: 'Insurance budget', country: 'Spain',
      billingFrequency: 'yearly', lastKnownAmount: 180, projectionMode: 'manual-annual-estimate',
      manualAnnualEstimate: 180, paymentHistory: [], customSchedule: [],
    }],
  });
  assert.equal(deriveBankReconciliationTargets(context({ properties: [budgetOnly] })).expenseObligationViews.length, 0);
});

test('target diagnostics and classification are deterministic and non-mutating', () => {
  const suggestionContext = context();
  const transaction = rentTransaction();
  const beforeContext = structuredClone(suggestionContext);
  const beforeTransaction = structuredClone(transaction);
  const diagnostics = getBankReconciliationTargetDiagnostics(suggestionContext);

  assert.equal(diagnostics.derivedRentTargetCount, 1);
  assert.equal(diagnostics.derivedExpenseTargetCount, 0);
  assert.equal(suggestBankTransactionMatch(transaction, suggestionContext)?.period, '2026-09');
  assert.deepEqual(suggestionContext, beforeContext);
  assert.deepEqual(transaction, beforeTransaction);
});
