import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property } from '../src/common/types';
import type { AppSettings, FxSnapshot } from '../src/common/types/settings';
import { calculatePortfolioMetrics } from '../src/common/utils/calculations';
import {
  areFxRatesStale,
  buildFxSyncResult,
  createFxSnapshot,
  formatFxTimestampUtc,
  getActiveFxSnapshot,
  getFxWarningMessage,
  getSettingsCurrencyRates,
  hydrateSettingsFxSnapshot,
} from '../src/common/utils/fxRates';
import { setCurrentSettings, DEFAULT_SETTINGS } from '../src/common/utils/settingsStore';

const buildSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

const createProperty = (overrides: Partial<Property>): Property => ({
  id: overrides.id ?? 'property',
  currency: overrides.currency ?? 'EUR',
  operatingCurrency: overrides.operatingCurrency ?? overrides.currency ?? 'EUR',
  propertyValueCurrency: overrides.propertyValueCurrency ?? overrides.currency ?? 'EUR',
  purchasePriceCurrency: overrides.purchasePriceCurrency ?? overrides.currency ?? 'EUR',
  currentEstimatedValueCurrency:
    overrides.currentEstimatedValueCurrency ?? overrides.currency ?? 'EUR',
  name: overrides.name ?? 'Property',
  address: overrides.address ?? 'Address 1',
  city: overrides.city ?? 'City',
  country: overrides.country ?? 'Spain',
  purchaseDate: overrides.purchaseDate ?? '2025-01-01',
  occupancyStatus: overrides.occupancyStatus ?? 'occupied',
  notes: overrides.notes ?? '',
  purchasePrice: overrides.purchasePrice ?? 100000,
  itpValueBase: overrides.itpValueBase ?? 100000,
  transferTaxRate: overrides.transferTaxRate ?? 0,
  transferTaxAmount: overrides.transferTaxAmount ?? 0,
  notaryCost: overrides.notaryCost ?? 0,
  registryCost: overrides.registryCost ?? 0,
  agencyFees: overrides.agencyFees ?? 0,
  totalPurchaseCost: overrides.totalPurchaseCost ?? 100000,
  renovationConservation: overrides.renovationConservation ?? 0,
  renovationImprovements: overrides.renovationImprovements ?? 0,
  furnishingAndOther: overrides.furnishingAndOther ?? 0,
  totalInitialInvestment: overrides.totalInitialInvestment ?? 100000,
  currentEstimatedValue: overrides.currentEstimatedValue ?? 100000,
  cashInvested: overrides.cashInvested ?? 100000,
  monthlyRent: overrides.monthlyRent ?? 1000,
  monthlyRentCurrency: overrides.monthlyRentCurrency ?? overrides.currency ?? 'EUR',
  annualRent: overrides.annualRent ?? 12000,
  annualIncomeGrowthRate: overrides.annualIncomeGrowthRate ?? 0,
  expectedRentGrowthPct: overrides.expectedRentGrowthPct ?? 0,
  expectedAnnualAppreciationPct: overrides.expectedAnnualAppreciationPct ?? 0,
  expectedPropertyAppreciationPct: overrides.expectedPropertyAppreciationPct ?? 0,
  lastRentUpdateDate: overrides.lastRentUpdateDate ?? '',
  lastPropertyValuationDate: overrides.lastPropertyValuationDate ?? '',
  communityMonthly: overrides.communityMonthly ?? 0,
  communityAnnual: overrides.communityAnnual ?? 0,
  ibiAndLocalTaxesMonthly: overrides.ibiAndLocalTaxesMonthly ?? 0,
  ibiAndLocalTaxesAnnual: overrides.ibiAndLocalTaxesAnnual ?? 0,
  homeInsuranceMonthly: overrides.homeInsuranceMonthly ?? 0,
  homeInsuranceAnnual: overrides.homeInsuranceAnnual ?? 0,
  propertyManagementRate: overrides.propertyManagementRate ?? 0,
  maintenanceMonthly: overrides.maintenanceMonthly ?? 0,
  maintenanceAnnual: overrides.maintenanceAnnual ?? 0,
  otherOperatingExpensesMonthly: overrides.otherOperatingExpensesMonthly ?? 0,
  otherOperatingExpensesAnnual: overrides.otherOperatingExpensesAnnual ?? 0,
  totalOperatingExpensesMonthly: overrides.totalOperatingExpensesMonthly ?? 200,
  totalOperatingExpensesAnnual: overrides.totalOperatingExpensesAnnual ?? 2400,
  annualExpenseGrowthRate: overrides.annualExpenseGrowthRate ?? 0,
  expectedCommunityGrowthPct: overrides.expectedCommunityGrowthPct ?? 0,
  expectedInsuranceGrowthPct: overrides.expectedInsuranceGrowthPct ?? 0,
  expectedTaxGrowthPct: overrides.expectedTaxGrowthPct ?? 0,
  expectedMaintenanceGrowthPct: overrides.expectedMaintenanceGrowthPct ?? 0,
  acquisitionTaxes: overrides.acquisitionTaxes ?? 0,
  notaryAndRegistryCosts: overrides.notaryAndRegistryCosts ?? 0,
  renovationCosts: overrides.renovationCosts ?? 0,
  furnishingCosts: overrides.furnishingCosts ?? 0,
  annualIBI: overrides.annualIBI ?? 0,
  annualHomeInsurance: overrides.annualHomeInsurance ?? 0,
  annualLifeInsurance: overrides.annualLifeInsurance ?? 0,
  annualRentDefaultInsurance: overrides.annualRentDefaultInsurance ?? 0,
  annualNonPaymentInsurance: overrides.annualNonPaymentInsurance ?? 0,
  annualCommunityFees: overrides.annualCommunityFees ?? 0,
  annualManagementFees: overrides.annualManagementFees ?? 0,
  annualMaintenance: overrides.annualMaintenance ?? 0,
  annualUtilitiesPaidByOwner: overrides.annualUtilitiesPaidByOwner ?? 0,
  annualOtherExpenses: overrides.annualOtherExpenses ?? 0,
  annualMortgageInterest: overrides.annualMortgageInterest ?? 0,
  annualPrincipalAmortized: overrides.annualPrincipalAmortized ?? 0,
  annualTotalMortgagePaid: overrides.annualTotalMortgagePaid ?? 0,
  oneTimeTenantPlacementFee: overrides.oneTimeTenantPlacementFee ?? 0,
  rentalDeposit: overrides.rentalDeposit ?? 0,
  rentalDepositCurrency: overrides.rentalDepositCurrency ?? overrides.currency ?? 'EUR',
  lateFeeAmount: overrides.lateFeeAmount ?? 0,
  lateFeeCurrency: overrides.lateFeeCurrency ?? overrides.currency ?? 'EUR',
  furnitureCost: overrides.furnitureCost ?? 0,
  totalCashInvestedForPurchase: overrides.totalCashInvestedForPurchase ?? 0,
  hasMortgage: overrides.hasMortgage ?? false,
  originalLoanAmount: overrides.originalLoanAmount ?? 0,
  currentMortgageBalance: overrides.currentMortgageBalance ?? 0,
  monthlyMortgagePayment: overrides.monthlyMortgagePayment ?? 0,
  loanToValueAtPurchase: overrides.loanToValueAtPurchase ?? 0,
  mortgageTermYears: overrides.mortgageTermYears ?? 0,
  initialInterestRateYear1: overrides.initialInterestRateYear1 ?? 0,
  interestType: overrides.interestType ?? '',
  baseRateWithoutBonificationsAfterYear1: overrides.baseRateWithoutBonificationsAfterYear1 ?? 0,
  maxBonifiedRateAfterYear1: overrides.maxBonifiedRateAfterYear1 ?? 0,
  monthlyMortgagePaymentYear1: overrides.monthlyMortgagePaymentYear1 ?? 0,
  monthlyMortgagePaymentWithoutBonificationsReference:
    overrides.monthlyMortgagePaymentWithoutBonificationsReference ?? 0,
  monthlyMortgagePaymentWithMaxBonificationsReference:
    overrides.monthlyMortgagePaymentWithMaxBonificationsReference ?? 0,
  firstYearInterestAnnual: overrides.firstYearInterestAnnual ?? 0,
  firstYearPrincipalAnnual: overrides.firstYearPrincipalAnnual ?? 0,
  propertyValuationForMortgage: overrides.propertyValuationForMortgage ?? 0,
  mortgageAppraisalCost: overrides.mortgageAppraisalCost ?? 0,
  registryCheckCost: overrides.registryCheckCost ?? 0,
  estimatedAnnualHomeInsuranceForBank: overrides.estimatedAnnualHomeInsuranceForBank ?? 0,
  estimatedAnnualLifeInsurance: overrides.estimatedAnnualLifeInsurance ?? 0,
  estimatedAnnualPaymentProtectionInsurance:
    overrides.estimatedAnnualPaymentProtectionInsurance ?? 0,
  cadastralValueTotal: overrides.cadastralValueTotal ?? 0,
  cadastralConstructionValue: overrides.cadastralConstructionValue ?? 0,
  cadastralLandValue: overrides.cadastralLandValue ?? 0,
  annualTaxableRentalIncome: overrides.annualTaxableRentalIncome ?? 12000,
  annualDeductibleExpenses: overrides.annualDeductibleExpenses ?? 2400,
  annualDepreciationTax: overrides.annualDepreciationTax ?? 0,
  annualMortgageInterestTax: overrides.annualMortgageInterestTax ?? 0,
  annualNetTaxableIncome: overrides.annualNetTaxableIncome ?? 9600,
  taxReductionPercentage: overrides.taxReductionPercentage ?? 0,
  marginalTaxRate: overrides.marginalTaxRate ?? 0,
  estimatedAnnualTax: overrides.estimatedAnnualTax ?? 0,
  taxNotes: overrides.taxNotes ?? '',
  grossYield: overrides.grossYield ?? 0,
  netYield: overrides.netYield ?? 0,
  monthlyCashflow: overrides.monthlyCashflow ?? 800,
  roceYear1: overrides.roceYear1 ?? 0,
  rocePlusAppreciation5Years: overrides.rocePlusAppreciation5Years ?? 0,
  rocePlusAppreciation10Years: overrides.rocePlusAppreciation10Years ?? 0,
  rocePlusAppreciation15Years: overrides.rocePlusAppreciation15Years ?? 0,
  mortgageVsRentPercentage: overrides.mortgageVsRentPercentage ?? 0,
  cashflowVsRentPercentage: overrides.cashflowVsRentPercentage ?? 0,
  imageUrl: overrides.imageUrl ?? '',
  imageUrls: overrides.imageUrls ?? [],
  primaryImageIndex: overrides.primaryImageIndex ?? 0,
});

test('requires a complete snapshot even when a legacy fetched timestamp is from today', () => {
  const now = new Date('2026-04-14T12:00:00.000Z');

  assert.equal(areFxRatesStale({ fxRatesFetchedAt: null }, now), true);
  assert.equal(
    areFxRatesStale({ fxRatesFetchedAt: '2026-04-14T08:00:00.000Z' }, now),
    true
  );
  assert.equal(
    areFxRatesStale({ fxRatesFetchedAt: '2026-04-12T08:00:00.000Z' }, now),
    true
  );
});

test('applies fetched FX snapshot as centralized rates', () => {
  const settings = buildSettings();
  const snapshot: FxSnapshot = createFxSnapshot({
    provider: 'Frankfurter',
    rates: { EUR: 1, USD: 0.8, ARS: 0.0012, GBP: 0.7 },
    fetchedAt: '2026-04-14T12:00:00.000Z',
    lastSuccessfulUpdateAt: '2026-04-14T12:00:00.000Z',
    status: 'fresh',
  });

  const result = buildFxSyncResult(settings, snapshot);

  assert.equal(result.nextSettings.usdToEurRate, 1.25);
  assert.equal(result.nextSettings.arsToEurRate, 833.3333333333334);
  assert.equal(result.nextSettings.fxRatesFetchedAt, '2026-04-14T12:00:00.000Z');
  assert.equal(result.nextSettings.fxSnapshot?.lastSuccessfulUpdateAt, '2026-04-14T12:00:00.000Z');
  assert.equal(result.warning, null);
});

test('falls back to cached FX rates with a warning when refresh fails', () => {
  const settings = buildSettings({
    fxSnapshot: createFxSnapshot({
      provider: 'Frankfurter',
      rates: { EUR: 1, USD: 0.81, ARS: 0.0011, GBP: 0.7 },
      fetchedAt: '2026-04-13T11:00:00.000Z',
      lastSuccessfulUpdateAt: '2026-04-13T11:00:00.000Z',
      status: 'fresh',
    }),
    usdToEurRate: 0.81,
    arsToEurRate: 0.0011,
    fxRatesFetchedAt: '2026-04-13T11:00:00.000Z',
  });

  const result = buildFxSyncResult(settings, null, new Error('network down'), new Date('2026-04-14T12:00:00.000Z'));

  assert.equal(result.nextSettings.usdToEurRate, 1.2345679012345678);
  assert.equal(result.nextSettings.arsToEurRate, 909.090909090909);
  assert.equal(result.usedCachedRates, true);
  assert.equal(result.warning, 'FX rates are stale. Last successful update: 2026-04-13 11:00 UTC.');
});

test('keeps fresh cached FX rates without marking them stale', () => {
  const now = new Date('2026-04-14T12:00:00.000Z');
  const settings = buildSettings({
    fxSnapshot: createFxSnapshot({
      provider: 'Frankfurter',
      rates: { EUR: 1, USD: 0.82, ARS: 0.00115, GBP: 0.7 },
      fetchedAt: '2026-04-14T11:30:00.000Z',
      lastSuccessfulUpdateAt: '2026-04-14T11:30:00.000Z',
      status: 'fresh',
    }),
    usdToEurRate: 0.82,
    arsToEurRate: 0.00115,
    fxRatesFetchedAt: '2026-04-14T11:30:00.000Z',
  });

  const result = buildFxSyncResult(settings, null, new Error('temporary outage'), now);

  assert.equal(result.usedCachedRates, true);
  assert.equal(result.shouldRefresh, false);
  assert.equal(result.warning, 'FX refresh failed. Using cached rates from 2026-04-14 11:30 UTC.');
});

test('warns clearly when refresh fails and no valid cached FX rates exist', () => {
  const now = new Date('2026-04-14T12:00:00.000Z');
  const settings = buildSettings({
    usdToEurRate: 0,
    arsToEurRate: 0,
    fxRatesFetchedAt: null,
  });

  const result = buildFxSyncResult(settings, null, new Error('network down'), now);

  assert.equal(result.usedCachedRates, false);
  assert.equal(result.shouldRefresh, true);
  assert.match(result.warning ?? '', /no valid cached rates are available/i);
  assert.match(result.warning ?? '', /network down/i);
});

test('legacy cache with timestamps is migrated into a validated FX snapshot on reload', () => {
  const restored = hydrateSettingsFxSnapshot(
    buildSettings({
      usdToEurRate: 0.84,
      arsToEurRate: 0.00114,
      usdToEurRateUpdatedAt: '2026-04-13T18:10:00.000Z',
      arsToEurRateUpdatedAt: '2026-04-13T18:10:00.000Z',
      fxRatesFetchedAt: '2026-04-13T18:10:00.000Z',
      fxSnapshot: null,
    }),
    new Date('2026-04-14T10:00:00.000Z')
  );

  assert.equal(restored.fxSnapshot?.provider, 'manual (legacy cache)');
  assert.equal(restored.fxSnapshot?.lastSuccessfulUpdateAt, '2026-04-13T18:10:00.000Z');
  assert.equal(restored.fxSnapshot?.status, 'stale');
});

test('snapshot rates are inverted into to-EUR settings values', () => {
  const settings = buildSettings();
  const snapshot = createFxSnapshot({
    provider: 'Frankfurter',
    rates: { EUR: 1, USD: 1.1782, ARS: 1602.368416, GBP: 0.86 },
    fetchedAt: '2026-04-14T12:00:00.000Z',
    lastSuccessfulUpdateAt: '2026-04-14T12:00:00.000Z',
    status: 'fresh',
  });

  const result = buildFxSyncResult(settings, snapshot);

  assert.equal(Math.round(result.nextSettings.usdToEurRate * 10000) / 10000, 0.8488);
  assert.equal(Math.round(result.nextSettings.arsToEurRate * 1000000000) / 1000000000, 0.000624076);
});

test('legacy cache without timestamps is rejected as invalid fallback', () => {
  const settings = buildSettings({
    usdToEurRate: 0.84,
    arsToEurRate: 0.00114,
    usdToEurRateUpdatedAt: null,
    arsToEurRateUpdatedAt: null,
    fxRatesFetchedAt: null,
    fxSnapshot: null,
  });

  assert.equal(getActiveFxSnapshot(settings), null);

  const result = buildFxSyncResult(settings, null, new Error('provider offline'), new Date('2026-04-14T12:00:00.000Z'));
  assert.match(result.warning ?? '', /no valid cached rates are available/i);
});

test('warning formatter shows the real UTC timestamp', () => {
  const snapshot = createFxSnapshot({
    provider: 'Frankfurter',
    rates: { EUR: 1, USD: 0.82, ARS: 0.00115, GBP: 0.7 },
    fetchedAt: '2026-04-14T09:32:00.000Z',
    lastSuccessfulUpdateAt: '2026-04-14T09:32:00.000Z',
    status: 'cached',
  });

  assert.equal(formatFxTimestampUtc('2026-04-14T09:32:00.000Z'), '2026-04-14 09:32 UTC');
  assert.equal(
    getFxWarningMessage(snapshot, new Error('timeout'), new Date('2026-04-14T12:00:00.000Z')),
    'FX refresh failed. Using cached rates from 2026-04-14 09:32 UTC.'
  );
});

test('invalid provider response does not corrupt an existing FX cache', () => {
  const cachedSnapshot = createFxSnapshot({
    provider: 'Frankfurter',
    rates: { EUR: 1, USD: 0.82, ARS: 0.00115, GBP: 0.7 },
    fetchedAt: '2026-04-14T09:32:00.000Z',
    lastSuccessfulUpdateAt: '2026-04-14T09:32:00.000Z',
    status: 'fresh',
  });
  const settings = buildSettings({
    fxSnapshot: cachedSnapshot,
    usdToEurRate: 0.82,
    arsToEurRate: 0.00115,
    fxRatesFetchedAt: '2026-04-14T09:32:00.000Z',
  });

  const invalidSnapshot = {
    provider: 'Broken Provider',
    fetchedAt: '2026-04-14T12:00:00.000Z',
    lastSuccessfulUpdateAt: '2026-04-14T12:00:00.000Z',
    status: 'fresh',
    rates: [{ baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 0 }],
  } as unknown as FxSnapshot;

  const result = buildFxSyncResult(
    settings,
    invalidSnapshot,
    new Error('invalid provider response'),
    new Date('2026-04-14T12:05:00.000Z')
  );

  assert.equal(result.nextSettings.fxSnapshot?.provider, 'Frankfurter');
  assert.equal(result.nextSettings.fxSnapshot?.lastSuccessfulUpdateAt, '2026-04-14T09:32:00.000Z');
  assert.match(result.warning ?? '', /Using cached rates from 2026-04-14 09:32 UTC/i);
});

test('cashflow calculations use centralized FX rates from settings', () => {
  setCurrentSettings(
    buildSettings({
      fxSnapshot: createFxSnapshot({
        provider: 'Frankfurter',
        rates: { EUR: 1, USD: 2, ARS: 500, GBP: 0.8 },
        fetchedAt: '2026-04-14T12:00:00.000Z',
        lastSuccessfulUpdateAt: '2026-04-14T12:00:00.000Z',
        status: 'fresh',
      }),
      usdToEurRate: 0.5,
      arsToEurRate: 0.002,
      fxRatesFetchedAt: '2026-04-14T12:00:00.000Z',
    })
  );

  const eurProperty = createProperty({
    id: 'eur-property',
    currency: 'EUR',
    operatingCurrency: 'EUR',
    monthlyRent: 1000,
    monthlyMortgagePayment: 50,
    ibiAndLocalTaxesAnnual: 1200,
  });
  const arsProperty = createProperty({
    id: 'ars-property',
    currency: 'ARS',
    operatingCurrency: 'ARS',
    propertyValueCurrency: 'ARS',
    purchasePriceCurrency: 'ARS',
    currentEstimatedValueCurrency: 'ARS',
    monthlyRent: 100000,
    monthlyRentCurrency: 'ARS',
    monthlyMortgagePayment: 25000,
    ibiAndLocalTaxesAnnual: 120000,
    currentEstimatedValue: 10000000,
    purchasePrice: 10000000,
    totalPurchaseCost: 10000000,
    totalInitialInvestment: 10000000,
    cashInvested: 10000000,
  });

  const metrics = calculatePortfolioMetrics([eurProperty, arsProperty], [], [], [], 'EUR');
  const swappedMetrics = calculatePortfolioMetrics([arsProperty, eurProperty], [], [], [], 'EUR');

  assert.equal(getSettingsCurrencyRates(DEFAULT_SETTINGS).USD > 0, true);
  assert.equal(metrics.operatingDisplayCurrency, 'EUR');
  assert.equal(swappedMetrics.operatingDisplayCurrency, 'EUR');
  assert.equal(Math.round(metrics.totalMonthlyRent), 1200);
  assert.equal(Math.round(metrics.totalMonthlyOperatingExpenses), 120);
  assert.equal(Math.round(metrics.totalMonthlyMortgagePayments), 100);
  assert.equal(Math.round(metrics.totalNetMonthlyCashflow), 980);
  assert.equal(Math.round(metrics.annualizedCashflow), 11760);
  assert.equal(Math.round(swappedMetrics.totalMonthlyRent), 1200);
  assert.equal(Math.round(swappedMetrics.totalMonthlyOperatingExpenses), 120);
  assert.equal(Math.round(swappedMetrics.totalMonthlyMortgagePayments), 100);
  assert.equal(Math.round(swappedMetrics.totalNetMonthlyCashflow), 980);
  assert.equal(Math.round(swappedMetrics.annualizedCashflow), 11760);
});
