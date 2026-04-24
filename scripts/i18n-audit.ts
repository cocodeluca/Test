import fs from 'node:fs';
import path from 'node:path';
import { flattenTranslations } from '../src/platforms/web/i18n/translations';
import { en } from '../src/platforms/web/i18n/locales/en';
import { enExtra } from '../src/platforms/web/i18n/locales/en-extra';
import { es } from '../src/platforms/web/i18n/locales/es';
import { esExtra } from '../src/platforms/web/i18n/locales/es-extra';
import { pt } from '../src/platforms/web/i18n/locales/pt';
import { ptExtra } from '../src/platforms/web/i18n/locales/pt-extra';

type LocaleName = 'en' | 'es' | 'pt';
interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src');
const localeFiles = {
  en: { base: en as TranslationTree, extra: enExtra as TranslationTree },
  es: { base: es as TranslationTree, extra: esExtra as TranslationTree },
  pt: { base: pt as TranslationTree, extra: ptExtra as TranslationTree },
} satisfies Record<LocaleName, { base: TranslationTree; extra: TranslationTree }>;

const flattenTree = (tree: TranslationTree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [nextKey] : flattenTree(value as TranslationTree, nextKey);
  });

const readFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return readFiles(fullPath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [fs.readFileSync(fullPath, 'utf8')];
  });

const readSourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(fullPath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [fullPath];
  });

const source = readFiles(sourceDir).join('\n');
const usedKeys = new Set<string>();
const keyPatterns = [
  /\bt\(\s*['"`]([^'"`]+)['"`]/g,
  /\btranslate(?:CurrentLanguage)?\(\s*[^,]*,\s*['"`]([^'"`]+)['"`]/g,
  /\btranslateCurrentLanguage\(\s*['"`]([^'"`]+)['"`]/g,
];

for (const pattern of keyPatterns) {
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(source)) !== null) {
    usedKeys.add(match[1]);
  }
}

const englishKeys = Object.keys(flattenTranslations('en')).sort();
const reportSection = (title: string, items: string[]) => {
  console.log(`\n${title}: ${items.length}`);
  items.slice(0, 40).forEach((item) => console.log(`- ${item}`));
  if (items.length > 40) {
    console.log(`- ...and ${items.length - 40} more`);
  }
};

let hasFailure = false;

for (const locale of ['es', 'pt'] as LocaleName[]) {
  const localeKeys = Object.keys(flattenTranslations(locale));
  const missingKeys = englishKeys.filter((key) => !localeKeys.includes(key));
  if (missingKeys.length > 0) {
    hasFailure = true;
    reportSection(`Missing keys in ${locale}`, missingKeys);
  }
}

const unusedKeys = englishKeys.filter((key) => !usedKeys.has(key));
reportSection('Unused keys in en', unusedKeys);

for (const locale of Object.keys(localeFiles) as LocaleName[]) {
  const duplicateKeys = flattenTree(localeFiles[locale].base).filter((key) =>
    flattenTree(localeFiles[locale].extra).includes(key)
  );

  if (duplicateKeys.length > 0) {
    reportSection(`Duplicate keys between base and extra in ${locale}`, duplicateKeys);
  }
}

const fallbackCandidates = Array.from(usedKeys).filter(
  (key) => !Object.prototype.hasOwnProperty.call(flattenTranslations('es'), key)
).sort();

if (fallbackCandidates.length > 0) {
  hasFailure = true;
  reportSection('Keys that would fall back from es to en', fallbackCandidates);
}

const uiLiteralFiles = readSourceFiles(sourceDir).filter(
  (filePath) =>
    filePath.endsWith('.tsx') &&
    !filePath.includes(`${path.sep}i18n${path.sep}`) &&
    !filePath.includes(`${path.sep}locales${path.sep}`)
);

const uiLiteralIgnorePatterns = [
  /data-tutorial-id/i,
  /className=/i,
  /key=/i,
  /value=/i,
  /type=/i,
  /name=/i,
  /htmlFor=/i,
  /id=/i,
  /toISOString/i,
  /rgba?\(/i,
  /linear-gradient/i,
  /Date\.now/i,
];

const uiLiteralFindings = uiLiteralFiles.flatMap((filePath) => {
  const fileSource = fs.readFileSync(filePath, 'utf8');
  const findings: string[] = [];
  const textNodePattern = />\s*([A-Za-z][A-Za-z0-9 ,/&:+().-]{2,})\s*</g;
  const attributePattern =
    /\b(?:title|placeholder|aria-label|alt|label)\s*=\s*["']([A-Za-z][^"']*[A-Za-z])["']/g;

  let match: RegExpExecArray | null = null;

  while ((match = textNodePattern.exec(fileSource)) !== null) {
    const candidate = match[1].trim();
    if (
      candidate.length >= 3 &&
      !candidate.includes('{') &&
      !uiLiteralIgnorePatterns.some((pattern) => pattern.test(candidate))
    ) {
      findings.push(`${path.relative(rootDir, filePath)} :: ${candidate}`);
    }
  }

  while ((match = attributePattern.exec(fileSource)) !== null) {
    const candidate = match[1].trim();
    if (
      candidate.length >= 3 &&
      !candidate.includes('{') &&
      !uiLiteralIgnorePatterns.some((pattern) => pattern.test(candidate))
    ) {
      findings.push(`${path.relative(rootDir, filePath)} :: ${candidate}`);
    }
  }

  return findings;
});

if (uiLiteralFindings.length > 0) {
  reportSection('Potential hardcoded UI literals', uiLiteralFindings);
}

if (!hasFailure) {
  console.log('\ni18n audit passed: no missing locale keys that would force fallback.');
}
