import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import type { Property, RentPayment, RentReceivable } from '../src/common/types';
import { toRentPeriod } from '../src/common/utils/rentCollection';
import { emptyPortfolioData, loadUserPortfolio, saveUserPortfolio } from '../src/platforms/web/services/localAccountStore';
import { accountSnapshotTransaction } from '../src/platforms/web/services/portfolioDatabase';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { localStorage: new MemoryStorage() } });
});

test('rent receivables, payments and allocations survive the canonical persistence round trip', async () => {
  const receivable: RentReceivable = { id: 'rent-receivable:lease-1:2026-08', propertyId: 'property-1', leaseId: 'lease-1', period: '2026-08', dueDate: '2026-08-03', expectedAmount: 830, currency: 'EUR' };
  const payment: RentPayment = { id: 'payment-1', propertyId: 'property-1', leaseId: 'lease-1', receivedDate: '2026-09-03', amount: 400, currency: 'EUR', source: 'manual', allocations: [{ receivableId: receivable.id, amount: 400 }] };
  await saveUserPortfolio('rent-round-trip', { ...emptyPortfolioData, rentReceivables: [receivable], rentPayments: [payment] });
  const loaded = await loadUserPortfolio('rent-round-trip');
  assert.deepEqual(loaded.rentReceivables, [receivable]);
  assert.deepEqual(loaded.rentPayments, [payment]);
});

test('an existing portfolio without rent collection fields loads with empty backward-compatible arrays', async () => {
  await saveUserPortfolio('legacy-no-rent', { ...emptyPortfolioData, rentReceivables: undefined, rentPayments: undefined });
  const loaded = await loadUserPortfolio('legacy-no-rent');
  assert.deepEqual(loaded.rentReceivables, []);
  assert.deepEqual(loaded.rentPayments, []);
});

test('legacy eligible leases receive a persistent current-month tracking boundary without changing lease dates', async () => {
  const property = {
    id: 'legacy-property', name: 'Málaga', address: '', city: 'Málaga', country: 'Spain', purchaseDate: '2020-01-01', currency: 'EUR', occupancyStatus: 'occupied', notes: '',
    leases: [{ id: 'legacy-lease', name: 'Lease', startDate: '2024-09-01', monthlyRent: 1230, rentDueDay: 1, rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 1230 }, adjustmentHistory: [], active: true }],
    activeLeaseId: 'legacy-lease',
  } as unknown as Property;
  await saveUserPortfolio('rent-tracking-migration', { ...emptyPortfolioData, properties: [property] });
  const loaded = await loadUserPortfolio('rent-tracking-migration');
  assert.equal(loaded.properties[0].leases?.[0].rentTrackingStartDate, `${toRentPeriod(new Date())}-01`);
  assert.equal(loaded.properties[0].leases?.[0].startDate, '2024-09-01');
  const stored = await accountSnapshotTransaction('portfolios', 'rent-tracking-migration');
  const storedProperty = (stored?.portfolio as { properties?: Property[] }).properties?.[0];
  assert.equal(storedProperty?.leases?.[0].rentTrackingStartDate, `${toRentPeriod(new Date())}-01`);
});

test('tracking migration preserves explicit historical payments and their earliest managed period', async () => {
  const property = {
    id: 'paid-history-property', name: 'Valencia', address: '', city: 'Valencia', country: 'Spain', purchaseDate: '2020-01-01', currency: 'EUR', occupancyStatus: 'occupied', notes: '',
    leases: [{ id: 'paid-history-lease', name: 'Lease', startDate: '2024-09-01', monthlyRent: 900, rentDueDay: 5, rentUpdateRule: { type: 'no-automatic-update', frequency: 'yearly', baseRent: 900 }, adjustmentHistory: [], active: true }],
    activeLeaseId: 'paid-history-lease',
  } as unknown as Property;
  const receivable: RentReceivable = { id: 'rent-receivable:paid-history-lease:2026-02', propertyId: property.id, leaseId: 'paid-history-lease', period: '2026-02', dueDate: '2026-02-05', expectedAmount: 900, currency: 'EUR' };
  const payment: RentPayment = { id: 'historical-payment', propertyId: property.id, leaseId: 'paid-history-lease', receivedDate: '2026-02-05', amount: 900, currency: 'EUR', source: 'manual', allocations: [{ receivableId: receivable.id, amount: 900 }] };
  await saveUserPortfolio('rent-tracking-paid-history', { ...emptyPortfolioData, properties: [property], rentReceivables: [receivable], rentPayments: [payment] });
  const loaded = await loadUserPortfolio('rent-tracking-paid-history');
  assert.equal(loaded.properties[0].leases?.[0].rentTrackingStartDate, '2026-02-01');
  assert.deepEqual(loaded.rentPayments, [payment]);
  assert.deepEqual(loaded.rentReceivables, [receivable]);
});
