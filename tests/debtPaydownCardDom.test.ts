import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { MortgageDebtPaydownSummary } from '../src/common/utils/calculations';
import { DebtPaydownCard } from '../src/platforms/web/components/dashboard/DashboardSections';

const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

const translations: Record<string, string> = {
  'dashboardUi.debtPaydownTitle': 'Amortización de deuda',
  'dashboardUi.next12Months': 'Próximos 12 meses',
  'dashboardUi.perYear': 'año',
  'dashboardUi.nextPayment': 'Próxima cuota',
  'dashboardUi.debtPaydownDescription': 'Capital amortizado.',
  'dashboardUi.debtPaydownNoActive': 'No hay hipotecas activas.',
  'dashboardUi.debtPaydownUnavailable': 'Faltan datos.',
};

const t = (key: string, replacements?: Record<string, string | number>) => {
  if (key === 'dashboardUi.debtPaydownCoverage') {
    return `Calculado con ${replacements?.eligible} de ${replacements?.candidates} hipotecas`;
  }

  return translations[key] ?? key;
};

const summary: MortgageDebtPaydownSummary = {
  currentDebt: 10_000,
  projectedDebtAfter12Months: 8_400,
  currentMonthPrincipal: 125,
  next12MonthsPrincipal: 1600,
  next12MonthsInterest: 600,
  reportingCurrency: 'EUR',
  status: 'available',
  debtCoverageStatus: 'available',
  candidateMortgageCount: 2,
  eligibleMortgageCount: 2,
  debtCoveredMortgageCount: 2,
  mortgages: [],
};

const renderCard = (debtPaydown: MortgageDebtPaydownSummary) =>
  renderToStaticMarkup(
    React.createElement(DebtPaydownCard, {
      debtPaydown,
      formatValuation: (value: number) => `€${value.toLocaleString('en-US')}`,
      t,
    })
  );

test('renders the required debt paydown title, annual value, and next-payment copy in DOM', () => {
  const markup = renderCard(summary);

  assert.match(markup, /Amortización de deuda/);
  assert.match(markup, /€1,600/);
  assert.match(markup, /\/ año/);
  assert.match(markup, /Próxima cuota/);
  assert.match(markup, /€125/);
  assert.doesNotMatch(markup, /Este mes/);
  assert.doesNotMatch(markup, /Calculado con/);
});

test('renders partial coverage and unavailable states in DOM', () => {
  const partialMarkup = renderCard({
    ...summary,
    candidateMortgageCount: 3,
  });
  const unavailableMarkup = renderCard({
    ...summary,
    status: 'unavailable',
    candidateMortgageCount: 1,
    eligibleMortgageCount: 0,
  });

  assert.match(partialMarkup, /Calculado con 2 de 3 hipotecas/);
  assert.match(unavailableMarkup, />—</);
  assert.match(unavailableMarkup, /Faltan datos/);
});
