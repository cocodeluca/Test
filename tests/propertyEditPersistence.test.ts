import assert from 'node:assert/strict';
import test from 'node:test';
import type { Property } from '../src/common/types';
import {
  mergeChangedPropertyFields,
  replacePropertyRecord,
} from '../src/common/utils/propertyEdits';

const originalProp1 = {
  id: 'prop1',
  currentEstimatedValue: 200000,
  leases: [{ id: 'lease-1', name: 'Current lease', active: true }],
  recurringExpenses: [{ id: 'expense-tax', expenseType: 'property-tax', lastKnownAmount: 80 }],
  propertyManagementRate: 0.1,
  oneTimeTenantPlacementFee: 1200,
  cashInvested: 50000,
  totalCashInvestedForPurchase: 50000,
  totalInitialInvestment: 220000,
  currentMortgageBalance: 150000,
  annualMortgageInterest: 4000,
  annualPrincipalAmortized: 4500,
  annualTotalMortgagePaid: 8500,
  propertyValuationForMortgage: 200000,
  mortgageAppraisalCost: 500,
} as Property;

const originalProp2 = {
  id: 'prop2',
  currentEstimatedValue: 175000,
  currentMortgageBalance: 100000,
  annualMortgageInterest: 2500,
} as Property;

const synchronizedEditingProperty = {
  ...originalProp1,
  currentMortgageBalance: 155000,
  annualMortgageInterest: undefined,
  annualPrincipalAmortized: undefined,
  annualTotalMortgagePaid: 0,
  propertyValuationForMortgage: 0,
  mortgageAppraisalCost: 0,
} as Property;

const normalizedFormDraft = {
  ...synchronizedEditingProperty,
  leases: [{ id: 'lease-1', name: 'Long-term residential', active: true }],
  recurringExpenses: [
    ...(synchronizedEditingProperty.recurringExpenses ?? []),
    { id: 'generated-management', expenseType: 'management-fees', lastKnownAmount: 120 },
  ],
  propertyManagementRate: 0,
  oneTimeTenantPlacementFee: 0,
  cashInvested: 0,
  totalCashInvestedForPurchase: 0,
  totalInitialInvestment: 225000,
} as Property;

const persistedPortfolio = (properties: Property[]) => ({
  properties,
  mortgages: [],
  cashAccounts: [],
  bankConnections: [],
  investmentAccounts: [],
  opportunities: [],
  rehabProjects: [],
  reports: [],
  reportTemplates: [],
  reportBranding: {} as never,
});

test('editing only prop1 valuation preserves every other persisted field and property', () => {
  const editedDraft = { ...normalizedFormDraft, currentEstimatedValue: 280000 };
  const formPayload = mergeChangedPropertyFields(
    synchronizedEditingProperty,
    normalizedFormDraft,
    editedDraft
  );
  const merged = mergeChangedPropertyFields(
    originalProp1,
    synchronizedEditingProperty,
    formPayload
  );
  const beforeProperties = [originalProp1, originalProp2];
  const afterProperties = replacePropertyRecord(beforeProperties, merged);
  const before = JSON.parse(JSON.stringify(persistedPortfolio(beforeProperties)));
  const after = JSON.parse(JSON.stringify(persistedPortfolio(afterProperties)));

  assert.deepEqual(after, {
    ...before,
    properties: [
      { ...before.properties[0], currentEstimatedValue: 280000 },
      before.properties[1],
    ],
  });
  assert.equal(after.properties[0].currentEstimatedValue, 280000);
  assert.deepEqual(
    { ...afterProperties[0], currentEstimatedValue: 200000 },
    originalProp1
  );
  assert.strictEqual(afterProperties[1], originalProp2);
});
