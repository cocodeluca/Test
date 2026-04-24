import type { RecurringExpenseBillingFrequency } from '../types';
import type { DisplayCurrency } from '../types/settings';
import { getArsToEurRate, getUsdToEurRate } from './currency';

export type MonetaryFrequency = RecurringExpenseBillingFrequency | 'monthly' | 'yearly';

export interface NormalizedMonetaryAmountInput {
  amount: number | string | null | undefined;
  currency?: DisplayCurrency | null;
  frequency?: MonetaryFrequency | null;
  customFrequencyMonths?: number | null;
  targetCurrency?: DisplayCurrency;
  rateOverrides?: Partial<Record<DisplayCurrency, number>>;
}

export interface NormalizedMonetaryAmountResult {
  rawAmount: number | string | null | undefined;
  parsedAmount: number;
  sourceCurrency: DisplayCurrency;
  targetCurrency: DisplayCurrency;
  frequency: MonetaryFrequency;
  monthsPerCycle: number;
  monthlyAmountInSourceCurrency: number;
  fxRate: number | null;
  normalizedMonthlyAmount: number;
  missingFx: boolean;
}

const DEFAULT_TARGET_CURRENCY: DisplayCurrency = 'EUR';

const buildRates = (
  rateOverrides?: Partial<Record<DisplayCurrency, number>>
): Record<DisplayCurrency, number> => ({
  EUR: 1,
  USD: rateOverrides?.USD ?? getUsdToEurRate(),
  ARS: rateOverrides?.ARS ?? getArsToEurRate(),
});

export const parseMoneyAmount = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed.replace(/[^\d,.\-]/g, '');
  if (!normalized) {
    return 0;
  }

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    const compact = normalized.split(thousandsSeparator).join('');
    const canonical = decimalSeparator === ',' ? compact.replace(',', '.') : compact;
    const parsed = Number(canonical);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (lastComma >= 0) {
    const decimalDigits = normalized.length - lastComma - 1;
    const canonical =
      decimalDigits > 0 && decimalDigits <= 2
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    const parsed = Number(canonical);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (lastDot >= 0) {
    const decimalDigits = normalized.length - lastDot - 1;
    const canonical =
      decimalDigits > 0 && decimalDigits <= 2
        ? normalized.replace(/,/g, '')
        : normalized.replace(/\./g, '');
    const parsed = Number(canonical);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getFrequencyMonths = (
  frequency: MonetaryFrequency | null | undefined,
  customFrequencyMonths?: number | null
): number => {
  switch (frequency ?? 'monthly') {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'every-4-months':
      return 4;
    case 'semi-annual':
      return 6;
    case 'yearly':
      return 12;
    case 'custom':
      return Math.max(Math.trunc(customFrequencyMonths ?? 0), 1);
    default:
      return 1;
  }
};

export const getStrictConversionRate = (
  fromCurrency: DisplayCurrency,
  toCurrency: DisplayCurrency = DEFAULT_TARGET_CURRENCY,
  rateOverrides?: Partial<Record<DisplayCurrency, number>>
): number | null => {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const rates = buildRates(rateOverrides);
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!(fromRate > 0) || !(toRate > 0)) {
    return null;
  }

  return fromRate / toRate;
};

export const normalizeAmountToMonthlyCurrency = (
  input: NormalizedMonetaryAmountInput
): NormalizedMonetaryAmountResult => {
  const sourceCurrency = input.currency ?? 'EUR';
  const targetCurrency = input.targetCurrency ?? DEFAULT_TARGET_CURRENCY;
  const frequency = input.frequency ?? 'monthly';
  const parsedAmount = parseMoneyAmount(input.amount);
  const monthsPerCycle = getFrequencyMonths(frequency, input.customFrequencyMonths);
  const monthlyAmountInSourceCurrency =
    monthsPerCycle > 0 ? parsedAmount / monthsPerCycle : parsedAmount;
  const fxRate = getStrictConversionRate(sourceCurrency, targetCurrency, input.rateOverrides);
  const missingFx = fxRate === null;

  return {
    rawAmount: input.amount,
    parsedAmount,
    sourceCurrency,
    targetCurrency,
    frequency,
    monthsPerCycle,
    monthlyAmountInSourceCurrency,
    fxRate,
    normalizedMonthlyAmount: missingFx ? 0 : monthlyAmountInSourceCurrency * fxRate,
    missingFx,
  };
};
