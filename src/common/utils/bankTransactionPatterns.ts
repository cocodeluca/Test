import type {
  BankTransaction,
  BankTransactionReconciliation,
  ExpensePaymentSource,
  PropertyExpenseCategory,
  RentPaymentSource,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { isCashAccountIncludedInPortfolio } from './cashAccounts';
import type { BankReconciliationContext } from './bankReconciliation';

export type BankPatternFingerprintType = 'counterparty' | 'description';
type BankPatternDirection = 'inflow' | 'outflow';
const MAX_CONFIRMATION_DATE_DISTANCE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ConfirmedPatternBase {
  fingerprintType: BankPatternFingerprintType;
  fingerprint: string;
  direction: BankPatternDirection;
  currency: DisplayCurrency;
  propertyId: string;
  confirmationCount: number;
}

export interface ConfirmedRentPattern extends ConfirmedPatternBase {
  targetType: 'rent-receivable';
  leaseId: string;
}

export interface ConfirmedExpensePattern extends ConfirmedPatternBase {
  targetType: 'expense-obligation';
  category: PropertyExpenseCategory;
}

export interface ConfirmedBankTransactionPatterns {
  rent: ConfirmedRentPattern[];
  expense: ConfirmedExpensePattern[];
  ambiguousRentFingerprints: AmbiguousBankPatternFingerprint[];
  ambiguousExpenseFingerprints: AmbiguousBankPatternFingerprint[];
}

export type AmbiguousBankPatternFingerprint = Pick<
  ConfirmedPatternBase,
  'fingerprintType' | 'fingerprint' | 'direction' | 'currency'
>;

export interface HistoricalPatternEvidence {
  fingerprintTypes: BankPatternFingerprintType[];
  confirmationCount: number;
}

interface PatternObservation {
  fingerprintType: BankPatternFingerprintType;
  fingerprint: string;
  direction: BankPatternDirection;
  currency: DisplayCurrency;
  propertyId: string;
  leaseId?: string;
  category?: PropertyExpenseCategory;
}

export const normalizeBankPatternText = (value: string | null | undefined) => {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length >= 3 && /[a-z]/.test(normalized) ? normalized : null;
};

const getDirection = (transaction: BankTransaction): BankPatternDirection | null =>
  transaction.amount > 0 ? 'inflow' : transaction.amount < 0 ? 'outflow' : null;

const getTransactionFingerprints = (transaction: BankTransaction) => {
  const fingerprints: Array<{ type: BankPatternFingerprintType; value: string }> = [];
  const counterparty = normalizeBankPatternText(transaction.counterparty);
  const description = normalizeBankPatternText(transaction.description);
  if (counterparty) fingerprints.push({ type: 'counterparty', value: counterparty });
  if (description) fingerprints.push({ type: 'description', value: description });
  return fingerprints;
};

const isCanonicalConfirmedTransaction = (
  transaction: BankTransaction | undefined,
  context: BankReconciliationContext
): transaction is BankTransaction => {
  if (
    !transaction ||
    transaction.pending ||
    transaction.amount === 0 ||
    (transaction.lifecycleStatus && transaction.lifecycleStatus !== 'active') ||
    transaction.reversedByBankTransactionId
  ) return false;
  const account = context.cashAccounts?.find((candidate) => candidate.id === transaction.cashAccountId);
  return Boolean(
    account &&
    account.sourceType === 'linked' &&
    account.connectionId === transaction.connectionId &&
    account.providerName === transaction.providerName &&
    isCashAccountIncludedInPortfolio(account)
  );
};

const daysBetween = (left: string, right: string) => {
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? Math.abs(Math.round((leftTime - rightTime) / MS_PER_DAY))
    : Number.POSITIVE_INFINITY;
};

const hasValidPaymentLink = (
  reconciliation: BankTransactionReconciliation,
  paymentSource: RentPaymentSource | ExpensePaymentSource
) => reconciliation.paymentLinkType === 'linked-manual'
  ? paymentSource === 'manual'
  : reconciliation.paymentLinkType === 'created-bank-sync' && paymentSource === 'bank_sync';

const observationKey = (observation: PatternObservation) => [
  observation.fingerprintType,
  observation.fingerprint,
  observation.direction,
  observation.currency,
].join('|');

const rentRelationKey = (observation: PatternObservation) =>
  `${observation.propertyId}|${observation.leaseId ?? ''}`;

const expenseRelationKey = (observation: PatternObservation) =>
  `${observation.propertyId}|${observation.category ?? ''}`;

const retainUniqueRelations = (
  observations: PatternObservation[],
  relationKey: (observation: PatternObservation) => string
) => {
  const groups = new Map<string, PatternObservation[]>();
  observations.forEach((observation) => {
    const key = observationKey(observation);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  });
  const grouped = [...groups.values()]
    .sort((left, right) => observationKey(left[0]).localeCompare(observationKey(right[0])));
  return {
    unique: grouped
      .filter((group) => new Set(group.map(relationKey)).size === 1)
      .map((group) => ({ ...group[0], confirmationCount: group.length }))
      .sort((left, right) => observationKey(left).localeCompare(observationKey(right))),
    ambiguous: grouped
      .filter((group) => new Set(group.map(relationKey)).size > 1)
      .map(([observation]) => ({
        fingerprintType: observation.fingerprintType,
        fingerprint: observation.fingerprint,
        direction: observation.direction,
        currency: observation.currency,
      })),
  };
};

export const extractConfirmedBankTransactionPatterns = (
  context: BankReconciliationContext,
  reconciliations: BankTransactionReconciliation[]
): ConfirmedBankTransactionPatterns => {
  const transactionsById = new Map(
    (context.bankTransactions ?? []).map((transaction) => [transaction.id, transaction])
  );
  const rentObservations: PatternObservation[] = [];
  const expenseObservations: PatternObservation[] = [];

  reconciliations.forEach((reconciliation) => {
    if (
      reconciliation.status !== 'matched' ||
      !reconciliation.targetType ||
      !reconciliation.targetId ||
      !reconciliation.paymentId
    ) return;
    const transaction = transactionsById.get(reconciliation.bankTransactionId);
    if (!isCanonicalConfirmedTransaction(transaction, context)) return;
    const direction = getDirection(transaction);
    if (!direction) return;
    const fingerprints = getTransactionFingerprints(transaction);
    if (fingerprints.length === 0) return;

    if (reconciliation.targetType === 'rent-receivable' && direction === 'inflow') {
      const receivable = context.rentReceivables.find((candidate) => candidate.id === reconciliation.targetId);
      const property = receivable
        ? context.properties.find((candidate) => candidate.id === receivable.propertyId)
        : undefined;
      const lease = receivable
        ? property?.leases?.find((candidate) => candidate.id === receivable.leaseId)
        : undefined;
      const payment = context.rentPayments.find((candidate) => candidate.id === reconciliation.paymentId);
      const allocation = payment?.allocations[0];
      if (
        !receivable ||
        !property ||
        !lease?.active ||
        transaction.bookingDate < lease.startDate ||
        Boolean(lease.endDate && transaction.bookingDate > lease.endDate) ||
        receivable.dueDate < lease.startDate ||
        Boolean(lease.endDate && receivable.dueDate > lease.endDate) ||
        !payment ||
        !hasValidPaymentLink(reconciliation, payment.source) ||
        payment.propertyId !== receivable.propertyId ||
        payment.leaseId !== receivable.leaseId ||
        payment.currency !== transaction.currency ||
        receivable.currency !== transaction.currency ||
        payment.allocations.length !== 1 ||
        allocation?.receivableId !== receivable.id ||
        Math.abs(payment.amount - Math.abs(transaction.amount)) > 0.01 ||
        Math.abs(allocation.amount - Math.abs(transaction.amount)) > 0.01 ||
        daysBetween(transaction.bookingDate, payment.receivedDate) > MAX_CONFIRMATION_DATE_DISTANCE_DAYS
      ) return;
      fingerprints.forEach(({ type, value }) => rentObservations.push({
        fingerprintType: type,
        fingerprint: value,
        direction,
        currency: transaction.currency,
        propertyId: receivable.propertyId,
        leaseId: receivable.leaseId,
      }));
      return;
    }

    if (reconciliation.targetType === 'expense-obligation' && direction === 'outflow') {
      const obligation = context.expenseObligations.find((candidate) => candidate.id === reconciliation.targetId);
      const property = obligation
        ? context.properties.find((candidate) => candidate.id === obligation.propertyId)
        : undefined;
      const rule = obligation?.expenseRuleId
        ? context.propertyExpenseRules?.find((candidate) => candidate.id === obligation.expenseRuleId)
        : undefined;
      const payment = context.expensePayments.find((candidate) => candidate.id === reconciliation.paymentId);
      const allocation = payment?.allocations[0];
      if (
        !obligation ||
        !property ||
        (obligation.expenseRuleId && (!rule?.isActive || rule.propertyId !== obligation.propertyId)) ||
        Boolean(rule && (
          transaction.bookingDate < rule.startDate ||
          transaction.bookingDate < rule.trackingStartDate ||
          (rule.endDate && transaction.bookingDate > rule.endDate)
        )) ||
        !payment ||
        !hasValidPaymentLink(reconciliation, payment.source) ||
        payment.propertyId !== obligation.propertyId ||
        payment.currency !== transaction.currency ||
        obligation.currency !== transaction.currency ||
        payment.allocations.length !== 1 ||
        allocation?.obligationId !== obligation.id ||
        Math.abs(payment.amount - Math.abs(transaction.amount)) > 0.01 ||
        Math.abs(allocation.amount - Math.abs(transaction.amount)) > 0.01 ||
        daysBetween(transaction.bookingDate, payment.paidDate) > MAX_CONFIRMATION_DATE_DISTANCE_DAYS
      ) return;
      fingerprints.forEach(({ type, value }) => expenseObservations.push({
        fingerprintType: type,
        fingerprint: value,
        direction,
        currency: transaction.currency,
        propertyId: obligation.propertyId,
        category: obligation.category,
      }));
    }
  });

  const rent = retainUniqueRelations(rentObservations, rentRelationKey);
  const expense = retainUniqueRelations(expenseObservations, expenseRelationKey);
  return {
    rent: rent.unique.map((observation) => ({
      targetType: 'rent-receivable',
      fingerprintType: observation.fingerprintType,
      fingerprint: observation.fingerprint,
      direction: observation.direction,
      currency: observation.currency,
      propertyId: observation.propertyId,
      leaseId: observation.leaseId!,
      confirmationCount: observation.confirmationCount,
    })),
    expense: expense.unique.map((observation) => ({
      targetType: 'expense-obligation',
      fingerprintType: observation.fingerprintType,
      fingerprint: observation.fingerprint,
      direction: observation.direction,
      currency: observation.currency,
      propertyId: observation.propertyId,
      category: observation.category!,
      confirmationCount: observation.confirmationCount,
    })),
    ambiguousRentFingerprints: rent.ambiguous,
    ambiguousExpenseFingerprints: expense.ambiguous,
  };
};

const matchingFingerprintTypes = <T extends AmbiguousBankPatternFingerprint>(
  transaction: BankTransaction,
  patterns: T[]
) => {
  const direction = getDirection(transaction);
  if (!direction) return [];
  const fingerprints = getTransactionFingerprints(transaction);
  return patterns.filter((pattern) =>
    pattern.direction === direction &&
    pattern.currency === transaction.currency &&
    fingerprints.some(({ type, value }) =>
      type === pattern.fingerprintType && value === pattern.fingerprint
    )
  );
};

export const getRentHistoricalPatternEvidence = (
  transaction: BankTransaction,
  patterns: ConfirmedRentPattern[],
  ambiguousFingerprints: AmbiguousBankPatternFingerprint[],
  propertyId: string,
  leaseId: string
): HistoricalPatternEvidence | null => {
  if (matchingFingerprintTypes(transaction, ambiguousFingerprints).length > 0) return null;
  const matching = matchingFingerprintTypes(transaction, patterns);
  if (new Set(matching.map((pattern) => `${pattern.propertyId}|${pattern.leaseId}`)).size !== 1) return null;
  const relation = matching[0];
  if (!relation || relation.propertyId !== propertyId || relation.leaseId !== leaseId) return null;
  return {
    fingerprintTypes: [...new Set(matching.map((pattern) => pattern.fingerprintType))].sort(),
    confirmationCount: Math.max(...matching.map((pattern) => pattern.confirmationCount)),
  };
};

export const getExpenseHistoricalPatternEvidence = (
  transaction: BankTransaction,
  patterns: ConfirmedExpensePattern[],
  ambiguousFingerprints: AmbiguousBankPatternFingerprint[],
  propertyId: string,
  category: PropertyExpenseCategory
): HistoricalPatternEvidence | null => {
  if (matchingFingerprintTypes(transaction, ambiguousFingerprints).length > 0) return null;
  const matching = matchingFingerprintTypes(transaction, patterns);
  if (new Set(matching.map((pattern) => `${pattern.propertyId}|${pattern.category}`)).size !== 1) return null;
  const relation = matching[0];
  if (!relation || relation.propertyId !== propertyId || relation.category !== category) return null;
  return {
    fingerprintTypes: [...new Set(matching.map((pattern) => pattern.fingerprintType))].sort(),
    confirmationCount: Math.max(...matching.map((pattern) => pattern.confirmationCount)),
  };
};
