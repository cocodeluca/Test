import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/common/types';
import { generatePortfolioAlerts } from '../src/common/utils/alerts';

test('keeps the Dashboard attention source limited to currently supported alert rules', () => {
  const property = {
    id: 'property-1',
    name: 'Stored property',
    city: 'Madrid',
    country: 'Spain',
    currency: 'EUR',
    monthlyRent: 1000,
    leaseEndDate: '2026-01-11',
    recurringExpenses: [
      {
        id: 'insurance-1',
        expenseType: 'home-insurance',
        nextExpectedUpdateDate: '2026-01-06',
        paymentHistory: [],
      },
      {
        id: 'tax-1',
        expenseType: 'property-tax',
        nextExpectedUpdateDate: '2026-01-04',
        paymentHistory: [],
      },
    ],
  } as unknown as Property;

  const alerts = generatePortfolioAlerts([property], new Date('2026-01-01T12:00:00Z'));

  assert.deepEqual(alerts.map((alert) => alert.kind), ['insurance-ending', 'lease-ending']);
  assert.equal(alerts.some((alert) => alert.id.includes('tax-1')), false);
});

test('reuses portfolio alerts for overdue rent and a newer-period payment gap', () => {
  const property = {
    id: 'property-rent-alert',
    name: 'Lorca',
    city: 'Lorca',
    country: 'Spain',
    currency: 'EUR',
    monthlyRent: 830,
    leases: [{
      id: 'lease-rent-alert',
      name: 'Current lease',
      startDate: '2026-08-01',
      monthlyRent: 830,
      monthlyRentCurrency: 'EUR',
      rentDueDay: 3,
      rentGracePeriodDays: 2,
      rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 830 },
      adjustmentHistory: [],
      active: true,
    }],
    activeLeaseId: 'lease-rent-alert',
  } as unknown as Property;
  const august = { id: 'august', propertyId: property.id, leaseId: 'lease-rent-alert', period: '2026-08', dueDate: '2026-08-03', expectedAmount: 830, currency: 'EUR' } as const;
  const september = { ...august, id: 'september', period: '2026-09', dueDate: '2026-09-03' } as const;
  const alerts = generatePortfolioAlerts(
    [property],
    new Date(2026, 8, 10, 12),
    [august, september],
    [{ id: 'september-payment', propertyId: property.id, leaseId: 'lease-rent-alert', receivedDate: '2026-09-03', amount: 830, currency: 'EUR', source: 'manual', allocations: [{ receivableId: september.id, amount: 830 }] }]
  );
  assert.ok(alerts.some((alert) => alert.kind === 'rent-overdue' && alert.rentPeriod === '2026-08'));
  assert.ok(alerts.some((alert) => alert.kind === 'rent-payment-gap' && alert.action === 'review-rent-collection'));
});
