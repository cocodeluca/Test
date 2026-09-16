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
  assert.match(propertiesOnlySource, /netMonthlyCashflow/);
  assert.match(propertiesOnlySource, /afterTaxMonthlyCashflow/);
  assert.match(propertiesOnlySource, /xl:grid-cols-5/);
  assert.match(propertiesOnlySource, /PropertiesOnlyOwnCapitalCard/);
  assert.match(propertiesOnlySource, /ownCapitalInvested/);

  const topRowStart = propertiesOnlySource.indexOf('xl:grid-cols-5');
  const topRowEnd = propertiesOnlySource.indexOf('</section>', topRowStart);
  const topRow = propertiesOnlySource.slice(topRowStart, topRowEnd);
  assert.equal((topRow.match(/<MetricCard/g) ?? []).length, 5);
  assert.doesNotMatch(topRow, /ownCapitalInvested/);

  const secondRowStart = propertiesOnlySource.indexOf('xl:grid-cols-[minmax(0,0.95fr)');
  const secondRowEnd = propertiesOnlySource.indexOf('</section>', secondRowStart);
  const secondRow = propertiesOnlySource.slice(secondRowStart, secondRowEnd);
  assert.ok(secondRow.indexOf('liquidityTitle') < secondRow.indexOf('PropertiesOnlyOwnCapitalCard'));
  assert.ok(secondRow.indexOf('PropertiesOnlyOwnCapitalCard') < secondRow.indexOf('PropertiesOnlyMortgageDebtCard'));
  assert.ok(secondRow.indexOf('PropertiesOnlyMortgageDebtCard') < secondRow.indexOf('equityTitle'));
  assert.doesNotMatch(secondRow, /eventsTitle/);

  const lowerRowStart = propertiesOnlySource.indexOf('xl:grid-cols-[minmax(0,1.15fr)');
  const lowerRow = propertiesOnlySource.slice(lowerRowStart);
  assert.ok(lowerRow.indexOf('occupancyTitle') < lowerRow.indexOf('eventsTitle'));
  assert.match(lowerRow, /flex h-full flex-col gap-4/);

  const getPropertiesOnlyBlock = (source: string) =>
    source.slice(source.indexOf('propertiesOnly:'), source.indexOf('starterTitle:', source.indexOf('propertiesOnly:')));
  assert.match(getPropertiesOnlyBlock(englishLabels), /netMonthlyCashflowTitle/);
  assert.match(getPropertiesOnlyBlock(spanishLabels), /netMonthlyCashflowTitle/);
  assert.match(getPropertiesOnlyBlock(englishLabels), /ownCapitalInvestedTitle/);
  assert.match(getPropertiesOnlyBlock(spanishLabels), /ownCapitalInvestedTitle/);
});
