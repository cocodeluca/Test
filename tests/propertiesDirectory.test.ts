import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { Property, PropertyMetrics } from '../src/common/types';
import { AppSafetyProvider } from '../src/platforms/web/context/AppSafetyContext';
import { SettingsProvider } from '../src/platforms/web/context/SettingsContext';
import { PropertyDirectory } from '../src/platforms/web/components/PropertyDirectory';
import {
  buildPropertyDirectoryItems,
  filterAndSortPropertyDirectoryItems,
} from '../src/platforms/web/pages/propertiesDirectoryViewModel';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const makeProperty = (overrides: Partial<Property> = {}) => ({
  id: 'property-1', name: 'Malaga Apartment', address: 'Calle Central 1', city: 'Malaga', country: 'Spain',
  propertyType: 'Apartment', occupancyStatus: 'occupied', imageUrl: '', imageUrls: [], primaryImageIndex: 0,
  ...overrides,
} as unknown as Property);

const makeMetrics = (id: string, value: number, rent: number, cashflow: number): PropertyMetrics => ({
  id, name: id, city: 'Malaga', country: 'Spain', valuationDisplayCurrency: 'EUR', operatingDisplayCurrency: 'EUR',
  currentEstimatedValue: value, mortgageBalance: 0, equity: value, investedCapital: value,
  equityPercentage: 100, annualRentalIncome: rent * 12, totalAnnualExpenses: 0,
  actualTrailing12MonthsExpenses: 0, projectedNext12MonthsExpenses: 0, monthlyExpensesEquivalent: 0,
  ownCapitalInvestedStatus: 'exact', totalMonthlyExpenses: 0, netMonthlyCashflow: cashflow,
  grossYield: 0, netYield: 0, roce: 0,
});

test('builds searchable property directory items and filters by occupancy', () => {
  const properties = [makeProperty(), makeProperty({ id: 'property-2', name: 'Oviedo House', city: 'Oviedo', occupancyStatus: 'vacant' })];
  const items = buildPropertyDirectoryItems(properties, [makeMetrics('property-1', 280000, 1200, 175), makeMetrics('property-2', 180000, 900, 50)]);
  assert.equal(items[0].shortLocation, 'Malaga, Spain');
  assert.equal(items[0].heroImageUrl, null);
  assert.equal(filterAndSortPropertyDirectoryItems(items, 'oviedo', 'all', 'name')[0].property.id, 'property-2');
  assert.equal(filterAndSortPropertyDirectoryItems(items, '', 'occupied', 'name').length, 1);
  assert.equal(filterAndSortPropertyDirectoryItems(items, '', 'all', 'value')[0].property.id, 'property-1');
});

test('renders property cards, empty-image fallback, search controls, and detail action', () => {
  const item = buildPropertyDirectoryItems([makeProperty()], [makeMetrics('property-1', 280000, 1200, 175)])[0];
  let openedId = '';
  const markup = renderToStaticMarkup(React.createElement(AppSafetyProvider, null,
    React.createElement(SettingsProvider, {
      storageKey: 'properties-directory-test',
      enableFxRefresh: false,
      children: React.createElement(PropertyDirectory, {
        items: [item],
        onOpenProperty: (id: string) => { openedId = id; },
        onAddProperty: () => undefined,
      }),
    })
  ));
  assert.match(markup, /Malaga Apartment/);
  assert.match(markup, /Search by name, city, or address|Buscar por nombre, ciudad o dirección/);
  assert.match(markup, /Occupied|Ocupada/);
  assert.match(markup, /Open property|Abrir propiedad/);
  assert.match(markup, /Building2|svg/);
  assert.equal(openedId, '');
});

test('renders a clear no-results state', () => {
  const markup = renderToStaticMarkup(React.createElement(AppSafetyProvider, null,
    React.createElement(SettingsProvider, {
      storageKey: 'properties-directory-empty-test',
      enableFxRefresh: false,
      children: React.createElement(PropertyDirectory, { items: [], onOpenProperty: () => undefined, onAddProperty: () => undefined }),
    })
  ));
  assert.match(markup, /Add your first property|Añade tu primera propiedad/);
});
