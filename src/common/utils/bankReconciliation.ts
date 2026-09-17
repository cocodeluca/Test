import type {
  BankReconciliationStatus,
  BankReconciliationTargetType,
  BankTransaction,
  BankTransactionReconciliation,
  ExpenseObligation,
  ExpensePayment,
  Property,
  RentPayment,
  RentReceivable,
} from '../types';
import { buildExpenseObligationViews, createManualExpensePayment } from './propertyExpenses';
import { buildRentReceivableViews, createManualRentPayment } from './rentCollection';
import type { BankTransactionLifecycleEvent } from './bankTransactions';

export type BankReconciliationReason = 'exact-amount' | 'similar-amount' | 'partial-amount' | 'existing-manual-payment' | 'date-proximity' | 'property-context';

export interface BankReconciliationSuggestion {
  targetType: BankReconciliationTargetType;
  targetId: string;
  propertyId: string;
  propertyName: string;
  targetLabel: string;
  outstandingAmount: number;
  currency: BankTransaction['currency'];
  reasons: BankReconciliationReason[];
  existingPaymentId?: string | null;
}

export interface BankReconciliationView {
  status: BankReconciliationStatus;
  suggestion: BankReconciliationSuggestion | null;
  reconciliation: BankTransactionReconciliation | null;
}

export interface BankReconciliationContext {
  properties: Property[];
  rentReceivables: RentReceivable[];
  rentPayments: RentPayment[];
  expenseObligations: ExpenseObligation[];
  expensePayments: ExpensePayment[];
  today?: Date;
}

interface Candidate {
  suggestion: BankReconciliationSuggestion;
  amountDifference: number;
  dateDistance: number;
  amountReason: Extract<BankReconciliationReason, 'exact-amount' | 'similar-amount' | 'partial-amount'>;
}

const MAX_DATE_DISTANCE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysBetween = (left: string, right: string) => {
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? Math.abs(Math.round((leftTime - rightTime) / MS_PER_DAY))
    : Number.POSITIVE_INFINITY;
};

const getPropertyContextId = (transaction: BankTransaction) => {
  const propertyId = transaction.providerMetadata?.propertyId;
  return typeof propertyId === 'string' && propertyId.trim() ? propertyId : null;
};

const getAmountReason = (transactionAmount: number, outstandingAmount: number) => {
  if (transactionAmount > outstandingAmount) return null;
  const difference = Math.abs(transactionAmount - outstandingAmount);
  if (difference <= 0.01) return { reason: 'exact-amount' as const, difference };
  const tolerance = Math.min(5, outstandingAmount * 0.01);
  if (transactionAmount <= outstandingAmount && difference <= tolerance) {
    return { reason: 'similar-amount' as const, difference };
  }
  return transactionAmount < outstandingAmount
    ? { reason: 'partial-amount' as const, difference }
    : null;
};

const selectConservativeCandidate = (candidates: Candidate[]): BankReconciliationSuggestion | null => {
  const strongCandidates = candidates.filter((candidate) => candidate.amountReason !== 'partial-amount');
  const eligible = strongCandidates.length > 0 ? strongCandidates : candidates;
  if (strongCandidates.length === 0 && eligible.length !== 1) return null;
  const sorted = [...eligible].sort((left, right) =>
    left.amountDifference - right.amountDifference ||
    left.dateDistance - right.dateDistance ||
    left.suggestion.targetId.localeCompare(right.suggestion.targetId)
  );
  const best = sorted[0];
  if (!best) return null;
  const equallyStrong = sorted[1] &&
    sorted[1].amountDifference === best.amountDifference &&
    sorted[1].dateDistance === best.dateDistance;
  return equallyStrong ? null : best.suggestion;
};

export const suggestBankTransactionMatch = (
  transaction: BankTransaction,
  context: BankReconciliationContext,
  reconciliations: BankTransactionReconciliation[] = []
): BankReconciliationSuggestion | null => {
  if (
    transaction.pending ||
    transaction.amount === 0 ||
    (transaction.lifecycleStatus && transaction.lifecycleStatus !== 'active')
  ) return null;
  const amount = Math.abs(transaction.amount);
  const propertyContextId = getPropertyContextId(transaction);
  const propertyNames = new Map(context.properties.map((property) => [property.id, property.name]));
  const linkedPaymentIds = new Set(
    reconciliations
      .filter((item) => item.status === 'matched' && item.paymentId)
      .map((item) => item.paymentId!)
  );

  if (transaction.amount > 0) {
    const receivableViews = buildRentReceivableViews(
      context.rentReceivables,
      context.rentPayments,
      context.properties,
      context.today
    );
    const manualPaymentCandidates = receivableViews.flatMap<BankReconciliationSuggestion>((receivable) => {
      if (
        receivable.currency !== transaction.currency ||
        (propertyContextId && receivable.propertyId !== propertyContextId) ||
        daysBetween(transaction.bookingDate, receivable.dueDate) > MAX_DATE_DISTANCE_DAYS
      ) return [];
      return context.rentPayments.flatMap((payment) => {
        const allocation = payment.allocations[0];
        if (
          payment.source !== 'manual' ||
          linkedPaymentIds.has(payment.id) ||
          payment.currency !== transaction.currency ||
          payment.allocations.length !== 1 ||
          allocation?.receivableId !== receivable.id ||
          Math.abs(payment.amount - amount) > 0.01 ||
          Math.abs(allocation.amount - amount) > 0.01 ||
          daysBetween(transaction.bookingDate, payment.receivedDate) > MAX_DATE_DISTANCE_DAYS
        ) return [];
        return [{
          targetType: 'rent-receivable',
          targetId: receivable.id,
          propertyId: receivable.propertyId,
          propertyName: propertyNames.get(receivable.propertyId) ?? receivable.propertyId,
          targetLabel: receivable.period,
          outstandingAmount: receivable.outstandingAmount,
          currency: receivable.currency,
          existingPaymentId: payment.id,
          reasons: [
            'existing-manual-payment',
            'exact-amount',
            'date-proximity',
            ...(propertyContextId ? ['property-context' as const] : []),
          ],
        }];
      });
    });
    if (manualPaymentCandidates.length > 1) return null;
    if (manualPaymentCandidates.length === 1) return manualPaymentCandidates[0];

    const candidates = receivableViews.flatMap<Candidate>((receivable) => {
      if (
        receivable.currency !== transaction.currency ||
        receivable.outstandingAmount <= 0 ||
        receivable.status === 'PAID' ||
        receivable.status === 'UPCOMING' ||
        (propertyContextId && receivable.propertyId !== propertyContextId)
      ) return [];
      const amountMatch = getAmountReason(amount, receivable.outstandingAmount);
      const dateDistance = daysBetween(transaction.bookingDate, receivable.dueDate);
      if (!amountMatch || dateDistance > MAX_DATE_DISTANCE_DAYS) return [];
      return [{
        amountDifference: amountMatch.difference,
        dateDistance,
        amountReason: amountMatch.reason,
        suggestion: {
          targetType: 'rent-receivable',
          targetId: receivable.id,
          propertyId: receivable.propertyId,
          propertyName: propertyNames.get(receivable.propertyId) ?? receivable.propertyId,
          targetLabel: receivable.period,
          outstandingAmount: receivable.outstandingAmount,
          currency: receivable.currency,
          reasons: [
            amountMatch.reason,
            'date-proximity',
            ...(propertyContextId ? ['property-context' as const] : []),
          ],
        },
      }];
    });
    return selectConservativeCandidate(candidates);
  }

  const obligationViews = buildExpenseObligationViews(
    context.expenseObligations,
    context.expensePayments,
    context.today
  );
  const manualPaymentCandidates = obligationViews.flatMap<BankReconciliationSuggestion>((obligation) => {
    if (
      obligation.currency !== transaction.currency ||
      (propertyContextId && obligation.propertyId !== propertyContextId) ||
      daysBetween(transaction.bookingDate, obligation.dueDate) > MAX_DATE_DISTANCE_DAYS
    ) return [];
    return context.expensePayments.flatMap((payment) => {
      const allocation = payment.allocations[0];
      if (
        payment.source !== 'manual' ||
        linkedPaymentIds.has(payment.id) ||
        payment.currency !== transaction.currency ||
        payment.allocations.length !== 1 ||
        allocation?.obligationId !== obligation.id ||
        Math.abs(payment.amount - amount) > 0.01 ||
        Math.abs(allocation.amount - amount) > 0.01 ||
        daysBetween(transaction.bookingDate, payment.paidDate) > MAX_DATE_DISTANCE_DAYS
      ) return [];
      return [{
        targetType: 'expense-obligation',
        targetId: obligation.id,
        propertyId: obligation.propertyId,
        propertyName: propertyNames.get(obligation.propertyId) ?? obligation.propertyId,
        targetLabel: obligation.label,
        outstandingAmount: obligation.outstandingAmount,
        currency: obligation.currency,
        existingPaymentId: payment.id,
        reasons: [
          'existing-manual-payment',
          'exact-amount',
          'date-proximity',
          ...(propertyContextId ? ['property-context' as const] : []),
        ],
      }];
    });
  });
  if (manualPaymentCandidates.length > 1) return null;
  if (manualPaymentCandidates.length === 1) return manualPaymentCandidates[0];

  const candidates = obligationViews.flatMap<Candidate>((obligation) => {
    if (
      obligation.currency !== transaction.currency ||
      obligation.outstandingAmount <= 0 ||
      obligation.status === 'PAID' ||
      obligation.status === 'UPCOMING' ||
      (propertyContextId && obligation.propertyId !== propertyContextId)
    ) return [];
    const amountMatch = getAmountReason(amount, obligation.outstandingAmount);
    const dateDistance = daysBetween(transaction.bookingDate, obligation.dueDate);
    if (!amountMatch || dateDistance > MAX_DATE_DISTANCE_DAYS) return [];
    return [{
      amountDifference: amountMatch.difference,
      dateDistance,
      amountReason: amountMatch.reason,
      suggestion: {
        targetType: 'expense-obligation',
        targetId: obligation.id,
        propertyId: obligation.propertyId,
        propertyName: propertyNames.get(obligation.propertyId) ?? obligation.propertyId,
        targetLabel: obligation.label,
        outstandingAmount: obligation.outstandingAmount,
        currency: obligation.currency,
        reasons: [
          amountMatch.reason,
          'date-proximity',
          ...(propertyContextId ? ['property-context' as const] : []),
        ],
      },
    }];
  });
  return selectConservativeCandidate(candidates);
};

export const getBankReconciliationView = (
  transaction: BankTransaction,
  reconciliations: BankTransactionReconciliation[],
  context: BankReconciliationContext
): BankReconciliationView => {
  const reconciliation = reconciliations.find((item) => item.bankTransactionId === transaction.id) ?? null;
  if (
    reconciliation?.status === 'matched' ||
    reconciliation?.status === 'ignored' ||
    reconciliation?.status === 'removed' ||
    reconciliation?.status === 'reversed'
  ) {
    return { status: reconciliation.status, suggestion: null, reconciliation };
  }
  if (transaction.lifecycleStatus === 'removed' || transaction.lifecycleStatus === 'reversed') {
    return { status: transaction.lifecycleStatus, suggestion: null, reconciliation };
  }
  if (transaction.lifecycleStatus === 'reversal') {
    return { status: 'reversed', suggestion: null, reconciliation };
  }
  const suggestion = suggestBankTransactionMatch(transaction, context, reconciliations);
  return {
    status: suggestion ? 'suggested' : 'unmatched',
    suggestion,
    reconciliation,
  };
};

const upsertReconciliation = (
  reconciliations: BankTransactionReconciliation[],
  next: Omit<BankTransactionReconciliation, 'createdAt' | 'updatedAt'>,
  timestamp: string
) => {
  const existing = reconciliations.find((item) => item.bankTransactionId === next.bankTransactionId);
  const value: BankTransactionReconciliation = {
    ...next,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  return [
    ...reconciliations.filter((item) => item.bankTransactionId !== next.bankTransactionId),
    value,
  ];
};

export const confirmBankTransactionMatch = (args: {
  transaction: BankTransaction;
  targetType: BankReconciliationTargetType;
  targetId: string;
  reconciliations: BankTransactionReconciliation[];
  context: BankReconciliationContext;
  timestamp?: string;
}) => {
  const existing = args.reconciliations.find((item) => item.bankTransactionId === args.transaction.id);
  if (existing?.status === 'matched') {
    return {
      reconciliations: args.reconciliations,
      rentPayments: args.context.rentPayments,
      expensePayments: args.context.expensePayments,
    };
  }
  const suggestion = suggestBankTransactionMatch(args.transaction, args.context, args.reconciliations);
  if (!suggestion || suggestion.targetType !== args.targetType || suggestion.targetId !== args.targetId) {
    return null;
  }

  const timestamp = args.timestamp ?? new Date().toISOString();
  const paymentId = suggestion.existingPaymentId ?? `bank-payment:${encodeURIComponent(args.transaction.id)}`;
  let rentPayments = args.context.rentPayments;
  let expensePayments = args.context.expensePayments;

  if (suggestion.targetType === 'rent-receivable') {
    const receivable = args.context.rentReceivables.find((item) => item.id === suggestion.targetId);
    if (!receivable) return null;
    if (!suggestion.existingPaymentId && !rentPayments.some((payment) => payment.id === paymentId)) {
      rentPayments = [...rentPayments, {
        ...createManualRentPayment({
          id: paymentId,
          receivable,
          receivedDate: args.transaction.bookingDate,
          amount: Math.abs(args.transaction.amount),
          reference: args.transaction.externalTransactionId,
          note: `Bank transaction ${args.transaction.id}`,
          createdAt: timestamp,
        }),
        source: 'bank_sync',
      }];
    }
  } else {
    const obligation = args.context.expenseObligations.find((item) => item.id === suggestion.targetId);
    if (!obligation) return null;
    if (!suggestion.existingPaymentId && !expensePayments.some((payment) => payment.id === paymentId)) {
      expensePayments = [...expensePayments, {
        ...createManualExpensePayment({
          id: paymentId,
          obligation,
          paidDate: args.transaction.bookingDate,
          amount: Math.abs(args.transaction.amount),
          reference: args.transaction.externalTransactionId,
          note: `Bank transaction ${args.transaction.id}`,
          createdAt: timestamp,
        }),
        source: 'bank_sync',
      }];
    }
  }

  return {
    reconciliations: upsertReconciliation(args.reconciliations, {
      bankTransactionId: args.transaction.id,
      status: 'matched',
      targetType: suggestion.targetType,
      targetId: suggestion.targetId,
      paymentId,
      paymentLinkType: suggestion.existingPaymentId ? 'linked-manual' : 'created-bank-sync',
    }, timestamp),
    rentPayments,
    expensePayments,
  };
};

export const ignoreBankTransaction = (
  reconciliations: BankTransactionReconciliation[],
  bankTransactionId: string,
  timestamp = new Date().toISOString()
) => upsertReconciliation(reconciliations, {
  bankTransactionId,
  status: 'ignored',
  targetType: null,
  targetId: null,
  paymentId: null,
}, timestamp);

export const unmatchBankTransaction = (args: {
  bankTransactionId: string;
  reconciliations: BankTransactionReconciliation[];
  rentPayments: RentPayment[];
  expensePayments: ExpensePayment[];
}) => {
  const reconciliation = args.reconciliations.find(
    (item) => item.bankTransactionId === args.bankTransactionId && item.status === 'matched'
  );
  if (!reconciliation) {
    return {
      reconciliations: args.reconciliations,
      rentPayments: args.rentPayments,
      expensePayments: args.expensePayments,
    };
  }

  const paymentId = reconciliation.paymentId;
  const filteredRentPayments = reconciliation.paymentLinkType !== 'linked-manual' &&
    reconciliation.targetType === 'rent-receivable' && paymentId
    ? args.rentPayments.filter(
        (payment) => payment.id !== paymentId || payment.source !== 'bank_sync'
      )
    : args.rentPayments;
  const filteredExpensePayments = reconciliation.paymentLinkType !== 'linked-manual' &&
    reconciliation.targetType === 'expense-obligation' && paymentId
    ? args.expensePayments.filter(
        (payment) => payment.id !== paymentId || payment.source !== 'bank_sync'
      )
    : args.expensePayments;
  return {
    reconciliations: args.reconciliations.filter(
      (item) => item.bankTransactionId !== args.bankTransactionId
    ),
    rentPayments: filteredRentPayments.length === args.rentPayments.length
      ? args.rentPayments
      : filteredRentPayments,
    expensePayments: filteredExpensePayments.length === args.expensePayments.length
      ? args.expensePayments
      : filteredExpensePayments,
  };
};

export const applyBankTransactionLifecycleToReconciliation = (args: {
  lifecycleEvents: BankTransactionLifecycleEvent[];
  reconciliations: BankTransactionReconciliation[];
  rentPayments: RentPayment[];
  expensePayments: ExpensePayment[];
  timestamp?: string;
}) => {
  let reconciliations = args.reconciliations;
  let rentPayments = args.rentPayments;
  let expensePayments = args.expensePayments;
  const timestamp = args.timestamp ?? new Date().toISOString();

  for (const event of args.lifecycleEvents) {
    const reconciliation = reconciliations.find(
      (item) => item.bankTransactionId === event.bankTransactionId
    );
    if (!reconciliation) continue;

    const removesCreatedBankPayment = Boolean(
      reconciliation.status === 'matched' &&
      reconciliation.paymentId &&
      reconciliation.paymentLinkType !== 'linked-manual'
    );
    if (removesCreatedBankPayment) {
      if (reconciliation.targetType === 'rent-receivable') {
        rentPayments = rentPayments.filter(
          (payment) => payment.id !== reconciliation.paymentId || payment.source !== 'bank_sync'
        );
      } else if (reconciliation.targetType === 'expense-obligation') {
        expensePayments = expensePayments.filter(
          (payment) => payment.id !== reconciliation.paymentId || payment.source !== 'bank_sync'
        );
      }
    }

    const nextStatus = reconciliation.status === 'ignored'
      ? 'ignored'
      : event.reason === 'provider-removed' ? 'removed' : 'reversed';
    const alreadyApplied = reconciliation.status === nextStatus &&
      reconciliation.lifecycleReason === event.reason &&
      (reconciliation.lifecycleTransactionId ?? null) === (event.relatedBankTransactionId ?? null);
    if (alreadyApplied) continue;
    reconciliations = reconciliations.map((item) => item.bankTransactionId === event.bankTransactionId ? {
      ...item,
      status: nextStatus,
      ...(removesCreatedBankPayment ? {
        paymentId: null,
        paymentLinkType: null,
        historicalPaymentId: reconciliation.historicalPaymentId ?? reconciliation.paymentId,
        historicalPaymentLinkType:
          reconciliation.historicalPaymentLinkType ??
          reconciliation.paymentLinkType ??
          'created-bank-sync',
      } : {}),
      lifecycleReason: event.reason,
      lifecycleTransactionId: event.relatedBankTransactionId ?? null,
      updatedAt: timestamp,
    } : item);
  }

  return { reconciliations, rentPayments, expensePayments };
};
