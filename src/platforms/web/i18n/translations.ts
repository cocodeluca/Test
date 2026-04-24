import { AppLanguage } from '../../../common/types/settings';
import { getCurrentSettings } from '../../../common/utils/settingsStore';
import { en } from './locales/en';
import { enExtra } from './locales/en-extra';
import { es } from './locales/es';
import { esExtra } from './locales/es-extra';
import { pt } from './locales/pt';
import { ptExtra } from './locales/pt-extra';
import type { TranslationTree } from './types';

type TranslationValue = string | TranslationTree;

export const defaultLanguage: AppLanguage = 'en';
export const fallbackLanguage: AppLanguage = 'en';
const warnedMissingKeys = new Set<string>();

const mergeTranslations = (base: TranslationTree, extension: TranslationTree): TranslationTree => {
  const merged: TranslationTree = { ...base };

  Object.entries(extension).forEach(([key, value]) => {
    const currentValue = merged[key];

    if (
      typeof currentValue === 'object' &&
      currentValue !== null &&
      typeof value === 'object' &&
      value !== null
    ) {
      merged[key] = mergeTranslations(currentValue as TranslationTree, value as TranslationTree);
      return;
    }

    merged[key] = value;
  });

  return merged;
};

export const translations = {
  en: mergeTranslations(en, enExtra),
  es: mergeTranslations(es, esExtra),
  pt: mergeTranslations(pt, ptExtra),
} satisfies Record<AppLanguage, TranslationTree>;

export const getTranslationValue = (
  language: AppLanguage,
  key: string
): string | undefined => {
  const resolvedValue =
    resolveTranslation(translations[language], key) ??
    (language === fallbackLanguage ? undefined : resolveTranslation(translations[fallbackLanguage], key));

  return typeof resolvedValue === 'string' ? resolvedValue : undefined;
};

export const translateCurrentLanguage = (
  key: string,
  replacements?: Record<string, string | number>
): string => translate(getCurrentSettings().language, key, replacements);

const resolveTranslation = (tree: TranslationTree, key: string): TranslationValue | undefined => {
  const segments = key.split('.');
  let value: TranslationValue | undefined = tree;

  for (const segment of segments) {
    if (typeof value !== 'object' || value === null || !(segment in value)) {
      return undefined;
    }

    value = (value as TranslationTree)[segment];
  }

  return value;
};

export const translate = (
  language: AppLanguage,
  key: string,
  replacements?: Record<string, string | number>
): string => {
  const resolved = getTranslationValue(language, key);

  if (!resolved) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      const warningKey = `${language}:${key}`;
      if (!warnedMissingKeys.has(warningKey)) {
        warnedMissingKeys.add(warningKey);
        console.warn(`[i18n] Missing translation key "${key}" for "${language}". Falling back to key name.`);
      }
    }
    return key;
  }

  if (!replacements) {
    return resolved;
  }

  return Object.entries(replacements).reduce(
    (result, [replacementKey, replacementValue]) =>
      result.split(`{{${replacementKey}}}`).join(String(replacementValue)),
    resolved
  );
};

const flattenTree = (
  tree: TranslationTree,
  prefix = ''
): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((result, [key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[nextKey] = value;
      return result;
    }

    return {
      ...result,
      ...flattenTree(value, nextKey),
    };
  }, {});

export const flattenTranslations = (language: AppLanguage): Record<string, string> =>
  flattenTree(translations[language]);
