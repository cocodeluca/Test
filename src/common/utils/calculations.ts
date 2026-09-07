import {
  CashAccount,
  InvestmentAccount,
  Mortgage,
  PortfolioMetrics,
  Property,
  PropertyMetrics,
} from '../types';
import { DisplayCurrency } from '../types/settings';
import { calculatePropertyTaxRuntime, getPropertyTaxProfile } from '../tax';
import { convertCurrency, convertCurrencyWithCoverage, sumInCurrency } from './currency';
import { getActiveLease, syncPropertyLeaseData } from './leaseUpdates';
import { calculateRecurringExpensePortfolioSummary, ensureRecurringExpenses } from './recurringExpenses';
import { compareCivilDates, parseCivilDate, toCivilDate } from './civilDate';
import {
  getMortgageFinancialValidationIssues,
  getPropertyFinancialValidationIssues,
} from './financialValidation';

export interface MortgageProjection {
  currentBalance: number;
  projectedBalance: number;
  principalPaid: number;
  interestPaid: number;
  monthsProjected: number;
}

export interface PortfolioDebtProjection {
  totalDebtToday: number;
  totalDebtProjected: number;
  debtChange: number;
  principalPaid: number;
  interestPaid: number;
  mortgageProjections: Record<string, MortgageProjection>;
}

export interface MortgageDebtPaydownItem {
  mortgageId: string;
  propertyId: string;
  currency: DisplayCurrency;
  currentDebt: number;
  projectedDebtAfter12Months: number;
  currentMonthPrincipal: number;
  next12MonthsPrincipal: number;
  next12MonthsInterest: number;
}

export interface MortgageDebtPaydownSummary {
  currentDebt: number;
  projectedDebtAfter12Months: number;
  currentMonthPrincipal: number;
  next12MonthsPrincipal: number;
  next12MonthsInterest: number;
  reportingCurrency: DisplayCurrency;
  status: 'available' | 'no-active-mortgages' | 'unavailable';
  debtCoverageStatus: 'available' | 'partial' | 'unavailable';
  candidateMortgageCount: number;
  eligibleMortgageCount: number;
  debtCoveredMortgageCount: number;
  unverifiedMortgageCount?: number;
  unverifiedOutstandingBalance?: number | null;
  paidMortgageConflictCount?: number;
  paidMortgageConflictBalance?: number | null;
  mortgages: MortgageDebtPaydownItem[];
}

export interface CalculateMortgageDebtPaydownArgs {
  mortgages: Mortgage[];
  properties: Property[];
  reportingCurrency: DisplayCurrency;
  today?: Date;
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>;
}

export interface MortgageBonificationSummary {
  activeBonifications: Mortgage['activeBonifications'];
  availableBonifications: Mortgage['availableBonifications'];
  knownActiveBonificationPoints: number;
  hasUnknownActivePoints: boolean;
}

export interface MortgageSnapshot {
  isValid: boolean;
  validationIssues: string[];
  /** The balance used everywhere in the application. */
  balanceSource: 'contractual-model' | 'saved-fallback';
  paymentFrequencySource: 'explicit-monthly' | 'inferred-monthly' | null;
  savedBalance: number;
  savedBalanceDifference: number | null;
  materialBalanceDifference: number | null;
  hasMaterialBalanceDifference: boolean;
  currentCalculatedBalance: number;
  displayedBalance: number;
  /** Contractual amortization-model output. Equals displayedBalance when the model is verifiable. */
  modeledBalance: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
  amortizedPercentage: number;
  principalAmortized: number;
  modeledPrincipalAmortized: number;
  modeledAmortizedPercentage: number;
  elapsedMonths: number;
  remainingMonths: number;
  currentRate: number | null;
  contractualMonthlyPayment: number | null;
  currentMonthlyPayment: number | null;
  usedStoredBalanceFallback: boolean;
}

export type MortgageClassification = 'active' | 'future' | 'matured' | 'paid' | 'unverified';

export interface MortgageClassificationResult {
  status: MortgageClassification;
  outstandingBalance: number;
  hasAuthoritativeBalance: boolean;
  dataConflict?: 'paid-with-positive-balance';
}

export interface PropertyExpenseBreakdown {
  annualIbi: number;
  annualCommunityFees: number;
  annualManagementFees: number;
  annualMaintenance: number;
  annualUtilitiesPaidByOwner: number;
  annualOtherExpenses: number;
  annualOperatingExpenses: number;
  monthlyOperatingExpenses: number;
  annualHomeInsurance: number;
  annualLifeInsurance: number;
  annualRentDefaultInsurance: number;
  annualNonPaymentInsurance: number;
  annualInsuranceExpenses: number;
  monthlyInsuranceExpenses: number;
  annualRecurringExpenses: number;
  monthlyRecurringExpenses: number;
  actualTrailing12MonthsExpenses: number;
  projectedNext12MonthsExpenses: number;
}

export interface PropertyMortgageBreakdown {
  annualMortgageInterest: number | null;
  annualPrincipalAmortized: number | null;
  annualTotalMortgagePaid: number;
  monthlyMortgageInterest: number | null;
  monthlyPrincipalAmortized: number | null;
  monthlyTotalMortgagePaid: number;
}

export interface PropertyOneTimeCosts {
  oneTimeTenantPlacementFee: number;
  mortgageAppraisal: number;
  deposit: number;
  furniture: number;
}

export interface PortfolioTaxPreview {
  estimatedAnnualTax: number;
  estimatedAnnualAfterTaxCashflow: number;
  estimatedMonthlyAfterTaxCashflow: number;
}

export interface PropertyFinancials {
  calculationIssues: string[];
  taxModuleId: string;
  taxModuleLabel: string;
  taxModuleStatus: string;
  annualTaxableRentalIncome: number;
  annualDeductibleExpenses: number;
  annualNonDeductibleExpenses: number;
  annualNetIncomeBeforeTax: number;
  estimatedAnnualTax: number;
  annualAfterTaxCashflow: number;
  monthlyAfterTaxCashflow: number;
  monthlyRent: number;
  currentMortgageBalance: number;
  unverifiedMortgageBalance: number;
  mortgageClassification: MortgageClassification | null;
  mortgageDataConflict: MortgageClassificationResult['dataConflict'] | null;
  monthlyMortgagePayment: number;
  monthlyOperatingExpenses: number;
  monthlyInsuranceExpenses: number;
  monthlyMortgageInterest: number | null;
  monthlyPrincipalAmortized: number | null;
  monthlyTotalMortgagePaid: number;
  totalMonthlyExpenses: number;
  netMonthlyCashflow: number;
  annualRent: number;
  annualOperatingExpenses: number;
  annualInsuranceExpenses: number;
  annualRecurringExpenses: number;
  actualTrailing12MonthsExpenses: number;
  projectedNext12MonthsExpenses: number;
  annualMortgageInterest: number | null;
  annualPrincipalAmortized: number | null;
  annualTotalMortgagePaid: number;
  annualIbi: number;
  annualCommunityFees: number;
  annualManagementFees: number;
  annualHomeInsurance: number;
  annualLifeInsurance: number;
  annualRentDefaultInsurance: number;
  propertyOneTimeCosts: PropertyOneTimeCosts;
  annualMortgagePayment: number;
  totalAnnualExpenses: number;
  annualNetCashflow: number;
  investedCapital: number;
  appreciationAmount: number;
  appreciationPercentage: number;
  equity: number;
  equityPercentage: number;
  grossYield: number;
  netYield: number;
  roce: number;
  mortgagePercentageOfRent: number;
  operatingExpensesPercentageOfRent: number;
  cashflowPercentageOfRent: number;
}

const getNumericValue = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const calculatePercentage = (numerator: number, denominator: number): number =>
  denominator > 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
    ? (numerator / denominator) * 100
    : Number.NaN;

const normalizePropertyImageUrl = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const candidate = value as { url?: unknown; src?: unknown; imageUrl?: unknown };
    return (
      normalizePropertyImageUrl(candidate.url) ??
      normalizePropertyImageUrl(candidate.src) ??
      normalizePropertyImageUrl(candidate.imageUrl)
    );
  }

  return null;
};

const getCashBalanceValue = (account: CashAccount): number =>
  getNumericValue(account.currentBalance ?? account.balance);

const getOperatingCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.operatingCurrency ?? property.currency ?? 'EUR';

const getPropertyValueCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.propertyValueCurrency ??
  property.currentEstimatedValueCurrency ??
  property.purchasePriceCurrency ??
  getOperatingCurrency(property);

const getPropertyCurrency = (property: Partial<Property>): DisplayCurrency =>
  getOperatingCurrency(property);

const getMostCommonCurrency = (
  currencies: DisplayCurrency[],
  fallback: DisplayCurrency
): DisplayCurrency => {
  if (currencies.length === 0) {
    return fallback;
  }

  const counts = new Map<DisplayCurrency, number>();
  currencies.forEach((currency) => {
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  });

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback
  );
};

const getPortfolioDomainCurrencies = (
  properties: Property[],
  fallbackCurrency: DisplayCurrency
): {
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
} => ({
  valuationDisplayCurrency: getMostCommonCurrency(
    properties.map((property) => getPropertyValueCurrency(property)),
    fallbackCurrency
  ),
  operatingDisplayCurrency: fallbackCurrency,
});

const getPurchasePriceCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.purchasePriceCurrency ?? getPropertyValueCurrency(property);

const getCurrentEstimatedValueCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.currentEstimatedValueCurrency ?? getPropertyValueCurrency(property);

const getRentCurrency = (property: Partial<Property>): DisplayCurrency => {
  const activeLease = getActiveLease(property);
  return activeLease?.monthlyRentCurrency ?? property.monthlyRentCurrency ?? getPropertyCurrency(property);
};

const getDepositCurrency = (property: Partial<Property>): DisplayCurrency => {
  const activeLease = getActiveLease(property);
  return activeLease?.securityDepositCurrency ?? property.rentalDepositCurrency ?? getRentCurrency(property);
};

const getProjectedMonthlyRent = (
  property: Partial<Property>,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): number => {
  const activeLease = getActiveLease(property);

  if (activeLease) {
    return convertCurrency(
      activeLease.monthlyRent,
      activeLease.monthlyRentCurrency ?? property.monthlyRentCurrency ?? getPropertyCurrency(property),
      getPropertyCurrency(property),
      rateOverrides
    );
  }

  return convertCurrency(
    getNumericValue(property.monthlyRent),
    property.monthlyRentCurrency ?? getPropertyCurrency(property),
    getPropertyCurrency(property),
    rateOverrides
  );
};

const isPropertyActuallyRentGenerating = (property: Partial<Property>): boolean =>
  property.occupancyStatus === 'occupied';

const getEffectiveMonthlyRent = (
  property: Partial<Property>,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): number => {
  if (!isPropertyActuallyRentGenerating(property)) {
    return 0;
  }

  return getProjectedMonthlyRent(property, rateOverrides);
};

const getMortgageCurrency = (
  mortgage: Partial<Mortgage> | undefined,
  property?: Partial<Property>
): DisplayCurrency => mortgage?.currency ?? getPropertyCurrency(property ?? {});

const preferFilledNumber = (...values: Array<number | undefined | null>): number => {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );

  return validValues.find((value) => value !== 0) ?? validValues[0] ?? 0;
};

export const mergeMortgageBonifications = (
  mortgage: Mortgage
): Mortgage['availableBonifications'] => {
  const byKey = new Map<string, Mortgage['availableBonifications'][number]>();

  mortgage.availableBonifications.forEach((item) => {
    byKey.set(item.key, item);
  });

  mortgage.activeBonifications.forEach((item) => {
    const existing = byKey.get(item.key);
    byKey.set(item.key, {
      ...existing,
      ...item,
      active: true,
      available: item.available ?? existing?.available ?? true,
      status: 'active',
    });
  });

  return Array.from(byKey.values());
};

export const calculateMortgageBonificationSummary = (
  mortgage: Mortgage
): MortgageBonificationSummary => {
  const mergedBonifications = mergeMortgageBonifications(mortgage);
  const activeBonifications = mergedBonifications.filter(
    (item) => item.active || item.status === 'active'
  );
  const availableBonifications = mergedBonifications.filter(
    (item) => item.available && !item.active && item.status !== 'active'
  );
  const knownActiveBonificationPoints = activeBonifications.reduce(
    (total, item) => total + (item.bonusPoints ?? 0),
    0
  );
  const hasUnknownActivePoints = activeBonifications.some(
    (item) => item.bonusPoints === null
  );

  return {
    activeBonifications,
    availableBonifications,
    knownActiveBonificationPoints,
    hasUnknownActivePoints,
  };
};

const getToday = (): Date => new Date();

const getMonthsElapsedSinceStart = (mortgageStartDate: string, today: Date = getToday()): number => {
  const startDate = parseCivilDate(mortgageStartDate);
  const currentDate = toCivilDate(today);
  if (!startDate || compareCivilDates(startDate, currentDate) > 0) {
    return 0;
  }

  let monthsElapsed =
    (currentDate.year - startDate.year) * 12 +
    (currentDate.month - startDate.month);

  if (currentDate.day < startDate.day) {
    monthsElapsed -= 1;
  }

  return Math.max(monthsElapsed, 0);
};

const getMortgageTotalMonths = (mortgage: Mortgage): number => {
  const explicitTotalPayments = Math.trunc(getNumericValue(mortgage.totalPayments));

  if (explicitTotalPayments > 0) {
    return explicitTotalPayments;
  }

  const explicitTermMonths = Math.trunc(getNumericValue(mortgage.mortgageTermMonths));

  if (explicitTermMonths > 0) {
    return explicitTermMonths;
  }

  return Math.max(Math.trunc(getNumericValue(mortgage.mortgageTermYears) * 12), 0);
};

const getKnownActiveBonificationPoints = (mortgage: Mortgage): number => {
  const { knownActiveBonificationPoints } = calculateMortgageBonificationSummary(mortgage);

  if (mortgage.maxTotalBonificationPoints !== null) {
    return Math.min(knownActiveBonificationPoints, mortgage.maxTotalBonificationPoints);
  }

  return knownActiveBonificationPoints;
};

const getPostInitialRate = (mortgage: Mortgage): number | null => {
  if (mortgage.baseInterestRate !== null) {
    return Math.max(mortgage.baseInterestRate - getKnownActiveBonificationPoints(mortgage), 0);
  }

  if (mortgage.currentInterestRate !== null) {
    return mortgage.currentInterestRate;
  }

  if (Number.isFinite(mortgage.interestRate) && mortgage.interestRate >= 0) {
    return mortgage.interestRate;
  }

  return null;
};

const getInitialRateMonths = (mortgage: Mortgage): number => {
  if (mortgage.initialInterestRate === null) {
    return 0;
  }

  const configuredMonths = Math.trunc(getNumericValue(mortgage.initialRateMonths));
  return configuredMonths > 0 ? configuredMonths : 12;
};

const getMonthlyRepaymentFrequencySource = (
  frequency: string | null | undefined
): MortgageSnapshot['paymentFrequencySource'] => {
  const normalized = frequency?.trim().toLowerCase();

  if (!normalized) {
    return 'inferred-monthly';
  }

  return normalized === 'monthly' || normalized === 'month' || normalized === 'mensual'
    ? 'explicit-monthly'
    : null;
};

const getRateForElapsedMonth = (mortgage: Mortgage, elapsedMonths: number): number | null => {
  const initialPeriodMonths = getInitialRateMonths(mortgage);

  if (mortgage.initialInterestRate !== null && elapsedMonths < initialPeriodMonths) {
    return mortgage.initialInterestRate;
  }

  return getPostInitialRate(mortgage);
};

const calculateAmortizedPayment = (
  principal: number,
  annualRate: number | null,
  monthsRemaining: number,
  fallbackMonthlyPayment: number
): number | null => {
  if (principal <= 0) {
    return 0;
  }

  if (monthsRemaining <= 0) {
    return fallbackMonthlyPayment > 0 ? fallbackMonthlyPayment : null;
  }

  if (annualRate === null) {
    return fallbackMonthlyPayment > 0 ? fallbackMonthlyPayment : null;
  }

  const monthlyRate = annualRate / 100 / 12;

  if (monthlyRate === 0) {
    return principal / monthsRemaining;
  }

  const factor = Math.pow(1 + monthlyRate, monthsRemaining);
  const denominator = factor - 1;

  if (denominator === 0) {
    return fallbackMonthlyPayment > 0 ? fallbackMonthlyPayment : null;
  }

  return principal * ((monthlyRate * factor) / denominator);
};

export const calculateRemainingMortgageMonths = (
  mortgage: Mortgage,
  today: Date = getToday()
): number => {
  const totalMonths = getMortgageTotalMonths(mortgage);
  const elapsedMonths = Math.min(getMonthsElapsedSinceStart(mortgage.mortgageStartDate, today), totalMonths);
  return Math.max(totalMonths - elapsedMonths, 0);
};

export const isMortgageInInitialPeriod = (
  mortgage: Mortgage,
  today: Date = getToday()
): boolean => {
  if (mortgage.initialInterestRate === null || !mortgage.mortgageStartDate) {
    return false;
  }

  const initialPeriodMonths = getInitialRateMonths(mortgage);

  return getMonthsElapsedSinceStart(mortgage.mortgageStartDate, today) < initialPeriodMonths;
};

export const calculateCurrentRate = (
  mortgage: Mortgage,
  today: Date = getToday()
): number | null => {
  const elapsedMonths = getMonthsElapsedSinceStart(mortgage.mortgageStartDate, today);
  return getRateForElapsedMonth(mortgage, elapsedMonths);
};

export const calculateMortgageSnapshot = (
  mortgage: Mortgage,
  today: Date = getToday()
): MortgageSnapshot => {
  const originalLoanAmount = Math.max(getNumericValue(mortgage.originalLoanAmount), 0);
  const storedCurrentBalance = Math.max(getNumericValue(mortgage.currentBalance), 0);
  const totalMonths = getMortgageTotalMonths(mortgage);
  const startDate = parseCivilDate(mortgage.mortgageStartDate);
  const elapsedMonths = Math.min(
    getMonthsElapsedSinceStart(mortgage.mortgageStartDate, today),
    totalMonths
  );
  const paymentFrequencySource = getMonthlyRepaymentFrequencySource(mortgage.repaymentFrequency);
  const currentRate = getRateForElapsedMonth(mortgage, elapsedMonths);
  const validationIssues = getMortgageFinancialValidationIssues(mortgage);

  if (originalLoanAmount <= 0) validationIssues.push('original loan amount is required for contractual modelling');
  if (totalMonths <= 0) validationIssues.push('mortgage term is required for contractual modelling');
  if (!startDate) validationIssues.push('mortgage start date is required for contractual modelling');
  if (!paymentFrequencySource) validationIssues.push('repayment frequency is not compatible with monthly modelling');
  if (currentRate === null || !Number.isFinite(currentRate) || currentRate < 0) {
    validationIssues.push('effective interest rate is required for contractual modelling');
  }

  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
  let modeledBalance = originalLoanAmount;
  let modeledInterestPaid = 0;
  let isContractuallyModeled = validationIssues.length === 0;

  if (isContractuallyModeled) {
    for (let month = 0; month < elapsedMonths && modeledBalance > 0; month += 1) {
      const monthlyRate = getRateForElapsedMonth(mortgage, month);
      if (monthlyRate === null || !Number.isFinite(monthlyRate) || monthlyRate < 0) {
        validationIssues.push('interest-rate structure cannot model the full elapsed term');
        isContractuallyModeled = false;
        break;
      }

      const payment = calculateAmortizedPayment(
        modeledBalance,
        monthlyRate,
        totalMonths - month,
        0
      );
      if (payment === null || payment <= 0) {
        validationIssues.push('contractual payment cannot be calculated');
        isContractuallyModeled = false;
        break;
      }

      const interest = modeledBalance * (monthlyRate / 100 / 12);
      const principal = Math.min(Math.max(payment - interest, 0), modeledBalance);
      modeledBalance = Math.max(modeledBalance - principal, 0);
      modeledInterestPaid += interest;
    }
  }

  const balanceSource = isContractuallyModeled ? 'contractual-model' : 'saved-fallback';
  const displayedBalance = isContractuallyModeled ? modeledBalance : storedCurrentBalance;
  const contractualMonthlyPayment =
    isContractuallyModeled && remainingMonths > 0
      ? calculateAmortizedPayment(displayedBalance, currentRate, remainingMonths, 0)
      : null;
  const explicitCurrentMonthlyPayment = isMortgageInInitialPeriod(mortgage, today)
    ? getNumericValue(mortgage.initialMonthlyPayment) ||
      getNumericValue(mortgage.monthlyMortgagePayment)
    : getNumericValue(mortgage.regularMonthlyPayment) ||
      getNumericValue(mortgage.monthlyMortgagePayment);
  const currentMonthlyPayment =
    remainingMonths > 0
      ? explicitCurrentMonthlyPayment > 0
        ? explicitCurrentMonthlyPayment
        : contractualMonthlyPayment
      : isContractuallyModeled
      ? 0
      : null;
  const modeledPrincipalAmortized = Math.max(originalLoanAmount - modeledBalance, 0);
  const principalAmortized = Math.max(originalLoanAmount - displayedBalance, 0);
  const amortizedPercentage =
    originalLoanAmount === 0 ? 0 : (principalAmortized / originalLoanAmount) * 100;
  const modeledAmortizedPercentage =
    originalLoanAmount === 0 ? 0 : (modeledPrincipalAmortized / originalLoanAmount) * 100;
  const savedBalanceDifference = isContractuallyModeled
    ? Math.abs(storedCurrentBalance - modeledBalance)
    : null;
  const materialBalanceDifference = Math.max(100, originalLoanAmount * 0.01);
  const hasMaterialBalanceDifference =
    savedBalanceDifference !== null && savedBalanceDifference > materialBalanceDifference;

  return {
    isValid: isContractuallyModeled,
    validationIssues: [...new Set(validationIssues)],
    balanceSource,
    paymentFrequencySource,
    savedBalance: storedCurrentBalance,
    savedBalanceDifference,
    materialBalanceDifference: isContractuallyModeled ? materialBalanceDifference : null,
    hasMaterialBalanceDifference,
    currentCalculatedBalance: isContractuallyModeled ? modeledBalance : storedCurrentBalance,
    displayedBalance,
    modeledBalance: isContractuallyModeled ? modeledBalance : storedCurrentBalance,
    totalPrincipalPaid: principalAmortized,
    totalInterestPaid: isContractuallyModeled ? modeledInterestPaid : 0,
    amortizedPercentage,
    principalAmortized,
    modeledPrincipalAmortized,
    modeledAmortizedPercentage,
    elapsedMonths,
    remainingMonths,
    currentRate,
    contractualMonthlyPayment,
    currentMonthlyPayment,
    usedStoredBalanceFallback: !isContractuallyModeled,
  };
};

export const calculateMonthlyPayment = (
  mortgage: Mortgage,
  today: Date = getToday()
): number | null => {
  const snapshot = calculateMortgageSnapshot(mortgage, today);
  return snapshot.currentMonthlyPayment;
};

export const calculateAmortization = (
  mortgage: Mortgage,
  today: Date = getToday()
) => {
  const snapshot = calculateMortgageSnapshot(mortgage, today);

  return {
    principalAmortized: snapshot.principalAmortized,
    amortizedPercentage: snapshot.amortizedPercentage,
    modeledPrincipalAmortized: snapshot.modeledPrincipalAmortized,
    modeledAmortizedPercentage: snapshot.modeledAmortizedPercentage,
  };
};

const getAnnualExpenseBreakdown = (
  property: Partial<Property>,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyExpenseBreakdown => {
  const recurringSummary = calculateRecurringExpensePortfolioSummary(property);
  const recurringByType = recurringSummary.byType;
  const annualIbi = preferFilledNumber(property.ibiAndLocalTaxesAnnual, property.annualIBI);
  const propertyManagementRate = getNumericValue(property.propertyManagementRate);
  const resolvedAnnualManagementFees =
    getNumericValue(property.annualManagementFees) ||
    (propertyManagementRate > 0
      ? getEffectiveMonthlyRent(property, rateOverrides) * propertyManagementRate * 12
      : 0);
  const annualCommunityFees = preferFilledNumber(
    property.communityAnnual,
    property.annualCommunityFees
  );
  const annualMaintenance = preferFilledNumber(
    property.maintenanceAnnual,
    property.annualMaintenance
  );
  const annualUtilitiesPaidByOwner = getNumericValue(property.annualUtilitiesPaidByOwner);
  const annualOtherExpenses = preferFilledNumber(
    property.otherOperatingExpensesAnnual,
    property.annualOtherExpenses
  );
  const annualHomeInsurance = preferFilledNumber(
    property.homeInsuranceAnnual,
    property.annualHomeInsurance
  );
  const annualLifeInsurance = preferFilledNumber(
    property.annualLifeInsurance,
    property.estimatedAnnualLifeInsurance
  );
  const annualRentDefaultInsurance = preferFilledNumber(
    property.annualRentDefaultInsurance,
    property.annualNonPaymentInsurance
  );
  const annualNonPaymentInsurance = annualRentDefaultInsurance;

  const projectedPropertyTax = recurringByType['property-tax']?.projectedNext12Months ?? annualIbi;
  const projectedCommunityFees =
    recurringByType['community-fees']?.projectedNext12Months ?? annualCommunityFees;
  const projectedManagementFees =
    recurringByType['management-fees']?.projectedNext12Months ?? resolvedAnnualManagementFees;
  const projectedMaintenance =
    recurringByType['maintenance']?.projectedNext12Months ?? annualMaintenance;
  const projectedUtilities =
    recurringByType['utilities']?.projectedNext12Months ?? annualUtilitiesPaidByOwner;
  const projectedOther =
    recurringByType['other-operating']?.projectedNext12Months ?? annualOtherExpenses;
  const projectedHomeInsurance =
    recurringByType['home-insurance']?.projectedNext12Months ?? annualHomeInsurance;
  const projectedLifeInsurance =
    recurringByType['life-insurance']?.projectedNext12Months ?? annualLifeInsurance;
  const projectedRentDefaultInsurance =
    recurringByType['rent-default-insurance']?.projectedNext12Months ?? annualRentDefaultInsurance;

  const annualOperatingExpenses =
    projectedPropertyTax +
    projectedCommunityFees +
    projectedManagementFees +
    projectedMaintenance +
    projectedUtilities +
    projectedOther;
  const annualInsuranceExpenses =
    projectedHomeInsurance + projectedLifeInsurance + projectedRentDefaultInsurance;
  const projectedCustomRecurringExpenses =
    recurringByType.custom?.projectedNext12Months ?? 0;
  const annualRecurringExpenses =
    annualOperatingExpenses + annualInsuranceExpenses + projectedCustomRecurringExpenses;

  return {
    annualIbi: projectedPropertyTax,
    annualCommunityFees: projectedCommunityFees,
    annualManagementFees: projectedManagementFees,
    annualMaintenance: projectedMaintenance,
    annualUtilitiesPaidByOwner: projectedUtilities,
    annualOtherExpenses: projectedOther,
    annualOperatingExpenses,
    monthlyOperatingExpenses: annualOperatingExpenses / 12,
    annualHomeInsurance: projectedHomeInsurance,
    annualLifeInsurance: projectedLifeInsurance,
    annualRentDefaultInsurance: projectedRentDefaultInsurance,
    annualNonPaymentInsurance,
    annualInsuranceExpenses,
    monthlyInsuranceExpenses: annualInsuranceExpenses / 12,
    annualRecurringExpenses,
    monthlyRecurringExpenses: annualRecurringExpenses / 12,
    actualTrailing12MonthsExpenses: recurringSummary.actualTrailing12Months,
    projectedNext12MonthsExpenses: annualRecurringExpenses,
  };
};

const getMortgageBreakdown = (
  property: Partial<Property>,
  mortgage?: Mortgage,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyMortgageBreakdown => {
  const propertyCurrency = getPropertyCurrency(property);
  const mortgageCurrency = getMortgageCurrency(mortgage, property);
  const convertMortgageAmount = (value: number) =>
    convertCurrency(value, mortgageCurrency, propertyCurrency, rateOverrides);
  const storedAnnualMortgageInterest = getNumericValue(property.annualMortgageInterest);
  const storedAnnualPrincipalAmortized = getNumericValue(property.annualPrincipalAmortized);
  const storedAnnualTotalMortgagePaid = getNumericValue(property.annualTotalMortgagePaid);

  if (mortgage && calculateMortgageSnapshot(mortgage).balanceSource === 'contractual-model') {
    const projection = calculateMortgageProjection(mortgage, 12);
    const annualMortgageInterest = convertMortgageAmount(projection.interestPaid);
    const annualPrincipalAmortized = convertMortgageAmount(projection.principalPaid);
    const annualTotalMortgagePaid = annualMortgageInterest + annualPrincipalAmortized;

    return {
      annualMortgageInterest,
      annualPrincipalAmortized,
      annualTotalMortgagePaid,
      monthlyMortgageInterest: annualMortgageInterest / 12,
      monthlyPrincipalAmortized: annualPrincipalAmortized / 12,
      monthlyTotalMortgagePaid: annualTotalMortgagePaid / 12,
    };
  }

  if (
    storedAnnualMortgageInterest > 0 ||
    storedAnnualPrincipalAmortized > 0
  ) {
    const annualTotalMortgagePaid =
      storedAnnualTotalMortgagePaid || storedAnnualMortgageInterest + storedAnnualPrincipalAmortized;

    return {
      annualMortgageInterest: storedAnnualMortgageInterest,
      annualPrincipalAmortized: storedAnnualPrincipalAmortized,
      annualTotalMortgagePaid,
      monthlyMortgageInterest: storedAnnualMortgageInterest / 12,
      monthlyPrincipalAmortized: storedAnnualPrincipalAmortized / 12,
      monthlyTotalMortgagePaid: annualTotalMortgagePaid / 12,
    };
  }

  if (mortgage) {
    const knownAnnualPayment = convertMortgageAmount(
      getNumericValue(mortgage.monthlyMortgagePayment) * 12
    );
    const annualTotalMortgagePaid = storedAnnualTotalMortgagePaid || knownAnnualPayment;

    return {
      annualMortgageInterest: null,
      annualPrincipalAmortized: null,
      annualTotalMortgagePaid,
      monthlyMortgageInterest: null,
      monthlyPrincipalAmortized: null,
      monthlyTotalMortgagePaid: annualTotalMortgagePaid / 12,
    };
  }

  if (
    property.hasMortgage ||
    getNumericValue(property.currentMortgageBalance) > 0 ||
    getNumericValue(property.monthlyMortgagePayment) > 0 ||
    storedAnnualTotalMortgagePaid > 0
  ) {
    const annualTotalMortgagePaid =
      storedAnnualTotalMortgagePaid || getNumericValue(property.monthlyMortgagePayment) * 12;

    return {
      annualMortgageInterest: null,
      annualPrincipalAmortized: null,
      annualTotalMortgagePaid,
      monthlyMortgageInterest: null,
      monthlyPrincipalAmortized: null,
      monthlyTotalMortgagePaid: annualTotalMortgagePaid / 12,
    };
  }

  return {
    annualMortgageInterest: 0,
    annualPrincipalAmortized: 0,
    annualTotalMortgagePaid: 0,
    monthlyMortgageInterest: 0,
    monthlyPrincipalAmortized: 0,
    monthlyTotalMortgagePaid: 0,
  };
};

const getOneTimeCosts = (
  property: Partial<Property>,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyOneTimeCosts => {
  return {
    oneTimeTenantPlacementFee: getNumericValue(property.oneTimeTenantPlacementFee),
    mortgageAppraisal: preferFilledNumber(property.mortgageAppraisalCost, 0),
    deposit: convertCurrency(
      getNumericValue(property.rentalDeposit),
      getDepositCurrency(property),
      getPropertyCurrency(property),
      rateOverrides
    ),
    furniture: preferFilledNumber(property.furnitureCost, property.furnishingAndOther),
  };
};

export const calculateSpainDeductibleExpenseSummary = (
  property: Partial<Property>
) => {
  const runtime = calculatePropertyTaxRuntime(property, 0);

  return {
    annualRent: runtime.generic.grossRentalIncome,
    annualDeductibleExpenses: runtime.generic.deductibleExpenses,
    estimatedNetTaxableIncome: runtime.generic.netIncomeBeforeTax,
    reductionRate: runtime.spain?.reductionRate ?? 0,
    reducedTaxableIncome:
      runtime.spain?.taxableIncomeAfterHousingReduction ?? runtime.generic.netIncomeBeforeTax,
    estimatedTax: runtime.generic.estimatedTax,
  };
};

export const calculateSpainAfterTaxCashflowSummary = (
  annualNetCashflow: number,
  estimatedTax: number
) => ({
  annualAfterTaxCashflow: annualNetCashflow - estimatedTax,
  monthlyAfterTaxCashflow: (annualNetCashflow - estimatedTax) / 12,
});

export const calculatePortfolioTaxPreview = (
  properties: Property[],
  mortgages: Mortgage[],
  reportingCurrency: DisplayCurrency = 'EUR',
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PortfolioTaxPreview => {
  const totals = properties.reduce(
    (sum, property) => {
      const financials = calculatePropertyFinancials(
        property,
        findMortgageByProperty(property.id, mortgages),
        rateOverrides
      );
      const estimatedAnnualTaxBase = financials.estimatedAnnualTax;

      sum.estimatedAnnualTax += convertCurrency(
        estimatedAnnualTaxBase,
        getPropertyCurrency(property),
        reportingCurrency,
        rateOverrides
      );
      sum.estimatedAnnualAfterTaxCashflow += convertCurrency(
        financials.annualAfterTaxCashflow,
        getPropertyCurrency(property),
        reportingCurrency,
        rateOverrides
      );

      return sum;
    },
    {
      estimatedAnnualTax: 0,
      estimatedAnnualAfterTaxCashflow: 0,
    }
  );

  return {
    estimatedAnnualTax: totals.estimatedAnnualTax,
    estimatedAnnualAfterTaxCashflow: totals.estimatedAnnualAfterTaxCashflow,
    estimatedMonthlyAfterTaxCashflow: totals.estimatedAnnualAfterTaxCashflow / 12,
  };
};

const getLeveragedCashInvested = (
  totalInitialInvestment: number,
  purchasePrice: number,
  loanAmount: number
): number => {
  const acquisitionAndSetupCosts = Math.max(totalInitialInvestment - purchasePrice, 0);
  const downPayment = Math.max(purchasePrice - loanAmount, 0);
  return downPayment + acquisitionAndSetupCosts;
};

export const calculateInvestedCapital = (
  property: Pick<
    Property,
    | 'cashInvested'
    | 'totalInitialInvestment'
    | 'purchasePrice'
    | 'hasMortgage'
    | 'originalLoanAmount'
    | 'totalCashInvestedForPurchase'
  >
): number => {
  const totalCashInvestedForPurchase = getNumericValue(property.totalCashInvestedForPurchase);

  if (totalCashInvestedForPurchase > 0) {
    return totalCashInvestedForPurchase;
  }

  if (property.hasMortgage && property.originalLoanAmount > 0) {
    const leveragedCashInvested = getLeveragedCashInvested(
      property.totalInitialInvestment || 0,
      property.purchasePrice || 0,
      property.originalLoanAmount || 0
    );

    if (property.cashInvested > 0 && property.cashInvested < property.totalInitialInvestment) {
      return property.cashInvested;
    }

    if (leveragedCashInvested > 0) {
      return leveragedCashInvested;
    }
  }

  if (property.cashInvested > 0) {
    return property.cashInvested;
  }

  if (property.totalInitialInvestment > 0) {
    return property.totalInitialInvestment;
  }

  return property.purchasePrice || 0;
};

export const findMortgageByProperty = (
  propertyId: string,
  mortgages: Mortgage[]
): Mortgage | undefined => mortgages.find((mortgage) => mortgage.propertyId === propertyId);

export const calculateMortgageProjection = (
  mortgage: Mortgage,
  monthsAhead: number,
  today: Date = getToday()
): MortgageProjection => {
  const snapshot = calculateMortgageSnapshot(mortgage, today);
  const currentBalance = snapshot.displayedBalance;

  if (
    snapshot.balanceSource !== 'contractual-model' ||
    classifyMortgage(mortgage, today).status !== 'active' ||
    currentBalance === 0 ||
    monthsAhead <= 0
  ) {
    return {
      currentBalance,
      projectedBalance: currentBalance,
      principalPaid: 0,
      interestPaid: 0,
      monthsProjected: 0,
    };
  }

  let balance = currentBalance;
  let principalPaid = 0;
  let interestPaid = 0;
  let monthsProjected = 0;
  const maximumProjectionMonths = Math.min(monthsAhead, snapshot.remainingMonths);

  for (let month = 0; month < maximumProjectionMonths; month += 1) {
    if (balance <= 0) {
      break;
    }

    const elapsedMonth = snapshot.elapsedMonths + month;
    const annualRate = getRateForElapsedMonth(mortgage, elapsedMonth);
    const remainingMonths = snapshot.remainingMonths - month;
    const monthlyPayment = calculateAmortizedPayment(balance, annualRate, remainingMonths, 0);

    if (monthlyPayment === null || monthlyPayment <= 0 || annualRate === null) {
      break;
    }

    const interest = balance * (Math.max(annualRate, 0) / 100 / 12);
    let principal = monthlyPayment - interest;

    if (principal <= 0) {
      break;
    }

    if (principal > balance) {
      principal = balance;
    }

    balance = Math.max(balance - principal, 0);
    principalPaid += principal;
    interestPaid += interest;
    monthsProjected += 1;
  }

  return {
    currentBalance,
    projectedBalance: balance,
    principalPaid,
    interestPaid,
    monthsProjected,
  };
};

export const classifyMortgage = (
  mortgage: Mortgage,
  today: Date = getToday()
): MortgageClassificationResult => {
  const snapshot = calculateMortgageSnapshot(mortgage, today);
  const outstandingBalance = snapshot.displayedBalance;
  const startDate = parseCivilDate(mortgage.mortgageStartDate);
  const currentDate = toCivilDate(today);
  const totalMonths = getMortgageTotalMonths(mortgage);
  const explicitlyPaid = mortgage.status === 'paid';

  if (explicitlyPaid) {
    return {
      status: 'paid',
      outstandingBalance,
      hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback,
      ...(snapshot.savedBalance > 0 ? { dataConflict: 'paid-with-positive-balance' as const } : {}),
    };
  }
  if (snapshot.balanceSource === 'saved-fallback') {
    return { status: 'unverified', outstandingBalance, hasAuthoritativeBalance: true };
  }
  if (!startDate || totalMonths <= 0) {
    return { status: 'unverified', outstandingBalance, hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback };
  }
  if (compareCivilDates(startDate, currentDate) > 0) {
    return { status: 'future', outstandingBalance, hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback };
  }
  if (getMonthsElapsedSinceStart(mortgage.mortgageStartDate, today) >= totalMonths) {
    return { status: 'matured', outstandingBalance, hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback };
  }
  if (outstandingBalance <= 0) {
    return { status: 'paid', outstandingBalance, hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback };
  }
  return { status: 'active', outstandingBalance, hasAuthoritativeBalance: snapshot.usedStoredBalanceFallback };
};

export const calculateMortgageDebtPaydown = ({
  mortgages,
  properties,
  reportingCurrency,
  today = getToday(),
  rateOverrides,
}: CalculateMortgageDebtPaydownArgs): MortgageDebtPaydownSummary => {
  const propertyIds = new Set(properties.map((property) => property.id));
  const candidates = mortgages.filter((mortgage) => classifyMortgage(mortgage, today).status === 'active');
  const unverifiedMortgages = mortgages.filter(
    (mortgage) => classifyMortgage(mortgage, today).status === 'unverified'
  );
  const paidMortgageConflicts = mortgages.filter(
    (mortgage) => classifyMortgage(mortgage, today).dataConflict === 'paid-with-positive-balance'
  );
  const unverifiedConversions = unverifiedMortgages.map((mortgage) =>
    convertCurrencyWithCoverage(
      calculateMortgageSnapshot(mortgage, today).displayedBalance,
      getMortgageCurrency(mortgage),
      reportingCurrency,
      rateOverrides
    )
  );
  const unverifiedOutstandingBalance = unverifiedConversions.every((conversion) => conversion.available)
    ? unverifiedConversions.reduce((sum, conversion) => sum + (conversion.value ?? 0), 0)
    : null;
  const paidMortgageConflictConversions = paidMortgageConflicts.map((mortgage) =>
    convertCurrencyWithCoverage(
      calculateMortgageSnapshot(mortgage, today).savedBalance,
      getMortgageCurrency(mortgage),
      reportingCurrency,
      rateOverrides
    )
  );
  const paidMortgageConflictBalance = paidMortgageConflictConversions.every((conversion) => conversion.available)
    ? paidMortgageConflictConversions.reduce((sum, conversion) => sum + (conversion.value ?? 0), 0)
    : null;
  const convertedCandidateDebts = candidates.map((mortgage) =>
    convertCurrencyWithCoverage(
      calculateMortgageSnapshot(mortgage, today).displayedBalance,
      getMortgageCurrency(mortgage),
      reportingCurrency,
      rateOverrides
    )
  );
  const coveredCandidateDebts = convertedCandidateDebts.filter(
    (conversion): conversion is { value: number; available: true } =>
      conversion.available && conversion.value !== null
  );
  const mortgagePaydowns = candidates.flatMap<MortgageDebtPaydownItem>((mortgage) => {
    const snapshot = calculateMortgageSnapshot(mortgage, today);
    const startDate = parseCivilDate(mortgage.mortgageStartDate);

    if (
      !propertyIds.has(mortgage.propertyId) ||
      !snapshot.isValid ||
      !startDate ||
      compareCivilDates(startDate, toCivilDate(today)) > 0 ||
      snapshot.remainingMonths <= 0 ||
      snapshot.currentRate === null ||
      !Number.isFinite(snapshot.currentRate) ||
      snapshot.currentRate < 0 ||
      snapshot.balanceSource !== 'contractual-model'
    ) {
      return [];
    }

    const nextPayment = calculateMortgageProjection(mortgage, 1, today);
    const next12Months = calculateMortgageProjection(mortgage, 12, today);
    const mortgageCurrency = getMortgageCurrency(mortgage);
    const convertedProjectionValues = [
      nextPayment.principalPaid,
      next12Months.principalPaid,
      next12Months.interestPaid,
      next12Months.projectedBalance,
    ].map((value) =>
      convertCurrencyWithCoverage(
        value,
        mortgageCurrency,
        reportingCurrency,
        rateOverrides
      )
    );

    if (
      nextPayment.monthsProjected !== 1 ||
      nextPayment.principalPaid <= 0 ||
      !Number.isFinite(nextPayment.principalPaid) ||
      !Number.isFinite(next12Months.principalPaid) ||
      next12Months.principalPaid < 0 ||
      convertedProjectionValues.some((conversion) => !conversion.available)
    ) {
      return [];
    }

    return [{
      mortgageId: mortgage.id,
      propertyId: mortgage.propertyId,
      currency: mortgageCurrency,
      currentDebt: next12Months.currentBalance,
      projectedDebtAfter12Months: next12Months.projectedBalance,
      currentMonthPrincipal: nextPayment.principalPaid,
      next12MonthsPrincipal: next12Months.principalPaid,
      next12MonthsInterest: next12Months.interestPaid,
    }];
  });
  const currentMonthPrincipal = mortgagePaydowns.reduce(
    (total, mortgage) => total + (convertCurrencyWithCoverage(
      mortgage.currentMonthPrincipal,
      mortgage.currency,
      reportingCurrency,
      rateOverrides
    ).value ?? 0),
    0
  );
  const next12MonthsPrincipal = mortgagePaydowns.reduce(
    (total, mortgage) => total + (convertCurrencyWithCoverage(
      mortgage.next12MonthsPrincipal,
      mortgage.currency,
      reportingCurrency,
      rateOverrides
    ).value ?? 0),
    0
  );
  const next12MonthsInterest = mortgagePaydowns.reduce(
    (total, mortgage) => total + (convertCurrencyWithCoverage(
      mortgage.next12MonthsInterest,
      mortgage.currency,
      reportingCurrency,
      rateOverrides
    ).value ?? 0),
    0
  );
  const currentDebt = coveredCandidateDebts.reduce(
    (total, conversion) => total + conversion.value,
    0
  );
  const candidateMortgageCount = candidates.length;
  const eligibleMortgageCount = mortgagePaydowns.length;
  const debtCoveredMortgageCount = coveredCandidateDebts.length;
  const debtCoverageStatus =
    unverifiedMortgages.length > 0
      ? 'partial'
      : candidateMortgageCount === 0 || debtCoveredMortgageCount === candidateMortgageCount
      ? 'available'
      : debtCoveredMortgageCount === 0
        ? 'unavailable'
        : 'partial';

  return {
    currentDebt,
    projectedDebtAfter12Months: Math.max(currentDebt - next12MonthsPrincipal, 0),
    currentMonthPrincipal,
    next12MonthsPrincipal,
    next12MonthsInterest,
    reportingCurrency,
    status:
      candidateMortgageCount === 0
        ? 'no-active-mortgages'
        : eligibleMortgageCount === 0
          ? 'unavailable'
          : 'available',
    debtCoverageStatus,
    candidateMortgageCount,
    eligibleMortgageCount,
    debtCoveredMortgageCount,
    unverifiedMortgageCount: unverifiedMortgages.length,
    unverifiedOutstandingBalance,
    paidMortgageConflictCount: paidMortgageConflicts.length,
    paidMortgageConflictBalance,
    mortgages: mortgagePaydowns,
  };
};

export const calculatePortfolioDebtProjection = (
  mortgages: Mortgage[],
  monthsAhead: number,
  today: Date = getToday(),
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PortfolioDebtProjection => {
  const mortgageProjections: Record<string, MortgageProjection> = {};

  const totals = mortgages.filter((mortgage) => classifyMortgage(mortgage, today).status === 'active').reduce(
    (accumulator, mortgage) => {
      const projection = calculateMortgageProjection(mortgage, monthsAhead, today);
      mortgageProjections[mortgage.id] = projection;
      const mortgageCurrency = getMortgageCurrency(mortgage);

      accumulator.totalDebtToday += convertCurrency(
        projection.currentBalance,
        mortgageCurrency,
        'EUR',
        rateOverrides
      );
      accumulator.totalDebtProjected += convertCurrency(
        projection.projectedBalance,
        mortgageCurrency,
        'EUR',
        rateOverrides
      );
      accumulator.principalPaid += convertCurrency(
        projection.principalPaid,
        mortgageCurrency,
        'EUR',
        rateOverrides
      );
      accumulator.interestPaid += convertCurrency(
        projection.interestPaid,
        mortgageCurrency,
        'EUR',
        rateOverrides
      );

      return accumulator;
    },
    {
      totalDebtToday: 0,
      totalDebtProjected: 0,
      principalPaid: 0,
      interestPaid: 0,
    }
  );

  return {
    totalDebtToday: totals.totalDebtToday,
    totalDebtProjected: totals.totalDebtProjected,
    debtChange: totals.totalDebtProjected - totals.totalDebtToday,
    principalPaid: totals.principalPaid,
    interestPaid: totals.interestPaid,
    mortgageProjections,
  };
};

export const calculatePropertyFinancials = (
  property: Property,
  mortgage?: Mortgage,
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyFinancials => {
  const financialValidationIssues = getPropertyFinancialValidationIssues(property);
  const propertyCurrency = getPropertyCurrency(property);
  const mortgageCurrency = getMortgageCurrency(mortgage, property);
  const convertMortgageAmount = (value: number) =>
    convertCurrency(value, mortgageCurrency, propertyCurrency, rateOverrides);
  const taxProfile = getPropertyTaxProfile(property);
  const monthlyRent = getEffectiveMonthlyRent(property, rateOverrides);
  const mortgageSnapshot = mortgage ? calculateMortgageSnapshot(mortgage) : null;
  const mortgageClassification = mortgage ? classifyMortgage(mortgage) : null;
  const isActiveMortgage = mortgageClassification?.status === 'active';
  const currentMortgageBalance = mortgageSnapshot && isActiveMortgage
    ? convertMortgageAmount(mortgageSnapshot.displayedBalance)
    : mortgage
      ? 0
      : getNumericValue(property.currentMortgageBalance);
  const unverifiedMortgageBalance = mortgageSnapshot && mortgageClassification?.status === 'unverified'
    ? convertMortgageAmount(mortgageSnapshot.displayedBalance)
    : 0;
  const monthlyMortgagePayment =
    (isActiveMortgage || mortgageClassification?.status === 'unverified') && mortgageSnapshot?.currentMonthlyPayment && mortgageSnapshot.currentMonthlyPayment > 0
      ? convertMortgageAmount(mortgageSnapshot.currentMonthlyPayment)
      : mortgage
        ? 0
        : getNumericValue(property.monthlyMortgagePayment);

  const expenseBreakdown = getAnnualExpenseBreakdown(property, rateOverrides);
  const mortgageBreakdown = getMortgageBreakdown(property, mortgage, rateOverrides);
  const totalMonthlyExpenses =
    expenseBreakdown.monthlyRecurringExpenses +
    monthlyMortgagePayment;
  const netMonthlyCashflow = monthlyRent - totalMonthlyExpenses;
  const annualRent = monthlyRent * 12;
  const annualMortgagePayment = monthlyMortgagePayment * 12;
  const totalAnnualExpenses =
    expenseBreakdown.annualRecurringExpenses +
    annualMortgagePayment;
  const annualNetCashflow = annualRent - totalAnnualExpenses;
  const taxRuntime = calculatePropertyTaxRuntime(
    {
      ...property,
      annualRent,
      annualMortgageInterest:
        mortgageBreakdown.annualMortgageInterest,
      annualMortgageInterestTax:
        mortgageBreakdown.annualMortgageInterest ??
        (mortgage ? 0 : getNumericValue(property.annualMortgageInterestTax)),
    },
    annualNetCashflow
  );

  const originalLoanAmount = mortgage?.originalLoanAmount
    ? convertMortgageAmount(mortgage.originalLoanAmount)
    : getNumericValue(property.originalLoanAmount);
  const investedCapital = calculateInvestedCapital({
    cashInvested: getNumericValue(property.cashInvested),
    totalInitialInvestment: getNumericValue(property.totalInitialInvestment),
    purchasePrice: convertCurrency(
      getNumericValue(property.purchasePrice),
      getPurchasePriceCurrency(property),
      propertyCurrency,
      rateOverrides
    ),
    hasMortgage: Boolean(property.hasMortgage || mortgage),
    originalLoanAmount,
    totalCashInvestedForPurchase: getNumericValue(property.totalCashInvestedForPurchase),
  });

  const currentEstimatedValue = convertCurrency(
    getNumericValue(property.currentEstimatedValue),
    getCurrentEstimatedValueCurrency(property),
    propertyCurrency,
    rateOverrides
  );
  const purchasePrice = convertCurrency(
    getNumericValue(property.purchasePrice),
    getPurchasePriceCurrency(property),
    propertyCurrency,
    rateOverrides
  );
  const appreciationAmount = currentEstimatedValue - purchasePrice;
  const appreciationPercentage = calculatePercentage(appreciationAmount, purchasePrice);
  const equity = currentEstimatedValue - currentMortgageBalance;
  const equityPercentage = calculatePercentage(equity, currentEstimatedValue);
  const grossYield = calculatePercentage(annualRent, currentEstimatedValue);
  const netYield = calculatePercentage(
    annualRent - expenseBreakdown.annualRecurringExpenses,
    currentEstimatedValue
  );
  const roce = calculatePercentage(
    annualNetCashflow + getNumericValue(mortgageBreakdown.annualPrincipalAmortized),
    investedCapital
  );
  const mortgagePercentageOfRent = calculatePercentage(
    monthlyMortgagePayment,
    monthlyRent
  );
  const operatingExpensesPercentageOfRent = calculatePercentage(
    expenseBreakdown.monthlyOperatingExpenses,
    monthlyRent
  );
  const cashflowPercentageOfRent = calculatePercentage(
    netMonthlyCashflow,
    monthlyRent
  );
  const calculationIssues = [
    ...financialValidationIssues,
    ...(currentEstimatedValue <= 0
      ? ['Property valuation must be greater than zero for valuation-based ratios']
      : []),
    ...(purchasePrice <= 0
      ? ['Purchase price must be greater than zero for appreciation percentage']
      : []),
    ...(investedCapital <= 0
      ? ['Invested capital must be greater than zero for ROCE']
      : []),
    ...(monthlyRent <= 0
      ? ['Monthly rent must be greater than zero for rent-based ratios']
      : []),
    ...(mortgageClassification?.status === 'unverified'
      ? ['Outstanding mortgage balance cannot be verified as active']
      : []),
    ...(mortgageClassification?.dataConflict === 'paid-with-positive-balance'
      ? ['Mortgage is marked paid but retains a positive outstanding balance']
      : []),
  ];

  return {
    calculationIssues: [...new Set(calculationIssues)],
    taxModuleId: taxProfile.moduleId,
    taxModuleLabel: taxProfile.label,
    taxModuleStatus: taxProfile.status,
    annualTaxableRentalIncome: taxRuntime.generic.grossRentalIncome,
    annualDeductibleExpenses: taxRuntime.generic.deductibleExpenses,
    annualNonDeductibleExpenses: taxRuntime.generic.nonDeductibleExpenses,
    annualNetIncomeBeforeTax: taxRuntime.generic.netIncomeBeforeTax,
    estimatedAnnualTax: taxRuntime.generic.estimatedTax,
    annualAfterTaxCashflow: taxRuntime.generic.annualAfterTaxCashflow,
    monthlyAfterTaxCashflow: taxRuntime.generic.monthlyAfterTaxCashflow,
    monthlyRent,
    currentMortgageBalance,
    unverifiedMortgageBalance,
    mortgageClassification: mortgageClassification?.status ?? null,
    mortgageDataConflict: mortgageClassification?.dataConflict ?? null,
    monthlyMortgagePayment,
    monthlyOperatingExpenses: expenseBreakdown.monthlyOperatingExpenses,
    monthlyInsuranceExpenses: expenseBreakdown.monthlyInsuranceExpenses,
    monthlyMortgageInterest: mortgageBreakdown.monthlyMortgageInterest,
    monthlyPrincipalAmortized: mortgageBreakdown.monthlyPrincipalAmortized,
    monthlyTotalMortgagePaid:
      mortgageBreakdown.monthlyTotalMortgagePaid || monthlyMortgagePayment,
    totalMonthlyExpenses,
    netMonthlyCashflow,
    annualRent,
    annualOperatingExpenses: expenseBreakdown.annualOperatingExpenses,
    annualInsuranceExpenses: expenseBreakdown.annualInsuranceExpenses,
    annualRecurringExpenses: expenseBreakdown.annualRecurringExpenses,
    actualTrailing12MonthsExpenses: expenseBreakdown.actualTrailing12MonthsExpenses,
    projectedNext12MonthsExpenses: expenseBreakdown.projectedNext12MonthsExpenses,
    annualMortgageInterest: mortgageBreakdown.annualMortgageInterest,
    annualPrincipalAmortized: mortgageBreakdown.annualPrincipalAmortized,
    annualTotalMortgagePaid: mortgageBreakdown.annualTotalMortgagePaid || annualMortgagePayment,
    annualIbi: expenseBreakdown.annualIbi,
    annualCommunityFees: expenseBreakdown.annualCommunityFees,
    annualManagementFees: expenseBreakdown.annualManagementFees,
    annualHomeInsurance: expenseBreakdown.annualHomeInsurance,
    annualLifeInsurance: expenseBreakdown.annualLifeInsurance,
    annualRentDefaultInsurance: expenseBreakdown.annualRentDefaultInsurance,
    propertyOneTimeCosts: getOneTimeCosts(property, rateOverrides),
    annualMortgagePayment,
    totalAnnualExpenses,
    annualNetCashflow,
    investedCapital,
    appreciationAmount,
    appreciationPercentage,
    equity,
    equityPercentage,
    grossYield,
    netYield,
    roce,
    mortgagePercentageOfRent,
    operatingExpensesPercentageOfRent,
    cashflowPercentageOfRent,
  };
};

export const normalizePropertyRecord = (
  property: Partial<Property>,
  mortgage?: Mortgage
): Property => {
  const purchasePriceCurrency = getPurchasePriceCurrency(property);
  const currentEstimatedValueCurrency = getCurrentEstimatedValueCurrency(property);
  const purchasePrice = getNumericValue(property.purchasePrice);
  const purchasePriceInPropertyCurrency = convertCurrency(
    purchasePrice,
    purchasePriceCurrency,
    getPropertyCurrency(property)
  );
  const acquisitionTaxes = preferFilledNumber(property.acquisitionTaxes, property.transferTaxAmount);
  const notaryAndRegistryCosts = preferFilledNumber(
    property.notaryAndRegistryCosts,
    getNumericValue(property.notaryCost) + getNumericValue(property.registryCost)
  );
  const agencyFees = getNumericValue(property.agencyFees);
  const renovationCosts = preferFilledNumber(
    property.renovationCosts,
    getNumericValue(property.renovationConservation) + getNumericValue(property.renovationImprovements)
  );
  const furnishingCosts = preferFilledNumber(
    property.furnishingCosts,
    property.furnishingAndOther
  );

  const expenseBreakdown = getAnnualExpenseBreakdown(property);
  const transferTaxAmount = preferFilledNumber(property.transferTaxAmount, acquisitionTaxes);
  const itpValueBase = preferFilledNumber(property.itpValueBase, purchasePriceInPropertyCurrency);
  const totalPurchaseCost =
    purchasePriceInPropertyCurrency + acquisitionTaxes + notaryAndRegistryCosts + agencyFees;
  const computedTotalInitialInvestment =
    totalPurchaseCost + renovationCosts + furnishingCosts;
  const totalInitialInvestment = preferFilledNumber(
    property.totalInitialInvestment,
    property.totalCashInvestedForPurchase,
    computedTotalInitialInvestment
  );

  const syncedProperty = syncPropertyLeaseData(property as Property);
  const recurringExpenses = ensureRecurringExpenses(syncedProperty);

  const normalizedBase: Property = {
    id: property.id ?? '',
    currency: getOperatingCurrency(property),
    operatingCurrency: getOperatingCurrency(property),
    propertyValueCurrency: getPropertyValueCurrency(property),
    purchasePriceCurrency,
    currentEstimatedValueCurrency,
    name: property.name ?? '',
    address: property.address ?? '',
    city: property.city ?? '',
    country:
      typeof property.country === 'string' && property.country.trim().length > 0
        ? property.country.trim()
        : 'Spain',
    purchaseDate: property.purchaseDate ?? '',
    occupancyStatus: property.occupancyStatus ?? 'occupied',
    notes: property.notes ?? '',
    builtAreaSqm: getNumericValue(property.builtAreaSqm),
    bedrooms: getNumericValue(property.bedrooms),
    bathrooms: getNumericValue(property.bathrooms),
    floor: getNumericValue(property.floor),
    propertyType: typeof property.propertyType === 'string' ? property.propertyType : '',
    leaseType: typeof property.leaseType === 'string' ? property.leaseType : '',
    leaseEndDate: syncedProperty.leaseEndDate ?? property.leaseEndDate ?? '',
    leases: syncedProperty.leases ?? property.leases ?? [],
    activeLeaseId: syncedProperty.activeLeaseId ?? property.activeLeaseId ?? null,
    recurringExpenses,
    yearBuilt: getNumericValue(property.yearBuilt),
    renovatedYear: getNumericValue(property.renovatedYear),
    furnishedStatus: typeof property.furnishedStatus === 'string' ? property.furnishedStatus : '',
    hasElevator: Boolean(property.hasElevator),
    hasBalcony: Boolean(property.hasBalcony),
    hasParking: Boolean(property.hasParking),
    hasStorageRoom: Boolean(property.hasStorageRoom),
    parkingSpaces: getNumericValue(property.parkingSpaces),
    parkingCoverage:
      property.parkingCoverage === 'covered' || property.parkingCoverage === 'uncovered'
        ? property.parkingCoverage
        : null,
    condition: typeof property.condition === 'string' ? property.condition : '',

    purchasePrice,
    itpValueBase,
    transferTaxRate:
      getNumericValue(property.transferTaxRate) ||
      (itpValueBase > 0 ? (transferTaxAmount / itpValueBase) * 100 : 0),
    transferTaxAmount,
    notaryCost: getNumericValue(property.notaryCost),
    registryCost: getNumericValue(property.registryCost),
    agencyFees,
    totalPurchaseCost,

    renovationConservation: preferFilledNumber(property.renovationConservation, renovationCosts),
    renovationImprovements: getNumericValue(property.renovationImprovements),
    furnishingAndOther: preferFilledNumber(property.furnishingAndOther, furnishingCosts),

    totalInitialInvestment,
    currentEstimatedValue: getNumericValue(property.currentEstimatedValue),
    cashInvested: getNumericValue(property.cashInvested),

    monthlyRent: getNumericValue(syncedProperty.monthlyRent),
    monthlyRentCurrency: syncedProperty.monthlyRentCurrency ?? getRentCurrency(syncedProperty),
    annualRent: 0,
    annualIncomeGrowthRate: getNumericValue(property.annualIncomeGrowthRate),
    expectedRentGrowthPct: getNumericValue(property.expectedRentGrowthPct),
    expectedAnnualAppreciationPct: preferFilledNumber(
      property.expectedAnnualAppreciationPct,
      property.expectedPropertyAppreciationPct
    ),
    expectedPropertyAppreciationPct: getNumericValue(property.expectedPropertyAppreciationPct),
    lastRentUpdateDate: syncedProperty.lastRentUpdateDate ?? property.lastRentUpdateDate ?? '',
    lastPropertyValuationDate: property.lastPropertyValuationDate ?? '',

    communityMonthly: expenseBreakdown.annualCommunityFees / 12,
    communityAnnual: expenseBreakdown.annualCommunityFees,
    ibiAndLocalTaxesMonthly: expenseBreakdown.annualIbi / 12,
    ibiAndLocalTaxesAnnual: expenseBreakdown.annualIbi,
    homeInsuranceMonthly: expenseBreakdown.annualHomeInsurance / 12,
    homeInsuranceAnnual: expenseBreakdown.annualHomeInsurance,
    propertyManagementRate: getNumericValue(property.propertyManagementRate),
    maintenanceMonthly: expenseBreakdown.annualMaintenance / 12,
    maintenanceAnnual: expenseBreakdown.annualMaintenance,
    otherOperatingExpensesMonthly: expenseBreakdown.annualOtherExpenses / 12,
    otherOperatingExpensesAnnual: expenseBreakdown.annualOtherExpenses,

    totalOperatingExpensesMonthly: 0,
    totalOperatingExpensesAnnual: 0,
    annualExpenseGrowthRate: getNumericValue(property.annualExpenseGrowthRate),
    expectedCommunityGrowthPct: getNumericValue(property.expectedCommunityGrowthPct),
    expectedInsuranceGrowthPct: getNumericValue(property.expectedInsuranceGrowthPct),
    expectedTaxGrowthPct: getNumericValue(property.expectedTaxGrowthPct),
    expectedMaintenanceGrowthPct: getNumericValue(property.expectedMaintenanceGrowthPct),

    acquisitionTaxes,
    notaryAndRegistryCosts,
    renovationCosts,
    furnishingCosts,
    annualIBI: expenseBreakdown.annualIbi,
    annualHomeInsurance: expenseBreakdown.annualHomeInsurance,
    annualLifeInsurance: expenseBreakdown.annualLifeInsurance,
    annualRentDefaultInsurance: expenseBreakdown.annualRentDefaultInsurance,
    annualNonPaymentInsurance: expenseBreakdown.annualNonPaymentInsurance,
    annualCommunityFees: expenseBreakdown.annualCommunityFees,
    annualManagementFees: expenseBreakdown.annualManagementFees,
    annualMaintenance: expenseBreakdown.annualMaintenance,
    annualUtilitiesPaidByOwner: expenseBreakdown.annualUtilitiesPaidByOwner,
    annualOtherExpenses: expenseBreakdown.annualOtherExpenses,
    annualMortgageInterest:
      property.annualMortgageInterest === null
        ? null
        : getNumericValue(property.annualMortgageInterest),
    annualPrincipalAmortized:
      property.annualPrincipalAmortized === null
        ? null
        : getNumericValue(property.annualPrincipalAmortized),
    annualTotalMortgagePaid: preferFilledNumber(
      property.annualTotalMortgagePaid,
      getNumericValue(property.annualMortgageInterest) +
        getNumericValue(property.annualPrincipalAmortized)
    ),
    oneTimeTenantPlacementFee: getNumericValue(property.oneTimeTenantPlacementFee),
    rentalDeposit: getNumericValue(property.rentalDeposit),
    rentalDepositCurrency: property.rentalDepositCurrency ?? getDepositCurrency(property),
    lateFeeAmount: getNumericValue(property.lateFeeAmount),
    lateFeeCurrency: property.lateFeeCurrency ?? getRentCurrency(property),
    furnitureCost: preferFilledNumber(property.furnitureCost, property.furnishingAndOther),
    totalCashInvestedForPurchase: preferFilledNumber(
      property.totalCashInvestedForPurchase,
      property.cashInvested,
      totalInitialInvestment
    ),

    hasMortgage: Boolean(property.hasMortgage || mortgage),
    lenderName: mortgage?.lenderName ?? property.lenderName,
    originalLoanAmount: mortgage?.originalLoanAmount ?? getNumericValue(property.originalLoanAmount),
    currentMortgageBalance: mortgage?.currentBalance ?? getNumericValue(property.currentMortgageBalance),
    monthlyMortgagePayment:
      mortgage?.monthlyMortgagePayment ?? getNumericValue(property.monthlyMortgagePayment),

    loanToValueAtPurchase: getNumericValue(property.loanToValueAtPurchase),
    mortgageTermYears: mortgage?.mortgageTermYears ?? getNumericValue(property.mortgageTermYears),
    initialInterestRateYear1: getNumericValue(property.initialInterestRateYear1),
    interestType: property.interestType ?? '',
    baseRateWithoutBonificationsAfterYear1: getNumericValue(
      property.baseRateWithoutBonificationsAfterYear1
    ),
    maxBonifiedRateAfterYear1: getNumericValue(property.maxBonifiedRateAfterYear1),
    monthlyMortgagePaymentYear1: getNumericValue(property.monthlyMortgagePaymentYear1),
    monthlyMortgagePaymentWithoutBonificationsReference: getNumericValue(
      property.monthlyMortgagePaymentWithoutBonificationsReference
    ),
    monthlyMortgagePaymentWithMaxBonificationsReference: getNumericValue(
      property.monthlyMortgagePaymentWithMaxBonificationsReference
    ),
    firstYearInterestAnnual: getNumericValue(property.firstYearInterestAnnual),
    firstYearPrincipalAnnual: getNumericValue(property.firstYearPrincipalAnnual),
    propertyValuationForMortgage: getNumericValue(property.propertyValuationForMortgage),
    mortgageAppraisalCost: getNumericValue(property.mortgageAppraisalCost),
    registryCheckCost: getNumericValue(property.registryCheckCost),
    estimatedAnnualHomeInsuranceForBank: getNumericValue(
      property.estimatedAnnualHomeInsuranceForBank
    ),
    estimatedAnnualLifeInsurance: getNumericValue(property.estimatedAnnualLifeInsurance),
    estimatedAnnualPaymentProtectionInsurance: getNumericValue(
      property.estimatedAnnualPaymentProtectionInsurance
    ),

    cadastralValueTotal: getNumericValue(property.cadastralValueTotal),
    cadastralConstructionValue: getNumericValue(property.cadastralConstructionValue),
    cadastralLandValue: getNumericValue(property.cadastralLandValue),

    annualTaxableRentalIncome: getNumericValue(property.annualTaxableRentalIncome),
    annualDeductibleExpenses: getNumericValue(property.annualDeductibleExpenses),
    annualDepreciationTax: getNumericValue(property.annualDepreciationTax),
    annualMortgageInterestTax: getNumericValue(property.annualMortgageInterestTax),
    annualNetTaxableIncome: getNumericValue(property.annualNetTaxableIncome),
    taxReductionPercentage: getNumericValue(property.taxReductionPercentage),
    marginalTaxRate: getNumericValue(property.marginalTaxRate),
    estimatedAnnualTax: getNumericValue(property.estimatedAnnualTax),
    taxNotes: property.taxNotes ?? '',
    spainOwnerType: property.spainOwnerType ?? 'individual',
    spainRentalType: property.spainRentalType ?? 'long-term',
    spainOwnershipPercentage: getNumericValue(property.spainOwnershipPercentage) || 100,
    spainAutonomousCommunity: property.spainAutonomousCommunity ?? '',
    spainEstimatedMarginalTaxRate:
      getNumericValue(property.spainEstimatedMarginalTaxRate) ||
      getNumericValue(property.marginalTaxRate),

    grossYield: getNumericValue(property.grossYield),
    netYield: getNumericValue(property.netYield),
    monthlyCashflow: getNumericValue(property.monthlyCashflow),
    roceYear1: getNumericValue(property.roceYear1),
    rocePlusAppreciation5Years: getNumericValue(property.rocePlusAppreciation5Years),
    rocePlusAppreciation10Years: getNumericValue(property.rocePlusAppreciation10Years),
    rocePlusAppreciation15Years: getNumericValue(property.rocePlusAppreciation15Years),
    mortgageVsRentPercentage: getNumericValue(property.mortgageVsRentPercentage),
    cashflowVsRentPercentage: getNumericValue(property.cashflowVsRentPercentage),

    imageUrls: Array.isArray(property.imageUrls)
      ? property.imageUrls
          .map((url) => normalizePropertyImageUrl(url))
          .filter((url): url is string => Boolean(url))
      : property.imageUrl
      ? [property.imageUrl]
      : [],
    imageThumbnailUrls: Array.isArray(property.imageThumbnailUrls)
      ? property.imageThumbnailUrls
          .map((url) => normalizePropertyImageUrl(url))
          .filter((url): url is string => Boolean(url))
      : [],
    primaryImageIndex: getNumericValue(property.primaryImageIndex),
    imageUrl: property.imageUrl ?? '',
  };

  const normalizedImageUrls = normalizedBase.imageUrls ?? [];
  const safePrimaryImageIndex =
    normalizedImageUrls.length === 0
      ? 0
      : Math.min(
          Math.max(Math.trunc(getNumericValue(normalizedBase.primaryImageIndex)), 0),
          normalizedImageUrls.length - 1
        );

  normalizedBase.imageUrls = normalizedImageUrls;
  normalizedBase.imageThumbnailUrls = normalizedBase.imageThumbnailUrls ?? [];
  normalizedBase.primaryImageIndex = safePrimaryImageIndex;
  normalizedBase.imageUrl =
    normalizedImageUrls[safePrimaryImageIndex] ?? normalizedBase.imageUrl ?? '';

  const financials = calculatePropertyFinancials(normalizedBase, mortgage);
  const taxRuntime = calculatePropertyTaxRuntime(normalizedBase, financials.annualNetCashflow);
  normalizedBase.annualTaxableRentalIncome = taxRuntime.generic.grossRentalIncome;
  normalizedBase.annualDeductibleExpenses = taxRuntime.generic.deductibleExpenses;
  normalizedBase.annualNetTaxableIncome = taxRuntime.generic.netIncomeBeforeTax;
  normalizedBase.estimatedAnnualTax = taxRuntime.generic.estimatedTax;
  normalizedBase.taxReductionPercentage = (taxRuntime.spain?.reductionRate ?? 0) * 100;

  return {
    ...normalizedBase,
    totalInitialInvestment,
    cashInvested: financials.investedCapital,
    annualRent: financials.annualRent,
    totalOperatingExpensesMonthly: financials.annualRecurringExpenses / 12,
    totalOperatingExpensesAnnual: financials.annualRecurringExpenses,
    annualMortgageInterest: financials.annualMortgageInterest,
    annualPrincipalAmortized: financials.annualPrincipalAmortized,
    annualTotalMortgagePaid: financials.annualTotalMortgagePaid,
    currentMortgageBalance: financials.currentMortgageBalance,
    monthlyMortgagePayment: financials.monthlyMortgagePayment,
    grossYield: financials.grossYield,
    netYield: financials.netYield,
    monthlyCashflow: financials.netMonthlyCashflow,
    roceYear1: financials.roce,
    mortgageVsRentPercentage: financials.mortgagePercentageOfRent,
    cashflowVsRentPercentage: financials.cashflowPercentageOfRent,
  };
};

export const normalizeProperties = (
  properties: Property[],
  mortgages: Mortgage[]
): Property[] =>
  properties.map((property) =>
    normalizePropertyRecord(property, findMortgageByProperty(property.id, mortgages))
  );

export const calculateTotalPortfolioValue = (
  properties: Property[],
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): number =>
  properties.reduce(
    (sum, property) =>
      sum +
      convertCurrency(
        property.currentEstimatedValue,
        getCurrentEstimatedValueCurrency(property),
        'EUR',
        rateOverrides
      ),
    0
  );

export const calculateTotalDebt = (
  mortgages: Mortgage[],
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>,
  today: Date = getToday()
): number =>
  mortgages.filter((mortgage) => classifyMortgage(mortgage, today).status === 'active').reduce(
    (sum, mortgage) =>
      sum +
      convertCurrency(
        calculateMortgageSnapshot(mortgage, today).displayedBalance,
        getMortgageCurrency(mortgage),
        'EUR',
        rateOverrides
      ),
    0
  );

export const calculateTotalEquity = (totalValue: number, totalDebt: number): number =>
  totalValue - totalDebt;

export const calculateEquityPercentage = (totalEquity: number, totalValue: number): number =>
  totalValue === 0 ? 0 : (totalEquity / totalValue) * 100;

export const calculatePortfolioMetrics = (
  properties: Property[],
  mortgages: Mortgage[],
  cashAccounts: CashAccount[] = [],
  investmentAccounts: InvestmentAccount[] = [],
  reportingCurrency: DisplayCurrency = 'EUR',
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PortfolioMetrics => {
  const { valuationDisplayCurrency, operatingDisplayCurrency } =
    getPortfolioDomainCurrencies(properties, reportingCurrency);
  const totalPortfolioValueBase = calculateTotalPortfolioValue(properties, rateOverrides);
  const debtProjection = calculatePortfolioDebtProjection(
    mortgages,
    12,
    getToday(),
    rateOverrides
  );
  const totalDebtBase = debtProjection.totalDebtToday;
  const totalDebtIn1YearBase = debtProjection.totalDebtProjected;
  const totalEquityBase = calculateTotalEquity(totalPortfolioValueBase, totalDebtBase);
  const totalEquityIn1YearBase = calculateTotalEquity(totalPortfolioValueBase, totalDebtIn1YearBase);
  const totalPortfolioValue = convertCurrency(
    totalPortfolioValueBase,
    'EUR',
    valuationDisplayCurrency,
    rateOverrides
  );
  const totalDebt = convertCurrency(totalDebtBase, 'EUR', valuationDisplayCurrency, rateOverrides);
  const totalDebtIn1Year = convertCurrency(
    totalDebtIn1YearBase,
    'EUR',
    valuationDisplayCurrency,
    rateOverrides
  );
  const debtChangeIn1Year = totalDebtIn1Year - totalDebt;
  const debtReductionIn1Year = Math.max(totalDebt - totalDebtIn1Year, 0);
  const debtReductionRate = totalDebt > 0 ? debtReductionIn1Year / totalDebt : 0;
  const totalEquity = convertCurrency(
    totalEquityBase,
    'EUR',
    valuationDisplayCurrency,
    rateOverrides
  );
  const totalEquityIn1Year = convertCurrency(
    totalEquityIn1YearBase,
    'EUR',
    valuationDisplayCurrency,
    rateOverrides
  );
  const equityChangeIn1Year = totalEquityIn1Year - totalEquity;
  const availableCash = cashAccounts.reduce(
    (sum, account) =>
      sum +
      convertCurrency(
        getCashBalanceValue(account),
        account.currency,
        valuationDisplayCurrency,
        rateOverrides
      ),
    0
  );
  const investmentsValue = investmentAccounts.reduce(
    (sum, account) =>
      sum +
      convertCurrency(
        getNumericValue(account.balance),
        account.currency,
        valuationDisplayCurrency,
        rateOverrides
      ),
    0
  );
  const totalNetWorth = totalEquity + availableCash + investmentsValue;

  const propertyFinancials = properties.map((property) =>
    calculatePropertyFinancials(
      property,
      findMortgageByProperty(property.id, mortgages),
      rateOverrides
    )
  );

  const totalMonthlyRent = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.monthlyRent,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const totalMonthlyOperatingExpenses = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.annualRecurringExpenses / 12,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const totalAnnualExpenses = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.annualRecurringExpenses,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const actualTrailing12MonthsExpenses = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.actualTrailing12MonthsExpenses,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const projectedNext12MonthsExpenses = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.projectedNext12MonthsExpenses,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const totalMonthlyMortgagePayments = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.monthlyMortgagePayment,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const totalNetMonthlyCashflow = sumInCurrency(
    propertyFinancials.map((financials, index) => ({
      value: financials.netMonthlyCashflow,
      currency: getPropertyCurrency(properties[index]),
    })),
    operatingDisplayCurrency,
    rateOverrides
  );
  const annualizedCashflow = totalNetMonthlyCashflow * 12;
  const totalAnnualRentBase = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        financials.annualRent,
        getPropertyCurrency(properties[index]),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalRecurringExpensesBase = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        financials.annualRecurringExpenses,
        getPropertyCurrency(properties[index]),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalNetCashflowBase = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        financials.annualNetCashflow,
        getPropertyCurrency(properties[index]),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalPrincipalAmortizedBase = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        getNumericValue(financials.annualPrincipalAmortized),
        getPropertyCurrency(properties[index]),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalInvestedCapitalBase = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        financials.investedCapital,
        getPropertyCurrency(properties[index]),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalInvestedCapital = propertyFinancials.reduce(
    (sum, financials, index) =>
      sum +
      convertCurrency(
        financials.investedCapital,
        getPropertyCurrency(properties[index]),
        valuationDisplayCurrency,
        rateOverrides
      ),
    0
  );
  const totalEstimatedAnnualPropertyAppreciationBase = properties.reduce(
    (sum, property) =>
      sum +
      convertCurrency(
        (getNumericValue(property.currentEstimatedValue) *
        getNumericValue(
          property.expectedAnnualAppreciationPct ?? property.expectedPropertyAppreciationPct
        )) /
        100,
        getCurrentEstimatedValueCurrency(property),
        'EUR',
        rateOverrides
      ),
    0
  );
  const totalEstimatedAnnualPropertyAppreciation = convertCurrency(
    totalEstimatedAnnualPropertyAppreciationBase,
    'EUR',
    valuationDisplayCurrency,
    rateOverrides
  );
  const annualValueCreation =
    convertCurrency(debtProjection.principalPaid, 'EUR', valuationDisplayCurrency, rateOverrides) +
    convertCurrency(totalNetCashflowBase, 'EUR', valuationDisplayCurrency, rateOverrides) +
    totalEstimatedAnnualPropertyAppreciation;
  const averageGrossYield =
    totalPortfolioValueBase === 0 ? 0 : (totalAnnualRentBase / totalPortfolioValueBase) * 100;
  const averageNetYield =
    totalPortfolioValueBase === 0
      ? 0
      : (
          (totalAnnualRentBase - totalRecurringExpensesBase) /
          totalPortfolioValueBase
        ) * 100;
  const portfolioRoce =
    totalInvestedCapitalBase === 0
      ? 0
      : ((totalNetCashflowBase + totalPrincipalAmortizedBase) / totalInvestedCapitalBase) * 100;
  const cashOnCashReturn =
    totalInvestedCapitalBase === 0 ? 0 : (totalNetCashflowBase / totalInvestedCapitalBase) * 100;
  const equityVsInvestedCapitalRatio =
    totalInvestedCapital === 0 ? 0 : (totalEquity / totalInvestedCapital) * 100;
  const debtToValueRatio =
    totalPortfolioValue === 0 ? 0 : (totalDebt / totalPortfolioValue) * 100;
  const annualValueCreationOnCapital =
    totalInvestedCapital === 0 ? 0 : (annualValueCreation / totalInvestedCapital) * 100;
  const taxPreview = calculatePortfolioTaxPreview(
    properties,
    mortgages,
    operatingDisplayCurrency,
    rateOverrides
  );

  return {
    valuationDisplayCurrency,
    operatingDisplayCurrency,
    totalPortfolioValue,
    totalPortfolioAssetValue: totalPortfolioValue + investmentsValue,
    totalDebt,
    totalDebtIn1Year,
    debtChangeIn1Year,
    debtReductionIn1Year,
    debtReductionRate,
    totalEquity,
    totalEquityIn1Year,
    equityChangeIn1Year,
    totalInvestedCapital,
    equityVsInvestedCapitalRatio,
    equityPercentage: calculateEquityPercentage(totalEquity, totalPortfolioValue),
    availableCash,
    investmentsValue,
    totalNetWorth,
    totalMonthlyRent,
    totalMonthlyOperatingExpenses,
    totalAnnualExpenses,
    actualTrailing12MonthsExpenses,
    projectedNext12MonthsExpenses,
    totalMonthlyMortgagePayments,
    totalNetMonthlyCashflow,
    annualizedCashflow,
    averageGrossYield,
    averageNetYield,
    cashOnCashReturn,
    portfolioRoce,
    debtToValueRatio,
    principalRepaidNext12Months: convertCurrency(
      debtProjection.principalPaid,
      'EUR',
      valuationDisplayCurrency,
      rateOverrides
    ),
    interestPaidNext12Months: convertCurrency(
      debtProjection.interestPaid,
      'EUR',
      operatingDisplayCurrency,
      rateOverrides
    ),
    totalEstimatedAnnualPropertyAppreciation,
    annualValueCreation,
    annualValueCreationOnCapital,
    estimatedAnnualTax: taxPreview.estimatedAnnualTax,
    estimatedAnnualAfterTaxCashflow: taxPreview.estimatedAnnualAfterTaxCashflow,
    estimatedMonthlyAfterTaxCashflow: taxPreview.estimatedMonthlyAfterTaxCashflow,
  };
};

export const calculatePropertyMetrics = (
  property: Property,
  mortgage: Mortgage | undefined,
  _reportingCurrency: DisplayCurrency = 'EUR',
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyMetrics => {
  const financials = calculatePropertyFinancials(property, mortgage, rateOverrides);
  const propertyCurrency = getPropertyCurrency(property);
  const valuationDisplayCurrency = getPropertyValueCurrency(property);
  const operatingDisplayCurrency = getOperatingCurrency(property);

  return {
    id: property.id,
    name: property.name,
    city: property.city,
    country: property.country,
    valuationDisplayCurrency,
    operatingDisplayCurrency,
    currentEstimatedValue: convertCurrency(
      property.currentEstimatedValue,
      getCurrentEstimatedValueCurrency(property),
      valuationDisplayCurrency,
      rateOverrides
    ),
    mortgageBalance: convertCurrency(
      financials.currentMortgageBalance,
      propertyCurrency,
      valuationDisplayCurrency,
      rateOverrides
    ),
    equity: convertCurrency(financials.equity, propertyCurrency, valuationDisplayCurrency, rateOverrides),
    investedCapital: convertCurrency(
      financials.investedCapital,
      propertyCurrency,
      valuationDisplayCurrency,
      rateOverrides
    ),
    equityPercentage: financials.equityPercentage,
    annualRentalIncome: convertCurrency(
      financials.annualRent,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    totalAnnualExpenses: convertCurrency(
      financials.annualRecurringExpenses,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    actualTrailing12MonthsExpenses: convertCurrency(
      financials.actualTrailing12MonthsExpenses,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    projectedNext12MonthsExpenses: convertCurrency(
      financials.projectedNext12MonthsExpenses,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    monthlyExpensesEquivalent: convertCurrency(
      financials.monthlyOperatingExpenses + financials.monthlyInsuranceExpenses,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    netMonthlyCashflow: convertCurrency(
      financials.netMonthlyCashflow,
      propertyCurrency,
      operatingDisplayCurrency,
      rateOverrides
    ),
    grossYield: financials.grossYield,
    netYield: financials.netYield,
    roce: financials.roce,
  };
};

export const calculateAllPropertyMetrics = (
  properties: Property[],
  mortgages: Mortgage[],
  reportingCurrency: DisplayCurrency = 'EUR',
  rateOverrides?: number | Partial<Record<DisplayCurrency, number>>
): PropertyMetrics[] =>
  properties.map((property) =>
    calculatePropertyMetrics(
      property,
      findMortgageByProperty(property.id, mortgages),
      reportingCurrency,
      rateOverrides
    )
  );

export type PropertyDetails = PropertyFinancials;
export const calculatePropertyDetails = calculatePropertyFinancials;
