import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('properties-only dashboard receives real data and keeps its presentation isolated', () => {
  const rendererSource = readSource('src/platforms/web/components/AppPageRenderer.tsx');
  const propertiesOnlySource = readSource('src/platforms/web/pages/PropertiesOnlyDashboard.tsx');
  const englishLabels = readSource('src/platforms/web/i18n/locales/en-extra.ts');
  const spanishLabels = readSource('src/platforms/web/i18n/locales/es-extra.ts');

  assert.match(
    rendererSource,
    /<PropertiesOnlyDashboard[\s\S]*?properties=\{props\.syncedProperties\}[\s\S]*?mortgages=\{props\.effectiveMortgages\}[\s\S]*?cashAccounts=\{props\.effectiveCashAccounts\}/
  );
  assert.match(propertiesOnlySource, /calculateMortgageDebtPaydown\(\{/);
  assert.match(propertiesOnlySource, /buildPropertiesOnlyDashboardViewModel\(\{/);
  assert.match(propertiesOnlySource, /data-dashboard-variant="properties-only"/);
  assert.match(propertiesOnlySource, /onClick=\{onAddProperty\}/);
  assert.match(propertiesOnlySource, /onClick=\{onOpenProperties\}/);
  assert.doesNotMatch(propertiesOnlySource, /DebtPaydownCard/);
  assert.doesNotMatch(propertiesOnlySource, /Cashflow/i);

  const getPropertiesOnlyBlock = (source: string) =>
    source.slice(source.indexOf('propertiesOnly:'), source.indexOf('starterTitle:', source.indexOf('propertiesOnly:')));
  assert.doesNotMatch(getPropertiesOnlyBlock(englishLabels), /Cashflow/i);
  assert.doesNotMatch(getPropertiesOnlyBlock(spanishLabels), /Cashflow/i);
});
