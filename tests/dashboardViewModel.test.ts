import test from 'node:test';
import assert from 'node:assert/strict';
import type { PortfolioMetrics, Property, PropertyMetrics } from '../src/common/types';
import type { MortgageDebtPaydownSummary } from '../src/common/utils/calculations';
import {
  buildDashboardDebtPaydownPresentation,
  buildDashboardViewModel,
  DASHBOARD_ACTIVITY_AVAILABLE,
  DASHBOARD_HISTORY_AVAILABLE,
} from '../src/platforms/web/pages/dashboardViewModel';

const metrics: PortfolioMetrics = {
  valuationDisplayCurrency: 'USD',
  operatingDisplayCurrency: 'EUR',
  totalPortfolioValue: 1000,
  totalPortfolioAssetValue: 1200,
  totalDebt: 400,
  totalDebtIn1Year: 380,
  debtChangeIn1Year: -20,
  debtReductionIn1Year: 20,
  debtReductionRate: 0.05,
  totalEquity: 600,
  totalEquityIn1Year: 620,
  equityChangeIn1Year: 20,
  totalInvestedCapital: 500,
  equityVsInvestedCapitalRatio: 120,
  equityPercentage: 60,
  availableCash: 100,
  investmentsValue: 200,
  totalNetWorth: 900,
  totalMonthlyRent: 70,
  totalMonthlyOperatingExpenses: 8,
  totalAnnualExpenses: 96,
  totalMonthlyMortgagePayments: 12,
  totalNetMonthlyCashflow: 50,
  annualizedCashflow: 600,
  averageGrossYield: 8.4,
  averageNetYield: 7.2,
  cashOnCashReturn: 12,
  portfolioRoce: 14,
  debtToValueRatio: 40,
  principalRepaidNext12Months: 20,
  interestPaidNext12Months: 15,
  totalEstimatedAnnualPropertyAppreciation: 30,
  annualValueCreation: 650,
  annualValueCreationOnCapital: 130,
  estimatedAnnualTax: 0,
  estimatedAnnualAfterTaxCashflow: 600,
  estimatedMonthlyAfterTaxCashflow: 50,
  actualTrailing12MonthsExpenses: 90,
  projectedNext12MonthsExpenses: 96,
};

const debtPaydown: MortgageDebtPaydownSummary = {
  currentDebt: 10_000,
  projectedDebtAfter12Months: 8_400,
  currentMonthPrincipal: 125,
  next12MonthsPrincipal: 1600,
  next12MonthsInterest: 600,
  reportingCurrency: 'USD',
  status: 'available',
  debtCoverageStatus: 'available',
  candidateMortgageCount: 3,
  eligibleMortgageCount: 2,
  debtCoveredMortgageCount: 3,
  mortgages: [],
};

const makeProperty = (
  id: string,
  name: string,
  currentEstimatedValue: number,
  currency: 'USD' | 'EUR'
): Property => ({
  id,
  name,
  city: `${name} City`,
  country: 'Test',
  currency,
  currentEstimatedValue,
  currentEstimatedValueCurrency: currency,
  imageUrl: '',
} as Property);

const makePropertyMetrics = (
  id: string,
  currentEstimatedValue: number,
  currency: 'USD' | 'EUR'
): PropertyMetrics => ({
  id,
  name: id,
  city: 'City',
  country: 'Test',
  valuationDisplayCurrency: currency,
  operatingDisplayCurrency: 'EUR',
  currentEstimatedValue,
  mortgageBalance: 0,
  equity: currentEstimatedValue,
  investedCapital: currentEstimatedValue,
  equityPercentage: 100,
  annualRentalIncome: 120,
  totalAnnualExpenses: 24,
  actualTrailing12MonthsExpenses: 24,
  projectedNext12MonthsExpenses: 24,
  monthlyExpensesEquivalent: 2,
  netMonthlyCashflow: 8,
  grossYield: 5,
  netYield: 4,
  roce: 3,
});

test('passes through primary metrics and keeps total assets distinct from net worth', () => {
  const result = buildDashboardViewModel({
    metrics,
    properties: [],
    propertyMetrics: [],
    alerts: [],
    debtPaydown,
    rateOverrides: { EUR: 1, USD: 0.8, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(result.primary.netWorth, metrics.totalNetWorth);
  assert.equal(result.primary.netMonthlyCashflow, metrics.totalNetMonthlyCashflow);
  assert.equal(result.primary.totalEquity, metrics.totalEquity);
  assert.equal(result.primary.totalDebt, metrics.totalDebt);
  assert.equal(result.totalAssets, 1300);
  assert.notEqual(result.totalAssets, result.primary.netWorth);
  assert.deepEqual(result.debtPaydown, debtPaydown);
});

test('normalizes reserve cash into operating currency and exposes transparent health measures', () => {
  const properties = [
    makeProperty('first', 'First', 600, 'USD'),
    makeProperty('second', 'Second', 320, 'EUR'),
  ];
  const propertyMetrics = [
    makePropertyMetrics('first', 600, 'USD'),
    makePropertyMetrics('second', 320, 'EUR'),
  ];
  const result = buildDashboardViewModel({
    metrics,
    properties,
    propertyMetrics,
    alerts: [],
    debtPaydown,
    rateOverrides: { EUR: 1, USD: 0.8, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(result.health.reserveMonths, 4);
  assert.ok(Math.abs((result.health.reserveCoveragePct ?? 0) - 66.6666666667) < 0.0001);
  assert.equal(result.health.propertyConcentrationPct, 60);
  assert.ok(Math.abs((result.health.liquidityPct ?? 0) - (100 / 1300) * 100) < 0.0001);
  assert.equal(result.health.debtToValuePct, metrics.debtToValueRatio);
});

test('preserves stored property order and limits the compact summary to three items', () => {
  const properties = [
    makeProperty('zeta', 'Zeta', 100, 'USD'),
    makeProperty('alpha', 'Alpha', 200, 'USD'),
    makeProperty('middle', 'Middle', 300, 'USD'),
    makeProperty('last', 'Last', 400, 'USD'),
  ];
  const propertyMetrics = properties.map((property) =>
    makePropertyMetrics(property.id, property.currentEstimatedValue, 'USD')
  );
  const result = buildDashboardViewModel({
    metrics,
    properties,
    propertyMetrics,
    alerts: [],
    debtPaydown,
  });

  assert.deepEqual(result.properties.map((property) => property.id), ['zeta', 'alpha', 'middle']);
  assert.equal(result.totalPropertyCount, 4);
});

test('keeps Portfolio History and Recent Activity truthfully unavailable', () => {
  const result = buildDashboardViewModel({
    metrics,
    properties: [],
    propertyMetrics: [],
    alerts: [],
    debtPaydown,
  });

  assert.equal(DASHBOARD_HISTORY_AVAILABLE, false);
  assert.equal(DASHBOARD_ACTIVITY_AVAILABLE, false);
  assert.equal(result.historyAvailable, false);
  assert.equal(result.activityAvailable, false);
});

const debtPaydownTranslations: Record<string, string> = {
  'dashboardUi.perYear': 'año',
  'dashboardUi.debtPaydownDescription': 'Capital amortizado.',
  'dashboardUi.debtPaydownNoActive': 'No hay hipotecas activas.',
  'dashboardUi.debtPaydownUnavailable': 'Faltan datos.',
};

const translateDebtPaydown = (
  key: string,
  replacements?: Record<string, string | number>
) => {
  if (key === 'dashboardUi.debtPaydownCoverage') {
    return `Calculado con ${replacements?.eligible} de ${replacements?.candidates} hipotecas`;
  }

  return debtPaydownTranslations[key] ?? key;
};

test('builds debt paydown card copy without a coverage message for full coverage', () => {
  const result = buildDashboardDebtPaydownPresentation(
    {
      ...debtPaydown,
      candidateMortgageCount: 2,
      eligibleMortgageCount: 2,
    },
    (value) => `€${value.toLocaleString('en-US')}`,
    translateDebtPaydown
  );

  assert.equal(result.mainValue, '€1,600');
  assert.equal(result.perYearLabel, 'año');
  assert.equal(result.nextPaymentValue, '€125');
  assert.equal(result.coverageLabel, null);
});

test('builds debt paydown card copy for partial, unavailable, and no-active coverage', () => {
  const partial = buildDashboardDebtPaydownPresentation(
    {
      ...debtPaydown,
      candidateMortgageCount: 3,
      eligibleMortgageCount: 2,
    },
    (value) => `€${value}`,
    translateDebtPaydown
  );
  const unavailable = buildDashboardDebtPaydownPresentation(
    {
      ...debtPaydown,
      status: 'unavailable',
      candidateMortgageCount: 1,
      eligibleMortgageCount: 0,
    },
    (value) => `€${value}`,
    translateDebtPaydown
  );
  const noActive = buildDashboardDebtPaydownPresentation(
    {
      ...debtPaydown,
      status: 'no-active-mortgages',
      currentMonthPrincipal: 0,
      next12MonthsPrincipal: 0,
      candidateMortgageCount: 0,
      eligibleMortgageCount: 0,
    },
    (value) => `€${value}`,
    translateDebtPaydown
  );

  assert.equal(partial.coverageLabel, 'Calculado con 2 de 3 hipotecas');
  assert.equal(unavailable.mainValue, '—');
  assert.equal(unavailable.perYearLabel, null);
  assert.equal(unavailable.nextPaymentValue, '—');
  assert.equal(unavailable.description, 'Faltan datos.');
  assert.equal(noActive.description, 'No hay hipotecas activas.');
});
