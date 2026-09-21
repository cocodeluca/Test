import type {
  BankReconciliationStatus,
  BankReconciliationTargetType,
  BankTransaction,
  BankTransactionReconciliation,
  CashAccount,
  ExpenseObligation,
  ExpensePayment,
  Lease,
  Property,
  PropertyExpenseCategory,
  PropertyExpenseRule,
  RentPayment,
  RentReceivable,
} from '../types';
import { isCashAccountIncludedInPortfolio } from './cashAccounts';
import { createManualExpensePayment } from './propertyExpenses';
import { createManualRentPayment } from './rentCollection';
import { deriveBankReconciliationTargets } from './bankReconciliationTargets';
import type { BankTransactionLifecycleEvent } from './bankTransactions';

export type BankReconciliationReason =
  | 'exact-amount'
  | 'similar-amount'
  | 'partial-amount'
  | 'existing-manual-payment'
  | 'same-currency'
  | 'date-proximity'
  | 'active-lease'
  | 'description-match'
  | 'property-context'
  | 'recurring-obligation'
  | 'unique-eligible-obligation';

export interface BankReconciliationSuggestion {
  targetType: BankReconciliationTargetType;
  targetId: string;
  propertyId: string;
  propertyName: string;
  targetLabel: string;
  period?: string | null;
  dueDate: string;
  expectedAmount: number;
  outstandingAmount: number;
  transactionAmount: number;
  dateDistanceDays: number;
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
  propertyExpenseRules?: PropertyExpenseRule[];
  cashAccounts?: CashAccount[];
  today?: Date;
}

interface Candidate {
  suggestion: BankReconciliationSuggestion;
  amountReason: Extract<BankReconciliationReason, 'exact-amount' | 'similar-amount' | 'partial-amount'>;
  hasPropertyTextMatch: boolean;
  hasSpecificDescriptionMatch: boolean;
}

const MAX_DATE_DISTANCE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TEXT_TOKEN_MIN_LENGTH = 4;
const GENERIC_PROPERTY_TOKENS = new Set([
  'apartment', 'apartamento', 'house', 'casa', 'property', 'propiedad', 'imovel', 'imóvel',
  'street', 'calle', 'avenida', 'avenue', 'road', 'piso', 'unit',
]);
const RENT_KEYWORDS = [
  'rent', 'rental', 'tenant', 'alquiler', 'renta', 'inquilino', 'arrendamento', 'renda', 'locatario',
];
const EXPENSE_CATEGORY_KEYWORDS: Record<PropertyExpenseCategory, string[]> = {
  COMMUNITY: ['community', 'hoa', 'comunidad', 'condominio', 'condomínio'],
  PROPERTY_TAX: ['ibi', 'property tax', 'council tax', 'impuesto bienes inmuebles', 'imposto predial'],
  HOME_INSURANCE: ['home insurance', 'property insurance', 'seguro hogar', 'seguro vivienda', 'seguro casa', 'seguro habitacao', 'seguro habitação'],
  RENT_DEFAULT_INSURANCE: ['rent default', 'rental guarantee', 'seguro impago', 'impago alquiler', 'garantia renda'],
  PROPERTY_MANAGEMENT: ['management fee', 'property management', 'gestion alquiler', 'gestión alquiler', 'gestion inmobiliaria', 'gestão imobiliária'],
  MAINTENANCE: ['maintenance', 'repair', 'mantenimiento', 'reparacion', 'reparación', 'manutencao', 'manutenção', 'reparo'],
  UTILITIES: ['utilities', 'utility', 'electricity', 'water', 'gas', 'electricidad', 'agua', 'luz', 'energia'],
  SPECIAL_ASSESSMENT: ['special assessment', 'assessment', 'derrama'],
  OTHER: [],
};

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

const normalizeText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const transactionText = (transaction: BankTransaction) => normalizeText(
  `${transaction.description} ${transaction.counterparty ?? ''}`
);

const includesPhrase = (text: string, phrase: string) => {
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase.length > 0 && ` ${text} `.includes(` ${normalizedPhrase} `);
};

const meaningfulTokens = (value: string) => normalizeText(value)
  .split(' ')
  .filter((token) => token.length >= TEXT_TOKEN_MIN_LENGTH && !GENERIC_PROPERTY_TOKENS.has(token));

const hasTokenOverlap = (text: string, value: string) =>
  meaningfulTokens(value).some((token) => ` ${text} `.includes(` ${token} `));

const hasPropertyTextMatch = (transaction: BankTransaction, property: Property) => {
  const text = transactionText(transaction);
  return [property.name, property.address]
    .filter(Boolean)
    .some((value) => hasTokenOverlap(text, value));
};

const findReceivableLease = (property: Property, receivable: RentReceivable): Lease | null => {
  if (receivable.leaseId === `legacy-property:${property.id}`) {
    return property.leases?.find((lease) => lease.id === property.activeLeaseId) ??
      property.leases?.find((lease) => lease.active) ?? null;
  }
  return property.leases?.find((lease) => lease.id === receivable.leaseId) ?? null;
};

const isRentCandidateEligible = (
  property: Property | undefined,
  receivable: RentReceivable,
  transaction: BankTransaction
) => {
  if (!property) return false;
  const lease = findReceivableLease(property, receivable);
  // Canonical receivables created before lease IDs were normalized remain eligible.
  // When a matching lease is available, its lifecycle boundaries are authoritative.
  if (!lease) return true;
  if (!lease.active) return false;
  if (transaction.bookingDate < lease.startDate) return false;
  if (lease.endDate && transaction.bookingDate > lease.endDate) return false;
  if (receivable.dueDate < lease.startDate) return false;
  if (lease.endDate && receivable.dueDate > lease.endDate) return false;
  const trackingPeriod = lease.rentTrackingStartDate?.slice(0, 7);
  return !trackingPeriod || receivable.period >= trackingPeriod;
};

const isExpenseRuleEligible = (
  obligation: ExpenseObligation,
  transaction: BankTransaction,
  rules: PropertyExpenseRule[] | undefined
) => {
  if (!obligation.expenseRuleId || !rules) return true;
  const rule = rules.find((candidate) => candidate.id === obligation.expenseRuleId);
  if (!rule) return false;
  if (!rule.isActive || rule.propertyId !== obligation.propertyId) return false;
  if (transaction.bookingDate < rule.startDate || transaction.bookingDate < rule.trackingStartDate) return false;
  return !rule.endDate || transaction.bookingDate <= rule.endDate;
};

const getExpenseDescriptionEvidence = (
  transaction: BankTransaction,
  obligation: ExpenseObligation
) => {
  const text = transactionText(transaction);
  const labelMatch = hasTokenOverlap(text, obligation.label);
  const categoryMatch = EXPENSE_CATEGORY_KEYWORDS[obligation.category]
    .some((keyword) => includesPhrase(text, keyword));
  return { matches: labelMatch || categoryMatch, isSpecific: labelMatch };
};

const hasRentDescriptionEvidence = (transaction: BankTransaction, lease: Lease | null) => {
  const text = transactionText(transaction);
  return RENT_KEYWORDS.some((keyword) => includesPhrase(text, keyword)) ||
    Boolean(lease && hasTokenOverlap(text, `${lease.name} ${lease.notes ?? ''}`));
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
  let eligible = strongCandidates.length > 0 ? strongCandidates : candidates;
  const propertySpecific = eligible.filter((candidate) => candidate.hasPropertyTextMatch);
  if (propertySpecific.length > 0) eligible = propertySpecific;
  const descriptionSpecific = eligible.filter((candidate) => candidate.hasSpecificDescriptionMatch);
  if (descriptionSpecific.length > 0) eligible = descriptionSpecific;
  if (eligible.length !== 1) return null;
  return {
    ...eligible[0].suggestion,
    reasons: [...eligible[0].suggestion.reasons, 'unique-eligible-obligation'],
  };
};

export const suggestBankTransactionMatch = (
  transaction: BankTransaction,
  context: BankReconciliationContext,
  reconciliations: BankTransactionReconciliation[] = []
): BankReconciliationSuggestion | null => {
  const cashAccount = context.cashAccounts?.find(
    (account) => account.id === transaction.cashAccountId
  );
  if (
    (context.cashAccounts && !cashAccount) ||
    (cashAccount && !isCashAccountIncludedInPortfolio(cashAccount)) ||
    transaction.pending ||
    transaction.amount === 0 ||
    (transaction.lifecycleStatus && transaction.lifecycleStatus !== 'active')
  ) return null;
  const amount = Math.abs(transaction.amount);
  const propertyContextId = getPropertyContextId(transaction);
  const propertiesById = new Map(context.properties.map((property) => [property.id, property]));
  const linkedPaymentIds = new Set(
    reconciliations
      .filter((item) => item.status === 'matched' && item.paymentId)
      .map((item) => item.paymentId!)
  );
  const targets = deriveBankReconciliationTargets(context);

  if (transaction.amount > 0) {
    const receivableViews = targets.rentReceivableViews;
    const manualPaymentCandidates = receivableViews.flatMap<BankReconciliationSuggestion>((receivable) => {
      const property = propertiesById.get(receivable.propertyId);
      const dateDistance = daysBetween(transaction.bookingDate, receivable.dueDate);
      if (
        receivable.currency !== transaction.currency ||
        !isRentCandidateEligible(property, receivable, transaction) ||
        (propertyContextId && receivable.propertyId !== propertyContextId) ||
        dateDistance > MAX_DATE_DISTANCE_DAYS
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
          propertyName: property?.name ?? receivable.propertyId,
          targetLabel: receivable.period,
          period: receivable.period,
          dueDate: receivable.dueDate,
          expectedAmount: receivable.expectedAmount,
          outstandingAmount: receivable.outstandingAmount,
          transactionAmount: amount,
          dateDistanceDays: dateDistance,
          currency: receivable.currency,
          existingPaymentId: payment.id,
          reasons: [
            'existing-manual-payment',
            'exact-amount',
            'same-currency',
            'date-proximity',
            ...(findReceivableLease(property!, receivable) ? ['active-lease' as const] : []),
            ...(propertyContextId ? ['property-context' as const] : []),
          ],
        }];
      });
    });
    if (manualPaymentCandidates.length > 1) return null;
    if (manualPaymentCandidates.length === 1) return manualPaymentCandidates[0];

    const candidates = receivableViews.flatMap<Candidate>((receivable) => {
      const property = propertiesById.get(receivable.propertyId);
      const lease = property ? findReceivableLease(property, receivable) : null;
      if (
        receivable.currency !== transaction.currency ||
        receivable.outstandingAmount <= 0 ||
        receivable.status === 'PAID' ||
        !isRentCandidateEligible(property, receivable, transaction) ||
        (propertyContextId && receivable.propertyId !== propertyContextId)
      ) return [];
      const amountMatch = getAmountReason(amount, receivable.outstandingAmount);
      const dateDistance = daysBetween(transaction.bookingDate, receivable.dueDate);
      if (!amountMatch || dateDistance > MAX_DATE_DISTANCE_DAYS) return [];
      const propertyTextMatch = Boolean(property && hasPropertyTextMatch(transaction, property));
      const descriptionMatch = hasRentDescriptionEvidence(transaction, lease);
      if (
        amountMatch.reason === 'partial-amount' &&
        !descriptionMatch &&
        !propertyTextMatch &&
        !propertyContextId
      ) return [];
      return [{
        amountReason: amountMatch.reason,
        hasPropertyTextMatch: propertyTextMatch,
        hasSpecificDescriptionMatch: Boolean(
          lease && hasTokenOverlap(transactionText(transaction), `${lease.name} ${lease.notes ?? ''}`)
        ),
        suggestion: {
          targetType: 'rent-receivable',
          targetId: receivable.id,
          propertyId: receivable.propertyId,
          propertyName: property?.name ?? receivable.propertyId,
          targetLabel: receivable.period,
          period: receivable.period,
          dueDate: receivable.dueDate,
          expectedAmount: receivable.expectedAmount,
          outstandingAmount: receivable.outstandingAmount,
          transactionAmount: amount,
          dateDistanceDays: dateDistance,
          currency: receivable.currency,
          reasons: [
            amountMatch.reason,
            'same-currency',
            'date-proximity',
            ...(lease ? ['active-lease' as const] : []),
            ...(descriptionMatch ? ['description-match' as const] : []),
            ...(propertyContextId ? ['property-context' as const] : []),
          ],
        },
      }];
    });
    return selectConservativeCandidate(candidates);
  }

  const obligationViews = targets.expenseObligationViews;
  const manualPaymentCandidates = obligationViews.flatMap<BankReconciliationSuggestion>((obligation) => {
    const property = propertiesById.get(obligation.propertyId);
    const dateDistance = daysBetween(transaction.bookingDate, obligation.dueDate);
    if (
      obligation.currency !== transaction.currency ||
      !isExpenseRuleEligible(obligation, transaction, context.propertyExpenseRules) ||
      (propertyContextId && obligation.propertyId !== propertyContextId) ||
      dateDistance > MAX_DATE_DISTANCE_DAYS
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
        propertyName: property?.name ?? obligation.propertyId,
        targetLabel: obligation.label,
        period: obligation.period,
        dueDate: obligation.dueDate,
        expectedAmount: obligation.expectedAmount,
        outstandingAmount: obligation.outstandingAmount,
        transactionAmount: amount,
        dateDistanceDays: dateDistance,
        currency: obligation.currency,
        existingPaymentId: payment.id,
        reasons: [
          'existing-manual-payment',
          'exact-amount',
          'same-currency',
          'date-proximity',
          ...(propertyContextId ? ['property-context' as const] : []),
        ],
      }];
    });
  });
  if (manualPaymentCandidates.length > 1) return null;
  if (manualPaymentCandidates.length === 1) return manualPaymentCandidates[0];

  const candidates = obligationViews.flatMap<Candidate>((obligation) => {
    const property = propertiesById.get(obligation.propertyId);
    if (
      obligation.currency !== transaction.currency ||
      obligation.outstandingAmount <= 0 ||
      obligation.status === 'PAID' ||
      !isExpenseRuleEligible(obligation, transaction, context.propertyExpenseRules) ||
      (propertyContextId && obligation.propertyId !== propertyContextId)
    ) return [];
    const amountMatch = getAmountReason(amount, obligation.outstandingAmount);
    const dateDistance = daysBetween(transaction.bookingDate, obligation.dueDate);
    if (!amountMatch || dateDistance > MAX_DATE_DISTANCE_DAYS) return [];
    const descriptionEvidence = getExpenseDescriptionEvidence(transaction, obligation);
    if (!descriptionEvidence.matches) return [];
    const propertyTextMatch = Boolean(property && hasPropertyTextMatch(transaction, property));
    const rule = obligation.expenseRuleId
      ? context.propertyExpenseRules?.find((candidate) => candidate.id === obligation.expenseRuleId)
      : undefined;
    return [{
      amountReason: amountMatch.reason,
      hasPropertyTextMatch: propertyTextMatch,
      hasSpecificDescriptionMatch: descriptionEvidence.isSpecific,
      suggestion: {
        targetType: 'expense-obligation',
        targetId: obligation.id,
        propertyId: obligation.propertyId,
        propertyName: property?.name ?? obligation.propertyId,
        targetLabel: obligation.label,
        period: obligation.period,
        dueDate: obligation.dueDate,
        expectedAmount: obligation.expectedAmount,
        outstandingAmount: obligation.outstandingAmount,
        transactionAmount: amount,
        dateDistanceDays: dateDistance,
        currency: obligation.currency,
        reasons: [
          amountMatch.reason,
          'same-currency',
          'date-proximity',
          'description-match',
          ...(rule && rule.frequency !== 'ONE_TIME' ? ['recurring-obligation' as const] : []),
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
  let rentReceivables = args.context.rentReceivables;
  let expenseObligations = args.context.expenseObligations;
  const targets = deriveBankReconciliationTargets(args.context);

  if (suggestion.targetType === 'rent-receivable') {
    const receivable = targets.rentReceivables.find((item) => item.id === suggestion.targetId);
    if (!receivable) return null;
    if (!rentReceivables.some((item) => item.id === receivable.id)) {
      rentReceivables = [...rentReceivables, receivable];
    }
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
    const obligation = targets.expenseObligations.find((item) => item.id === suggestion.targetId);
    if (!obligation) return null;
    if (!expenseObligations.some((item) => item.id === obligation.id)) {
      expenseObligations = [...expenseObligations, obligation];
    }
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
    rentReceivables,
    rentPayments,
    expenseObligations,
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
