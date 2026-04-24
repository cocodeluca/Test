import type {
  Lease,
  Property,
  RentAdjustmentHistoryEntry,
  RentAdjustmentRuleSource,
  RentUpdateFrequency,
  RentUpdateIndexType,
  RentUpdateRule,
  RentUpdateRuleType,
} from '../types';
import type { DisplayCurrency } from '../types/settings';

export const rentUpdateRuleTypes: Array<{ value: RentUpdateRuleType; label: string }> = [
  { value: 'official-index', label: 'Official index' },
  { value: 'fixed-percentage', label: 'Fixed percentage' },
  { value: 'manual-custom-schedule', label: 'Manual custom schedule' },
  { value: 'no-automatic-update', label: 'No automatic update' },
];

export const rentUpdateFrequencies: Array<{ value: RentUpdateFrequency; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'every-3-months', label: 'Every 3 months' },
  { value: 'every-4-months', label: 'Every 4 months' },
  { value: 'every-6-months', label: 'Every 6 months' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

export const rentUpdateIndexTypes: Array<{ value: RentUpdateIndexType; label: string }> = [
  { value: 'cpi-ipc', label: 'CPI / IPC' },
  { value: 'irav', label: 'IRAV' },
  { value: 'icl', label: 'ICL' },
  { value: 'cvs', label: 'CVS' },
  { value: 'other', label: 'Other' },
];

const frequencyToMonths = (frequency: RentUpdateFrequency, customFrequencyMonths?: number | null) => {
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
      return Math.max(Math.trunc(customFrequencyMonths ?? 0), 1);
    default:
      return 12;
  }
};

const buildId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getPropertyRentCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.monthlyRentCurrency ?? property.operatingCurrency ?? property.currency ?? 'EUR';

const getPropertyDepositCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.rentalDepositCurrency ?? getPropertyRentCurrency(property);

const getPropertyLateFeeCurrency = (property: Partial<Property>): DisplayCurrency =>
  property.lateFeeCurrency ?? getPropertyRentCurrency(property);

const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addMonths = (isoDate: string, months: number) => {
  if (!isoDate) {
    return '';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setMonth(date.getMonth() + months);
  return formatIsoDate(date);
};

const clampPercentage = (
  value: number,
  minimumCapPct?: number | null,
  maximumCapPct?: number | null
) => {
  let nextValue = value;

  if (typeof minimumCapPct === 'number' && Number.isFinite(minimumCapPct)) {
    nextValue = Math.max(nextValue, minimumCapPct);
  }

  if (typeof maximumCapPct === 'number' && Number.isFinite(maximumCapPct)) {
    nextValue = Math.min(nextValue, maximumCapPct);
  }

  return nextValue;
};

export const createRentUpdateRuleTemplate = (
  country: string,
  baseRent: number,
  contractSignatureDate: string
): RentUpdateRule => {
  const normalizedCountry = country.trim().toLowerCase();

  if (normalizedCountry === 'argentina') {
    return {
      type: 'official-index',
      frequency: 'every-3-months',
      indexType: 'cpi-ipc',
      contractSignatureDate,
      firstAdjustmentDate: addMonths(contractSignatureDate, 3),
      nextUpdateDate: addMonths(contractSignatureDate, 3),
      baseRent,
      referenceRatePct: null,
      minimumCapPct: null,
      maximumCapPct: null,
      notes: 'Default Argentina lease template. Fully editable.',
      manualCustomSchedule: [],
    };
  }

  if (normalizedCountry === 'spain') {
    return {
      type: 'official-index',
      frequency: 'yearly',
      indexType: 'irav',
      contractSignatureDate,
      firstAdjustmentDate: addMonths(contractSignatureDate, 12),
      nextUpdateDate: addMonths(contractSignatureDate, 12),
      baseRent,
      referenceRatePct: null,
      minimumCapPct: null,
      maximumCapPct: null,
      notes: 'Default Spain lease template. Fully editable.',
      manualCustomSchedule: [],
    };
  }

  return {
    type: 'no-automatic-update',
    frequency: 'yearly',
    indexType: null,
    contractSignatureDate,
    firstAdjustmentDate: addMonths(contractSignatureDate, 12),
    nextUpdateDate: addMonths(contractSignatureDate, 12),
    baseRent,
    referenceRatePct: null,
    minimumCapPct: null,
    maximumCapPct: null,
    notes: 'Generic lease template. Fully editable.',
    manualCustomSchedule: [],
  };
};

export const createDefaultLease = (
  property: Partial<Property>,
  overrides: Partial<Lease> = {}
): Lease => {
  const startDate = property.purchaseDate ?? new Date().toISOString().slice(0, 10);
  const baseRent = property.monthlyRent ?? 0;
  const rentUpdateRule =
    overrides.rentUpdateRule ??
    createRentUpdateRuleTemplate(property.country ?? 'Other', baseRent, startDate);

  return {
    id: overrides.id ?? buildId('lease'),
    name: overrides.name ?? 'Current lease',
    startDate,
    endDate: overrides.endDate ?? property.leaseEndDate ?? '',
    monthlyRent: overrides.monthlyRent ?? baseRent,
    monthlyRentCurrency: overrides.monthlyRentCurrency ?? getPropertyRentCurrency(property),
    securityDeposit: overrides.securityDeposit ?? property.rentalDeposit ?? null,
    securityDepositCurrency:
      overrides.securityDepositCurrency ?? getPropertyDepositCurrency(property),
    lateFeeAmount: overrides.lateFeeAmount ?? property.lateFeeAmount ?? null,
    lateFeeCurrency: overrides.lateFeeCurrency ?? getPropertyLateFeeCurrency(property),
    notes: overrides.notes ?? property.notes ?? '',
    rentUpdateRule,
    adjustmentHistory: overrides.adjustmentHistory ?? [],
    active: overrides.active ?? true,
  };
};

export const getActiveLease = (property: Partial<Property>): Lease | null => {
  const leases = property.leases ?? [];
  const explicitLease =
    leases.find((lease) => lease.id === property.activeLeaseId) ??
    leases.find((lease) => lease.active) ??
    leases[0];

  if (explicitLease) {
    return explicitLease;
  }

  if (
    typeof property.monthlyRent === 'number' ||
    typeof property.leaseType === 'string' ||
    typeof property.leaseEndDate === 'string'
  ) {
    return createDefaultLease(property);
  }

  return null;
};

const deriveRulePercentage = (rule: RentUpdateRule) => {
  if (rule.type === 'fixed-percentage') {
    return rule.fixedPercentage ?? 0;
  }

  if (rule.type === 'official-index') {
    return rule.referenceRatePct ?? 0;
  }

  return 0;
};

const buildHistoryEntry = (
  adjustmentDate: string,
  previousRent: number,
  newRent: number,
  percentageApplied: number,
  indexUsed: RentUpdateIndexType | null | undefined,
  ruleSource: RentAdjustmentRuleSource,
  notes?: string
): RentAdjustmentHistoryEntry => ({
  id: `rent-history-${adjustmentDate}-${ruleSource}`,
  adjustmentDate,
  previousRent,
  newRent,
  percentageApplied,
  indexUsed: indexUsed ?? null,
  ruleSource,
  notes: notes ?? '',
});

export const calculateLeaseAdjustmentHistory = (
  lease: Lease,
  today: Date = new Date()
): RentAdjustmentHistoryEntry[] => {
  const { rentUpdateRule } = lease;
  const baseRent = rentUpdateRule.baseRent || lease.monthlyRent || 0;
  const storedHistory = [...(lease.adjustmentHistory ?? [])].sort((left, right) =>
    left.adjustmentDate.localeCompare(right.adjustmentDate)
  );

  if (rentUpdateRule.type === 'manual-custom-schedule') {
    const manualSchedule = [...(rentUpdateRule.manualCustomSchedule ?? [])].sort((left, right) =>
      left.effectiveDate.localeCompare(right.effectiveDate)
    );
    let currentRent = baseRent;

    return manualSchedule.map((entry) => {
      const percentageApplied =
        typeof entry.percentageApplied === 'number'
          ? entry.percentageApplied
          : currentRent > 0 && typeof entry.newRent === 'number'
          ? ((entry.newRent - currentRent) / currentRent) * 100
          : 0;
      const nextRent =
        typeof entry.newRent === 'number'
          ? entry.newRent
          : currentRent * (1 + percentageApplied / 100);
      const historyEntry = buildHistoryEntry(
        entry.effectiveDate,
        currentRent,
        nextRent,
        percentageApplied,
        null,
        'manual-override',
        entry.notes
      );
      currentRent = nextRent;
      return historyEntry;
    });
  }

  if (rentUpdateRule.type === 'no-automatic-update') {
    return storedHistory;
  }

  const months = frequencyToMonths(
    rentUpdateRule.frequency,
    rentUpdateRule.customFrequencyMonths
  );
  const firstAdjustmentDate =
    rentUpdateRule.firstAdjustmentDate ||
    addMonths(rentUpdateRule.contractSignatureDate ?? lease.startDate, months);

  if (!firstAdjustmentDate) {
    return storedHistory;
  }

  const generatedEntries: RentAdjustmentHistoryEntry[] = [];
  let currentDate = firstAdjustmentDate;
  let currentRent = baseRent;

  while (currentDate && new Date(currentDate) <= today) {
    const rawPercentage = deriveRulePercentage(rentUpdateRule);
    const percentageApplied = clampPercentage(
      rawPercentage,
      rentUpdateRule.minimumCapPct,
      rentUpdateRule.maximumCapPct
    );
    const nextRent = currentRent * (1 + percentageApplied / 100);
    generatedEntries.push(
      buildHistoryEntry(
        currentDate,
        currentRent,
        nextRent,
        percentageApplied,
        rentUpdateRule.type === 'official-index' ? rentUpdateRule.indexType ?? null : null,
        'rule-engine',
        rentUpdateRule.notes
      )
    );
    currentRent = nextRent;
    currentDate = addMonths(currentDate, months);
  }

  return storedHistory.length > 0 ? storedHistory : generatedEntries;
};

export const calculateLeaseNextUpdateDate = (
  lease: Lease,
  today: Date = new Date()
): string => {
  const { rentUpdateRule } = lease;

  if (rentUpdateRule.type === 'manual-custom-schedule') {
    return (
      [...(rentUpdateRule.manualCustomSchedule ?? [])]
        .map((entry) => entry.effectiveDate)
        .filter((date) => Boolean(date) && new Date(date) > today)
        .sort()[0] ?? ''
    );
  }

  if (rentUpdateRule.type === 'no-automatic-update') {
    return '';
  }

  const months = frequencyToMonths(
    rentUpdateRule.frequency,
    rentUpdateRule.customFrequencyMonths
  );
  let nextDate =
    rentUpdateRule.nextUpdateDate ||
    rentUpdateRule.firstAdjustmentDate ||
    addMonths(rentUpdateRule.contractSignatureDate ?? lease.startDate, months);

  while (nextDate && new Date(nextDate) <= today) {
    nextDate = addMonths(nextDate, months);
  }

  return nextDate;
};

export const calculateLeaseCurrentRent = (lease: Lease, today: Date = new Date()) => {
  const baseRent = lease.rentUpdateRule.baseRent || lease.monthlyRent || 0;
  const history = calculateLeaseAdjustmentHistory(lease, today);
  return history.length > 0 ? history[history.length - 1].newRent : baseRent;
};

export const summarizeRentUpdateRule = (rule: RentUpdateRule) => {
  switch (rule.type) {
    case 'official-index':
      return `${rule.indexType ? rule.indexType.toUpperCase() : 'Index'} · ${rule.frequency}`;
    case 'fixed-percentage':
      return `${rule.fixedPercentage ?? 0}% · ${rule.frequency}`;
    case 'manual-custom-schedule':
      return 'Manual custom schedule';
    default:
      return 'No automatic update';
  }
};

export const syncPropertyLeaseData = (property: Property): Property => {
  const activeLease = getActiveLease(property);

  if (!activeLease) {
    return property;
  }

  const currentRent = calculateLeaseCurrentRent(activeLease);
  const nextUpdateDate = calculateLeaseNextUpdateDate(activeLease);
  const adjustmentHistory = calculateLeaseAdjustmentHistory(activeLease);

  const syncedLease: Lease = {
    ...activeLease,
    monthlyRent: currentRent,
    rentUpdateRule: {
      ...activeLease.rentUpdateRule,
      nextUpdateDate,
      baseRent: activeLease.rentUpdateRule.baseRent || currentRent,
    },
    adjustmentHistory,
  };

  const leases = property.leases ?? [];
  const nextLeases =
    leases.length === 0
      ? [syncedLease]
      : leases.some((lease) => lease.id === syncedLease.id)
      ? leases.map((lease) => (lease.id === syncedLease.id ? syncedLease : lease))
      : [syncedLease, ...leases.map((lease) => ({ ...lease, active: false }))];

  return {
    ...property,
    leases: nextLeases,
    activeLeaseId: syncedLease.id,
    monthlyRent: currentRent,
    monthlyRentCurrency: syncedLease.monthlyRentCurrency ?? property.monthlyRentCurrency,
    annualRent: currentRent * 12,
    rentalDeposit: syncedLease.securityDeposit ?? 0,
    rentalDepositCurrency:
      syncedLease.securityDepositCurrency ??
      property.rentalDepositCurrency ??
      syncedLease.monthlyRentCurrency,
    lateFeeAmount: syncedLease.lateFeeAmount ?? 0,
    lateFeeCurrency:
      syncedLease.lateFeeCurrency ??
      property.lateFeeCurrency ??
      syncedLease.monthlyRentCurrency,
    leaseEndDate: syncedLease.endDate ?? '',
    lastRentUpdateDate: adjustmentHistory[adjustmentHistory.length - 1]?.adjustmentDate ?? '',
  };
};
