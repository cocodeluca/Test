import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Mortgage, Property } from '../src/common/types';
import { createManualProperty } from '../src/common/utils/manualProperty';
import {
  addMortgageRelationship,
  deleteMortgageRelationship,
  editMortgageRelationship,
  synchronizeMortgageProperties,
} from '../src/common/utils/mortgageRelationships';

const createProperty = (id: string): Property =>
  createManualProperty(
    {
      operatingCurrency: 'EUR',
      propertyValueCurrency: 'EUR',
      name: id,
      address: '',
      city: 'Madrid',
      country: 'Spain',
      propertyType: 'Apartment',
      estimatedPropertyValue: 300000,
      monthlyRent: 1200,
      monthlyExpenses: 100,
      monthlyInsurance: 25,
      monthlyTaxes: 50,
      notes: '',
    },
    { id }
  );

const createMortgage = (overrides: Partial<Mortgage> = {}): Mortgage => ({
  id: 'mortgage-1',
  propertyId: 'property-1',
  currency: 'EUR',
  lenderName: 'Test Bank',
  originalLoanAmount: 200000,
  currentBalance: 175000,
  currentBalanceEstimated: false,
  interestRate: 3,
  mortgageTermYears: 30,
  mortgageTermMonths: 360,
  totalPayments: 360,
  repaymentFrequency: 'monthly',
  monthlyMortgagePayment: 850,
  initialMonthlyPayment: 800,
  regularMonthlyPayment: 850,
  mortgageStartDate: '2025-01-01',
  fixedOrVariable: 'fixed',
  mortgageType: 'Fixed',
  initialInterestRate: 2.5,
  initialRateMonths: 12,
  baseInterestRate: 3,
  currentInterestRate: 3,
  maxBonifiedRate: 2.7,
  maxTotalBonificationPoints: 0.3,
  valuationAmount: 300000,
  rateNotes: '',
  availableBonifications: [],
  activeBonifications: [],
  notes: '',
  ...overrides,
});

test('bug #7: the Mortgages page exposes deletion on the selected mortgage card', () => {
  const pageSource = readFileSync(
    path.join(process.cwd(), 'src/platforms/web/pages/MortgagesPage.tsx'),
    'utf8'
  );
  const cardSource = readFileSync(
    path.join(process.cwd(), 'src/platforms/web/components/MortgageCard.tsx'),
    'utf8'
  );

  assert.doesNotMatch(pageSource, /void onDeleteMortgage/);
  assert.match(pageSource, /onDelete=\{[^}]*onDeleteMortgage/);
  assert.match(cardSource, /Delete Mortgage/);
  assert.match(cardSource, /onDelete\(mortgage\.id\)/);
});

test('bug #8: adding, reassigning, and deleting synchronizes duplicated property debt fields', () => {
  const property1 = createProperty('property-1');
  const property2 = createProperty('property-2');
  const mortgage = createMortgage();
  const added = addMortgageRelationship([property1, property2], [], mortgage);
  const linkedAfterAdd = added.properties.find((property) => property.id === 'property-1')!;

  assert.equal(linkedAfterAdd.hasMortgage, true);
  assert.equal(linkedAfterAdd.lenderName, 'Test Bank');
  assert.equal(linkedAfterAdd.originalLoanAmount, 200000);
  assert.equal(linkedAfterAdd.currentMortgageBalance, 175000);
  assert.equal(linkedAfterAdd.monthlyMortgagePayment, 850);
  assert.equal(linkedAfterAdd.mortgageTermYears, 30);

  const reassignedMortgage = createMortgage({ propertyId: 'property-2', currentBalance: 160000 });
  const reassigned = editMortgageRelationship(
    added.properties,
    added.mortgages,
    reassignedMortgage
  );
  const oldProperty = reassigned.properties.find((property) => property.id === 'property-1')!;
  const newProperty = reassigned.properties.find((property) => property.id === 'property-2')!;

  assert.equal(oldProperty.hasMortgage, false);
  assert.equal(oldProperty.lenderName, undefined);
  assert.equal(oldProperty.originalLoanAmount, 0);
  assert.equal(oldProperty.currentMortgageBalance, 0);
  assert.equal(oldProperty.monthlyMortgagePayment, 0);
  assert.equal(oldProperty.mortgageTermYears, 0);
  assert.equal(oldProperty.annualMortgageInterest, null);
  assert.equal(oldProperty.annualPrincipalAmortized, null);
  assert.equal(oldProperty.annualTotalMortgagePaid, 0);
  assert.equal(newProperty.hasMortgage, true);
  assert.equal(newProperty.currentMortgageBalance, 160000);

  const deleted = deleteMortgageRelationship(
    reassigned.properties,
    reassigned.mortgages,
    reassignedMortgage.id
  );
  const propertyAfterDelete = deleted.properties.find((property) => property.id === 'property-2')!;

  assert.deepEqual(deleted.mortgages, []);
  assert.equal(propertyAfterDelete.hasMortgage, false);
  assert.equal(propertyAfterDelete.currentMortgageBalance, 0);
  assert.equal(propertyAfterDelete.monthlyMortgagePayment, 0);
  assert.equal(propertyAfterDelete.annualMortgageInterestTax, 0);
});

test('bug #9: a second mortgage for the same property is rejected on add or reassignment', () => {
  const properties = [createProperty('property-1'), createProperty('property-2')];
  const first = addMortgageRelationship(properties, [], createMortgage());

  assert.throws(
    () =>
      addMortgageRelationship(
        first.properties,
        first.mortgages,
        createMortgage({ id: 'mortgage-2' })
      ),
    /already has an active mortgage/i
  );

  const withSecondPropertyMortgage = addMortgageRelationship(
    first.properties,
    first.mortgages,
    createMortgage({ id: 'mortgage-2', propertyId: 'property-2' })
  );

  assert.throws(
    () =>
      editMortgageRelationship(
        withSecondPropertyMortgage.properties,
        withSecondPropertyMortgage.mortgages,
        createMortgage({ id: 'mortgage-2', propertyId: 'property-1' })
      ),
    /already has an active mortgage/i
  );
});

test('bug #8: a later property edit cannot overwrite mortgage-authoritative debt fields', () => {
  const relationship = addMortgageRelationship(
    [createProperty('property-1')],
    [],
    createMortgage()
  );
  const editedProperty = {
    ...relationship.properties[0],
    name: 'Edited property name',
    hasMortgage: false,
    currentMortgageBalance: 1,
    monthlyMortgagePayment: 2,
  };

  const synchronized = synchronizeMortgageProperties(
    [editedProperty],
    relationship.mortgages
  );

  assert.equal(synchronized[0].name, 'Edited property name');
  assert.equal(synchronized[0].hasMortgage, true);
  assert.equal(synchronized[0].currentMortgageBalance, 175000);
  assert.equal(synchronized[0].monthlyMortgagePayment, 850);
});
