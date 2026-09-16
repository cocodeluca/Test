import assert from 'node:assert/strict';
import test from 'node:test';
import type { Lease, Property, RentPayment, RentReceivable } from '../src/common/types';
import {
  buildRentReceivableViews,
  createManualRentPayment,
  deriveRentReceivableStatus,
  detectRentPaymentGaps,
  generateRentReceivables,
  getRentDueDate,
  initializeRentTrackingStartDates,
  makeRentReceivableId,
  summarizeOverdueRentByProperty,
  summarizeRentPeriod,
} from '../src/common/utils/rentCollection';

const makeLease = (overrides: Partial<Lease> = {}): Lease => ({
  id: 'lease-1',
  name: 'Tenant lease',
  startDate: '2026-06-15',
  endDate: '2026-09-30',
  monthlyRent: 830,
  monthlyRentCurrency: 'EUR',
  rentDueDay: 3,
  rentTrackingStartDate: '2026-06-01',
  rentGracePeriodDays: 2,
  rentUpdateRule: {
    type: 'no-automatic-update',
    frequency: 'yearly',
    baseRent: 830,
  },
  adjustmentHistory: [],
  active: true,
  ...overrides,
});

const makeProperty = (overrides: Partial<Property> = {}): Property => ({
  id: 'property-1',
  name: 'Lorca',
  city: 'Lorca',
  country: 'Spain',
  currency: 'EUR',
  operatingCurrency: 'EUR',
  occupancyStatus: 'occupied',
  monthlyRent: 830,
  leases: [makeLease()],
  activeLeaseId: 'lease-1',
  ...overrides,
} as Property);

const makeReceivable = (period: string, overrides: Partial<RentReceivable> = {}): RentReceivable => ({
  id: makeRentReceivableId('lease-1', period),
  propertyId: 'property-1',
  leaseId: 'lease-1',
  period,
  dueDate: `${period}-03`,
  expectedAmount: 830,
  currency: 'EUR',
  ...overrides,
});

const pay = (receivable: RentReceivable, amount = 830, receivedDate = `${receivable.period}-03`, id = `payment-${receivable.period}`): RentPayment =>
  createManualRentPayment({ id, receivable, amount, receivedDate, createdAt: `${receivedDate}T12:00:00.000Z` });

test('generates monthly receivables from the explicit tracking start', () => {
  const receivables = generateRentReceivables([makeProperty()], [], {
    today: new Date(2026, 8, 10, 12),
    throughPeriod: '2026-09',
  });
  assert.deepEqual(receivables.map((item) => item.period), ['2026-06', '2026-07', '2026-08', '2026-09']);
  assert.ok(receivables.every((item) => item.expectedAmount === 830 && item.leaseId === 'lease-1'));
});

test('a long-running lease only enters scope from its Rent Collection tracking month', () => {
  const property = makeProperty({ leases: [makeLease({ startDate: '2024-09-10', endDate: '', monthlyRent: 1230, rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 1230 }, rentTrackingStartDate: '2026-09-01' })] });
  const receivables = generateRentReceivables([property], [], { today: new Date(2026, 8, 15, 12), throughPeriod: '2026-09' });
  assert.deepEqual(receivables.map((item) => item.period), ['2026-09']);
  assert.equal(property.leases?.[0].startDate, '2024-09-10');
});

test('a missing tracking start defaults to the current rental month instead of the lease start', () => {
  const property = makeProperty({ leases: [makeLease({ startDate: '2024-09-10', endDate: '', rentTrackingStartDate: null })] });
  const receivables = generateRentReceivables([property], [], { today: new Date(2026, 8, 15, 12), throughPeriod: '2026-09' });
  assert.deepEqual(receivables.map((item) => item.period), ['2026-09']);
});

test('pre-tracking generated rows are ignored while explicitly paid history remains in scope', () => {
  const property = makeProperty({ leases: [makeLease({ startDate: '2024-09-10', endDate: '', rentTrackingStartDate: null })] });
  const historical = makeReceivable('2026-02');
  assert.deepEqual(generateRentReceivables([property], [historical], { today: new Date(2026, 8, 15, 12), throughPeriod: '2026-09' }).map((item) => item.period), ['2026-09']);
  const payment = pay(historical);
  assert.deepEqual(generateRentReceivables([property], [historical], { today: new Date(2026, 8, 15, 12), throughPeriod: '2026-09', payments: [payment] }).map((item) => item.period), ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
});

test('snapshots the rent amount applicable to each historical period', () => {
  const lease = makeLease({
    rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 830 },
    adjustmentHistory: [{ id: 'increase-1', adjustmentDate: '2026-08-01', previousRent: 830, newRent: 900, percentageApplied: 8.4337, ruleSource: 'manual-override' }],
  });
  const receivables = generateRentReceivables([makeProperty({ leases: [lease] })], [], { today: new Date(2026, 8, 10, 12) });
  assert.equal(receivables.find((item) => item.period === '2026-07')?.expectedAmount, 830);
  assert.equal(receivables.find((item) => item.period === '2026-08')?.expectedAmount, 900);
});

test('receivable generation is idempotent and preserves the canonical existing record', () => {
  const first = generateRentReceivables([makeProperty()], [], { today: new Date(2026, 8, 10, 12) });
  const marked = first.map((item) => item.period === '2026-08' ? { ...item, generatedAt: 'kept' } : item);
  const second = generateRentReceivables([makeProperty()], marked, { today: new Date(2026, 8, 10, 12) });
  assert.equal(second.length, first.length);
  assert.equal(second.find((item) => item.period === '2026-08')?.generatedAt, 'kept');
  assert.equal(new Set(second.map((item) => `${item.leaseId}|${item.period}`)).size, second.length);
});

test('respects lease start and end month boundaries', () => {
  const property = makeProperty({ leases: [makeLease({ startDate: '2026-07-10', endDate: '2026-08-02' })] });
  const receivables = generateRentReceivables([property], [], { today: new Date(2026, 9, 1, 12), throughPeriod: '2026-10' });
  assert.deepEqual(receivables.map((item) => item.period), ['2026-07', '2026-08']);
});

test('does not generate a receivable when an old lease has no contractual due day', () => {
  const property = makeProperty({ leases: [makeLease({ rentDueDay: null })] });
  assert.deepEqual(generateRentReceivables([property], [], { today: new Date(2026, 8, 1, 12) }), []);
});

test('calculates due dates and clamps day 31 to the last calendar day', () => {
  assert.equal(getRentDueDate('2026-01', 15), '2026-01-15');
  assert.equal(getRentDueDate('2026-02', 31), '2026-02-28');
  assert.equal(getRentDueDate('2024-02', 31), '2024-02-29');
  assert.equal(getRentDueDate('2026-04', 31), '2026-04-30');
});

test('derives UPCOMING before the due date', () => {
  assert.equal(deriveRentReceivableStatus({ receivable: makeReceivable('2026-09'), allocatedAmount: 0, today: new Date(2026, 8, 2, 12) }), 'UPCOMING');
});

test('derives DUE throughout the due and grace window', () => {
  assert.equal(deriveRentReceivableStatus({ receivable: makeReceivable('2026-09'), allocatedAmount: 0, gracePeriodDays: 2, today: new Date(2026, 8, 5, 12) }), 'DUE');
});

test('derives OVERDUE after due date plus grace period', () => {
  assert.equal(deriveRentReceivableStatus({ receivable: makeReceivable('2026-09'), allocatedAmount: 0, gracePeriodDays: 2, today: new Date(2026, 8, 6, 12) }), 'OVERDUE');
});

test('current-month status respects whether the contractual due date has passed', () => {
  assert.equal(deriveRentReceivableStatus({ receivable: makeReceivable('2026-09', { dueDate: '2026-09-01' }), allocatedAmount: 0, today: new Date(2026, 8, 15, 12) }), 'OVERDUE');
  assert.equal(deriveRentReceivableStatus({ receivable: makeReceivable('2026-09', { dueDate: '2026-09-20' }), allocatedAmount: 0, today: new Date(2026, 8, 15, 12) }), 'UPCOMING');
});

test('derives PAID from a full explicit allocation', () => {
  const receivable = makeReceivable('2026-08');
  const [view] = buildRentReceivableViews([receivable], [pay(receivable)], [makeProperty()], new Date(2026, 8, 10, 12));
  assert.equal(view.status, 'PAID');
  assert.equal(view.outstandingAmount, 0);
});

test('derives PARTIAL for a partial payment within the allowed window', () => {
  const receivable = makeReceivable('2026-09');
  const [view] = buildRentReceivableViews([receivable], [pay(receivable, 300)], [makeProperty()], new Date(2026, 8, 4, 12));
  assert.equal(view.status, 'PARTIAL');
  assert.equal(view.outstandingAmount, 530);
});

test('adds multiple payments allocated to the same receivable', () => {
  const receivable = makeReceivable('2026-09');
  const payments = [pay(receivable, 300, '2026-09-03', 'part-1'), pay(receivable, 530, '2026-09-04', 'part-2')];
  const [view] = buildRentReceivableViews([receivable], payments, [makeProperty()], new Date(2026, 8, 4, 12));
  assert.equal(view.allocatedAmount, 830);
  assert.equal(view.status, 'PAID');
  assert.deepEqual(view.paymentDates, ['2026-09-03', '2026-09-04']);
});

test('a September-dated payment can explicitly settle August', () => {
  const august = makeReceivable('2026-08');
  const payment = pay(august, 830, '2026-09-03');
  assert.equal(payment.receivedDate, '2026-09-03');
  assert.equal(payment.allocations[0].receivableId, august.id);
  assert.equal(buildRentReceivableViews([august], [payment], [makeProperty()], new Date(2026, 8, 4, 12))[0].status, 'PAID');
});

test('September payment never implicitly closes unpaid August', () => {
  const august = makeReceivable('2026-08');
  const september = makeReceivable('2026-09');
  const views = buildRentReceivableViews([august, september], [pay(september)], [makeProperty()], new Date(2026, 8, 10, 12));
  assert.equal(views.find((view) => view.period === '2026-08')?.status, 'OVERDUE');
  assert.equal(views.find((view) => view.period === '2026-09')?.status, 'PAID');
});

test('detects payment gap when a newer period is paid and an older period is outstanding', () => {
  const august = makeReceivable('2026-08');
  const september = makeReceivable('2026-09');
  const views = buildRentReceivableViews([august, september], [pay(september)], [makeProperty()], new Date(2026, 8, 10, 12));
  assert.deepEqual(detectRentPaymentGaps(views).map((gap) => [gap.outstandingPeriod, gap.newerPaidPeriod]), [['2026-08', '2026-09']]);
});

test('calculates portfolio-level expected, received, outstanding and count totals', () => {
  const a = makeReceivable('2026-09');
  const b = makeReceivable('2026-09', { id: makeRentReceivableId('lease-2', '2026-09'), propertyId: 'property-2', leaseId: 'lease-2', expectedAmount: 700 });
  const views = buildRentReceivableViews([a, b], [pay(a)], [makeProperty()], new Date(2026, 8, 4, 12));
  assert.deepEqual(summarizeRentPeriod(views, '2026-09'), { expectedAmount: 1530, receivedAmount: 830, outstandingAmount: 700, paidCount: 1, expectedCount: 2 });
});

test('portfolio totals convert currencies into the requested reporting currency', () => {
  const eur = makeReceivable('2026-09', { expectedAmount: 800 });
  const usd = makeReceivable('2026-09', { id: makeRentReceivableId('lease-usd', '2026-09'), propertyId: 'property-usd', leaseId: 'lease-usd', expectedAmount: 1000, currency: 'USD' });
  const views = buildRentReceivableViews([eur, usd], [], [makeProperty()], new Date(2026, 8, 1, 12));
  assert.equal(summarizeRentPeriod(views, '2026-09', { targetCurrency: 'EUR', rateOverrides: { EUR: 1, USD: 0.9 } }).expectedAmount, 1700);
});

test('property-specific history can be selected without cross-property rows', () => {
  const first = makeReceivable('2026-08');
  const second = makeReceivable('2026-08', { id: makeRentReceivableId('lease-2', '2026-08'), propertyId: 'property-2', leaseId: 'lease-2' });
  const history = buildRentReceivableViews([first, second], [], [makeProperty()], new Date(2026, 8, 10, 12)).filter((view) => view.propertyId === 'property-1');
  assert.deepEqual(history.map((view) => view.id), [first.id]);
});

test('explicit earlier tracking generates history while lease end remains an upper boundary', () => {
  const property = makeProperty({ leases: [makeLease({ startDate: '2024-09-10', rentTrackingStartDate: '2026-01-01', endDate: '2026-03-20' })] });
  assert.deepEqual(generateRentReceivables([property], [], { today: new Date(2026, 8, 15, 12) }).map((item) => item.period), ['2026-01', '2026-02', '2026-03']);
});

test('tracking migration defaults to current month but preserves explicit payment history', () => {
  const untracked = makeProperty({ leases: [makeLease({ startDate: '2024-09-10', rentTrackingStartDate: null })] });
  const current = initializeRentTrackingStartDates([untracked], [], [], new Date(2026, 8, 15, 12));
  assert.equal(current[0].leases?.[0].rentTrackingStartDate, '2026-09-01');
  assert.equal(current[0].leases?.[0].startDate, '2024-09-10');

  const historical = makeReceivable('2026-02');
  const payment = pay(historical, 830, '2026-03-01');
  const preserved = initializeRentTrackingStartDates([untracked], [historical], [payment], new Date(2026, 8, 15, 12));
  assert.equal(preserved[0].leases?.[0].rentTrackingStartDate, '2026-02-01');
  assert.deepEqual(payment.allocations, [{ receivableId: historical.id, amount: 830 }]);
});

test('Needs attention aggregates overdue periods per property', () => {
  const first = makeReceivable('2026-06');
  const second = makeReceivable('2026-07');
  const other = makeReceivable('2026-05', { id: makeRentReceivableId('lease-2', '2026-05'), propertyId: 'property-2', leaseId: 'lease-2', expectedAmount: 700 });
  const views = buildRentReceivableViews([first, second, other], [], [makeProperty()], new Date(2026, 8, 15, 12));
  assert.deepEqual(summarizeOverdueRentByProperty(views), [
    { propertyId: 'property-2', overdueCount: 1, totalOutstanding: 700, oldestOverduePeriod: '2026-05', currency: 'EUR' },
    { propertyId: 'property-1', overdueCount: 2, totalOutstanding: 1660, oldestOverduePeriod: '2026-06', currency: 'EUR' },
  ]);
});
