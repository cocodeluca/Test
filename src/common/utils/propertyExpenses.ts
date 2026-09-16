import type {
  ExpenseObligation,
  ExpenseObligationStatus,
  ExpensePayment,
  ExpensePaymentAllocation,
  Property,
  PropertyExpenseAmountField,
  PropertyExpenseCategory,
  PropertyExpenseRule,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { compareCivilDates, parseCivilDate, toCivilDate } from './civilDate';
import { convertCurrency, type CurrencyRates } from './currency';

const pad2 = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (date: Date) => { const civil = toCivilDate(date); return `${civil.year}-${pad2(civil.month)}-${pad2(civil.day)}`; };
const validDate = (value?: string) => Boolean(value && parseCivilDate(value));

const daysInMonth = (year: number, month: number) => new Date(year, month, 0, 12).getDate();
const makeDate = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(Math.min(Math.max(1, day), daysInMonth(year, month)))}`;

const periodFor = (frequency: PropertyExpenseRule['frequency'], year: number, month: number) => {
  if (frequency === 'ANNUAL') return String(year);
  if (frequency === 'QUARTERLY') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${pad2(month)}`;
};

export const makeExpenseObligationId = (ruleId: string, period: string) =>
  `expense-obligation:${encodeURIComponent(ruleId)}:${period}`;

const legacyAnnualFallbacks: Partial<Record<PropertyExpenseAmountField, keyof Property>> = {
  communityAnnual: 'annualCommunityFees',
  ibiAndLocalTaxesAnnual: 'annualIBI',
  homeInsuranceAnnual: 'annualHomeInsurance',
  maintenanceAnnual: 'annualMaintenance',
  annualRentDefaultInsurance: 'annualNonPaymentInsurance',
  otherOperatingExpensesAnnual: 'annualOtherExpenses',
};

export const resolveExpenseRuleAmount = (rule: PropertyExpenseRule, property?: Property): number => {
  const field = rule.amountSource?.field;
  if (!field || !property) return Math.max(0, rule.amount);
  let value = Number(property[field] ?? 0);
  if (value <= 0 && legacyAnnualFallbacks[field]) {
    value = Number(property[legacyAnnualFallbacks[field]!] ?? 0);
  }
  return Math.max(0, value || rule.amount);
};

const dueDatesForRule = (rule: PropertyExpenseRule, throughDate: string): string[] => {
  const start = parseCivilDate(rule.startDate);
  const tracking = parseCivilDate(rule.trackingStartDate);
  const through = parseCivilDate(throughDate);
  if (!start || !tracking || !through || !rule.isActive || rule.dueDay < 1 || rule.dueDay > 31) return [];
  const lower = compareCivilDates(start, tracking) > 0 ? start : tracking;
  const upper = rule.endDate && validDate(rule.endDate) && rule.endDate < throughDate
    ? parseCivilDate(rule.endDate)!
    : through;
  if (compareCivilDates(lower, upper) > 0) return [];

  if (rule.frequency === 'ONE_TIME') {
    return rule.startDate >= rule.trackingStartDate && rule.startDate <= throughDate &&
      (!rule.endDate || rule.startDate <= rule.endDate) ? [rule.startDate] : [];
  }

  const result: string[] = [];
  for (let year = lower.year; year <= upper.year; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (rule.frequency === 'ANNUAL' && month !== (rule.dueMonth ?? start.month)) continue;
      if (rule.frequency === 'QUARTERLY' && (month - start.month + 12) % 3 !== 0) continue;
      const dueDate = makeDate(year, month, rule.dueDay);
      if (dueDate < rule.startDate || dueDate < rule.trackingStartDate || dueDate > throughDate) continue;
      if (rule.endDate && dueDate > rule.endDate) continue;
      result.push(dueDate);
    }
  }
  return result;
};

export const generateExpenseObligations = (
  rules: PropertyExpenseRule[],
  properties: Property[],
  existing: ExpenseObligation[] = [],
  options: { throughDate?: string; today?: Date } = {}
): ExpenseObligation[] => {
  const throughDate = options.throughDate ?? toIsoDate(options.today ?? new Date());
  const byId = new Map(existing.map((obligation) => [obligation.id, obligation]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  rules.forEach((rule) => {
    const property = propertyById.get(rule.propertyId);
    if (!property) return;
    dueDatesForRule(rule, throughDate).forEach((dueDate) => {
      const parsed = parseCivilDate(dueDate)!;
      const period = periodFor(rule.frequency, parsed.year, parsed.month);
      const id = makeExpenseObligationId(rule.id, period);
      if (byId.has(id)) return;
      const amount = resolveExpenseRuleAmount(rule, property);
      if (amount <= 0) return;
      byId.set(id, {
        id,
        propertyId: rule.propertyId,
        expenseRuleId: rule.id,
        category: rule.category,
        label: rule.label,
        period,
        dueDate,
        expectedAmount: amount,
        currency: rule.currency,
        generatedAt: toIsoDate(options.today ?? new Date()),
        notes: rule.notes,
      });
    });
  });
  return [...byId.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
};

export const getExpenseAllocatedAmount = (obligationId: string, payments: ExpensePayment[]) =>
  payments.reduce((total, payment) => total + payment.allocations
    .filter((allocation) => allocation.obligationId === obligationId)
    .reduce((sum, allocation) => sum + Math.max(0, allocation.amount), 0), 0);

export const deriveExpenseObligationStatus = (args: {
  obligation: ExpenseObligation;
  allocatedAmount: number;
  today?: Date;
}): ExpenseObligationStatus => {
  const allocated = Math.max(0, args.allocatedAmount);
  const expected = Math.max(0, args.obligation.expectedAmount);
  if (allocated >= expected) return 'PAID';
  if (allocated > 0) return 'PARTIAL';
  const today = toIsoDate(args.today ?? new Date());
  if (args.obligation.dueDate < today) return 'OVERDUE';
  if (args.obligation.dueDate === today) return 'DUE';
  return 'UPCOMING';
};

export interface ExpenseObligationView extends ExpenseObligation {
  allocatedAmount: number;
  outstandingAmount: number;
  status: ExpenseObligationStatus;
  paymentDates: string[];
}

export const buildExpenseObligationViews = (
  obligations: ExpenseObligation[], payments: ExpensePayment[], today: Date = new Date()
): ExpenseObligationView[] => obligations.map((obligation) => {
  const allocatedAmount = getExpenseAllocatedAmount(obligation.id, payments);
  return {
    ...obligation,
    allocatedAmount,
    outstandingAmount: Math.max(obligation.expectedAmount - allocatedAmount, 0),
    status: deriveExpenseObligationStatus({ obligation, allocatedAmount, today }),
    paymentDates: payments
      .filter((payment) => payment.allocations.some((allocation) => allocation.obligationId === obligation.id))
      .map((payment) => payment.paidDate).sort(),
  };
});

export const createManualExpensePayment = (args: {
  id?: string;
  obligation: ExpenseObligation;
  paidDate: string;
  amount: number;
  allocations?: ExpensePaymentAllocation[];
  reference?: string;
  note?: string;
  createdAt?: string;
}): ExpensePayment => ({
  id: args.id ?? `expense-payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  propertyId: args.obligation.propertyId,
  paidDate: args.paidDate,
  amount: args.amount,
  currency: args.obligation.currency,
  source: 'manual',
  reference: args.reference?.trim() || undefined,
  note: args.note?.trim() || undefined,
  allocations: args.allocations ?? [{ obligationId: args.obligation.id, amount: args.amount }],
  createdAt: args.createdAt ?? new Date().toISOString(),
});

export const createOneTimeExpenseObligation = (args: {
  id?: string; propertyId: string; category: PropertyExpenseCategory; label: string;
  expectedAmount: number; currency: DisplayCurrency; dueDate: string; notes?: string;
}): ExpenseObligation => ({
  id: args.id ?? `expense-obligation:manual:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  propertyId: args.propertyId,
  category: args.category,
  label: args.label.trim(),
  period: args.dueDate,
  dueDate: args.dueDate,
  expectedAmount: args.expectedAmount,
  currency: args.currency,
  generatedAt: toIsoDate(new Date()),
  notes: args.notes?.trim() || undefined,
});

export const summarizePropertyExpenses = (
  views: ExpenseObligationView[], payments: ExpensePayment[], today: Date = new Date(),
  options: { targetCurrency?: DisplayCurrency; rateOverrides?: Partial<CurrencyRates> } = {}
) => {
  const current = toIsoDate(today);
  const month = current.slice(0, 7);
  const add = (value: number, currency: DisplayCurrency) => options.targetCurrency
    ? convertCurrency(value, currency, options.targetCurrency, options.rateOverrides) : value;
  return {
    upcomingAmount: views.filter((view) => view.status === 'UPCOMING')
      .reduce((sum, view) => sum + add(view.outstandingAmount, view.currency), 0),
    dueOrOverdueAmount: views.filter((view) => view.status === 'DUE' || view.status === 'OVERDUE' || view.status === 'PARTIAL')
      .reduce((sum, view) => sum + add(view.outstandingAmount, view.currency), 0),
    overdueAmount: views.filter((view) => view.status === 'OVERDUE')
      .reduce((sum, view) => sum + add(view.outstandingAmount, view.currency), 0),
    paidThisMonthAmount: payments.filter((payment) => payment.paidDate.startsWith(month))
      .reduce((sum, payment) => sum + add(payment.amount, payment.currency), 0),
  };
};

export const expenseCategoryForRecurringType = (type: string): PropertyExpenseCategory => ({
  'community-fees': 'COMMUNITY', 'property-tax': 'PROPERTY_TAX', 'home-insurance': 'HOME_INSURANCE',
  'rent-default-insurance': 'RENT_DEFAULT_INSURANCE', 'management-fees': 'PROPERTY_MANAGEMENT',
  maintenance: 'MAINTENANCE', utilities: 'UTILITIES',
}[type] as PropertyExpenseCategory | undefined) ?? 'OTHER';
