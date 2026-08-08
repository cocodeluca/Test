import { DisplayCurrency } from '../types/settings';
import { getCurrentSettings } from './settingsStore';
import { getSettingsCurrencyRates } from './fxRates';

export interface CurrencyOption {
  code: DisplayCurrency;
  symbol: string;
  locale: string;
}

export type CurrencyRates = Record<DisplayCurrency, number>;

export const currencyOptions: CurrencyOption[] = [
  { code: 'EUR', symbol: 'EUR', locale: 'de-DE' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'ARS', symbol: '$', locale: 'es-AR' },
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
];

export const supportedCurrencies = currencyOptions.map((option) => option.code);

export const getCurrencyOption = (currency: DisplayCurrency): CurrencyOption =>
  currencyOptions.find((option) => option.code === currency) ?? currencyOptions[0];

export const getCurrencyLocale = (currency: DisplayCurrency): string =>
  getCurrencyOption(currency).locale;

export const getCurrencyFractionDigits = (currency: DisplayCurrency): number =>
  currency === 'ARS' ? 2 : 0;

export const getUsdToEurRate = (): number => {
  const rate = getCurrentSettings().usdToEurRate;
  return rate > 0 ? rate : 1;
};

export const getArsToEurRate = (): number => {
  const rate = getCurrentSettings().arsToEurRate;
  return rate > 0 ? rate : 0.00092;
};

const buildDefaultRates = (): CurrencyRates => ({
  ...getSettingsCurrencyRates(getCurrentSettings()),
});

const normalizeRateOverrides = (
  overrides?: number | Partial<CurrencyRates>
): CurrencyRates => {
  const defaultRates = buildDefaultRates();

  if (typeof overrides === 'number') {
    return {
      ...defaultRates,
      USD: overrides > 0 ? overrides : defaultRates.USD,
    };
  }

  return {
    ...defaultRates,
    ...overrides,
    EUR: 1,
  };
};

export const getConversionRate = (
  fromCurrency: DisplayCurrency,
  toCurrency: DisplayCurrency,
  rateOverrides?: number | Partial<CurrencyRates>
): number => {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const rates = normalizeRateOverrides(rateOverrides);
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!fromRate || !toRate) {
    return 1;
  }

  return fromRate / toRate;
};

export const convertCurrency = (
  value: number,
  fromCurrency: DisplayCurrency = 'EUR',
  toCurrency: DisplayCurrency = getCurrentSettings().currency,
  rateOverrides?: number | Partial<CurrencyRates>
): number => value * getConversionRate(fromCurrency, toCurrency, rateOverrides);

export interface CurrencyAmount {
  value: number;
  currency: DisplayCurrency;
}

export const sumInCurrency = (
  amounts: CurrencyAmount[],
  targetCurrency: DisplayCurrency,
  rateOverrides?: number | Partial<CurrencyRates>
): number =>
  amounts.reduce(
    (sum, amount) => sum + convertCurrency(amount.value, amount.currency, targetCurrency, rateOverrides),
    0
  );
