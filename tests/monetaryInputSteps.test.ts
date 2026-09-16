import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

test('property and mortgage money inputs use one-euro increments', () => {
  const propertyForm = readSource('src/platforms/web/components/PropertyFormNew.tsx');
  const sectionEditor = readSource('src/platforms/web/components/PropertySectionEditModal.tsx');
  const mortgageForm = readSource('src/platforms/web/components/MortgageForm.tsx');

  // The default covers purchase price and current value, while the explicit
  // rent option ensures 1230 has no browser stepMismatch validation error.
  assert.match(propertyForm, /step=\{options\?\.step \?\? '1'\}/);
  assert.match(propertyForm, /'monthlyRent',[\s\S]*?step: '1'/);
  assert.doesNotMatch(propertyForm, /name="monthlyRent"[\s\S]{0,240}step="(?:10|50|100|1000)"/);
  assert.match(propertyForm, /name="renovationCosts"[\s\S]{0,180}step="1"/);
  assert.match(propertyForm, /name="annualCommunityFees"[\s\S]{0,180}step="1"/);

  assert.match(sectionEditor, /step="1"[\s\S]{0,500}value=\{purchasePrice\}/);
  assert.match(sectionEditor, /step="1"[\s\S]{0,500}value=\{currentEstimatedValue\}/);

  assert.match(mortgageForm, /name="originalLoanAmount"[\s\S]{0,240}min="0"[\s\S]{0,120}step="1"/);
  assert.doesNotMatch(mortgageForm, /name="originalLoanAmount"[\s\S]{0,240}min="0\.01"/);
  assert.match(mortgageForm, /name="currentBalance"[\s\S]{0,240}step="1"/);
  assert.match(mortgageForm, /name="monthlyMortgagePayment"[\s\S]{0,240}step="1"/);
  assert.match(mortgageForm, /name="openingFees"[\s\S]{0,240}step="1"/);
  assert.match(mortgageForm, /name="interestRate"[\s\S]{0,240}step="0\.01"/);
});
