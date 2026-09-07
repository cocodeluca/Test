import type { Mortgage, Opportunity, Property } from '../types';

export class FinancialValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'FinancialValidationError';
    this.issues = issues;
  }
}

type NumericRecord = Record<string, unknown>;

export const MAX_MORTGAGE_INTEREST_RATE_PERCENT = 100;

export const getLowMortgageInterestRateWarning = (rate: number | null | undefined): string | null =>
  typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate < 0.1
    ? `You entered ${rate}%. Did you mean ${rate * 100}%?`
    : null;

const propertyNonNegativeFields = [
  'purchasePrice',
  'currentEstimatedValue',
  'monthlyRent',
  'builtAreaSqm',
  'acquisitionTaxes',
  'notaryAndRegistryCosts',
  'agencyFees',
  'renovationCosts',
  'furnishingCosts',
  'annualIBI',
  'annualHomeInsurance',
  'annualLifeInsurance',
  'annualRentDefaultInsurance',
  'annualNonPaymentInsurance',
  'annualCommunityFees',
  'annualManagementFees',
  'annualMaintenance',
  'annualUtilitiesPaidByOwner',
  'annualOtherExpenses',
  'originalLoanAmount',
  'currentMortgageBalance',
  'monthlyMortgagePayment',
  'mortgageTermYears',
] as const;

const mortgageNonNegativeFields = [
  'originalLoanAmount',
  'currentBalance',
  'interestRate',
  'mortgageTermYears',
  'mortgageTermMonths',
  'totalPayments',
  'monthlyMortgagePayment',
  'initialMonthlyPayment',
  'regularMonthlyPayment',
  'initialInterestRate',
  'initialRateMonths',
  'baseInterestRate',
  'currentInterestRate',
  'maxBonifiedRate',
  'maxTotalBonificationPoints',
  'valuationAmount',
  'openingFees',
  'valuationFee',
  'brokerFee',
] as const;

const validateNonNegativeFields = (
  record: NumericRecord,
  fields: readonly string[]
): string[] =>
  fields.flatMap((field) => {
    const value = record[field];
    if (value === undefined || value === null) {
      return [];
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [`${field} must be a finite number`];
    }
    if (value < 0) {
      return [`${field} must not be negative`];
    }
    return [];
  });

const validateNonNegativeValue = (path: string, value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [`${path} must be a finite number`];
  }
  if (value < 0) {
    return [`${path} must not be negative`];
  }
  return [];
};

export const getPropertyFinancialValidationIssues = (
  property: Partial<Property>
): string[] => {
  const issues = validateNonNegativeFields(
    property as unknown as NumericRecord,
    propertyNonNegativeFields
  );

  if (property.purchasePrice !== undefined && property.purchasePrice <= 0) {
    issues.push('purchasePrice must be greater than zero');
  }
  if (
    property.currentEstimatedValue !== undefined &&
    property.currentEstimatedValue <= 0
  ) {
    issues.push('currentEstimatedValue must be greater than zero');
  }

  property.recurringExpenses?.forEach((expense, expenseIndex) => {
    issues.push(
      ...validateNonNegativeValue(
        `recurringExpenses[${expenseIndex}].lastKnownAmount`,
        expense.lastKnownAmount
      ),
      ...validateNonNegativeValue(
        `recurringExpenses[${expenseIndex}].manualAnnualEstimate`,
        expense.manualAnnualEstimate
      )
    );
    expense.paymentHistory.forEach((payment, paymentIndex) => {
      issues.push(
        ...validateNonNegativeValue(
          `recurringExpenses[${expenseIndex}].paymentHistory[${paymentIndex}].amount`,
          payment.amount
        )
      );
    });
    expense.customSchedule?.forEach((entry, entryIndex) => {
      issues.push(
        ...validateNonNegativeValue(
          `recurringExpenses[${expenseIndex}].customSchedule[${entryIndex}].amount`,
          entry.amount
        )
      );
    });
  });

  property.leases?.forEach((lease, leaseIndex) => {
    issues.push(
      ...validateNonNegativeValue(
        `leases[${leaseIndex}].monthlyRent`,
        lease.monthlyRent
      ),
      ...validateNonNegativeValue(
        `leases[${leaseIndex}].securityDeposit`,
        lease.securityDeposit
      ),
      ...validateNonNegativeValue(
        `leases[${leaseIndex}].lateFeeAmount`,
        lease.lateFeeAmount
      ),
      ...validateNonNegativeValue(
        `leases[${leaseIndex}].rentUpdateRule.baseRent`,
        lease.rentUpdateRule.baseRent
      )
    );
  });

  return [...new Set(issues)];
};

export const getMortgageFinancialValidationIssues = (
  mortgage: Partial<Mortgage>
): string[] => {
  const issues = validateNonNegativeFields(
    mortgage as unknown as NumericRecord,
    mortgageNonNegativeFields
  );

  if (
    mortgage.originalLoanAmount !== undefined &&
    mortgage.originalLoanAmount <= 0
  ) {
    issues.push('originalLoanAmount principal must be greater than zero');
  }

  const hasPositiveTerm =
    (mortgage.totalPayments ?? 0) > 0 ||
    (mortgage.mortgageTermMonths ?? 0) > 0 ||
    (mortgage.mortgageTermYears ?? 0) > 0;
  if (!hasPositiveTerm) {
    issues.push('mortgage term must be greater than zero');
  }

  ['interestRate', 'initialInterestRate', 'baseInterestRate', 'currentInterestRate'].forEach((field) => {
    const value = (mortgage as unknown as NumericRecord)[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > MAX_MORTGAGE_INTEREST_RATE_PERCENT) {
      issues.push(`${field} must not exceed ${MAX_MORTGAGE_INTEREST_RATE_PERCENT}%`);
    }
  });

  mortgage.availableBonifications?.forEach((item, index) => {
    issues.push(
      ...validateNonNegativeValue(
        `availableBonifications[${index}].bonusPoints`,
        item.bonusPoints
      )
    );
  });
  mortgage.activeBonifications?.forEach((item, index) => {
    issues.push(
      ...validateNonNegativeValue(
        `activeBonifications[${index}].bonusPoints`,
        item.bonusPoints
      )
    );
  });

  return [...new Set(issues)];
};

export const getOpportunityFinancialValidationIssues = (
  opportunity: Partial<Opportunity>
): string[] => {
  const sellingCostPct = opportunity.sellingCostPct;
  if (sellingCostPct === undefined || sellingCostPct === null) {
    return [];
  }
  if (typeof sellingCostPct !== 'number' || !Number.isFinite(sellingCostPct)) {
    return ['sellingCostPct must be a finite number'];
  }
  if (sellingCostPct >= 100) {
    return ['sellingCostPct must be less than 100'];
  }
  return [];
};

export const assertValidPropertyFinancialValues = (
  property: Partial<Property>
): void => {
  const issues = getPropertyFinancialValidationIssues(property);
  if (issues.length > 0) {
    throw new FinancialValidationError(issues);
  }
};

export const assertValidMortgageFinancialValues = (
  mortgage: Partial<Mortgage>
): void => {
  const issues = getMortgageFinancialValidationIssues(mortgage);
  if (issues.length > 0) {
    throw new FinancialValidationError(issues);
  }
};

export const assertValidOpportunityFinancialValues = (
  opportunity: Partial<Opportunity>
): void => {
  const issues = getOpportunityFinancialValidationIssues(opportunity);
  if (issues.length > 0) {
    throw new FinancialValidationError(issues);
  }
};
