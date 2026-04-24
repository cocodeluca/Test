import type {
  Property,
  RecurringExpense,
  RecurringExpenseBillingFrequency,
  RecurringExpenseGrowthFrequency,
  RecurringExpenseProjectionMode,
  RecurringExpenseType,
} from '../types';

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const billingFrequencyMonths = (
  frequency: RecurringExpenseBillingFrequency,
  customMonths?: number | null
) => {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'every-4-months':
      return 4;
    case 'semi-annual':
      return 6;
    case 'yearly':
      return 12;
    case 'custom':
      return Math.max(Math.trunc(customMonths ?? 0), 1);
    default:
      return 12;
  }
};

const growthFrequencyMonths = (
  frequency?: RecurringExpenseGrowthFrequency | null,
  customMonths?: number | null
) => {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'every-3-months':
      return 3;
    case 'every-4-months':
      return 4;
    case 'every-6-months':
      return 6;
    case 'yearly':
      return 12;
    case 'custom':
      return Math.max(Math.trunc(customMonths ?? 0), 1);
    default:
      return 12;
  }
};

const annualizeAmount = (
  amount: number,
  billingFrequency: RecurringExpenseBillingFrequency,
  customMonths?: number | null
) => {
  const months = billingFrequencyMonths(billingFrequency, customMonths);
  return months > 0 ? (amount * 12) / months : amount;
};

const canonicalExpenseDefaults: Array<{
  expenseType: RecurringExpenseType;
  label: string;
  amountKey: keyof Property;
  billingFrequency: RecurringExpenseBillingFrequency;
}> = [
  { expenseType: 'property-tax', label: 'Property tax', amountKey: 'annualIBI', billingFrequency: 'yearly' },
  { expenseType: 'home-insurance', label: 'Home insurance', amountKey: 'annualHomeInsurance', billingFrequency: 'yearly' },
  { expenseType: 'life-insurance', label: 'Life insurance', amountKey: 'annualLifeInsurance', billingFrequency: 'yearly' },
  { expenseType: 'rent-default-insurance', label: 'Rent default insurance', amountKey: 'annualNonPaymentInsurance', billingFrequency: 'yearly' },
  { expenseType: 'community-fees', label: 'Community fees', amountKey: 'annualCommunityFees', billingFrequency: 'monthly' },
  { expenseType: 'management-fees', label: 'Management fees', amountKey: 'annualManagementFees', billingFrequency: 'monthly' },
  { expenseType: 'maintenance', label: 'Maintenance', amountKey: 'annualMaintenance', billingFrequency: 'monthly' },
  { expenseType: 'utilities', label: 'Utilities', amountKey: 'annualUtilitiesPaidByOwner', billingFrequency: 'monthly' },
  { expenseType: 'other-operating', label: 'Other operating', amountKey: 'annualOtherExpenses', billingFrequency: 'monthly' },
];

export const createRecurringExpense = (
  expenseType: RecurringExpenseType,
  label: string,
  country: string,
  billingFrequency: RecurringExpenseBillingFrequency,
  amount: number,
  overrides: Partial<RecurringExpense> = {}
): RecurringExpense => ({
  id: overrides.id ?? buildId('expense'),
  expenseType,
  label,
  country,
  billingFrequency,
  customBillingFrequencyMonths: overrides.customBillingFrequencyMonths ?? null,
  lastKnownAmount: amount,
  lastPaymentDate: overrides.lastPaymentDate ?? '',
  periodCovered: overrides.periodCovered ?? '',
  projectionMode: overrides.projectionMode ?? 'use-last-known-amount',
  manualAnnualEstimate: overrides.manualAnnualEstimate ?? null,
  growthFrequency: overrides.growthFrequency ?? 'yearly',
  customGrowthFrequencyMonths: overrides.customGrowthFrequencyMonths ?? null,
  growthPercentage: overrides.growthPercentage ?? null,
  nextExpectedUpdateDate: overrides.nextExpectedUpdateDate ?? '',
  notes: overrides.notes ?? '',
  documentUrl: overrides.documentUrl ?? null,
  paymentHistory: overrides.paymentHistory ?? [],
  customSchedule: overrides.customSchedule ?? [],
});

export const ensureRecurringExpenses = (property: Partial<Property>): RecurringExpense[] => {
  if (property.recurringExpenses && property.recurringExpenses.length > 0) {
    return property.recurringExpenses;
  }

  return canonicalExpenseDefaults
    .map((definition) => {
      const annualAmount = Number(property[definition.amountKey] ?? 0) || 0;
      if (annualAmount <= 0) {
        return null;
      }

      const amount =
        definition.billingFrequency === 'yearly' ? annualAmount : Math.round((annualAmount / 12) * 100) / 100;

      return createRecurringExpense(
        definition.expenseType,
        definition.label,
        property.country ?? 'Other',
        definition.billingFrequency,
        amount
      );
    })
    .filter(Boolean) as RecurringExpense[];
};

const normalizeProjectionAmount = (
  expense: RecurringExpense,
  projectionMode: RecurringExpenseProjectionMode
) => {
  switch (projectionMode) {
    case 'fixed-amount':
      return annualizeAmount(
        expense.lastKnownAmount,
        expense.billingFrequency,
        expense.customBillingFrequencyMonths
      );
    case 'manual-annual-estimate':
      return expense.manualAnnualEstimate ?? 0;
    case 'use-last-known-amount':
      return annualizeAmount(
        expense.lastKnownAmount,
        expense.billingFrequency,
        expense.customBillingFrequencyMonths
      );
    default:
      return 0;
  }
};

export const calculateRecurringExpenseActualTrailing12Months = (
  expense: RecurringExpense,
  today: Date = new Date()
) => {
  const trailingStart = new Date(today);
  trailingStart.setFullYear(today.getFullYear() - 1);

  const historyTotal = expense.paymentHistory
    .filter((payment) => {
      const paymentDate = new Date(payment.paymentDate);
      return !Number.isNaN(paymentDate.getTime()) && paymentDate >= trailingStart && paymentDate <= today;
    })
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (historyTotal > 0) {
    return historyTotal;
  }

  if (expense.lastPaymentDate) {
    const lastPaymentDate = new Date(expense.lastPaymentDate);
    if (!Number.isNaN(lastPaymentDate.getTime()) && lastPaymentDate >= trailingStart) {
      return annualizeAmount(
        expense.lastKnownAmount,
        expense.billingFrequency,
        expense.customBillingFrequencyMonths
      );
    }
  }

  return 0;
};

export const calculateRecurringExpenseProjectedNext12Months = (
  expense: RecurringExpense,
  today: Date = new Date()
) => {
  if (expense.projectionMode === 'custom-schedule') {
    const horizon = new Date(today);
    horizon.setFullYear(today.getFullYear() + 1);

    return (expense.customSchedule ?? [])
      .filter((entry) => {
        const effectiveDate = new Date(entry.effectiveDate);
        return !Number.isNaN(effectiveDate.getTime()) && effectiveDate > today && effectiveDate <= horizon;
      })
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  if (expense.projectionMode === 'increase-by-x-every-y-months') {
    const billingMonths = billingFrequencyMonths(
      expense.billingFrequency,
      expense.customBillingFrequencyMonths
    );
    const growthMonths = growthFrequencyMonths(
      expense.growthFrequency,
      expense.customGrowthFrequencyMonths
    );
    const periods = Math.max(Math.ceil(12 / Math.max(billingMonths, 1)), 1);
    let currentAmount = expense.lastKnownAmount;
    let total = 0;

    for (let period = 1; period <= periods; period += 1) {
      const monthsAhead = period * billingMonths;
      if (monthsAhead > 12) {
        break;
      }

      if (growthMonths > 0 && monthsAhead % growthMonths === 0) {
        currentAmount *= 1 + (expense.growthPercentage ?? 0) / 100;
      }

      total += currentAmount;
    }

    return total;
  }

  return normalizeProjectionAmount(expense, expense.projectionMode);
};

export const calculateRecurringExpensePortfolioSummary = (
  property: Partial<Property>,
  today: Date = new Date()
) => {
  const recurringExpenses = ensureRecurringExpenses(property);

  const totals = recurringExpenses.reduce(
    (sum, expense) => {
      const actual = calculateRecurringExpenseActualTrailing12Months(expense, today);
      const projected = calculateRecurringExpenseProjectedNext12Months(expense, today);

      sum.actualTrailing12Months += actual;
      sum.projectedNext12Months += projected;
      sum.byType[expense.expenseType] = {
        actualTrailing12Months: actual,
        projectedNext12Months: projected,
      };

      return sum;
    },
    {
      actualTrailing12Months: 0,
      projectedNext12Months: 0,
      byType: {} as Record<
        string,
        { actualTrailing12Months: number; projectedNext12Months: number }
      >,
    }
  );

  return {
    recurringExpenses,
    ...totals,
  };
};
