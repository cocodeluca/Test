import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('properties-only dashboard receives real data and keeps its presentation isolated', () => {
  const rendererSource = readSource('src/platforms/web/components/AppPageRenderer.tsx');
  const propertiesOnlySource = readSource('src/platforms/web/pages/PropertiesOnlyDashboard.tsx');
  const layoutSource = readSource('src/platforms/web/components/Layout.tsx');
  const sidebarSource = readSource('src/platforms/web/components/Sidebar.tsx');
  const webStyles = readSource('src/platforms/web/styles/index.css');
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
  assert.match(propertiesOnlySource, /properties-only-kpi-grid/);
  assert.match(propertiesOnlySource, /PropertiesOnlyOwnCapitalCard/);
  assert.match(propertiesOnlySource, /ownCapitalInvested/);

  const topRowStart = propertiesOnlySource.indexOf('properties-only-kpi-grid');
  const topRowEnd = propertiesOnlySource.indexOf('</section>', topRowStart);
  const topRow = propertiesOnlySource.slice(topRowStart, topRowEnd);
  assert.equal((topRow.match(/<MetricCard/g) ?? []).length, 5);
  assert.doesNotMatch(topRow, /ownCapitalInvested/);

  const secondRowStart = propertiesOnlySource.indexOf('properties-only-summary-grid');
  const secondRowEnd = propertiesOnlySource.indexOf('</section>', secondRowStart);
  const secondRow = propertiesOnlySource.slice(secondRowStart, secondRowEnd);
  assert.ok(secondRow.indexOf('liquidityTitle') < secondRow.indexOf('PropertiesOnlyOwnCapitalCard'));
  assert.ok(secondRow.indexOf('PropertiesOnlyOwnCapitalCard') < secondRow.indexOf('PropertiesOnlyMortgageDebtCard'));
  assert.ok(secondRow.indexOf('PropertiesOnlyMortgageDebtCard') < secondRow.indexOf('equityTitle'));
  assert.doesNotMatch(secondRow, /eventsTitle/);

  const lowerRowStart = propertiesOnlySource.indexOf('properties-only-lower-grid');
  const lowerRow = propertiesOnlySource.slice(lowerRowStart);
  assert.ok(lowerRow.indexOf('occupancyTitle') < lowerRow.indexOf('eventsTitle'));
  assert.match(lowerRow, /properties-only-lower-stack/);

  assert.match(webStyles, /container-type:\s*inline-size/);
  assert.match(webStyles, /properties-only-kpi-grid[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 12\.5rem\), 1fr\)\)/);
  assert.match(webStyles, /properties-only-summary-grid[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 15\.5rem\), 1fr\)\)/);
  assert.match(webStyles, /properties-only-summary-grid \.properties-only-panel[\s\S]*?padding-block:\s*clamp\(/);
  assert.match(webStyles, /properties-only-lower-grid[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 19rem\), 1fr\)\)/);
  assert.match(webStyles, /properties-only-kpi-value[\s\S]*?font-size:\s*clamp\(/);
  assert.match(webStyles, /properties-only-occupancy-chart[\s\S]*?height:\s*clamp\(/);
  assert.match(webStyles, /@media \(min-width: 1024px\) and \(max-height: 900px\)/);
  assert.match(webStyles, /properties-only-kpi-card,[\s\S]*?properties-only-summary-grid \.properties-only-panel[\s\S]*?padding-block:\s*0\.75rem/);
  assert.match(webStyles, /properties-only-debt-projection[\s\S]*?padding-block:\s*0\.5rem/);
  assert.match(layoutSource, /app-desktop-main min-w-0 flex-1 overflow-auto/);
  assert.match(sidebarSource, /app-desktop-sidebar/);
  assert.doesNotMatch(sidebarSource, /w-\[224px\]/);

  const getPropertiesOnlyBlock = (source: string) =>
    source.slice(source.indexOf('propertiesOnly:'), source.indexOf('starterTitle:', source.indexOf('propertiesOnly:')));
  assert.match(getPropertiesOnlyBlock(englishLabels), /netMonthlyCashflowTitle/);
  assert.match(getPropertiesOnlyBlock(spanishLabels), /netMonthlyCashflowTitle/);
  assert.match(getPropertiesOnlyBlock(englishLabels), /ownCapitalInvestedTitle/);
  assert.match(getPropertiesOnlyBlock(spanishLabels), /ownCapitalInvestedTitle/);
});
