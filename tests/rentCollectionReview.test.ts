import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import type { Property } from '../src/common/types';
import type { RentReceivableView } from '../src/common/utils/rentCollection';
import { buildRentReceivableViews, createManualRentPayment, summarizeOverdueRentByProperty } from '../src/common/utils/rentCollection';
import { DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';
import { AppSafetyProvider } from '../src/platforms/web/context/AppSafetyContext';
import { SettingsProvider } from '../src/platforms/web/context/SettingsContext';
import { PaymentReviewModal, RecordPaymentModal, RentCollectionPage } from '../src/platforms/web/pages/RentCollectionPage';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

const property = (id: string, name: string) => ({ id, name, currency: 'EUR' }) as unknown as Property;
const properties = [property('property-a', 'Alicante Apartment'), property('property-b', 'Málaga Apartment')];

const overdueView = (propertyId: string, period: string, outstandingAmount = 1230): RentReceivableView => ({
  id: `rent-receivable:${propertyId}:${period}`,
  propertyId,
  leaseId: `lease-${propertyId}`,
  period,
  dueDate: `${period}-01`,
  expectedAmount: 1230,
  currency: 'EUR',
  allocatedAmount: 1230 - outstandingAmount,
  outstandingAmount,
  paymentDates: [],
  status: 'OVERDUE',
});

const renderWithLanguage = (language: 'en' | 'es' | 'pt', element: React.ReactNode) => {
  const storageKey = `rent-review-${language}`;
  const storage = new MemoryStorage();
  storage.setItem(storageKey, JSON.stringify({ ...DEFAULT_SETTINGS, language }));
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage: storage, matchMedia: () => ({ matches: false }) },
  });
  return renderToStaticMarkup(React.createElement(AppSafetyProvider, null,
    React.createElement(SettingsProvider, { storageKey, enableFxRefresh: false, children: element })));
};

const renderReview = (language: 'en' | 'es' | 'pt', selectedProperty: Property, views: RentReceivableView[]) =>
  renderWithLanguage(language, React.createElement(PaymentReviewModal, {
    property: selectedProperty,
    views,
    locale: language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-PT',
    money: (amount: number) => `€${amount.toLocaleString('en-US')}`,
    onClose: () => undefined,
    onRecordPayment: () => undefined,
  }));

test('Review payments is wired to an observable property review and the existing payment modal', () => {
  const source = readFileSync('src/platforms/web/pages/RentCollectionPage.tsx', 'utf8');
  assert.match(source, /openPaymentReview\(item\.propertyId, event\.currentTarget\)/);
  assert.match(source, /<PaymentReviewModal[^>]*reviewPropertyId/);
  assert.match(source, /onRecordPayment=\{openPaymentForReceivable\}/);
  assert.match(source, /initialReceivableId=\{paymentModal\.initialReceivableId\}/);
});

test('the review renders every overdue period for only the selected property in chronological order', () => {
  const july = overdueView('property-b', '2026-07');
  const august = overdueView('property-b', '2026-08', 500);
  const september = overdueView('property-b', '2026-09');
  const markup = renderReview('en', properties[1], [september, july, august]);

  assert.match(markup, /Málaga Apartment — Payment review/);
  assert.doesNotMatch(markup, /Alicante Apartment/);
  assert.ok(markup.indexOf('July 2026') < markup.indexOf('August 2026'));
  assert.ok(markup.indexOf('August 2026') < markup.indexOf('September 2026'));
  assert.match(markup, /€500/);
  assert.equal((markup.match(/>Record payment</g) ?? []).length, 3);
});

test('the existing payment modal preselects the receivable chosen in review', () => {
  const propertyAView = overdueView('property-a', '2026-08');
  const propertyBView = overdueView('property-b', '2026-09', 500);
  const markup = renderWithLanguage('en', React.createElement(RecordPaymentModal, {
    views: [propertyAView, propertyBView],
    properties,
    locale: 'en-US',
    initialReceivableId: propertyBView.id,
    onClose: () => undefined,
    onSave: () => undefined,
  }));

  assert.match(markup, new RegExp(`<option value="${propertyBView.id}" selected="">Málaga Apartment`));
  assert.match(markup, /value="500"/);
});

test('payment review follows the active English, Spanish, and Portuguese locale', () => {
  const view = overdueView('property-b', '2026-09');
  const en = renderReview('en', properties[1], [view]);
  const es = renderReview('es', properties[1], [view]);
  const pt = renderReview('pt', properties[1], [view]);

  assert.match(en, /Payment review/);
  assert.match(en, /September 2026/);
  assert.match(en, />Overdue</);
  assert.match(es, /Revisión de pagos/);
  assert.match(es, /septiembre de 2026/);
  assert.match(es, />Vencido</);
  assert.match(pt, /Revisão de pagamentos/);
  assert.match(pt, /setembro de 2026/);
  assert.match(pt, />Vencido</);
});

test('the Rent Collection table renders a localized status header instead of the raw key', () => {
  const expected = { en: 'Status', es: 'Estado', pt: 'Estado' } as const;

  (Object.keys(expected) as Array<keyof typeof expected>).forEach((language) => {
    const markup = renderWithLanguage(language, React.createElement(RentCollectionPage, {
      properties: [],
      receivables: [],
      payments: [],
      onUpdate: () => undefined,
    }));

    assert.match(markup, new RegExp(`<th[^>]*>${expected[language]}</th>`));
    assert.doesNotMatch(markup, /rentCollectionUi\.status(?:Label)?/);
  });
});

test('a full payment immediately removes the period and property from overdue aggregation', () => {
  const receivable = overdueView('property-b', '2026-09');
  const payment = createManualRentPayment({
    receivable,
    receivedDate: '2026-09-15',
    amount: receivable.outstandingAmount,
    reference: '',
    note: '',
  });
  const refreshedViews = buildRentReceivableViews([receivable], [payment], properties, new Date(2026, 8, 15, 12));

  assert.equal(refreshedViews[0].status, 'PAID');
  assert.deepEqual(summarizeOverdueRentByProperty(refreshedViews), []);
});
