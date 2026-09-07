import test from 'node:test';
import assert from 'node:assert/strict';
import type { Mortgage, Property, RecurringExpense } from '../src/common/types';
import {
  calculateMortgageDebtPaydown,
  calculateMortgageProjection,
  calculateMortgageSnapshot,
  calculatePortfolioMetrics,
  calculatePropertyFinancials,
  calculateCurrentRate,
  calculateTotalDebt,
  classifyMortgage,
  normalizePropertyRecord,
} from '../src/common/utils/calculations';
import { calculateRecurringExpensePortfolioSummary } from '../src/common/utils/recurringExpenses';
import { getLowMortgageInterestRateWarning, getMortgageFinancialValidationIssues } from '../src/common/utils/financialValidation';
import {
  calculateOpportunityAnalysis,
  createEmptyOpportunity,
} from '../src/common/utils/opportunities';

const closeTo = (actual: number, expected: number, tolerance = 0.000001) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

const amortizedPayment = (principal: number, annualRate: number, months: number) => {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  const factor = (1 + monthlyRate) ** months;
  return principal * ((monthlyRate * factor) / (factor - 1));
};

const balanceAfterPayments = (
  principal: number,
  annualRate: number,
  months: number,
  payments: number
) => {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal * (1 - payments / months);
  const totalFactor = (1 + monthlyRate) ** months;
  return principal * ((totalFactor - (1 + monthlyRate) ** payments) / (totalFactor - 1));
};

const createMortgage = (overrides: Partial<Mortgage> = {}): Mortgage => ({
  id: 'mortgage-1',
  propertyId: 'property-1',
  currency: 'EUR',
  lenderName: 'Test Bank',
  originalLoanAmount: 200000,
  currentBalance: 0,
  interestRate: 3,
  mortgageTermYears: 30,
  mortgageTermMonths: 360,
  totalPayments: 360,
  repaymentFrequency: 'monthly',
  monthlyMortgagePayment: 0,
  initialMonthlyPayment: null,
  regularMonthlyPayment: null,
  mortgageStartDate: '2025-01-01',
  fixedOrVariable: 'fixed',
  mortgageType: 'Fixed',
  initialInterestRate: null,
  initialRateMonths: null,
  baseInterestRate: null,
  currentInterestRate: null,
  maxBonifiedRate: null,
  maxTotalBonificationPoints: null,
  rateNotes: '',
  availableBonifications: [],
  activeBonifications: [],
  notes: '',
  ...overrides,
});

const createProperty = (overrides: Partial<Property> = {}): Property =>
  ({
    id: 'property-1',
    name: 'Test Property',
    address: '1 Test Street',
    city: 'Madrid',
    country: 'Spain',
    currency: 'EUR',
    operatingCurrency: 'EUR',
    propertyValueCurrency: 'EUR',
    purchasePriceCurrency: 'EUR',
    currentEstimatedValueCurrency: 'EUR',
    monthlyRentCurrency: 'EUR',
    rentalDepositCurrency: 'EUR',
    lateFeeCurrency: 'EUR',
    occupancyStatus: 'occupied',
    monthlyRent: 1000,
    annualRent: 0,
    purchasePrice: 100000,
    currentEstimatedValue: 120000,
    totalInitialInvestment: 100000,
    cashInvested: 100000,
    totalCashInvestedForPurchase: 100000,
    hasMortgage: false,
    originalLoanAmount: 0,
    currentMortgageBalance: 0,
    monthlyMortgagePayment: 0,
    recurringExpenses: [],
    annualIBI: 0,
    annualCommunityFees: 0,
    annualHomeInsurance: 0,
    annualLifeInsurance: 0,
    annualRentDefaultInsurance: 0,
    annualNonPaymentInsurance: 0,
    annualManagementFees: 0,
    annualMaintenance: 0,
    annualUtilitiesPaidByOwner: 0,
    annualOtherExpenses: 0,
    annualMortgageInterest: 0,
    annualPrincipalAmortized: 0,
    annualTotalMortgagePaid: 0,
    annualMortgageInterestTax: 0,
    annualDepreciationTax: 0,
    estimatedAnnualTax: 0,
    propertyManagementRate: 0,
    spainOwnershipPercentage: 100,
    spainRentalType: 'long-term',
    spainEstimatedMarginalTaxRate: 0,
    ...overrides,
  } as Property);

test('preserves gross yield as active annual rent divided by current estimated value', () => {
  const financials = calculatePropertyFinancials(
    createProperty({
      monthlyRent: 1_000,
      purchasePrice: 80_000,
      currentEstimatedValue: 120_000,
      occupancyStatus: 'occupied',
    })
  );

  assert.equal(financials.annualRent, 12_000);
  assert.equal(financials.grossYield, 10);
  assert.notEqual(financials.grossYield, 15);
});

const createExpense = (
  expenseType: RecurringExpense['expenseType'],
  amount: number,
  id: string = expenseType
): RecurringExpense => ({
  id,
  expenseType,
  label: expenseType,
  country: 'Spain',
  billingFrequency: 'yearly',
  customBillingFrequencyMonths: null,
  lastKnownAmount: amount,
  lastPaymentDate: '',
  periodCovered: '',
  projectionMode: 'fixed-amount',
  manualAnnualEstimate: null,
  growthFrequency: 'yearly',
  customGrowthFrequencyMonths: null,
  growthPercentage: null,
  nextExpectedUpdateDate: '',
  notes: '',
  documentUrl: null,
  paymentHistory: [],
  customSchedule: [],
});

test('preserves the verified fixed-rate mortgage formula', () => {
  const mortgage = createMortgage();
  const snapshot = calculateMortgageSnapshot(mortgage, new Date('2026-01-01T12:00:00Z'));

  closeTo(snapshot.currentMonthlyPayment ?? 0, amortizedPayment(200000, 3, 360));
  closeTo(snapshot.currentCalculatedBalance, balanceAfterPayments(200000, 3, 360, 12));
  closeTo(snapshot.displayedBalance, snapshot.currentCalculatedBalance);
});

test('uses the contractual balance instead of a saved balance when inputs are verifiable', () => {
  const mortgage = createMortgage({ currentBalance: 100000, currentBalanceEstimated: false });
  const snapshot = calculateMortgageSnapshot(mortgage, new Date('2026-01-01T12:00:00Z'));

  closeTo(snapshot.currentCalculatedBalance, balanceAfterPayments(200000, 3, 360, 12));
  closeTo(snapshot.displayedBalance, snapshot.currentCalculatedBalance);
  assert.equal(snapshot.balanceSource, 'contractual-model');
  assert.equal(snapshot.savedBalance, 100000);
  assert.equal(snapshot.hasMaterialBalanceDifference, true);
});

test('does not let legacy saved zero override a verifiable contractual balance', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const explicitSavedZero = calculateMortgageSnapshot(
    createMortgage({ currentBalance: 0, currentBalanceEstimated: false }),
    today
  );
  const legacyUnspecified = calculateMortgageSnapshot(
    createMortgage({ currentBalance: 0, currentBalanceEstimated: undefined }),
    today
  );

  closeTo(explicitSavedZero.displayedBalance, balanceAfterPayments(200000, 3, 360, 12));
  closeTo(legacyUnspecified.displayedBalance, balanceAfterPayments(200000, 3, 360, 12));
});

test('uses a contractual schedule for legacy monthly mortgages and keeps saved balance as a material reconciliation reference', () => {
  const málaga = createMortgage({
    originalLoanAmount: 190000,
    currentBalance: 189000,
    interestRate: 2.4,
    mortgageTermYears: 30,
    mortgageTermMonths: 360,
    mortgageStartDate: '2024-09-16',
    initialInterestRate: 2.4,
    initialRateMonths: 12,
    baseInterestRate: 3.5,
    monthlyMortgagePayment: 744.09,
    repaymentFrequency: null,
    activeBonifications: [
      { key: 'salary', label: 'Salary', active: true, available: true, bonusPoints: 0.6, status: 'active', notes: '', source: 'fein' },
      { key: 'home', label: 'Home', active: true, available: true, bonusPoints: 0.1, status: 'active', notes: '', source: 'fein' },
      { key: 'life', label: 'Life', active: true, available: true, bonusPoints: 0.1, status: 'active', notes: '', source: 'fein' },
    ],
    maxTotalBonificationPoints: 1.1,
  });
  const snapshot = calculateMortgageSnapshot(málaga, new Date('2026-09-05T12:00:00Z'));

  assert.equal(snapshot.balanceSource, 'contractual-model');
  assert.equal(snapshot.paymentFrequencySource, 'inferred-monthly');
  closeTo(snapshot.displayedBalance, 181704.21305584);
  assert.equal(snapshot.savedBalance, 189000);
  closeTo(snapshot.savedBalanceDifference ?? 0, 7295.78694416);
  assert.equal(snapshot.materialBalanceDifference, 1900);
  assert.equal(snapshot.hasMaterialBalanceDifference, true);
});

test('does not let a saved monthly payment govern a contractual modeled balance', () => {
  const base = {
    currentBalance: 150000,
    mortgageStartDate: '2024-01-01',
    repaymentFrequency: 'monthly' as const,
  };
  const lowSavedPayment = calculateMortgageSnapshot(
    createMortgage({ ...base, monthlyMortgagePayment: 1 }),
    new Date('2026-01-01T12:00:00Z')
  );
  const highSavedPayment = calculateMortgageSnapshot(
    createMortgage({ ...base, monthlyMortgagePayment: 9999 }),
    new Date('2026-01-01T12:00:00Z')
  );

  closeTo(lowSavedPayment.displayedBalance, highSavedPayment.displayedBalance);
  assert.equal(lowSavedPayment.currentMonthlyPayment, 1);
  assert.equal(highSavedPayment.currentMonthlyPayment, 9999);
  closeTo(
    lowSavedPayment.contractualMonthlyPayment ?? 0,
    highSavedPayment.contractualMonthlyPayment ?? 0
  );
});

test('falls back to saved balance and marks unsupported repayment timing unverified', () => {
  const snapshot = calculateMortgageSnapshot(
    createMortgage({ currentBalance: 88000, repaymentFrequency: 'quarterly' }),
    new Date('2026-01-01T12:00:00Z')
  );

  assert.equal(snapshot.balanceSource, 'saved-fallback');
  assert.equal(snapshot.paymentFrequencySource, null);
  assert.equal(snapshot.displayedBalance, 88000);
  assert.equal(classifyMortgage(createMortgage({ currentBalance: 88000, repaymentFrequency: 'quarterly' }), new Date('2026-01-01T12:00:00Z')).status, 'unverified');
});

test('uses the introductory rate then re-amortizes at the post-introductory rate', () => {
  const mortgage = createMortgage({
    fixedOrVariable: 'variable',
    interestRate: 4,
    initialInterestRate: 1,
    initialRateMonths: 12,
    baseInterestRate: 4,
  });
  const duringIntro = calculateMortgageSnapshot(mortgage, new Date('2025-07-01T12:00:00Z'));
  const atTransition = calculateMortgageSnapshot(mortgage, new Date('2026-01-01T12:00:00Z'));
  const transitionBalance = balanceAfterPayments(200000, 1, 360, 12);

  assert.equal(calculateCurrentRate(mortgage, new Date('2025-07-01T12:00:00Z')), 1);
  closeTo(duringIntro.currentMonthlyPayment ?? 0, amortizedPayment(200000, 1, 360));
  closeTo(atTransition.currentCalculatedBalance, transitionBalance);
  assert.equal(atTransition.currentRate, 4);
  closeTo(atTransition.currentMonthlyPayment ?? 0, amortizedPayment(transitionBalance, 4, 348));
});

test('calculates debt paydown from principal only and projects every payment separately', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const mortgage = createMortgage({
    currentBalance: 100000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 700,
  });
  const result = calculateMortgageDebtPaydown({
    mortgages: [mortgage],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });
  const snapshot = calculateMortgageSnapshot(mortgage, today);
  const expectedInterest = snapshot.displayedBalance * (3 / 100 / 12);
  const expectedPayment = amortizedPayment(snapshot.displayedBalance, 3, snapshot.remainingMonths);
  const expectedPrincipal = expectedPayment - expectedInterest;

  assert.equal(result.status, 'available');
  assert.equal(result.candidateMortgageCount, 1);
  assert.equal(result.eligibleMortgageCount, 1);
  assert.equal(result.debtCoverageStatus, 'available');
  assert.equal(result.debtCoveredMortgageCount, 1);
  closeTo(result.currentDebt, snapshot.displayedBalance);
  closeTo(result.currentMonthPrincipal, expectedPrincipal);
  assert.ok(result.next12MonthsPrincipal > expectedPrincipal * 12);
  assert.ok(result.next12MonthsPrincipal < expectedPayment * 12);
  assert.equal(result.mortgages[0].currency, 'EUR');

  const projection = calculateMortgageProjection(mortgage, 12, today);
  closeTo(
    projection.projectedBalance,
    projection.currentBalance - projection.principalPaid
  );
  closeTo(result.next12MonthsInterest, projection.interestPaid);
  closeTo(result.projectedDebtAfter12Months, projection.projectedBalance);
});

test('aggregates eligible mortgages in native currency before FX conversion', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const eurMortgage = createMortgage({
    id: 'mortgage-eur',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 700,
  });
  const usdMortgage = createMortgage({
    id: 'mortgage-usd',
    propertyId: 'property-2',
    currency: 'USD',
    currentBalance: 50000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 400,
  });
  const rates = { EUR: 1, USD: 0.5, ARS: 0.001, GBP: 1.2 } as const;
  const eurOnly = calculateMortgageDebtPaydown({
    mortgages: [eurMortgage],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
    rateOverrides: rates,
  });
  const usdOnly = calculateMortgageDebtPaydown({
    mortgages: [usdMortgage],
    properties: [createProperty({ id: 'property-2' })],
    reportingCurrency: 'EUR',
    today,
    rateOverrides: rates,
  });
  const combined = calculateMortgageDebtPaydown({
    mortgages: [eurMortgage, usdMortgage],
    properties: [createProperty(), createProperty({ id: 'property-2' })],
    reportingCurrency: 'EUR',
    today,
    rateOverrides: rates,
  });

  assert.equal(combined.candidateMortgageCount, 2);
  assert.equal(combined.eligibleMortgageCount, 2);
  closeTo(
    combined.currentMonthPrincipal,
    eurOnly.currentMonthPrincipal + usdOnly.currentMonthPrincipal
  );
  closeTo(
    combined.next12MonthsPrincipal,
    eurOnly.next12MonthsPrincipal + usdOnly.next12MonthsPrincipal
  );
  closeTo(
    combined.next12MonthsInterest,
    eurOnly.next12MonthsInterest + usdOnly.next12MonthsInterest
  );
  closeTo(combined.currentDebt, eurOnly.currentDebt + usdOnly.currentDebt);
  assert.equal(combined.mortgages.find((item) => item.mortgageId === 'mortgage-usd')?.currency, 'USD');
});

test('reports mortgage FX coverage instead of silently converting missing currencies one-to-one', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const eurMortgage = createMortgage({
    id: 'mortgage-eur',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 700,
  });
  const gbpMortgage = createMortgage({
    id: 'mortgage-gbp',
    propertyId: 'property-2',
    currency: 'GBP',
    currentBalance: 50000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 400,
  });
  const result = calculateMortgageDebtPaydown({
    mortgages: [eurMortgage, gbpMortgage],
    properties: [createProperty(), createProperty({ id: 'property-2' })],
    reportingCurrency: 'EUR',
    today,
    rateOverrides: { EUR: 1, USD: 0.9 },
  });

  assert.equal(result.debtCoverageStatus, 'partial');
  assert.equal(result.debtCoveredMortgageCount, 1);
  closeTo(result.currentDebt, calculateMortgageSnapshot(eurMortgage, today).displayedBalance);
  assert.equal(result.candidateMortgageCount, 2);
  assert.equal(result.eligibleMortgageCount, 1);
  assert.equal(result.mortgages.some((item) => item.mortgageId === 'mortgage-gbp'), false);
});

test('counts only conceptually active mortgages as debt paydown candidates', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const active = createMortgage({
    id: 'active',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 700,
  });
  const paidOff = createMortgage({
    id: 'paid-off',
    currentBalance: 0,
    currentBalanceEstimated: false,
    status: 'paid',
  });
  const matured = createMortgage({
    id: 'matured',
    currentBalance: 1000,
    currentBalanceEstimated: true,
    mortgageStartDate: '1990-01-01',
    mortgageTermYears: 1,
    mortgageTermMonths: 12,
    totalPayments: 12,
  });
  const future = createMortgage({
    id: 'future',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    mortgageStartDate: '2027-01-01',
  });
  const result = calculateMortgageDebtPaydown({
    mortgages: [active, paidOff, matured, future],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });

  assert.equal(result.candidateMortgageCount, 1);
  assert.equal(result.eligibleMortgageCount, 1);
});

test('reports partial and unavailable coverage for active mortgages with insufficient data', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const valid = createMortgage({
    id: 'valid',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    monthlyMortgagePayment: 700,
  });
  const incomplete = createMortgage({
    id: 'incomplete',
    propertyId: 'missing-property',
    currentBalance: 50000,
    currentBalanceEstimated: false,
    originalLoanAmount: 0,
    mortgageStartDate: '',
    mortgageTermYears: 0,
    mortgageTermMonths: 0,
    totalPayments: 0,
  });
  const nonMonthly = createMortgage({
    id: 'non-monthly',
    currentBalance: 80000,
    currentBalanceEstimated: false,
    repaymentFrequency: 'quarterly',
  });
  const partial = calculateMortgageDebtPaydown({
    mortgages: [valid, incomplete, nonMonthly],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });
  const unavailable = calculateMortgageDebtPaydown({
    mortgages: [incomplete],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });

  assert.equal(partial.status, 'available');
  assert.equal(partial.candidateMortgageCount, 1);
  assert.equal(partial.eligibleMortgageCount, 1);
  assert.equal(partial.unverifiedMortgageCount, 2);
  assert.equal(unavailable.status, 'no-active-mortgages');
  assert.equal(unavailable.candidateMortgageCount, 0);
  assert.equal(unavailable.eligibleMortgageCount, 0);
  assert.equal(unavailable.currentMonthPrincipal, 0);
  assert.equal(unavailable.next12MonthsPrincipal, 0);
});

test('handles zero interest, stepped rates and a term shorter than twelve payments safely', () => {
  const today = new Date('2026-01-01T12:00:00Z');
  const zeroInterest = createMortgage({
    id: 'zero-interest',
    originalLoanAmount: 1200,
    currentBalance: 1200,
    currentBalanceEstimated: false,
    interestRate: 0,
    mortgageTermYears: 1,
    mortgageTermMonths: 12,
    totalPayments: 12,
    mortgageStartDate: '2025-07-01',
    monthlyMortgagePayment: 200,
  });
  const stepped = createMortgage({
    id: 'stepped',
    currentBalance: 100000,
    currentBalanceEstimated: false,
    fixedOrVariable: 'variable',
    interestRate: 4,
    initialInterestRate: 1,
    initialRateMonths: 12,
    baseInterestRate: 4,
    monthlyMortgagePayment: 600,
  });
  const zeroResult = calculateMortgageDebtPaydown({
    mortgages: [zeroInterest],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });
  const steppedProjection = calculateMortgageProjection(stepped, 2, today);
  const steppedSnapshot = calculateMortgageSnapshot(stepped, today);
  const steppedFirstPayment = amortizedPayment(steppedSnapshot.displayedBalance, 4, steppedSnapshot.remainingMonths);
  const steppedFirstPrincipal = steppedFirstPayment - steppedSnapshot.displayedBalance * (4 / 100 / 12);
  const steppedSecondOpeningBalance = steppedSnapshot.displayedBalance - steppedFirstPrincipal;
  const steppedSecondPayment = amortizedPayment(steppedSecondOpeningBalance, 4, steppedSnapshot.remainingMonths - 1);
  const steppedSecondPrincipal = steppedSecondPayment - steppedSecondOpeningBalance * (4 / 100 / 12);

  assert.equal(zeroResult.currentMonthPrincipal, 100);
  assert.equal(zeroResult.next12MonthsPrincipal, 600);
  assert.equal(steppedProjection.monthsProjected, 2);
  closeTo(
    steppedProjection.principalPaid,
    steppedFirstPrincipal + steppedSecondPrincipal
  );
  for (const value of [
    zeroResult.currentMonthPrincipal,
    zeroResult.next12MonthsPrincipal,
    steppedProjection.projectedBalance,
    steppedProjection.principalPaid,
    steppedProjection.interestPaid,
  ]) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0);
  }
});

test('uses one explicit FX snapshot throughout portfolio calculations', () => {
  const rates = { EUR: 1, USD: 0.5, ARS: 0.001 } as const;
  const property = createProperty({
    country: 'Spain',
    currency: 'EUR',
    operatingCurrency: 'EUR',
    propertyValueCurrency: 'EUR',
    purchasePriceCurrency: 'USD',
    currentEstimatedValueCurrency: 'USD',
    currentEstimatedValue: 100000,
    purchasePrice: 100000,
    monthlyRent: 1000,
    monthlyRentCurrency: 'USD',
    spainEstimatedMarginalTaxRate: 20,
  });
  const mortgage = createMortgage({
    currency: 'USD',
    originalLoanAmount: 50000,
    currentBalance: 50000,
    currentBalanceEstimated: false,
    mortgageStartDate: '2025-01-01',
    mortgageTermYears: 30,
    mortgageTermMonths: 360,
    totalPayments: 360,
    interestRate: 0,
  });
  const metrics = calculatePortfolioMetrics([property], [mortgage], [], [], 'EUR', rates);

  assert.equal(metrics.totalPortfolioValue, 50000);
  closeTo(metrics.totalDebt, calculateMortgageSnapshot(mortgage).displayedBalance * 0.5);
  assert.ok(metrics.totalDebtIn1Year < metrics.totalDebt);
  assert.equal(metrics.totalMonthlyRent, 500);
  assert.equal(metrics.estimatedAnnualTax, 600);
});

test('merges recurring and legacy expense categories without loss or duplication', () => {
  const property = createProperty({
    annualIBI: 1200,
    annualCommunityFees: 600,
    annualHomeInsurance: 240,
    annualMaintenance: 360,
    recurringExpenses: [createExpense('property-tax', 1200)],
  });
  const financials = calculatePropertyFinancials(property);

  assert.equal(financials.annualRecurringExpenses, 2400);
  assert.equal(financials.annualOperatingExpenses, 2160);
  assert.equal(financials.annualInsuranceExpenses, 240);
});

test('sums multiple recurring expenses of the same type', () => {
  const property = createProperty({
    recurringExpenses: [
      createExpense('maintenance', 300, 'maintenance-1'),
      createExpense('maintenance', 200, 'maintenance-2'),
    ],
  });
  const summary = calculateRecurringExpensePortfolioSummary(property);

  assert.equal(summary.projectedNext12Months, 500);
  assert.equal(summary.byType.maintenance.projectedNext12Months, 500);
});

test('floors current-period tax at zero when taxable income is negative', () => {
  const property = createProperty({
    monthlyRent: 500,
    annualIBI: 5000,
    annualCommunityFees: 3000,
    annualHomeInsurance: 1000,
    annualMaintenance: 2000,
    spainEstimatedMarginalTaxRate: 30,
  });
  const financials = calculatePropertyFinancials(property);

  assert.ok(financials.annualNetIncomeBeforeTax < 0);
  assert.equal(financials.estimatedAnnualTax, 0);
  assert.equal(financials.annualAfterTaxCashflow, financials.annualNetCashflow);
});

test('keeps an incomplete mortgage payment split unknown and non-deductible', () => {
  const mortgage = createMortgage({
    originalLoanAmount: 0,
    currentBalance: 100000,
    currentBalanceEstimated: false,
    mortgageStartDate: '',
    mortgageTermYears: 0,
    mortgageTermMonths: 0,
    totalPayments: 0,
    interestRate: 0,
    monthlyMortgagePayment: 700,
  });
  const property = createProperty({
    hasMortgage: true,
    currentMortgageBalance: 100000,
    monthlyMortgagePayment: 700,
    annualIBI: 1200,
  });
  const financials = calculatePropertyFinancials(property, mortgage);

  assert.equal(financials.monthlyMortgageInterest, null);
  assert.equal(financials.monthlyPrincipalAmortized, null);
  assert.equal(financials.annualMortgageInterest, null);
  assert.equal(financials.annualPrincipalAmortized, null);
  assert.equal(financials.annualTotalMortgagePaid, 8400);
  assert.equal(financials.annualDeductibleExpenses, 1200);

  const propertyOnlyFinancials = calculatePropertyFinancials(property);
  assert.equal(propertyOnlyFinancials.annualMortgageInterest, null);
  assert.equal(propertyOnlyFinancials.annualPrincipalAmortized, null);
  assert.equal(propertyOnlyFinancials.annualTotalMortgagePaid, 8400);
  assert.equal(propertyOnlyFinancials.annualDeductibleExpenses, 1200);
});

test('normalization does not turn an incomplete payment into deductible interest', () => {
  const mortgage = createMortgage({
    originalLoanAmount: 0,
    currentBalance: 100000,
    currentBalanceEstimated: false,
    mortgageStartDate: '',
    mortgageTermYears: 0,
    mortgageTermMonths: 0,
    totalPayments: 0,
    interestRate: 0,
    monthlyMortgagePayment: 700,
  });
  const property = createProperty({
    hasMortgage: true,
    currentMortgageBalance: 100000,
    monthlyMortgagePayment: 700,
    annualIBI: 1200,
  });
  const normalized = normalizePropertyRecord(property, mortgage);
  const recalculated = calculatePropertyFinancials(normalized, mortgage);

  assert.equal(normalized.annualMortgageInterest, null);
  assert.equal(recalculated.annualMortgageInterest, null);
  assert.equal(recalculated.annualDeductibleExpenses, 1200);
});

test('bug #11: break-even sale price includes percentage-based selling costs', () => {
  const opportunity = createEmptyOpportunity({
    askingPrice: 100000,
    estimatedClosingCosts: 5000,
    estimatedRenovationCost: 10000,
    furnitureSetupCost: 5000,
    contingencyPct: 0,
    sellingCostPct: 5,
  });

  const withSellingCosts = calculateOpportunityAnalysis(opportunity);
  const withoutSellingCosts = calculateOpportunityAnalysis({
    ...opportunity,
    sellingCostPct: 0,
  });

  assert.equal(withSellingCosts.breakEvenSalePrice, 120000 / 0.95);
  assert.equal(withoutSellingCosts.breakEvenSalePrice, 120000);
});

test('bug #12: legacy annual recurring expenses retain their exact annual total', () => {
  const annualAmount = 1000;
  const summary = calculateRecurringExpensePortfolioSummary(
    createProperty({ annualCommunityFees: annualAmount, recurringExpenses: [] })
  );
  const migratedExpense = summary.recurringExpenses.find(
    (expense) => expense.expenseType === 'community-fees'
  );

  assert.equal(migratedExpense?.lastKnownAmount, annualAmount / 12);
  assert.equal(summary.projectedNext12Months, annualAmount);
});

test('contractual balance drives displayed amortization while retaining the saved balance for reconciliation', () => {
  const mortgage = createMortgage({
    originalLoanAmount: 200_000,
    currentBalance: 150_000,
    currentBalanceEstimated: false,
    mortgageStartDate: '2024-01-01',
  });
  const snapshot = calculateMortgageSnapshot(mortgage, new Date(2026, 0, 1, 12));

  assert.equal(snapshot.balanceSource, 'contractual-model');
  assert.equal(snapshot.savedBalance, 150_000);
  assert.notEqual(snapshot.displayedBalance, 150_000);
  assert.equal(snapshot.displayedBalance, snapshot.modeledBalance);
  assert.equal(snapshot.principalAmortized, 200_000 - snapshot.displayedBalance);
  assert.equal(snapshot.modeledPrincipalAmortized, 200_000 - snapshot.modeledBalance);
  assert.equal(snapshot.hasMaterialBalanceDifference, true);
});

test('central mortgage classification excludes future, matured, paid, and unverified balances from active debt', () => {
  const today = new Date(2026, 0, 15, 12);
  const active = createMortgage({ id: 'active', currentBalance: 80_000, currentBalanceEstimated: false });
  const future = createMortgage({ id: 'future', currentBalance: 70_000, currentBalanceEstimated: false, mortgageStartDate: '2027-01-01' });
  const matured = createMortgage({ id: 'matured', currentBalance: 60_000, currentBalanceEstimated: false, mortgageStartDate: '2020-01-01', mortgageTermYears: 1, mortgageTermMonths: 12, totalPayments: 12 });
  const paid = createMortgage({ id: 'paid', currentBalance: 0, currentBalanceEstimated: false, status: 'paid' });
  const paidWithLegacyBalance = createMortgage({ id: 'paid-legacy', currentBalance: 40_000, currentBalanceEstimated: false, status: 'paid' });
  const unverified = createMortgage({ id: 'unverified', currentBalance: 50_000, currentBalanceEstimated: false, mortgageStartDate: '', mortgageTermYears: 0, mortgageTermMonths: 0, totalPayments: 0 });

  assert.equal(classifyMortgage(active, today).status, 'active');
  assert.equal(classifyMortgage(future, today).status, 'future');
  assert.equal(classifyMortgage(matured, today).status, 'matured');
  assert.equal(classifyMortgage(paid, today).status, 'paid');
  assert.equal(classifyMortgage(paidWithLegacyBalance, today).status, 'paid');
  assert.equal(classifyMortgage(paidWithLegacyBalance, today).dataConflict, 'paid-with-positive-balance');
  assert.equal(classifyMortgage(unverified, today).status, 'unverified');
  const activeBalance = calculateMortgageSnapshot(active, today).displayedBalance;
  closeTo(calculateTotalDebt([active, future, matured, paid, paidWithLegacyBalance, unverified], undefined, today), activeBalance);

  const paydown = calculateMortgageDebtPaydown({
    mortgages: [active, future, matured, paid, paidWithLegacyBalance, unverified],
    properties: [createProperty()],
    reportingCurrency: 'EUR',
    today,
  });
  closeTo(paydown.currentDebt, activeBalance);
  assert.equal(paydown.unverifiedMortgageCount, 1);
  assert.equal(paydown.unverifiedOutstandingBalance, 50_000);
  assert.equal(paydown.paidMortgageConflictCount, 1);
  assert.equal(paydown.paidMortgageConflictBalance, 40_000);
  assert.equal(paydown.debtCoverageStatus, 'partial');
});

test('mortgage elapsed months use civil dates at exact and adjacent anniversaries', () => {
  const mortgage = createMortgage({ mortgageStartDate: '2025-01-15', currentBalanceEstimated: true });
  assert.equal(calculateMortgageSnapshot(mortgage, new Date(2026, 0, 14, 12)).elapsedMonths, 11);
  assert.equal(calculateMortgageSnapshot(mortgage, new Date(2026, 0, 15, 12)).elapsedMonths, 12);
  assert.equal(calculateMortgageSnapshot(mortgage, new Date(2026, 0, 16, 12)).elapsedMonths, 12);
  assert.equal(calculateMortgageSnapshot(mortgage, new Date(2025, 0, 15, 0, 30)).elapsedMonths, 0);
});

test('derived percentage management fees reconcile monthly and annual expense routes without duplication', () => {
  const property = createProperty({
    monthlyRent: 1_000,
    propertyManagementRate: 0.1,
    annualIBI: 1_200,
    recurringExpenses: [createExpense('property-tax', 1_200)],
  });
  const financials = calculatePropertyFinancials(property);
  assert.equal(financials.annualManagementFees, 1_200);
  assert.equal(financials.annualRecurringExpenses, 2_400);
  assert.equal(financials.totalMonthlyExpenses * 12, financials.totalAnnualExpenses);
  assert.equal(financials.annualNetCashflow, 9_600);
  assert.equal(financials.netYield, 8);
  assert.equal(financials.roce, 9.6);
});

test('interest-rate inputs preserve human percentages and only warn for extremely low valid rates', () => {
  assert.equal(getLowMortgageInterestRateWarning(0), null);
  assert.match(getLowMortgageInterestRateWarning(0.02) ?? '', /2%/);
  assert.equal(getLowMortgageInterestRateWarning(0.5), null);
  assert.equal(getLowMortgageInterestRateWarning(2), null);
  assert.equal(getLowMortgageInterestRateWarning(2.4), null);
  assert.match(getMortgageFinancialValidationIssues(createMortgage({ interestRate: -1 })).join(' '), /negative/);
  assert.match(getMortgageFinancialValidationIssues(createMortgage({ interestRate: Number.POSITIVE_INFINITY })).join(' '), /finite/);
  assert.match(getMortgageFinancialValidationIssues(createMortgage({ interestRate: 101 })).join(' '), /100%/);
});
