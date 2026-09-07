import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mockMortgages, mockProperties } from '../src/common/data/mockData';
import type { Property } from '../src/common/types';
import { addMortgageRelationship } from '../src/common/utils/mortgageRelationships';
import {
  loadUserPortfolio,
  saveUserPortfolio,
  serializeUserPortfolioForPersistence,
  type UserPortfolioData,
} from '../src/platforms/web/services/localAccountStore';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const installWindow = (localStorage = new MemoryStorage()): MemoryStorage => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage } as unknown as Window & typeof globalThis,
  });
  return localStorage;
};

const makePortfolio = (overrides: Partial<UserPortfolioData> = {}): UserPortfolioData => ({
  properties: [],
  mortgages: [],
  cashAccounts: [],
  bankConnections: [],
  investmentAccounts: [],
  opportunities: [],
  rehabProjects: [],
  reports: [],
  reportTemplates: [],
  reportBranding: {} as never,
  ...overrides,
});

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  installWindow();
});

test('property edit round-trip preserves editable scalar, nested, optional, and image-reference fields', async () => {
  const userId = 'audit-property-round-trip';
  const untouchedProperty = { ...mockProperties[1], notes: 'Must remain unchanged.' } as Property;
  const editedProperty = {
    ...mockProperties[0],
    name: 'Persistence Test',
    address: '123 Audit Street',
    city: 'Persistence City',
    country: 'Spain',
    propertyType: 'apartment',
    bedrooms: 4,
    bathrooms: 3,
    builtAreaSqm: 123.45,
    purchasePrice: 210_001,
    currentEstimatedValue: 345_678,
    monthlyRent: 1_987,
    annualCommunityFees: 876,
    notes: 'Nested values and image references must survive reload.',
    occupancyStatus: 'occupied',
    imageUrl: 'gallery-media:full-audit-1',
    imageUrls: ['gallery-media:full-audit-1', 'https://example.test/property-2.jpg'],
    imageThumbnailUrls: ['gallery-media:thumb-audit-1', 'https://example.test/property-2-thumb.jpg'],
    primaryImageIndex: 1,
    leases: [{
      ...(mockProperties[0].leases?.[0] ?? {}),
      id: 'lease-audit-1',
      name: 'Audit tenant lease',
      active: true,
      startDate: '2026-01-15',
      endDate: '2027-01-14',
      securityDeposit: 2_500,
      monthlyRent: 1_987,
      rentUpdateRule: {
        type: 'fixed-percentage',
        frequency: 'yearly',
        baseRent: 1_987,
        fixedPercentage: 3,
        nextUpdateDate: '2027-01-15',
      },
    }],
    recurringExpenses: [{
      id: 'audit-expense-1',
      expenseType: 'property-tax',
      lastKnownAmount: 321.5,
    }],
  } as Property;
  const portfolio = makePortfolio({ properties: [editedProperty, untouchedProperty] });

  await saveUserPortfolio(userId, portfolio);

  const raw = serializeUserPortfolioForPersistence(await loadUserPortfolio(userId));
  assert.equal(raw, serializeUserPortfolioForPersistence(portfolio));

  const reloaded = (await loadUserPortfolio(userId));
  assert.deepEqual(reloaded.properties, [editedProperty, untouchedProperty]);
});

test('consecutive property snapshots persist only the complete latest version and do not alter another property', async () => {
  const userId = 'audit-consecutive-property-edits';
  const first = { ...mockProperties[0], name: 'Before rapid edits' } as Property;
  const second = { ...mockProperties[1], notes: 'Unchanged second property' } as Property;
  const baseline = makePortfolio({ properties: [first, second] });
  await saveUserPortfolio(userId, baseline);

  const afterFirstEdit = {
    ...baseline,
    properties: [{ ...first, name: 'Persistence Test', monthlyRent: 4_001 }, second],
  };
  const afterFinalEdit = {
    ...afterFirstEdit,
    properties: [{ ...afterFirstEdit.properties[0], currentEstimatedValue: 777_777 }, second],
  };
  await saveUserPortfolio(userId, afterFirstEdit);
  await saveUserPortfolio(userId, afterFinalEdit);

  const reloaded = (await loadUserPortfolio(userId));
  assert.deepEqual(reloaded, afterFinalEdit);
  assert.deepEqual(reloaded.properties[1], second);
});

test('mortgage relationship fields and optional property values survive the account storage round-trip', async () => {
  const userId = 'audit-mortgage-round-trip';
  const property = {
    ...mockProperties[0],
    notes: '',
    imageUrl: '',
    imageUrls: [],
    imageThumbnailUrls: [],
    primaryImageIndex: 0,
  } as Property;
  const mortgage = {
    ...mockMortgages[0],
    propertyId: property.id,
    currentBalance: 123_456,
    monthlyMortgagePayment: 1_234,
  };
  const synchronized = addMortgageRelationship([property], [], mortgage);
  const portfolio = makePortfolio({
    properties: synchronized.properties,
    mortgages: synchronized.mortgages,
  });

  await saveUserPortfolio(userId, portfolio);
  const reloaded = (await loadUserPortfolio(userId));

  assert.deepEqual(reloaded, portfolio);
  assert.equal(reloaded.mortgages[0].propertyId, property.id);
  assert.equal(reloaded.properties[0].currentMortgageBalance, mortgage.currentBalance);
  assert.equal(reloaded.properties[0].monthlyMortgagePayment, mortgage.monthlyMortgagePayment);
});
