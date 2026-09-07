import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CashAccount,
  Property,
  PropertyMetrics,
} from '../src/common/types';
import type { MortgageDebtPaydownSummary } from '../src/common/utils/calculations';
import { buildPropertiesOnlyDashboardViewModel } from '../src/platforms/web/pages/propertiesOnlyDashboardViewModel';

const property = (
  id: string,
  occupancyStatus: Property['occupancyStatus'] | string,
  currentEstimatedValue = 100_000
): Property => ({
  id,
  name: `Property ${id}`,
  city: 'Madrid',
  country: 'Spain',
  currency: 'EUR',
  operatingCurrency: 'EUR',
  propertyValueCurrency: 'EUR',
  currentEstimatedValueCurrency: 'EUR',
  occupancyStatus,
  currentEstimatedValue,
  imageUrl: '',
} as Property);

const propertyMetric = (
  id: string,
  {
    currency = 'EUR',
    monthlyRent,
    monthlyExpenses,
    currentEstimatedValue = 100_000,
    grossYield = 12,
  }: {
    currency?: PropertyMetrics['operatingDisplayCurrency'];
    monthlyRent: number;
    monthlyExpenses: number;
    currentEstimatedValue?: number;
    grossYield?: number;
  }
): PropertyMetrics => ({
  id,
  name: `Property ${id}`,
  city: 'Madrid',
  country: 'Spain',
  valuationDisplayCurrency: currency,
  operatingDisplayCurrency: currency,
  currentEstimatedValue,
  mortgageBalance: 0,
  equity: currentEstimatedValue,
  investedCapital: currentEstimatedValue,
  equityPercentage: 100,
  annualRentalIncome: monthlyRent * 12,
  totalAnnualExpenses: monthlyExpenses * 12,
  actualTrailing12MonthsExpenses: monthlyExpenses * 12,
  projectedNext12MonthsExpenses: monthlyExpenses * 12,
  monthlyExpensesEquivalent: monthlyExpenses,
  netMonthlyCashflow: monthlyRent - monthlyExpenses,
  grossYield,
  netYield: grossYield,
  roce: grossYield,
});

const debtPaydown: MortgageDebtPaydownSummary = {
  currentMonthPrincipal: 0,
  next12MonthsPrincipal: 0,
  next12MonthsInterest: 0,
  currentDebt: 0,
  projectedDebtAfter12Months: 0,
  reportingCurrency: 'EUR',
  status: 'no-active-mortgages',
  debtCoverageStatus: 'available',
  candidateMortgageCount: 0,
  eligibleMortgageCount: 0,
  debtCoveredMortgageCount: 0,
  mortgages: [],
};

const cashAccount = (overrides: Partial<CashAccount>): CashAccount => ({
  id: 'cash-1',
  nickname: 'Cash',
  institutionName: 'Bank',
  accountType: 'checking',
  currency: 'EUR',
  currentBalance: 0,
  availableBalance: null,
  sourceType: 'manual',
  status: 'active',
  syncStatus: 'idle',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('derives operating KPIs and table totals from the exact same converted rows', () => {
  const properties = [property('one', 'occupied'), property('two', 'vacant')];
  const metrics = [
    propertyMetric('one', { monthlyRent: 1_000.123456, monthlyExpenses: 123.456789 }),
    propertyMetric('two', { monthlyRent: 0, monthlyExpenses: 45.678912 }),
  ];
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties,
    propertyMetrics: metrics,
    cashAccounts: [],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: Object.freeze({ EUR: 1, USD: 0.9, ARS: 0.001, GBP: 1.2 }),
  });

  const rowRent = viewModel.properties.reduce((sum, row) => sum + (row.monthlyRent ?? 0), 0);
  const rowExpenses = viewModel.properties.reduce(
    (sum, row) => sum + (row.monthlyOperatingExpenses ?? 0),
    0
  );
  const rowResult = viewModel.properties.reduce(
    (sum, row) => sum + (row.monthlyOperatingResult ?? 0),
    0
  );

  assert.equal(viewModel.operating.grossRent.value, rowRent);
  assert.equal(viewModel.operating.expenses.value, rowExpenses);
  assert.equal(viewModel.operating.noi.value, rowResult);
  assert.ok(Math.abs(rowResult - (rowRent - rowExpenses)) < 1e-9);
  assert.equal(viewModel.operating.margin, (rowResult / rowRent) * 100);
  assert.ok(Math.abs((viewModel.operating.grossRent.value ?? 0) - 1_000.123456) < 1e-9);
  assert.notEqual(viewModel.operating.grossRent.value, 1_000.12);
});

test('leaves operating margin unavailable when gross rent is zero', () => {
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties: [property('vacant', 'vacant')],
    propertyMetrics: [
      propertyMetric('vacant', { monthlyRent: 0, monthlyExpenses: 125.25 }),
    ],
    cashAccounts: [],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(viewModel.operating.grossRent.value, 0);
  assert.equal(viewModel.operating.noi.value, -125.25);
  assert.equal(viewModel.operating.margin, null);
});

test('derives equity and LTV from the same covered valuation and debt', () => {
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties: [property('leveraged', 'occupied', 200_000)],
    propertyMetrics: [
      propertyMetric('leveraged', {
        monthlyRent: 1_000,
        monthlyExpenses: 100,
        currentEstimatedValue: 200_000,
      }),
    ],
    cashAccounts: [],
    alerts: [],
    debtPaydown: {
      ...debtPaydown,
      currentDebt: 50_000,
      projectedDebtAfter12Months: 45_000,
      currentMonthPrincipal: 400,
      next12MonthsPrincipal: 5_000,
      next12MonthsInterest: 2_000,
      status: 'available',
      candidateMortgageCount: 1,
      eligibleMortgageCount: 1,
      debtCoveredMortgageCount: 1,
    },
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(viewModel.valuation.value, 200_000);
  assert.equal(viewModel.debt.current.value, 50_000);
  assert.equal(viewModel.equity.value, 150_000);
  assert.equal(viewModel.equity.ltv, 25);
  assert.equal(viewModel.equity.equityShare, 75);
  assert.equal(viewModel.equity.coverage.status, 'available');
});

test('keeps gross yield based on current value and excludes unavailable yields from ranking', () => {
  const properties = [
    property('ranked', 'occupied', 200_000),
    property('missing-value', 'occupied', 0),
  ];
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties,
    propertyMetrics: [
      propertyMetric('ranked', {
        monthlyRent: 1_000,
        monthlyExpenses: 100,
        currentEstimatedValue: 200_000,
        grossYield: 6,
      }),
      propertyMetric('missing-value', {
        monthlyRent: 1_000,
        monthlyExpenses: 100,
        currentEstimatedValue: 0,
        grossYield: Number.NaN,
      }),
    ],
    cashAccounts: [],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(viewModel.properties[0].grossYield, 6);
  assert.equal(viewModel.properties[1].grossYield, null);
  assert.deepEqual(viewModel.topProperties.map((item) => item.id), ['ranked']);
});

test('uses informed zero available balances, FX-converts before summing, and ignores inactive accounts', () => {
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties: [],
    propertyMetrics: [],
    cashAccounts: [
      cashAccount({ id: 'zero', currency: 'EUR', currentBalance: 900, availableBalance: 0 }),
      cashAccount({ id: 'fallback', currency: 'USD', currentBalance: 200, availableBalance: null }),
      cashAccount({ id: 'undefined-fallback', currency: 'USD', currentBalance: 100, availableBalance: undefined }),
      cashAccount({ id: 'inactive', currency: 'EUR', currentBalance: 5_000, status: 'inactive' }),
    ],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.5, ARS: 0.001, GBP: 1.2 },
  });

  assert.equal(viewModel.liquidity.value, 150);
  assert.equal(viewModel.liquidity.coverage.status, 'available');
  assert.equal(viewModel.liquidity.coverage.coveredCount, 3);
  assert.equal(viewModel.liquidity.coverage.totalCount, 3);
});

test('keeps uncovered FX rows visible and exposes partial and unavailable coverage', () => {
  const properties = [
    property('eur', 'occupied'),
    {
      ...property('gbp', 'occupied'),
      currency: 'GBP' as const,
      operatingCurrency: 'GBP' as const,
      propertyValueCurrency: 'GBP' as const,
      currentEstimatedValueCurrency: 'GBP' as const,
    },
  ];
  const partial = buildPropertiesOnlyDashboardViewModel({
    properties,
    propertyMetrics: [
      propertyMetric('eur', { monthlyRent: 1_000, monthlyExpenses: 100 }),
      propertyMetric('gbp', { currency: 'GBP', monthlyRent: 800, monthlyExpenses: 80 }),
    ],
    cashAccounts: [cashAccount({ currency: 'GBP', currentBalance: 500 })],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9 },
  });

  assert.equal(partial.properties.length, 2);
  assert.equal(partial.properties[1].monthlyRent, null);
  assert.equal(partial.operating.grossRent.value, 1_000);
  assert.equal(partial.operating.grossRent.coverage.status, 'partial');
  assert.equal(partial.liquidity.value, null);
  assert.equal(partial.liquidity.coverage.status, 'unavailable');

  const unavailable = buildPropertiesOnlyDashboardViewModel({
    properties: [properties[1]],
    propertyMetrics: [
      propertyMetric('gbp', { currency: 'GBP', monthlyRent: 800, monthlyExpenses: 80 }),
    ],
    cashAccounts: [],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9 },
  });

  assert.equal(unavailable.properties.length, 1);
  assert.equal(unavailable.properties[0].monthlyRent, null);
  assert.deepEqual(unavailable.operating.grossRent, {
    value: null,
    coverage: { status: 'unavailable', coveredCount: 0, totalCount: 1 },
  });
  assert.equal(unavailable.operating.expenses.coverage.status, 'unavailable');
  assert.equal(unavailable.operating.noi.coverage.status, 'unavailable');
});

test('reconciles occupied, vacant, pending, and unknown states with total properties', () => {
  const properties = [
    property('occupied', 'occupied'),
    property('vacant', 'vacant'),
    property('pending', 'tenant-to-be-confirmed'),
    property('unknown', 'legacy-unknown'),
  ];
  const viewModel = buildPropertiesOnlyDashboardViewModel({
    properties,
    propertyMetrics: properties.map((item) =>
      propertyMetric(item.id, { monthlyRent: 100, monthlyExpenses: 10 })
    ),
    cashAccounts: [],
    alerts: [],
    debtPaydown,
    valuationDisplayCurrency: 'EUR',
    operatingDisplayCurrency: 'EUR',
    fxRates: { EUR: 1, USD: 0.9, ARS: 0.001, GBP: 1.2 },
  });

  assert.deepEqual(viewModel.occupancy, {
    totalCount: 4,
    occupiedCount: 1,
    vacantCount: 1,
    pendingCount: 1,
    unknownCount: 1,
    rate: 25,
  });
  assert.equal(
    viewModel.occupancy.occupiedCount +
      viewModel.occupancy.vacantCount +
      viewModel.occupancy.pendingCount +
      viewModel.occupancy.unknownCount,
    viewModel.occupancy.totalCount
  );
});
