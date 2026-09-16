import type {
  Lease,
  Property,
  RentPayment,
  RentPaymentAllocation,
  RentReceivable,
  RentReceivableStatus,
} from '../types';
import type { DisplayCurrency } from '../types/settings';
import { calculateLeaseAdjustmentHistory, getActiveLease } from './leaseUpdates';
import { compareCivilDates, parseCivilDate, toCivilDate } from './civilDate';
import { convertCurrency, type CurrencyRates } from './currency';

const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

export interface RentReceivableView extends RentReceivable {
  allocatedAmount: number;
  outstandingAmount: number;
  status: RentReceivableStatus;
  paymentDates: string[];
}

export interface RentPaymentGap {
  leaseId: string;
  propertyId: string;
  outstandingReceivableId: string;
  outstandingPeriod: string;
  newerPaidReceivableId: string;
  newerPaidPeriod: string;
}

export interface OverdueRentPropertySummary {
  propertyId: string;
  overdueCount: number;
  totalOutstanding: number;
  oldestOverduePeriod: string;
  currency: DisplayCurrency;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

export const toRentPeriod = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

export const parseRentPeriod = (period: string) => {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
};

export const shiftRentPeriod = (period: string, deltaMonths: number): string => {
  const parsed = parseRentPeriod(period);
  if (!parsed) return period;
  const date = new Date(parsed.year, parsed.month - 1 + deltaMonths, 1, 12);
  return toRentPeriod(date);
};

export const getRentDueDate = (period: string, dueDay: number): string | null => {
  const parsed = parseRentPeriod(period);
  if (!parsed || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  const lastDay = new Date(parsed.year, parsed.month, 0, 12).getDate();
  return `${parsed.year}-${pad2(parsed.month)}-${pad2(Math.min(dueDay, lastDay))}`;
};

const getLeaseKey = (property: Property, lease: Lease): string =>
  property.leases?.some((candidate) => candidate.id === lease.id)
    ? lease.id
    : `legacy-property:${property.id}`;

const getRentCurrency = (property: Property, lease: Lease): DisplayCurrency =>
  lease.monthlyRentCurrency ?? property.monthlyRentCurrency ?? property.operatingCurrency ?? property.currency ?? 'EUR';

const monthDate = (period: string, day = 1) => {
  const parsed = parseRentPeriod(period);
  return parsed ? new Date(parsed.year, parsed.month - 1, day, 12) : null;
};

const periodOfIsoDate = (value: string): string | null => {
  const date = parseCivilDate(value);
  return date ? `${date.year}-${pad2(date.month)}` : null;
};

const firstDayOfPeriod = (period: string): string => `${period}-01`;

export const initializeRentTrackingStartDates = (
  properties: Property[],
  receivables: RentReceivable[] = [],
  payments: RentPayment[] = [],
  today: Date = new Date()
): Property[] => {
  const currentPeriod = toRentPeriod(today);
  const receivableById = new Map(receivables.map((receivable) => [receivable.id, receivable]));

  return properties.map((property) => {
    const leases = property.leases ?? [];
    let changed = false;
    const nextLeases = leases.map((lease) => {
      if (lease.rentTrackingStartDate || !lease.active || !Number.isInteger(lease.rentDueDay)) return lease;
      const leaseKey = getLeaseKey(property, lease);
      const explicitPeriods = payments
        .filter((payment) => payment.propertyId === property.id && payment.leaseId === leaseKey)
        .flatMap((payment) => payment.allocations)
        .map((allocation) => receivableById.get(allocation.receivableId))
        .filter((receivable): receivable is RentReceivable => Boolean(receivable && receivable.leaseId === leaseKey && parseRentPeriod(receivable.period)))
        .map((receivable) => receivable.period)
        .sort();
      changed = true;
      return { ...lease, rentTrackingStartDate: firstDayOfPeriod(explicitPeriods[0] ?? currentPeriod) };
    });
    return changed ? { ...property, leases: nextLeases } : property;
  });
};

const getRentForPeriod = (lease: Lease, period: string): number => {
  const date = monthDate(period, 28);
  if (!date) return lease.monthlyRent;
  const periodEnd = `${period}-31`;
  const history = calculateLeaseAdjustmentHistory(lease, date)
    .filter((entry) => entry.adjustmentDate <= periodEnd)
    .sort((left, right) => left.adjustmentDate.localeCompare(right.adjustmentDate));
  return history[history.length - 1]?.newRent ?? lease.rentUpdateRule.baseRent ?? lease.monthlyRent;
};

export const makeRentReceivableId = (leaseId: string, period: string): string =>
  `rent-receivable:${encodeURIComponent(leaseId)}:${period}`;

export const generateRentReceivables = (
  properties: Property[],
  existing: RentReceivable[] = [],
  options: { throughPeriod?: string; today?: Date; payments?: RentPayment[] } = {}
): RentReceivable[] => {
  const today = options.today ?? new Date();
  const throughPeriod = parseRentPeriod(options.throughPeriod ?? '')
    ? options.throughPeriod!
    : toRentPeriod(today);
  const byLeaseAndPeriod = new Map<string, RentReceivable>();
  const existingById = new Map(existing.map((receivable) => [receivable.id, receivable]));

  properties.forEach((property) => {
    const lease = getActiveLease(property);
    const dueDay = lease?.rentDueDay;
    if (!lease || !lease.active || !Number.isInteger(dueDay) || (dueDay ?? 0) < 1 || (dueDay ?? 0) > 31) return;

    const leaseStartPeriod = periodOfIsoDate(lease.startDate);
    if (!leaseStartPeriod) return;
    const leaseId = getLeaseKey(property, lease);
    const earliestExplicitPaymentPeriod = (options.payments ?? [])
      .filter((payment) => payment.propertyId === property.id && payment.leaseId === leaseId)
      .flatMap((payment) => payment.allocations)
      .map((allocation) => existingById.get(allocation.receivableId))
      .filter((receivable): receivable is RentReceivable => Boolean(receivable && receivable.leaseId === leaseId && parseRentPeriod(receivable.period)))
      .map((receivable) => receivable.period)
      .sort()[0];
    const trackingStartPeriod = periodOfIsoDate(lease.rentTrackingStartDate ?? '') ?? earliestExplicitPaymentPeriod ?? toRentPeriod(today);
    const leaseEndPeriod = lease.endDate ? periodOfIsoDate(lease.endDate) : null;
    const startPeriod = leaseStartPeriod > trackingStartPeriod ? leaseStartPeriod : trackingStartPeriod;
    const endPeriod = leaseEndPeriod && leaseEndPeriod < throughPeriod ? leaseEndPeriod : throughPeriod;
    if (startPeriod > endPeriod) return;

    existing.forEach((receivable) => {
      if (receivable.propertyId === property.id && receivable.leaseId === leaseId && parseRentPeriod(receivable.period) && receivable.period >= startPeriod && receivable.period <= endPeriod) {
        byLeaseAndPeriod.set(`${receivable.leaseId}|${receivable.period}`, receivable);
      }
    });
    let period = startPeriod;
    while (period <= endPeriod) {
      const key = `${leaseId}|${period}`;
      if (!byLeaseAndPeriod.has(key)) {
        const dueDate = getRentDueDate(period, dueDay!);
        const expectedAmount = getRentForPeriod(lease, period);
        if (dueDate && expectedAmount > 0) {
          byLeaseAndPeriod.set(key, {
            id: makeRentReceivableId(leaseId, period),
            propertyId: property.id,
            leaseId,
            period,
            dueDate,
            expectedAmount,
            currency: getRentCurrency(property, lease),
          });
        }
      }
      period = shiftRentPeriod(period, 1);
    }
  });

  return [...byLeaseAndPeriod.values()].sort((left, right) =>
    left.period.localeCompare(right.period) || left.propertyId.localeCompare(right.propertyId)
  );
};

export const summarizeOverdueRentByProperty = (
  views: RentReceivableView[]
): OverdueRentPropertySummary[] => {
  const summaries = new Map<string, OverdueRentPropertySummary>();
  views.filter((view) => view.status === 'OVERDUE').forEach((view) => {
    const current = summaries.get(view.propertyId);
    if (!current) {
      summaries.set(view.propertyId, { propertyId: view.propertyId, overdueCount: 1, totalOutstanding: view.outstandingAmount, oldestOverduePeriod: view.period, currency: view.currency });
      return;
    }
    current.overdueCount += 1;
    current.totalOutstanding += view.outstandingAmount;
    if (view.period < current.oldestOverduePeriod) current.oldestOverduePeriod = view.period;
  });
  return [...summaries.values()].sort((left, right) => left.oldestOverduePeriod.localeCompare(right.oldestOverduePeriod) || left.propertyId.localeCompare(right.propertyId));
};

export const getAllocatedAmount = (receivableId: string, payments: RentPayment[]): number =>
  payments.reduce(
    (total, payment) => total + payment.allocations
      .filter((allocation) => allocation.receivableId === receivableId)
      .reduce((sum, allocation) => sum + Math.max(0, allocation.amount), 0),
    0
  );

const addCalendarDays = (isoDate: string, days: number) => {
  const parsed = parseCivilDate(isoDate);
  if (!parsed) return null;
  const date = new Date(parsed.year, parsed.month - 1, parsed.day + Math.max(0, Math.trunc(days)), 12);
  return toCivilDate(date);
};

export const deriveRentReceivableStatus = (args: {
  receivable: RentReceivable;
  allocatedAmount: number;
  gracePeriodDays?: number | null;
  today?: Date;
}): RentReceivableStatus => {
  const expected = Math.max(0, args.receivable.expectedAmount);
  const allocated = Math.max(0, args.allocatedAmount);
  if (allocated >= expected) return 'PAID';

  const dueDate = parseCivilDate(args.receivable.dueDate);
  const today = toCivilDate(args.today ?? new Date());
  if (!dueDate) return allocated > 0 ? 'PARTIAL' : 'DUE';

  const deadline = addCalendarDays(args.receivable.dueDate, args.gracePeriodDays ?? 0) ?? dueDate;
  if (compareCivilDates(today, deadline) > 0) return 'OVERDUE';
  if (allocated > 0) return 'PARTIAL';
  return compareCivilDates(today, dueDate) < 0 ? 'UPCOMING' : 'DUE';
};

export const buildRentReceivableViews = (
  receivables: RentReceivable[],
  payments: RentPayment[],
  properties: Property[],
  today: Date = new Date()
): RentReceivableView[] => {
  const graceByLease = new Map<string, number>();
  properties.forEach((property) => {
    const lease = getActiveLease(property);
    if (lease) graceByLease.set(getLeaseKey(property, lease), Math.max(0, lease.rentGracePeriodDays ?? 0));
  });

  return receivables.map((receivable) => {
    const allocatedAmount = getAllocatedAmount(receivable.id, payments);
    const outstandingAmount = Math.max(receivable.expectedAmount - allocatedAmount, 0);
    const paymentDates = payments
      .filter((payment) => payment.allocations.some((allocation) => allocation.receivableId === receivable.id))
      .map((payment) => payment.receivedDate)
      .sort();
    return {
      ...receivable,
      allocatedAmount,
      outstandingAmount,
      paymentDates,
      status: deriveRentReceivableStatus({
        receivable,
        allocatedAmount,
        gracePeriodDays: graceByLease.get(receivable.leaseId) ?? 0,
        today,
      }),
    };
  });
};

export const detectRentPaymentGaps = (views: RentReceivableView[]): RentPaymentGap[] => {
  const byLease = new Map<string, RentReceivableView[]>();
  views.forEach((view) => byLease.set(view.leaseId, [...(byLease.get(view.leaseId) ?? []), view]));
  const gaps: RentPaymentGap[] = [];

  byLease.forEach((leaseViews) => {
    const sorted = [...leaseViews].sort((left, right) => left.period.localeCompare(right.period));
    sorted.forEach((outstanding, index) => {
      if (outstanding.outstandingAmount <= 0 || outstanding.status === 'UPCOMING') return;
      const newerPaid = sorted.slice(index + 1).find((candidate) => candidate.status === 'PAID');
      if (newerPaid) {
        gaps.push({
          leaseId: outstanding.leaseId,
          propertyId: outstanding.propertyId,
          outstandingReceivableId: outstanding.id,
          outstandingPeriod: outstanding.period,
          newerPaidReceivableId: newerPaid.id,
          newerPaidPeriod: newerPaid.period,
        });
      }
    });
  });
  return gaps;
};

export const summarizeRentPeriod = (
  views: RentReceivableView[],
  period: string,
  options: { targetCurrency?: DisplayCurrency; rateOverrides?: Partial<CurrencyRates> } = {}
) => {
  const periodViews = views.filter((view) => view.period === period);
  const amount = (value: number, currency: DisplayCurrency) => options.targetCurrency
    ? convertCurrency(value, currency, options.targetCurrency, options.rateOverrides)
    : value;
  return {
    expectedAmount: periodViews.reduce((sum, view) => sum + amount(view.expectedAmount, view.currency), 0),
    receivedAmount: periodViews.reduce((sum, view) => sum + amount(Math.min(view.allocatedAmount, view.expectedAmount), view.currency), 0),
    outstandingAmount: periodViews.reduce((sum, view) => sum + amount(view.outstandingAmount, view.currency), 0),
    paidCount: periodViews.filter((view) => view.status === 'PAID').length,
    expectedCount: periodViews.length,
  };
};

export const createManualRentPayment = (args: {
  id?: string;
  receivable: RentReceivable;
  receivedDate: string;
  amount: number;
  allocations?: RentPaymentAllocation[];
  reference?: string;
  note?: string;
  createdAt?: string;
}): RentPayment => ({
  id: args.id ?? `rent-payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  propertyId: args.receivable.propertyId,
  leaseId: args.receivable.leaseId,
  receivedDate: args.receivedDate,
  amount: args.amount,
  currency: args.receivable.currency,
  source: 'manual',
  reference: args.reference?.trim() || undefined,
  note: args.note?.trim() || undefined,
  allocations: args.allocations ?? [{ receivableId: args.receivable.id, amount: args.amount }],
  createdAt: args.createdAt ?? new Date().toISOString(),
});
