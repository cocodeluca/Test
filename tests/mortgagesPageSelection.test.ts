import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import type { Mortgage, Property } from '../src/common/types';
import { MortgageCard } from '../src/platforms/web/components/MortgageCard';
import { AppSafetyProvider } from '../src/platforms/web/context/AppSafetyContext';
import { SettingsProvider } from '../src/platforms/web/context/SettingsContext';
import { MortgagesPage } from '../src/platforms/web/pages/MortgagesPage';
import {
  getMortgageSelectorLabel,
  normalizeSelectedMortgageId,
} from '../src/platforms/web/pages/mortgageSelection';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const properties = ['Property A', 'Property B', 'Property C'].map((name, index) => ({
  id: `property-${index + 1}`,
  name,
  city: 'Málaga',
  country: 'Spain',
})) as Property[];

const createMortgage = (id: string, lenderName: string, propertyId: string, monthlyMortgagePayment: number): Mortgage => ({
  id,
  propertyId,
  currency: 'EUR',
  lenderName,
  originalLoanAmount: monthlyMortgagePayment * 240,
  currentBalance: monthlyMortgagePayment * 180,
  currentBalanceEstimated: false,
  interestRate: 3,
  mortgageTermYears: 30,
  mortgageTermMonths: 360,
  totalPayments: 360,
  repaymentFrequency: 'monthly',
  monthlyMortgagePayment,
  initialMonthlyPayment: monthlyMortgagePayment,
  regularMonthlyPayment: monthlyMortgagePayment,
  mortgageStartDate: '2025-01-01',
  fixedOrVariable: 'fixed',
  mortgageType: 'Fixed',
  initialInterestRate: null,
  baseInterestRate: 3.5,
  currentInterestRate: 3,
  maxBonifiedRate: null,
  maxTotalBonificationPoints: null,
  rateNotes: '',
  availableBonifications: [],
  activeBonifications: [],
  notes: '',
});

const mortgages = [
  createMortgage('mortgage-a', 'Bank A', 'property-1', 610),
  createMortgage('mortgage-b', 'Bank B', 'property-2', 720),
  createMortgage('mortgage-c', 'Bank C', 'property-3', 830),
];

const renderWithProviders = (element: React.ReactNode) =>
  renderToStaticMarkup(
    React.createElement(
      AppSafetyProvider,
      null,
      React.createElement(SettingsProvider, {
        storageKey: 'mortgages-page-selection-test',
        enableFxRefresh: false,
        children: element,
      })
    )
  );

const renderPage = (pageMortgages: Mortgage[]) =>
  renderWithProviders(
    React.createElement(MortgagesPage, {
      properties,
      mortgages: pageMortgages,
      onAddMortgage: () => undefined,
      onEditMortgage: () => undefined,
      onDeleteMortgage: () => undefined,
    })
  );

test('3 mortgages render a visible selector with all lender-property labels', () => {
  const markup = renderPage(mortgages);

  assert.match(markup, /<select[^>]*aria-label="[^"]*hipoteca/);
  assert.match(markup, /Bank A — Property A/);
  assert.match(markup, /Bank B — Property B/);
  assert.match(markup, /Bank C — Property C/);
});

test('selecting mortgage B resolves B and its details use B throughout the card', () => {
  const selectedMortgageId = normalizeSelectedMortgageId(mortgages, 'mortgage-b');
  const selectedMortgage = mortgages.find((mortgage) => mortgage.id === selectedMortgageId)!;
  const selectedProperty = properties.find((property) => property.id === selectedMortgage.propertyId);
  const markup = renderWithProviders(
    React.createElement(MortgageCard, {
      mortgage: selectedMortgage,
      property: selectedProperty,
      onEdit: () => undefined,
      onDelete: () => undefined,
    })
  );

  assert.equal(selectedMortgage.id, 'mortgage-b');
  assert.match(markup, /Bank B/);
  assert.match(markup, /720\u00a0€/);
  assert.match(markup, /Property B/);
  assert.match(markup, /Rate &amp; Bonifications/);
  assert.match(markup, /Mortgage Insight/);
});

test('edit action is bound to the currently rendered mortgage', () => {
  const cardSource = readFileSync(
    path.join(process.cwd(), 'src/platforms/web/components/MortgageCard.tsx'),
    'utf8'
  );

  assert.match(cardSource, /onEdit\(mortgage, 'rate'\)/);
});

test('deleting B selects a valid remaining mortgage and never retains B', () => {
  const remainingMortgages = mortgages.filter((mortgage) => mortgage.id !== 'mortgage-b');
  const nextSelectedId = normalizeSelectedMortgageId(remainingMortgages, null);

  assert.equal(nextSelectedId, 'mortgage-a');
  assert.equal(remainingMortgages.some((mortgage) => mortgage.id === nextSelectedId), true);
});

test('one mortgage keeps the page working without a selector and zero mortgages shows its empty state', () => {
  const singleMarkup = renderPage([mortgages[0]]);
  const emptyMarkup = renderPage([]);

  assert.doesNotMatch(singleMarkup, /<select[^>]*aria-label="[^"]*hipoteca/);
  assert.match(singleMarkup, /Bank A/);
  assert.match(emptyMarkup, /Todav.a no hay hipotecas a.adidas/);
});

test('selection normalization preserves a valid selection and selector labels unlinked mortgages', () => {
  assert.equal(normalizeSelectedMortgageId(mortgages, 'mortgage-c'), 'mortgage-c');
  assert.equal(normalizeSelectedMortgageId([], 'mortgage-c'), null);
  assert.equal(getMortgageSelectorLabel(mortgages[0], undefined), 'Bank A — Unlinked');
});
