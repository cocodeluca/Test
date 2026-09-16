import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { PropertiesOnlyDashboardViewModel, PropertiesOnlyPropertyRow } from '../src/platforms/web/pages/propertiesOnlyDashboardViewModel';
import {
  PropertiesOnlyCashflowMarginBadge,
  PropertiesOnlyEquityPosition,
  PropertiesOnlyMortgageDebtCard,
  PropertiesOnlyOccupancyCard,
  PropertiesOnlyOwnCapitalCard,
} from '../src/platforms/web/pages/PropertiesOnlyDashboard';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const translations: Record<string, string> = {
  'dashboardUi.propertiesOnly.mortgageDebtTitle': 'Mortgage debt',
  'dashboardUi.propertiesOnly.outstandingBalance': 'Outstanding balance',
  'dashboardUi.propertiesOnly.nextPaymentTitle': 'Next payment principal',
  'dashboardUi.propertiesOnly.next12MonthsTitle': 'Next 12 months',
  'dashboardUi.propertiesOnly.principalLabel': 'Principal',
  'dashboardUi.propertiesOnly.principalAmortizedLabel': 'Principal repaid',
  'dashboardUi.propertiesOnly.interestLabel': 'Interest',
  'dashboardUi.propertiesOnly.projectionTitle': '12-month projection',
  'dashboardUi.propertiesOnly.amortizationBadge': '{{amount}} principal repaid',
  'dashboardUi.propertiesOnly.nextPaymentPrincipal': 'Next payment principal',
  'dashboardUi.propertiesOnly.next12Principal': 'Principal, next 12 months',
  'dashboardUi.propertiesOnly.next12Interest': 'Interest, next 12 months',
  'dashboardUi.propertiesOnly.projectedDebt': 'Projected debt in 12 months',
  'dashboardUi.propertiesOnly.debtToday': 'Today',
  'dashboardUi.propertiesOnly.debtIn12Months': 'In 12 months',
  'dashboardUi.propertiesOnly.debtRemaining': 'Debt remaining after 12 months',
  'dashboardUi.propertiesOnly.principalRepaid': '{{amount}} principal repaid',
  'dashboardUi.propertiesOnly.coverageUnavailable': 'Unavailable because exchange-rate coverage is missing',
  'dashboardUi.propertiesOnly.ownCapitalInvestedTitle': 'Own capital invested',
  'dashboardUi.propertiesOnly.propertyBreakdownTitle': 'By property',
  'dashboardUi.propertiesOnly.ownCapitalInvestedDescription': 'Total contributed from your own pocket across the portfolio.',
  'dashboardUi.propertiesOnly.ownCapitalInvestedIncludes': 'Includes down payment, purchase costs, renovations, and more.',
  'dashboardUi.propertiesOnly.cashflowMargin': 'Cash flow margin {{value}}',
  'dashboardUi.propertiesOnly.portfolioLtv': 'Portfolio LTV',
  'dashboardUi.propertiesOnly.equityShare': 'equity',
  'dashboardUi.propertiesOnly.debtShare': 'debt',
  'dashboardUi.propertiesOnly.equityUnderwater': 'Negative equity: debt exceeds property value by {{amount}}.',
  'dashboardUi.propertiesOnly.occupancyTitle': 'Portfolio occupancy',
  'dashboardUi.propertiesOnly.occupied': 'Occupied',
  'dashboardUi.propertiesOnly.vacant': 'Vacant',
  'dashboardUi.propertiesOnly.pending': 'Pending',
  'dashboardUi.propertiesOnly.unknown': 'Unknown',
  'dashboardUi.propertiesOnly.occupancy': 'Occupancy',
  'dashboardUi.propertiesOnly.occupancyExcellentTitle': 'Excellent occupancy',
  'dashboardUi.propertiesOnly.occupancyReviewTitle': 'Occupancy needs review',
  'dashboardUi.propertiesOnly.occupancyEmptyTitle': 'No properties to measure',
  'dashboardUi.propertiesOnly.occupancyEmptyBody': 'Add a property to start tracking portfolio occupancy.',
  'dashboardUi.debtPaydownNoActive': 'No active mortgages are currently reducing portfolio debt.',
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
  status: 'available',
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

test('renders the properties-only debt card with compact summaries and projection', () => {
  const markup = renderCard(debt);

  assert.match(markup, /Mortgage debt/);
  assert.match(markup, /Outstanding balance/);
  assert.match(markup, /Next payment principal/);
  assert.match(markup, /Next 12 months/);
  assert.match(markup, /Principal repaid/);
  assert.match(markup, /Interest/);
  assert.match(markup, /12-month projection/);
  assert.match(markup, /Today/);
  assert.match(markup, /In 12 months/);
  assert.doesNotMatch(markup, /role="progressbar"/);
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

test('renders a no-active-mortgages empty state without fake payment projections', () => {
  const markup = renderCard({
    ...debt,
    status: 'no-active-mortgages',
    current: {
      value: 0,
      coverage: { status: 'available', coveredCount: 0, totalCount: 0 },
    },
    nextPaymentPrincipal: 0,
    next12MonthsPrincipal: 0,
    next12MonthsInterest: 0,
    projectedAfter12Months: 0,
    projectionCoverage: { status: 'available', coveredCount: 0, totalCount: 0 },
  });

  assert.match(markup, /data-dashboard-empty-state="no-active-mortgages"/);
  assert.match(markup, /No active mortgages are currently reducing portfolio debt/);
  assert.match(markup, /data-dashboard-card="mortgage-debt"[\s\S]*?Outstanding balance/);
  assert.doesNotMatch(markup, /Next payment principal/);
  assert.doesNotMatch(markup, /Next 12 months/);
  assert.doesNotMatch(markup, /12-month projection/);
});

test('renders the canonical own-capital card without presenting equity as its value', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PropertiesOnlyOwnCapitalCard, {
      amount: { value: 90_000, coverage: availableCoverage },
      currency: 'EUR',
      t,
    })
  );

  assert.match(markup, /Own capital invested/);
  assert.match(markup, /data-raw-value="90000"/);
  assert.match(markup, /Total contributed from your own pocket/);
  assert.match(markup, /Includes down payment, purchase costs, renovations/);
  assert.match(markup, /data-dashboard-metric="own-capital-invested"/);
  assert.doesNotMatch(markup, /Real-estate equity/);
});

test('sorts and compacts own-capital property rows for display only', () => {
  const property = (id: string, city: string, name: string, investedCapital: number) => ({
    id,
    city,
    name,
    investedCapital,
  } as PropertiesOnlyPropertyRow);
  const markup = renderToStaticMarkup(
    React.createElement(PropertiesOnlyOwnCapitalCard, {
      amount: { value: 150_000, coverage: availableCoverage },
      currency: 'EUR',
      properties: [
        property('lorca', 'Lorca', 'Lorca', 37_800),
        property('oviedo', 'Oviedo', 'Oviedo', 88_759),
        property('onda', 'Onda, Valencia', 'Onda, Valencia', 23_441),
      ],
      t,
    })
  );

  assert.ok(markup.indexOf('data-property-name="Oviedo"') < markup.indexOf('data-property-name="Lorca"'));
  assert.ok(markup.indexOf('data-property-name="Lorca"') < markup.indexOf('data-property-name="Onda, Valencia"'));
  assert.match(markup, />Onda<\/span>/);
  assert.doesNotMatch(markup, />Onda, Valencia<\/span>/);
});

test('renders a truthful occupancy empty state without percentages or review messaging', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PropertiesOnlyOccupancyCard, {
      occupancy: {
        totalCount: 0,
        occupiedCount: 0,
        vacantCount: 0,
        pendingCount: 0,
        unknownCount: 0,
        rate: 0,
      },
      t,
    })
  );

  assert.match(markup, /data-dashboard-empty-state="occupancy"/);
  assert.match(markup, /No properties to measure/);
  assert.doesNotMatch(markup, /Occupancy needs review/);
  assert.doesNotMatch(markup, /%/);
  assert.doesNotMatch(markup, /role="progressbar"/);
});

test('renders coherent equity states at and above 100% LTV', () => {
  const renderEquity = (value: number, ltv: number, equityShare: number) =>
    renderToStaticMarkup(
      React.createElement(PropertiesOnlyEquityPosition, {
        equity: { value, ltv, equityShare, coverage: availableCoverage },
        currency: 'EUR',
        t,
      })
    );
  const fullyLeveraged = renderEquity(0, 100, 0);
  const underwater = renderEquity(-40_000, 120, -20);

  assert.match(fullyLeveraged, /data-equity-position="standard"/);
  assert.match(fullyLeveraged, /0\.0% equity/);
  assert.match(fullyLeveraged, /100\.0% debt/);
  assert.match(fullyLeveraged, /role="progressbar"/);

  assert.match(underwater, /data-equity-position="underwater"/);
  assert.match(underwater, /120\.0%/);
  assert.match(underwater, /Negative equity: debt exceeds property value by/);
  assert.doesNotMatch(underwater, /data-equity-share/);
  assert.doesNotMatch(underwater, /data-debt-share/);
  assert.doesNotMatch(underwater, /role="progressbar"/);
});

test('uses the negative financial treatment for a negative cash-flow margin', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PropertiesOnlyCashflowMarginBadge, {
      netMonthlyCashflow: -250,
      grossRent: 1_000,
      t,
    })
  );

  assert.match(markup, /data-cashflow-margin-tone="negative"/);
  assert.match(markup, /text-rose-700/);
  assert.doesNotMatch(markup, /text-emerald-700/);
  assert.match(markup, /-25\.0%/);
});
