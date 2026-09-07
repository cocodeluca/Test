import type { CashAccount, Property, PropertyMetrics } from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';
import type { PortfolioAlert } from '../../../common/utils/alerts';
import type { MortgageDebtPaydownSummary } from '../../../common/utils/calculations';
import {
  convertCurrencyWithCoverage,
  type CurrencyRates,
} from '../../../common/utils/currency';

export type DashboardCoverageStatus = 'available' | 'partial' | 'unavailable';

export interface DashboardCoverage {
  status: DashboardCoverageStatus;
  coveredCount: number;
  totalCount: number;
}

export interface DashboardCoveredAmount {
  value: number | null;
  coverage: DashboardCoverage;
}

export interface PropertiesOnlyPropertyRow {
  id: string;
  name: string;
  city: string;
  imageRefs: string[];
  sourceOperatingCurrency: DisplayCurrency;
  sourceValuationCurrency: DisplayCurrency;
  monthlyRent: number | null;
  monthlyOperatingExpenses: number | null;
  monthlyOperatingResult: number | null;
  currentEstimatedValue: number | null;
  grossYield: number | null;
}

export interface PropertiesOnlyDashboardViewModel {
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
  valuation: DashboardCoveredAmount;
  operating: {
    grossRent: DashboardCoveredAmount;
    expenses: DashboardCoveredAmount;
    noi: DashboardCoveredAmount;
    margin: number | null;
  };
  liquidity: DashboardCoveredAmount;
  debt: {
    current: DashboardCoveredAmount;
    nextPaymentPrincipal: number | null;
    next12MonthsPrincipal: number | null;
    next12MonthsInterest: number | null;
    projectedAfter12Months: number | null;
    projectionCoverage: DashboardCoverage;
    unverifiedMortgageCount?: number;
    unverifiedOutstandingBalance?: number | null;
    paidMortgageConflictCount?: number;
    paidMortgageConflictBalance?: number | null;
  };
  equity: {
    value: number | null;
    ltv: number | null;
    equityShare: number | null;
    coverage: DashboardCoverage;
  };
  properties: PropertiesOnlyPropertyRow[];
  topProperties: PropertiesOnlyPropertyRow[];
  events: PortfolioAlert[];
  occupancy: {
    totalCount: number;
    occupiedCount: number;
    vacantCount: number;
    pendingCount: number;
    unknownCount: number;
    rate: number;
  };
}

interface BuildPropertiesOnlyDashboardViewModelArgs {
  properties: Property[];
  propertyMetrics: PropertyMetrics[];
  cashAccounts: CashAccount[];
  alerts: PortfolioAlert[];
  debtPaydown: MortgageDebtPaydownSummary;
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
  fxRates: Readonly<Partial<CurrencyRates>>;
}

const coverageFromCounts = (
  coveredCount: number,
  totalCount: number,
  emptyIsAvailable = true
): DashboardCoverage => ({
  status:
    totalCount === 0
      ? emptyIsAvailable
        ? 'available'
        : 'unavailable'
      : coveredCount === 0
        ? 'unavailable'
        : coveredCount < totalCount
          ? 'partial'
          : 'available',
  coveredCount,
  totalCount,
});

const aggregateCoveredAmounts = (
  values: Array<number | null>,
  emptyIsAvailable = true
): DashboardCoveredAmount => {
  const coveredValues = values.filter((value): value is number => value !== null);
  const coverage = coverageFromCounts(coveredValues.length, values.length, emptyIsAvailable);

  return {
    value:
      values.length === 0
        ? emptyIsAvailable
          ? 0
          : null
        : coveredValues.length === 0
          ? null
          : coveredValues.reduce((sum, value) => sum + value, 0),
    coverage,
  };
};

const getImageRefs = (property: Property): string[] => {
  const candidates = property.imageUrls?.length
    ? property.imageUrls
    : property.imageUrl
      ? [property.imageUrl]
      : [];

  return candidates.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0
  );
};

const combineCoverage = (...coverages: DashboardCoverage[]): DashboardCoverage => {
  const coveredCount = coverages.reduce((sum, coverage) => sum + coverage.coveredCount, 0);
  const totalCount = coverages.reduce((sum, coverage) => sum + coverage.totalCount, 0);
  return coverageFromCounts(coveredCount, totalCount);
};

export const buildPropertiesOnlyDashboardViewModel = ({
  properties,
  propertyMetrics,
  cashAccounts,
  alerts,
  debtPaydown,
  valuationDisplayCurrency,
  operatingDisplayCurrency,
  fxRates,
}: BuildPropertiesOnlyDashboardViewModelArgs): PropertiesOnlyDashboardViewModel => {
  const metricsById = new Map(propertyMetrics.map((metric) => [metric.id, metric]));
  const rows = properties.map<PropertiesOnlyPropertyRow>((property) => {
    const metric = metricsById.get(property.id);
    const sourceOperatingCurrency = metric?.operatingDisplayCurrency ?? property.operatingCurrency ?? property.currency;
    const sourceValuationCurrency = metric?.valuationDisplayCurrency ?? property.currentEstimatedValueCurrency ?? property.propertyValueCurrency ?? property.currency;
    const nativeMonthlyRent = metric ? metric.annualRentalIncome / 12 : Number.NaN;
    const nativeMonthlyExpenses = metric?.monthlyExpensesEquivalent ?? Number.NaN;
    const convertedRent = convertCurrencyWithCoverage(
      nativeMonthlyRent,
      sourceOperatingCurrency,
      operatingDisplayCurrency,
      fxRates
    );
    const convertedExpenses = convertCurrencyWithCoverage(
      nativeMonthlyExpenses,
      sourceOperatingCurrency,
      operatingDisplayCurrency,
      fxRates
    );
    const hasValidCurrentValue =
      typeof property.currentEstimatedValue === 'number' &&
      Number.isFinite(property.currentEstimatedValue) &&
      property.currentEstimatedValue > 0 &&
      typeof metric?.currentEstimatedValue === 'number' &&
      Number.isFinite(metric.currentEstimatedValue) &&
      metric.currentEstimatedValue > 0;
    const convertedValue = hasValidCurrentValue
      ? convertCurrencyWithCoverage(
          metric.currentEstimatedValue,
          sourceValuationCurrency,
          valuationDisplayCurrency,
          fxRates
        )
      : { value: null, available: false };
    const monthlyRent = convertedRent.available ? convertedRent.value : null;
    const monthlyOperatingExpenses = convertedExpenses.available
      ? convertedExpenses.value
      : null;
    const grossYield =
      hasValidCurrentValue && typeof metric?.grossYield === 'number' && Number.isFinite(metric.grossYield)
        ? metric.grossYield
        : null;

    return {
      id: property.id,
      name: property.name,
      city: property.city,
      imageRefs: getImageRefs(property),
      sourceOperatingCurrency,
      sourceValuationCurrency,
      monthlyRent,
      monthlyOperatingExpenses,
      monthlyOperatingResult:
        monthlyRent !== null && monthlyOperatingExpenses !== null
          ? monthlyRent - monthlyOperatingExpenses
          : null,
      currentEstimatedValue: convertedValue.available ? convertedValue.value : null,
      grossYield,
    };
  });

  const grossRent = aggregateCoveredAmounts(rows.map((row) => row.monthlyRent));
  const expenses = aggregateCoveredAmounts(rows.map((row) => row.monthlyOperatingExpenses));
  const noi = aggregateCoveredAmounts(rows.map((row) => row.monthlyOperatingResult));
  const valuation = aggregateCoveredAmounts(rows.map((row) => row.currentEstimatedValue));
  const activeCashAccounts = cashAccounts.filter((account) => account.status === 'active');
  const liquidity = aggregateCoveredAmounts(
    activeCashAccounts.map((account) => {
      const balance =
        account.availableBalance !== null && account.availableBalance !== undefined
          ? account.availableBalance
          : account.currentBalance;
      const converted = convertCurrencyWithCoverage(
        balance,
        account.currency,
        valuationDisplayCurrency,
        fxRates
      );
      return converted.available ? converted.value : null;
    }),
    false
  );
  const activeDebtCoverage = coverageFromCounts(
    debtPaydown.debtCoveredMortgageCount,
    debtPaydown.candidateMortgageCount
  );
  const debtCoverage = debtPaydown.debtCoverageStatus === 'partial'
    ? {
        status: 'partial' as const,
        coveredCount: debtPaydown.debtCoveredMortgageCount,
        totalCount:
          debtPaydown.candidateMortgageCount + (debtPaydown.unverifiedMortgageCount ?? 0),
      }
    : activeDebtCoverage;
  const projectionCoverage = coverageFromCounts(
    debtPaydown.eligibleMortgageCount,
    debtPaydown.candidateMortgageCount
  );
  const currentDebt =
    debtCoverage.status === 'unavailable' && debtCoverage.totalCount > 0
      ? null
      : debtPaydown.currentDebt;
  const hasProjection =
    debtPaydown.status === 'no-active-mortgages' || debtPaydown.eligibleMortgageCount > 0;
  const equityCoverage = combineCoverage(valuation.coverage, debtCoverage);
  const equityValue =
    valuation.value !== null && currentDebt !== null ? valuation.value - currentDebt : null;
  const ltv =
    valuation.value !== null && valuation.value > 0 && currentDebt !== null
      ? (currentDebt / valuation.value) * 100
      : null;
  const occupancy = properties.reduce(
    (result, property) => {
      switch (String(property.occupancyStatus)) {
        case 'occupied':
          result.occupiedCount += 1;
          break;
        case 'vacant':
          result.vacantCount += 1;
          break;
        case 'tenant-to-be-confirmed':
          result.pendingCount += 1;
          break;
        default:
          result.unknownCount += 1;
      }
      return result;
    },
    {
      totalCount: properties.length,
      occupiedCount: 0,
      vacantCount: 0,
      pendingCount: 0,
      unknownCount: 0,
      rate: 0,
    }
  );
  occupancy.rate = occupancy.totalCount > 0
    ? (occupancy.occupiedCount / occupancy.totalCount) * 100
    : 0;

  return {
    valuationDisplayCurrency,
    operatingDisplayCurrency,
    valuation,
    operating: {
      grossRent,
      expenses,
      noi,
      margin:
        grossRent.value !== null && grossRent.value !== 0 && noi.value !== null
          ? (noi.value / grossRent.value) * 100
          : null,
    },
    liquidity,
    debt: {
      current: {
        value: currentDebt,
        coverage: debtCoverage,
      },
      nextPaymentPrincipal: hasProjection ? debtPaydown.currentMonthPrincipal : null,
      next12MonthsPrincipal: hasProjection ? debtPaydown.next12MonthsPrincipal : null,
      next12MonthsInterest: hasProjection ? debtPaydown.next12MonthsInterest : null,
      projectedAfter12Months: hasProjection
        ? debtPaydown.projectedDebtAfter12Months
        : null,
      projectionCoverage,
      unverifiedMortgageCount: debtPaydown.unverifiedMortgageCount ?? 0,
      unverifiedOutstandingBalance: debtPaydown.unverifiedOutstandingBalance ?? null,
      paidMortgageConflictCount: debtPaydown.paidMortgageConflictCount ?? 0,
      paidMortgageConflictBalance: debtPaydown.paidMortgageConflictBalance ?? null,
    },
    equity: {
      value: equityValue,
      ltv,
      equityShare: ltv === null ? null : 100 - ltv,
      coverage: equityCoverage,
    },
    properties: rows,
    topProperties: rows
      .filter((row): row is PropertiesOnlyPropertyRow & { grossYield: number } => row.grossYield !== null)
      .sort((left, right) => right.grossYield - left.grossYield)
      .slice(0, 5),
    events: alerts.slice(0, 4),
    occupancy,
  };
};
