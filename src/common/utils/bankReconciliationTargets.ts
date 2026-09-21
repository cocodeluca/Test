import type {
  ExpenseObligation,
  ExpensePayment,
  Property,
  PropertyExpenseRule,
  RentPayment,
  RentReceivable,
} from '../types';
import {
  buildExpenseObligationViews,
  generateExpenseObligations,
  type ExpenseObligationView,
} from './propertyExpenses';
import {
  buildRentReceivableViews,
  generateRentReceivables,
  toRentPeriod,
  type RentReceivableView,
} from './rentCollection';

export interface BankReconciliationTargetContext {
  properties: Property[];
  rentReceivables: RentReceivable[];
  rentPayments: RentPayment[];
  propertyExpenseRules?: PropertyExpenseRule[];
  expenseObligations: ExpenseObligation[];
  expensePayments: ExpensePayment[];
  today?: Date;
}

export interface BankReconciliationTargets {
  rentReceivables: RentReceivable[];
  rentReceivableViews: RentReceivableView[];
  expenseObligations: ExpenseObligation[];
  expenseObligationViews: ExpenseObligationView[];
}

export interface BankReconciliationTargetDiagnostic {
  targetType: 'rent-receivable' | 'expense-obligation';
  propertyName: string;
  periodOrCategory: string;
  expectedAmount: number;
  outstandingAmount: number;
  currency: string;
  dueDate: string;
}

export interface BankReconciliationTargetDiagnostics {
  derivedRentTargetCount: number;
  derivedExpenseTargetCount: number;
  targets: BankReconciliationTargetDiagnostic[];
}

const isOutstanding = (target: { outstandingAmount: number; status: string }) =>
  target.outstandingAmount > 0 && target.status !== 'PAID';

// Older persisted obligations can predate the deterministic generated ID. A rule and
// period still represent one canonical bill, so prefer the persisted record over a
// duplicate generated view of that same bill.
const removeDuplicateGeneratedObligations = (
  obligations: ExpenseObligation[],
  persisted: ExpenseObligation[]
) => {
  const persistedByRuleAndPeriod = new Map(
    persisted
      .filter((obligation) => Boolean(obligation.expenseRuleId))
      .map((obligation) => [`${obligation.expenseRuleId}|${obligation.period}`, obligation.id])
  );
  return obligations.filter((obligation) => {
    if (!obligation.expenseRuleId) return true;
    const persistedId = persistedByRuleAndPeriod.get(`${obligation.expenseRuleId}|${obligation.period}`);
    return !persistedId || persistedId === obligation.id;
  });
};

const mergeCanonicalRentReceivables = (
  persisted: RentReceivable[],
  generated: RentReceivable[]
) => {
  const byLeaseAndPeriod = new Map<string, RentReceivable>();
  persisted.forEach((receivable) => {
    byLeaseAndPeriod.set(`${receivable.leaseId}|${receivable.period}`, receivable);
  });
  generated.forEach((receivable) => {
    const key = `${receivable.leaseId}|${receivable.period}`;
    if (!byLeaseAndPeriod.has(key)) byLeaseAndPeriod.set(key, receivable);
  });
  return [...byLeaseAndPeriod.values()].sort((left, right) =>
    left.period.localeCompare(right.period) || left.propertyId.localeCompare(right.propertyId)
  );
};

export const deriveBankReconciliationTargets = (
  context: BankReconciliationTargetContext
): BankReconciliationTargets => {
  const today = context.today ?? new Date();
  // Keep rent-period eligibility exactly aligned with Rent Collection: through the
  // current rent period, never by a reconciliation-specific period calculation.
  const rentReceivables = mergeCanonicalRentReceivables(
    context.rentReceivables,
    generateRentReceivables(context.properties, context.rentReceivables, {
    today,
    throughPeriod: toRentPeriod(today),
    payments: context.rentPayments,
    })
  );
  const expenseObligations = removeDuplicateGeneratedObligations(
    generateExpenseObligations(
      context.propertyExpenseRules ?? [],
      context.properties,
      context.expenseObligations,
      { today }
    ),
    context.expenseObligations
  );

  return {
    rentReceivables,
    rentReceivableViews: buildRentReceivableViews(
      rentReceivables,
      context.rentPayments,
      context.properties,
      today
    ),
    expenseObligations,
    expenseObligationViews: buildExpenseObligationViews(
      expenseObligations,
      context.expensePayments,
      today
    ),
  };
};

export const getBankReconciliationTargetDiagnostics = (
  context: BankReconciliationTargetContext
): BankReconciliationTargetDiagnostics => {
  const targets = deriveBankReconciliationTargets(context);
  const propertyNames = new Map(context.properties.map((property) => [property.id, property.name]));
  const rentTargets = targets.rentReceivableViews.filter(isOutstanding).map((receivable) => ({
    targetType: 'rent-receivable' as const,
    propertyName: propertyNames.get(receivable.propertyId) ?? 'Unknown property',
    periodOrCategory: receivable.period,
    expectedAmount: receivable.expectedAmount,
    outstandingAmount: receivable.outstandingAmount,
    currency: receivable.currency,
    dueDate: receivable.dueDate,
  }));
  const expenseTargets = targets.expenseObligationViews.filter(isOutstanding).map((obligation) => ({
    targetType: 'expense-obligation' as const,
    propertyName: propertyNames.get(obligation.propertyId) ?? 'Unknown property',
    periodOrCategory: obligation.category,
    expectedAmount: obligation.expectedAmount,
    outstandingAmount: obligation.outstandingAmount,
    currency: obligation.currency,
    dueDate: obligation.dueDate,
  }));
  return {
    derivedRentTargetCount: rentTargets.length,
    derivedExpenseTargetCount: expenseTargets.length,
    targets: [...rentTargets, ...expenseTargets],
  };
};
