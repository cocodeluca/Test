import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExpenseObligation, ExpensePayment, Property, PropertyExpenseRule } from '../src/common/types';
import { calculatePropertyFinancials } from '../src/common/utils/calculations';
import { generatePortfolioAlerts } from '../src/common/utils/alerts';
import {
  buildExpenseObligationViews, createManualExpensePayment, deriveExpenseObligationStatus,
  generateExpenseObligations, makeExpenseObligationId, resolveExpenseRuleAmount, summarizePropertyExpenses,
} from '../src/common/utils/propertyExpenses';

const property = (overrides: Partial<Property> = {}) => ({ id: 'property-1', name: 'Málaga', city: 'Málaga', country: 'Spain', currency: 'EUR', operatingCurrency: 'EUR', communityMonthly: 51, communityAnnual: 612, annualCommunityFees: 612, ...overrides } as Property);
const rule = (frequency: PropertyExpenseRule['frequency'], overrides: Partial<PropertyExpenseRule> = {}): PropertyExpenseRule => ({ id: `rule-${frequency}`, propertyId: 'property-1', category: 'COMMUNITY', label: 'Community', amount: 51, currency: 'EUR', frequency, startDate: '2026-01-01', trackingStartDate: '2026-01-01', dueDay: 5, dueMonth: 2, isActive: true, ...overrides });
const obligation = (overrides: Partial<ExpenseObligation> = {}): ExpenseObligation => ({ id: 'bill-1', propertyId: 'property-1', category: 'PROPERTY_TAX', label: 'IBI 2026', dueDate: '2026-09-15', expectedAmount: 400, currency: 'EUR', ...overrides });

test('generates monthly obligations deterministically without duplicates', () => {
  const generated = generateExpenseObligations([rule('MONTHLY')], [property()], [], { throughDate: '2026-03-31', today: new Date(2026, 2, 1, 12) });
  assert.deepEqual(generated.map((x) => x.dueDate), ['2026-01-05', '2026-02-05', '2026-03-05']);
  assert.deepEqual(generateExpenseObligations([rule('MONTHLY')], [property()], generated, { throughDate: '2026-03-31' }), generated);
  assert.equal(generated[0].id, makeExpenseObligationId('rule-MONTHLY', '2026-01'));
});

test('generates quarterly, annual and one-time occurrences', () => {
  assert.deepEqual(generateExpenseObligations([rule('QUARTERLY')], [property()], [], { throughDate: '2026-12-31' }).map((x) => x.dueDate), ['2026-01-05','2026-04-05','2026-07-05','2026-10-05']);
  assert.deepEqual(generateExpenseObligations([rule('ANNUAL')], [property()], [], { throughDate: '2027-12-31' }).map((x) => x.dueDate), ['2026-02-05','2027-02-05']);
  assert.deepEqual(generateExpenseObligations([rule('ONE_TIME', { startDate: '2026-11-15', trackingStartDate: '2026-01-01' })], [property()], [], { throughDate: '2026-12-31' }).map((x) => x.dueDate), ['2026-11-15']);
});

test('respects rule start, end and explicit tracking-start boundaries', () => {
  const generated = generateExpenseObligations([rule('MONTHLY', { startDate: '2026-01-01', trackingStartDate: '2026-03-01', endDate: '2026-04-30' })], [property()], [], { throughDate: '2026-12-31' });
  assert.deepEqual(generated.map((x) => x.dueDate), ['2026-03-05', '2026-04-05']);
});

test('derives upcoming, due, overdue, partial and paid from date and allocations', () => {
  const today = new Date(2026, 8, 15, 12);
  assert.equal(deriveExpenseObligationStatus({ obligation: obligation({ dueDate: '2026-09-16' }), allocatedAmount: 0, today }), 'UPCOMING');
  assert.equal(deriveExpenseObligationStatus({ obligation: obligation(), allocatedAmount: 0, today }), 'DUE');
  assert.equal(deriveExpenseObligationStatus({ obligation: obligation({ dueDate: '2026-09-14' }), allocatedAmount: 0, today }), 'OVERDUE');
  assert.equal(deriveExpenseObligationStatus({ obligation: obligation(), allocatedAmount: 100, today }), 'PARTIAL');
  assert.equal(deriveExpenseObligationStatus({ obligation: obligation(), allocatedAmount: 400, today }), 'PAID');
});

test('supports multiple explicitly allocated payments and deletion correction', () => {
  const bill = obligation();
  const payments: ExpensePayment[] = [createManualExpensePayment({ id: 'p1', obligation: bill, paidDate: '2026-09-10', amount: 100 }), createManualExpensePayment({ id: 'p2', obligation: bill, paidDate: '2026-09-12', amount: 300 })];
  assert.equal(buildExpenseObligationViews([bill], payments, new Date(2026, 8, 15, 12))[0].status, 'PAID');
  const corrected = payments.filter((payment) => payment.id !== 'p2');
  const view = buildExpenseObligationViews([bill], corrected, new Date(2026, 8, 15, 12))[0];
  assert.equal(view.status, 'PARTIAL'); assert.equal(view.outstandingAmount, 300);
});

test('summarizes upcoming, overdue and paid-this-month amounts', () => {
  const bills = [obligation({ id: 'overdue', dueDate: '2026-09-01' }), obligation({ id: 'future', dueDate: '2026-10-01', expectedAmount: 200 })];
  const payment = createManualExpensePayment({ obligation: bills[0], paidDate: '2026-09-03', amount: 50 });
  const views = buildExpenseObligationViews(bills, [payment], new Date(2026, 8, 15, 12));
  const summary = summarizePropertyExpenses(views, [payment], new Date(2026, 8, 15, 12));
  assert.equal(summary.upcomingAmount, 200); assert.equal(summary.dueOrOverdueAmount, 350); assert.equal(summary.overdueAmount, 0); assert.equal(summary.paidThisMonthAmount, 50);
});

test('canonical property field remains the rule amount source and ledger never changes cash flow', () => {
  const malaga = property({ communityMonthly: 51, annualCommunityFees: 612 });
  const linked = rule('MONTHLY', { amount: 999, amountSource: { kind: 'property-field', field: 'communityMonthly' } });
  assert.equal(resolveExpenseRuleAmount(linked, malaga), 51);
  const before = calculatePropertyFinancials(malaga).annualRecurringExpenses;
  const bill = generateExpenseObligations([linked], [malaga], [], { throughDate: '2026-09-30' }).find((x) => x.period === '2026-09')!;
  const paid = createManualExpensePayment({ obligation: bill, paidDate: '2026-09-05', amount: 51 });
  assert.equal(buildExpenseObligationViews([bill], [paid], new Date(2026, 8, 6, 12))[0].status, 'PAID');
  assert.equal(calculatePropertyFinancials(malaga).annualRecurringExpenses, before);
  assert.equal(malaga.communityMonthly, 51);
});

test('property history can be selected by property and overdue expense alerts use global alerts', () => {
  const bills = [obligation({ propertyId: 'property-1', dueDate: '2026-09-01' }), obligation({ id: 'other', propertyId: 'property-2' })];
  assert.equal(buildExpenseObligationViews(bills, [], new Date()).filter((x) => x.propertyId === 'property-1').length, 1);
  const alerts = generatePortfolioAlerts([property()], new Date(2026, 8, 15, 12), [], [], bills, []);
  assert.ok(alerts.some((alert) => alert.kind === 'expense-overdue' && alert.action === 'review-expenses'));
});
