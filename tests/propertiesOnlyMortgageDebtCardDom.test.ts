import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { PropertiesOnlyDashboardViewModel } from '../src/platforms/web/pages/propertiesOnlyDashboardViewModel';
import { PropertiesOnlyMortgageDebtCard } from '../src/platforms/web/pages/PropertiesOnlyDashboard';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const translations: Record<string, string> = {
  'dashboardUi.propertiesOnly.mortgageDebtTitle': 'Mortgage debt',
  'dashboardUi.propertiesOnly.outstandingBalance': 'Outstanding balance',
  'dashboardUi.propertiesOnly.nextPaymentPrincipal': 'Next payment principal',
  'dashboardUi.propertiesOnly.next12Principal': 'Principal, next 12 months',
  'dashboardUi.propertiesOnly.next12Interest': 'Interest, next 12 months',
  'dashboardUi.propertiesOnly.projectedDebt': 'Projected debt in 12 months',
  'dashboardUi.propertiesOnly.debtToday': 'Today',
  'dashboardUi.propertiesOnly.debtIn12Months': 'In 12 months',
  'dashboardUi.propertiesOnly.debtRemaining': 'Debt remaining after 12 months',
  'dashboardUi.propertiesOnly.principalRepaid': '{{amount}} principal repaid',
  'dashboardUi.propertiesOnly.coverageUnavailable': 'Unavailable because exchange-rate coverage is missing',
};

const t = (key: string, replacements?: Record<string, string | number>) => {
  if (key === 'dashboardUi.propertiesOnly.coveragePartial') {
    return `Calculated with ${replacements?.covered} of ${replacements?.total} items`;
  }

  const value = translations[key] ?? key;
  return Object.entries(replacements ?? {}).reduce(
    (result, [replacementKey, replacementValue]) => result.replace(`{{${replacementKey}}}`, String(replacementValue)),
    value
  );
};

const availableCoverage = {
  status: 'available' as const,
  coveredCount: 2,
  totalCount: 2,
};

const debt: PropertiesOnlyDashboardViewModel['debt'] = {
  current: {
    value: 10_000,
    coverage: availableCoverage,
  },
  nextPaymentPrincipal: 125,
  next12MonthsPrincipal: 1_600,
  next12MonthsInterest: 600,
  projectedAfter12Months: 8_400,
  projectionCoverage: availableCoverage,
};

const renderCard = (value: PropertiesOnlyDashboardViewModel['debt']) =>
  renderToStaticMarkup(
    React.createElement(PropertiesOnlyMortgageDebtCard, {
      debt: value,
      currency: 'EUR',
      t,
    })
  );

test('renders the properties-only debt balance, four details, and remaining-debt comparison', () => {
  const markup = renderCard(debt);

  assert.match(markup, /Mortgage debt/);
  assert.match(markup, /Outstanding balance/);
  assert.equal((markup.match(/<dt/g) ?? []).length, 4);
  assert.match(markup, /Today/);
  assert.match(markup, /In 12 months/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-label="Debt remaining after 12 months"/);
  assert.match(markup, /aria-valuenow="84"/);
  assert.match(markup, /principal repaid/);
  assert.doesNotMatch(markup, /Este mes/);
});

test('keeps coverage states and hides the debt bar when comparison values are unavailable', () => {
  const partialMarkup = renderCard({
    ...debt,
    current: {
      ...debt.current,
      coverage: { status: 'partial', coveredCount: 1, totalCount: 2 },
    },
  });
  const unavailableMarkup = renderCard({
    ...debt,
    current: {
      value: null,
      coverage: { status: 'unavailable', coveredCount: 0, totalCount: 2 },
    },
    projectedAfter12Months: null,
    projectionCoverage: { status: 'unavailable', coveredCount: 0, totalCount: 2 },
  });

  assert.match(partialMarkup, /Calculated with 1 of 2 items/);
  assert.match(unavailableMarkup, /Unavailable because exchange-rate coverage is missing/);
  assert.doesNotMatch(unavailableMarkup, /role="progressbar"/);
});
