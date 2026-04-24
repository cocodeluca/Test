import { DisplayCurrency } from '../types/settings';
import { getCurrentSettings } from './settingsStore';
import {
  convertCurrency,
  getCurrencyFractionDigits,
} from './currency';
import { translateCurrentLanguage } from '../../platforms/web/i18n/translations';

const languageLocaleMap = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-PT',
} as const;

const getUiLocale = () => languageLocaleMap[getCurrentSettings().language] ?? 'en-US';
const getNumberLocale = () => getCurrentSettings().numberFormat || getUiLocale();
const getDateLocale = () => getCurrentSettings().dateFormat || getUiLocale();
const getCurrencyCode = () => getCurrentSettings().currency;

export const formatCurrencyValue = (
  value: number,
  currency: DisplayCurrency,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string => {
  const digits = getCurrencyFractionDigits(currency);

  return new Intl.NumberFormat(getUiLocale(), {
    style: 'currency',
    currency,
    localeMatcher: 'best fit',
    minimumFractionDigits: options?.minimumFractionDigits ?? digits,
    maximumFractionDigits: options?.maximumFractionDigits ?? digits,
  }).format(value);
};

export const formatCurrency = (
  value: number,
  sourceCurrency: DisplayCurrency = 'EUR'
): string => {
  const targetCurrency = getCurrencyCode();
  const convertedValue = convertCurrency(value, sourceCurrency, targetCurrency);

  return formatCurrencyValue(convertedValue, targetCurrency);
};

export const getPortfolioDisplayCurrency = (
  sourceCurrency: DisplayCurrency,
  domain: 'valuation' | 'operating' | 'reporting',
  reportingCurrency: DisplayCurrency = getCurrencyCode()
): DisplayCurrency => {
  if (reportingCurrency !== 'ARS') {
    return domain === 'reporting' ? reportingCurrency : sourceCurrency;
  }

  if (domain === 'valuation') {
    return 'USD';
  }

  if (domain === 'operating') {
    return 'ARS';
  }

  return reportingCurrency;
};

export const formatPortfolioDisplayCurrency = (
  value: number,
  sourceCurrency: DisplayCurrency,
  domain: 'valuation' | 'operating' | 'reporting',
  options?: {
    reportingCurrency?: DisplayCurrency;
    rateOverrides?: number | Partial<Record<DisplayCurrency, number>>;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string => {
  const reportingCurrency = options?.reportingCurrency ?? getCurrencyCode();
  const targetCurrency = getPortfolioDisplayCurrency(sourceCurrency, domain, reportingCurrency);
  const convertedValue = convertCurrency(value, sourceCurrency, targetCurrency, options?.rateOverrides);

  return formatCurrencyValue(convertedValue, targetCurrency, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  });
};

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return new Intl.NumberFormat(getNumberLocale(), {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
};

export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat(getNumberLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat(getDateLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat(getDateLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

type SupportedLanguage = 'en' | 'es' | 'pt';

const getCurrentLanguage = (): SupportedLanguage => {
  const language = getCurrentSettings().language;

  if (language === 'es' || language === 'pt') {
    return language;
  }

  return 'en';
};

const getMortgageTermLabels = (language: SupportedLanguage) => {
  switch (language) {
    case 'es':
      return {
        yearSingular: 'año',
        yearPlural: 'años',
        monthSingular: 'mes',
        monthPlural: 'meses',
        and: 'y',
        leftSingular: 'restante',
        leftPlural: 'restantes',
      };
    case 'pt':
      return {
        yearSingular: 'ano',
        yearPlural: 'anos',
        monthSingular: 'mes',
        monthPlural: 'meses',
        and: 'e',
        leftSingular: 'restante',
        leftPlural: 'restantes',
      };
    case 'en':
    default:
      return {
        yearSingular: 'year',
        yearPlural: 'years',
        monthSingular: 'month',
        monthPlural: 'months',
        and: 'and',
        leftSingular: 'left',
        leftPlural: 'left',
      };
  }
};

const formatMortgageTermUnit = (
  value: number,
  singular: string,
  plural: string
): string => `${value} ${value === 1 ? singular : plural}`;

export const formatMortgageTermMonths = (
  totalMonths: number,
  options?: {
    suffix?: 'remaining' | 'none';
  }
): string => {
  const normalizedMonths = Math.max(Math.round(totalMonths), 0);
  const language = getCurrentLanguage();
  const labels = getMortgageTermLabels(language);

  if (normalizedMonths === 0) {
    return language === 'es' ? '0 meses' : language === 'pt' ? '0 meses' : '0 months';
  }

  const years = Math.floor(normalizedMonths / 12);
  const months = normalizedMonths % 12;
  const parts: string[] = [];

  if (years > 0) {
    parts.push(formatMortgageTermUnit(years, labels.yearSingular, labels.yearPlural));
  }

  if (months > 0) {
    parts.push(formatMortgageTermUnit(months, labels.monthSingular, labels.monthPlural));
  }

  const joined = parts.join(` ${labels.and} `);

  if (options?.suffix !== 'remaining') {
    return joined;
  }

  const suffix = parts.length > 1 ? labels.leftPlural : labels.leftSingular;
  return `${joined} ${suffix}`;
};

export const formatMortgageTermYears = (
  years: number,
  options?: {
    suffix?: 'remaining' | 'none';
  }
): string => formatMortgageTermMonths(years * 12, options);

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const getLocalizedCurrencyLabel = (currency: DisplayCurrency): string =>
  translateCurrentLanguage(`common.currencyOptions.${currency}`);
