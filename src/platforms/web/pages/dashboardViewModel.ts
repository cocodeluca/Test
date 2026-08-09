import type {
  PortfolioMetrics,
  Property,
  PropertyMetrics,
} from '../../../common/types';
import type { DisplayCurrency } from '../../../common/types/settings';
import { convertCurrency } from '../../../common/utils/currency';
import type { PortfolioAlert } from '../../../common/utils/alerts';

export const DASHBOARD_HISTORY_AVAILABLE = false;
export const DASHBOARD_ACTIVITY_AVAILABLE = false;
export const DASHBOARD_RESERVE_TARGET_MONTHS = 6;

export interface DashboardAllocationItem {
  key: 'real-estate' | 'cash' | 'investments';
  value: number;
  color: string;
}

export interface DashboardPropertySummaryItem {
  id: string;
  name: string;
  location: string;
  imageRefs: string[];
  currentEstimatedValue: number;
  equity: number;
  netMonthlyCashflow: number;
  valuationDisplayCurrency: DisplayCurrency;
  operatingDisplayCurrency: DisplayCurrency;
}

export interface DashboardHealthViewModel {
  propertyConcentrationPct: number | null;
  reserveMonths: number | null;
  reserveTargetMonths: number;
  reserveCoveragePct: number | null;
  debtToValuePct: number;
  liquidityPct: number | null;
}

export interface DashboardViewModel {
  primary: {
    netWorth: number;
    netMonthlyCashflow: number;
    annualizedCashflow: number;
    totalEquity: number;
    equityPct: number;
    totalDebt: number;
    debtToValuePct: number;
  };
  totalAssets: number;
  allocation: DashboardAllocationItem[];
  cashflow: {
    monthlyRent: number;
    monthlyOperatingExpenses: number;
    monthlyMortgagePayments: number;
    netMonthlyCashflow: number;
  };
  attention: {
    totalCount: number;
    items: PortfolioAlert[];
  };
  properties: DashboardPropertySummaryItem[];
  totalPropertyCount: number;
  health: DashboardHealthViewModel;
  historyAvailable: boolean;
  activityAvailable: boolean;
}

type RateOverrides = number | Partial<Record<DisplayCurrency, number>>;

interface BuildDashboardViewModelArgs {
  metrics: PortfolioMetrics;
  properties: Property[];
  propertyMetrics: PropertyMetrics[];
  alerts: PortfolioAlert[];
  rateOverrides?: RateOverrides;
}

const getPropertyValuationCurrency = (property: Property): DisplayCurrency =>
  property.currentEstimatedValueCurrency ??
  property.propertyValueCurrency ??
  property.purchasePriceCurrency ??
  property.operatingCurrency ??
  property.currency;

const getPropertyImageRefs = (property: Property): string[] => {
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

const calculatePropertyConcentration = (
  properties: Property[],
  targetCurrency: DisplayCurrency,
  rateOverrides?: RateOverrides
): number | null => {
  const values = properties.map((property) =>
    Math.max(
      convertCurrency(
        property.currentEstimatedValue,
        getPropertyValuationCurrency(property),
        targetCurrency,
        rateOverrides
      ),
      0
    )
  );
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total <= 0 || values.length === 0) {
    return null;
  }

  return (Math.max(...values) / total) * 100;
};

export const buildDashboardViewModel = ({
  metrics,
  properties,
  propertyMetrics,
  alerts,
  rateOverrides,
}: BuildDashboardViewModelArgs): DashboardViewModel => {
  const totalAssets =
    metrics.totalPortfolioValue + metrics.availableCash + metrics.investmentsValue;
  const monthlyBurn =
    metrics.totalMonthlyOperatingExpenses + metrics.totalMonthlyMortgagePayments;
  const availableCashInOperatingCurrency = convertCurrency(
    metrics.availableCash,
    metrics.valuationDisplayCurrency,
    metrics.operatingDisplayCurrency,
    rateOverrides
  );
  const reserveMonths = monthlyBurn > 0
    ? availableCashInOperatingCurrency / monthlyBurn
    : null;
  const reserveCoveragePct = reserveMonths === null
    ? null
    : (reserveMonths / DASHBOARD_RESERVE_TARGET_MONTHS) * 100;
  const liquidityPct = totalAssets > 0
    ? (metrics.availableCash / totalAssets) * 100
    : null;

  const allocation: DashboardAllocationItem[] = [
    {
      key: 'real-estate',
      value: metrics.totalPortfolioValue,
      color: '#38a169',
    },
    {
      key: 'cash',
      value: metrics.availableCash,
      color: '#2f6fed',
    },
    {
      key: 'investments',
      value: metrics.investmentsValue,
      color: '#8b7bd8',
    },
  ];

  const summaryProperties = properties.slice(0, 3).flatMap((property, index) => {
    const propertyMetric = propertyMetrics[index];

    if (!propertyMetric) {
      return [];
    }

    return [{
      id: property.id,
      name: property.name,
      location: [property.city, property.country].filter(Boolean).join(', '),
      imageRefs: getPropertyImageRefs(property),
      currentEstimatedValue: propertyMetric.currentEstimatedValue,
      equity: propertyMetric.equity,
      netMonthlyCashflow: propertyMetric.netMonthlyCashflow,
      valuationDisplayCurrency: propertyMetric.valuationDisplayCurrency,
      operatingDisplayCurrency: propertyMetric.operatingDisplayCurrency,
    }];
  });

  return {
    primary: {
      netWorth: metrics.totalNetWorth,
      netMonthlyCashflow: metrics.totalNetMonthlyCashflow,
      annualizedCashflow: metrics.annualizedCashflow,
      totalEquity: metrics.totalEquity,
      equityPct: metrics.equityPercentage,
      totalDebt: metrics.totalDebt,
      debtToValuePct: metrics.debtToValueRatio,
    },
    totalAssets,
    allocation,
    cashflow: {
      monthlyRent: metrics.totalMonthlyRent,
      monthlyOperatingExpenses: metrics.totalMonthlyOperatingExpenses,
      monthlyMortgagePayments: metrics.totalMonthlyMortgagePayments,
      netMonthlyCashflow: metrics.totalNetMonthlyCashflow,
    },
    attention: {
      totalCount: alerts.length,
      items: alerts.slice(0, 3),
    },
    properties: summaryProperties,
    totalPropertyCount: properties.length,
    health: {
      propertyConcentrationPct: calculatePropertyConcentration(
        properties,
        metrics.valuationDisplayCurrency,
        rateOverrides
      ),
      reserveMonths,
      reserveTargetMonths: DASHBOARD_RESERVE_TARGET_MONTHS,
      reserveCoveragePct,
      debtToValuePct: metrics.debtToValueRatio,
      liquidityPct,
    },
    historyAvailable: DASHBOARD_HISTORY_AVAILABLE,
    activityAvailable: DASHBOARD_ACTIVITY_AVAILABLE,
  };
};
