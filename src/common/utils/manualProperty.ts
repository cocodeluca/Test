import type { Property } from '../types';
import type { DisplayCurrency } from '../types/settings';
import { defaultPropertyType } from './propertyTypes';

export interface ManualPropertyInput {
  operatingCurrency: DisplayCurrency;
  propertyValueCurrency: DisplayCurrency;
  name: string;
  address: string;
  city: string;
  country: string;
  propertyType: string;
  estimatedPropertyValue: number;
  monthlyRent: number;
  monthlyExpenses: number;
  monthlyInsurance: number;
  monthlyTaxes: number;
  notes: string;
}

const toAnnual = (monthly: number) => monthly * 12;

export const createManualProperty = (
  input: ManualPropertyInput,
  overrides: Partial<Property> = {}
): Property => {
  const monthlyOperatingExpenses =
    input.monthlyExpenses + input.monthlyInsurance + input.monthlyTaxes;
  const annualOperatingExpenses = toAnnual(monthlyOperatingExpenses);
  const purchaseValue = input.estimatedPropertyValue;
  const annualRent = toAnnual(input.monthlyRent);
  const grossYield = purchaseValue > 0 ? (annualRent / purchaseValue) * 100 : 0;
  const netYield = purchaseValue > 0 ? ((annualRent - annualOperatingExpenses) / purchaseValue) * 100 : 0;
  const monthlyCashflow = input.monthlyRent - monthlyOperatingExpenses;
  const propertyId = overrides.id ?? `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdDate = overrides.purchaseDate ?? new Date().toISOString().slice(0, 10);

  return {
    id: propertyId,
    currency: input.operatingCurrency,
    operatingCurrency: input.operatingCurrency,
    propertyValueCurrency: input.propertyValueCurrency,
    purchasePriceCurrency: input.propertyValueCurrency,
    currentEstimatedValueCurrency: input.propertyValueCurrency,
    name: input.name.trim() || 'New property',
    address: input.address.trim(),
    city: input.city.trim(),
    country: input.country.trim() || 'Spain',
    purchaseDate: createdDate,
    occupancyStatus: input.monthlyRent > 0 ? 'occupied' : 'vacant',
    notes: input.notes.trim(),
    propertyType: input.propertyType.trim() || defaultPropertyType,
    purchasePrice: purchaseValue,
    itpValueBase: purchaseValue,
    transferTaxRate: 0,
    transferTaxAmount: 0,
    notaryCost: 0,
    registryCost: 0,
    agencyFees: 0,
    totalPurchaseCost: purchaseValue,
    renovationConservation: 0,
    renovationImprovements: 0,
    furnishingAndOther: 0,
    totalInitialInvestment: purchaseValue,
    currentEstimatedValue: purchaseValue,
    cashInvested: purchaseValue,
    monthlyRent: input.monthlyRent,
    monthlyRentCurrency: input.operatingCurrency,
    annualRent,
    annualIncomeGrowthRate: 0,
    expectedRentGrowthPct: 0,
    expectedAnnualAppreciationPct: 0,
    expectedPropertyAppreciationPct: 0,
    lastRentUpdateDate: '',
    lastPropertyValuationDate: '',
    communityMonthly: input.monthlyExpenses,
    communityAnnual: toAnnual(input.monthlyExpenses),
    ibiAndLocalTaxesMonthly: input.monthlyTaxes,
    ibiAndLocalTaxesAnnual: toAnnual(input.monthlyTaxes),
    homeInsuranceMonthly: input.monthlyInsurance,
    homeInsuranceAnnual: toAnnual(input.monthlyInsurance),
    propertyManagementRate: 0,
    maintenanceMonthly: 0,
    maintenanceAnnual: 0,
    otherOperatingExpensesMonthly: 0,
    otherOperatingExpensesAnnual: 0,
    totalOperatingExpensesMonthly: monthlyOperatingExpenses,
    totalOperatingExpensesAnnual: annualOperatingExpenses,
    annualExpenseGrowthRate: 0,
    expectedCommunityGrowthPct: 0,
    expectedInsuranceGrowthPct: 0,
    expectedTaxGrowthPct: 0,
    expectedMaintenanceGrowthPct: 0,
    acquisitionTaxes: 0,
    notaryAndRegistryCosts: 0,
    renovationCosts: 0,
    furnishingCosts: 0,
    annualIBI: toAnnual(input.monthlyTaxes),
    annualHomeInsurance: toAnnual(input.monthlyInsurance),
    annualLifeInsurance: 0,
    annualRentDefaultInsurance: 0,
    annualNonPaymentInsurance: 0,
    annualCommunityFees: toAnnual(input.monthlyExpenses),
    annualManagementFees: 0,
    annualMaintenance: 0,
    annualUtilitiesPaidByOwner: 0,
    annualOtherExpenses: 0,
    annualMortgageInterest: 0,
    annualPrincipalAmortized: 0,
    annualTotalMortgagePaid: 0,
    oneTimeTenantPlacementFee: 0,
    rentalDeposit: 0,
    rentalDepositCurrency: input.operatingCurrency,
    lateFeeAmount: 0,
    lateFeeCurrency: input.operatingCurrency,
    furnitureCost: 0,
    totalCashInvestedForPurchase: purchaseValue,
    hasMortgage: false,
    parkingSpaces: 0,
    parkingCoverage: null,
    originalLoanAmount: 0,
    currentMortgageBalance: 0,
    monthlyMortgagePayment: 0,
    loanToValueAtPurchase: 0,
    mortgageTermYears: 0,
    initialInterestRateYear1: 0,
    interestType: '',
    baseRateWithoutBonificationsAfterYear1: 0,
    maxBonifiedRateAfterYear1: 0,
    monthlyMortgagePaymentYear1: 0,
    monthlyMortgagePaymentWithoutBonificationsReference: 0,
    monthlyMortgagePaymentWithMaxBonificationsReference: 0,
    firstYearInterestAnnual: 0,
    firstYearPrincipalAnnual: 0,
    propertyValuationForMortgage: purchaseValue,
    mortgageAppraisalCost: 0,
    registryCheckCost: 0,
    estimatedAnnualHomeInsuranceForBank: 0,
    estimatedAnnualLifeInsurance: 0,
    estimatedAnnualPaymentProtectionInsurance: 0,
    cadastralValueTotal: 0,
    cadastralConstructionValue: 0,
    cadastralLandValue: 0,
    annualTaxableRentalIncome: annualRent,
    annualDeductibleExpenses: annualOperatingExpenses,
    annualDepreciationTax: 0,
    annualMortgageInterestTax: 0,
    annualNetTaxableIncome: annualRent - annualOperatingExpenses,
    taxReductionPercentage: 0,
    marginalTaxRate: 0,
    estimatedAnnualTax: 0,
    taxNotes: '',
    grossYield,
    netYield,
    monthlyCashflow,
    roceYear1: 0,
    rocePlusAppreciation5Years: 0,
    rocePlusAppreciation10Years: 0,
    rocePlusAppreciation15Years: 0,
    mortgageVsRentPercentage: 0,
    cashflowVsRentPercentage: input.monthlyRent > 0 ? (monthlyCashflow / input.monthlyRent) * 100 : 0,
    imageUrl: '',
    imageUrls: [],
    primaryImageIndex: 0,
    ...overrides,
  };
};
