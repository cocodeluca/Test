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
