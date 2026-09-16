import type { ExpenseObligation, ExpensePayment, Property, RentPayment, RentReceivable } from '../types';
import { calculateLeaseNextUpdateDate, getActiveLease } from './leaseUpdates';
import { buildRentReceivableViews, detectRentPaymentGaps } from './rentCollection';
import { parseCivilDate, toCivilDate } from './civilDate';
import { buildExpenseObligationViews } from './propertyExpenses';

export type PortfolioAlertCategory = 'upcoming' | 'attention' | 'insight';
export type PortfolioAlertSeverity = 'urgent' | 'upcoming' | 'info';
export type PortfolioAlertAction = 'review-rent' | 'review-rent-collection' | 'review-expenses' | 'review-lease' | 'review-insurance' | 'complete-data';
export type PortfolioAlertKind =
  | 'rent-update-upcoming'
  | 'lease-ending'
  | 'lease-expired'
  | 'insurance-ending'
  | 'missing-lease-end-date'
  | 'rent-overdue'
  | 'rent-payment-gap'
  | 'expense-overdue';

export interface PortfolioAlert {
  id: string;
  kind: PortfolioAlertKind;
  category: PortfolioAlertCategory;
  severity: PortfolioAlertSeverity;
  propertyId: string;
  propertyName: string;
  propertyLocation: string;
  dueDate?: string;
  daysUntil?: number;
  rentPeriod?: string;
  outstandingAmount?: number;
  action: PortfolioAlertAction;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const UPCOMING_RENT_DAYS = 30;
const UPCOMING_LEASE_DAYS = 45;
const UPCOMING_INSURANCE_DAYS = 30;

const getDaysUntil = (isoDate: string, today: Date) => {
  const target = parseCivilDate(isoDate);
  if (!target) return null;
  const current = toCivilDate(today);
  return Math.round(
    (Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(current.year, current.month - 1, current.day)) /
      MS_PER_DAY
  );
};

export const generatePortfolioAlerts = (
  properties: Property[],
  today: Date = new Date(),
  rentReceivables: RentReceivable[] = [],
  rentPayments: RentPayment[] = [],
  expenseObligations: ExpenseObligation[] = [],
  expensePayments: ExpensePayment[] = []
): PortfolioAlert[] => {
  const alerts: PortfolioAlert[] = [];

  properties.forEach((property) => {
    const propertyLocation = [property.city, property.country].filter(Boolean).join(', ');
    const activeLease = getActiveLease(property);
    const nextRentUpdateDate = activeLease ? calculateLeaseNextUpdateDate(activeLease, today) : '';
    const rentUpdateDaysUntil = nextRentUpdateDate ? getDaysUntil(nextRentUpdateDate, today) : null;

    if (
      nextRentUpdateDate &&
      rentUpdateDaysUntil !== null &&
      rentUpdateDaysUntil >= 0 &&
      rentUpdateDaysUntil <= UPCOMING_RENT_DAYS
    ) {
      alerts.push({
        id: `${property.id}-rent-update`,
        kind: 'rent-update-upcoming',
        category: 'upcoming',
        severity: 'upcoming',
        propertyId: property.id,
        propertyName: property.name,
        propertyLocation,
        dueDate: nextRentUpdateDate,
        daysUntil: rentUpdateDaysUntil,
        action: 'review-rent',
      });
    }

    const leaseEndDate = activeLease?.endDate ?? property.leaseEndDate ?? '';
    const leaseEndDaysUntil = leaseEndDate ? getDaysUntil(leaseEndDate, today) : null;

    if (leaseEndDate && leaseEndDaysUntil !== null) {
      if (leaseEndDaysUntil < 0) {
        alerts.push({
          id: `${property.id}-lease-expired`,
          kind: 'lease-expired',
          category: 'attention',
          severity: 'urgent',
          propertyId: property.id,
          propertyName: property.name,
          propertyLocation,
          dueDate: leaseEndDate,
          daysUntil: leaseEndDaysUntil,
          action: 'review-lease',
        });
      } else if (leaseEndDaysUntil <= UPCOMING_LEASE_DAYS) {
        alerts.push({
          id: `${property.id}-lease-ending`,
          kind: 'lease-ending',
          category: 'upcoming',
          severity: 'upcoming',
          propertyId: property.id,
          propertyName: property.name,
          propertyLocation,
          dueDate: leaseEndDate,
          daysUntil: leaseEndDaysUntil,
          action: 'review-lease',
        });
      }
    }

    property.recurringExpenses
      ?.filter((expense) =>
        expense.expenseType === 'home-insurance' ||
        expense.expenseType === 'life-insurance' ||
        expense.expenseType === 'rent-default-insurance'
      )
      .forEach((expense) => {
        const insuranceDaysUntil = expense.nextExpectedUpdateDate
          ? getDaysUntil(expense.nextExpectedUpdateDate, today)
          : null;

        if (
          expense.nextExpectedUpdateDate &&
          insuranceDaysUntil !== null &&
          insuranceDaysUntil >= 0 &&
          insuranceDaysUntil <= UPCOMING_INSURANCE_DAYS
        ) {
          alerts.push({
            id: `${property.id}-${expense.id}-insurance`,
            kind: 'insurance-ending',
            category: 'upcoming',
            severity: 'upcoming',
            propertyId: property.id,
            propertyName: property.name,
            propertyLocation,
            dueDate: expense.nextExpectedUpdateDate,
            daysUntil: insuranceDaysUntil,
            action: 'review-insurance',
          });
        }
      });

    if (activeLease && !leaseEndDate) {
      alerts.push({
        id: `${property.id}-missing-lease-end-date`,
        kind: 'missing-lease-end-date',
        category: 'attention',
        severity: 'info',
        propertyId: property.id,
        propertyName: property.name,
        propertyLocation,
        action: 'complete-data',
      });
    }
  });

  const rentViews = buildRentReceivableViews(rentReceivables, rentPayments, properties, today);
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  rentViews.filter((view) => view.status === 'OVERDUE').forEach((view) => {
    const property = propertyById.get(view.propertyId);
    if (!property) return;
    alerts.push({
      id: `${view.id}-overdue`,
      kind: 'rent-overdue',
      category: 'attention',
      severity: 'urgent',
      propertyId: property.id,
      propertyName: property.name,
      propertyLocation: [property.city, property.country].filter(Boolean).join(', '),
      dueDate: view.dueDate,
      daysUntil: getDaysUntil(view.dueDate, today) ?? undefined,
      rentPeriod: view.period,
      outstandingAmount: view.outstandingAmount,
      action: 'review-rent-collection',
    });
  });

  detectRentPaymentGaps(rentViews).forEach((gap) => {
    const property = propertyById.get(gap.propertyId);
    const outstanding = rentViews.find((view) => view.id === gap.outstandingReceivableId);
    if (!property || !outstanding) return;
    alerts.push({
      id: `${gap.outstandingReceivableId}-payment-gap`,
      kind: 'rent-payment-gap',
      category: 'attention',
      severity: 'urgent',
      propertyId: property.id,
      propertyName: property.name,
      propertyLocation: [property.city, property.country].filter(Boolean).join(', '),
      dueDate: outstanding.dueDate,
      daysUntil: getDaysUntil(outstanding.dueDate, today) ?? undefined,
      rentPeriod: gap.outstandingPeriod,
      outstandingAmount: outstanding.outstandingAmount,
      action: 'review-rent-collection',
    });
  });

  buildExpenseObligationViews(expenseObligations, expensePayments, today)
    .filter((view) => view.status === 'OVERDUE')
    .forEach((view) => {
      const property = propertyById.get(view.propertyId);
      if (!property) return;
      alerts.push({
        id: `${view.id}-overdue`,
        kind: 'expense-overdue',
        category: 'attention',
        severity: 'urgent',
        propertyId: property.id,
        propertyName: property.name,
        propertyLocation: [property.city, property.country].filter(Boolean).join(', '),
        dueDate: view.dueDate,
        daysUntil: getDaysUntil(view.dueDate, today) ?? undefined,
        outstandingAmount: view.outstandingAmount,
        action: 'review-expenses',
      });
    });

  const severityWeight: Record<PortfolioAlertSeverity, number> = {
    urgent: 0,
    upcoming: 1,
    info: 2,
  };

  return alerts.sort((left, right) => {
    const severityDelta = severityWeight[left.severity] - severityWeight[right.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const leftDays = left.daysUntil ?? Number.POSITIVE_INFINITY;
    const rightDays = right.daysUntil ?? Number.POSITIVE_INFINITY;

    if (leftDays !== rightDays) {
      return leftDays - rightDays;
    }

    return left.propertyName.localeCompare(right.propertyName);
  });
};
