import type { Property } from '../types';
import type { DisplayCurrency, PortfolioDisplayMode } from '../types/settings';
import { convertCurrency } from './currency';
import { getCurrentSettings } from './settingsStore';
import type { AppSettings } from '../types/settings';

export type MetricCurrencyDomain = 'value' | 'operating' | 'reporting' | 'none';
export type MetricType =
  | 'portfolio-value'
  | 'equity'
  | 'debt'
  | 'cash'
  | 'investments'
  | 'purchase-price'
  | 'current-estimated-value'
  | 'monthly-rent'
  | 'operating-expenses'
  | 'cashflow'
  | 'annualized-cashflow'
  | 'mortgage-payment'
  | 'mortgage-balance'
  | 'yield'
  | 'occupancy'
  | 'ratio'
  | 'percent'
  | 'other';

export const getMetricCurrencyDomain = (metricType: MetricType): MetricCurrencyDomain => {
  switch (metricType) {
    case 'portfolio-value':
    case 'equity':
    case 'debt':
    case 'cash':
    case 'investments':
    case 'purchase-price':
    case 'current-estimated-value':
    case 'mortgage-balance':
      return 'value';
    case 'monthly-rent':
    case 'operating-expenses':
    case 'cashflow':
    case 'annualized-cashflow':
    case 'mortgage-payment':
      return 'operating';
    case 'yield':
    case 'occupancy':
    case 'ratio':
    case 'percent':
      return 'none';
    default:
      return 'reporting';
  }
};

export const getPropertyValueCurrency = (property?: Partial<Property>): DisplayCurrency | undefined =>
  property?.propertyValueCurrency ?? property?.currentEstimatedValueCurrency ?? property?.purchasePriceCurrency ?? property?.currency;

export const getPropertyOperatingCurrency = (property?: Partial<Property>): DisplayCurrency | undefined =>
  property?.operatingCurrency ?? property?.currency;

export const resolveDisplayCurrency = ({
  domain,
  settings = getCurrentSettings(),
  property,
  metricType,
}: {
  domain: MetricCurrencyDomain;
  settings?: AppSettings;
  property?: Partial<Property>;
  metricType?: MetricType;
}): DisplayCurrency => {
  const displayMode: PortfolioDisplayMode = settings.displayMode ?? 'single-reporting-currency';
  const fallbackCurrency = settings.currency ?? 'EUR';
  const valueCurrency = settings.valueCurrency ?? getPropertyValueCurrency(property) ?? fallbackCurrency;
  const operatingCurrency =
    settings.operatingCurrency ?? getPropertyOperatingCurrency(property) ?? fallbackCurrency;
  const reportingCurrency = settings.reportingCurrency ?? fallbackCurrency;

  if (metricType && getMetricCurrencyDomain(metricType) === 'none') {
    return reportingCurrency;
  }

  if (displayMode === 'mixed-logical-currencies') {
    if (domain === 'value') return valueCurrency ?? reportingCurrency;
    if (domain === 'operating') return operatingCurrency ?? reportingCurrency;
    return reportingCurrency;
  }

  return reportingCurrency;
};

export const formatMetricAmount = (
  amount: number,
  fromCurrency: DisplayCurrency,
  domain: MetricCurrencyDomain,
  options?: {
    settings?: AppSettings;
    property?: Partial<Property>;
    rateOverrides?: number | Partial<Record<DisplayCurrency, number>>;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): { value: number; currency: DisplayCurrency } => {
  const targetCurrency = resolveDisplayCurrency({
    domain,
    settings: options?.settings,
    property: options?.property,
  });

  return {
    value: convertCurrency(amount, fromCurrency, targetCurrency, options?.rateOverrides),
    currency: targetCurrency,
  };
};
