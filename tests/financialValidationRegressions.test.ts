import assert from 'node:assert/strict';
import test from 'node:test';
import type { Mortgage } from '../src/common/types';
import {
  calculateMortgageSnapshot,
  calculatePropertyFinancials,
} from '../src/common/utils/calculations';
import {
  FinancialValidationError,
  assertValidMortgageFinancialValues,
  assertValidOpportunityFinancialValues,
  assertValidPropertyFinancialValues,
} from '../src/common/utils/financialValidation';
import { formatPercentage } from '../src/common/utils/formatting';
import { createManualProperty } from '../src/common/utils/manualProperty';
import { createEmptyOpportunity } from '../src/common/utils/opportunities';

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
  mortgageStartDate: '2025-01-01',
  fixedOrVariable: 'fixed',
  mortgageType: 'Fixed',
  initialInterestRate: null,
  baseInterestRate: 3,
  currentInterestRate: 3,
  maxBonifiedRate: null,
  maxTotalBonificationPoints: null,
  rateNotes: '',
  availableBonifications: [],
  activeBonifications: [],
  notes: '',
  ...overrides,
});

const createProperty = () =>
  createManualProperty(
    {
      operatingCurrency: 'EUR',
      propertyValueCurrency: 'EUR',
      name: 'Property 1',
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
    { id: 'property-1', builtAreaSqm: 80 }
  );

test('bug #10: negative and non-finite property financial values are rejected, not coerced', () => {
  const property = createProperty();

  assert.throws(
    () =>
      assertValidPropertyFinancialValues({
        ...property,
        purchasePrice: -1,
        monthlyRent: Number.POSITIVE_INFINITY,
        builtAreaSqm: -10,
      }),
    (error: unknown) => {
      assert.ok(error instanceof FinancialValidationError);
      assert.match(error.message, /purchasePrice/);
      assert.match(error.message, /monthlyRent/);
      assert.match(error.message, /builtAreaSqm/);
      return true;
    }
  );
});

test('bug #10: invalid recurring expense values are rejected before persistence', () => {
  const property = createProperty();

  assert.throws(
    () =>
      assertValidPropertyFinancialValues({
        ...property,
        recurringExpenses: [
          {
            id: 'expense-1',
            expenseType: 'maintenance',
            label: 'Maintenance',
            country: 'Spain',
            billingFrequency: 'monthly',
            lastKnownAmount: -50,
            projectionMode: 'fixed-amount',
            paymentHistory: [
              {
                id: 'payment-1',
                paymentDate: '2026-01-01',
                amount: Number.POSITIVE_INFINITY,
                coveredPeriod: 'January',
              },
            ],
            customSchedule: [
              {
                id: 'schedule-1',
                effectiveDate: '2026-02-01',
                amount: -75,
              },
            ],
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof FinancialValidationError);
      assert.match(error.message, /recurringExpenses\[0\]\.lastKnownAmount/);
      assert.match(error.message, /paymentHistory\[0\]\.amount/);
      assert.match(error.message, /customSchedule\[0\]\.amount/);
      return true;
    }
  );
});

test('bug #10: invalid mortgage principal, balance, payment, and term are rejected', () => {
  assert.throws(
    () =>
      assertValidMortgageFinancialValues(
        createMortgage({
          originalLoanAmount: -200000,
          currentBalance: Number.NaN,
          monthlyMortgagePayment: -850,
          mortgageTermYears: 0,
          mortgageTermMonths: 0,
          totalPayments: 0,
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof FinancialValidationError);
      assert.match(error.message, /originalLoanAmount/);
      assert.match(error.message, /currentBalance/);
      assert.match(error.message, /monthlyMortgagePayment/);
      assert.match(error.message, /mortgage term/);
      return true;
    }
  );
});

test('bug #10: calculations mark missing non-positive denominators and required mortgage inputs invalid', () => {
  const property = createProperty();
  const invalidPropertyFinancials = calculatePropertyFinancials({
    ...property,
    purchasePrice: 0,
    currentEstimatedValue: 0,
    cashInvested: 0,
    totalInitialInvestment: 0,
    totalCashInvestedForPurchase: 0,
  });
  const invalidMortgageSnapshot = calculateMortgageSnapshot(
    createMortgage({
      originalLoanAmount: 0,
      currentBalance: 0,
      mortgageTermYears: 0,
      mortgageTermMonths: 0,
      totalPayments: 0,
    })
  );

  assert.ok(Number.isNaN(invalidPropertyFinancials.grossYield));
  assert.ok(Number.isNaN(invalidPropertyFinancials.netYield));
  assert.ok(Number.isNaN(invalidPropertyFinancials.equityPercentage));
  assert.match(invalidPropertyFinancials.calculationIssues.join(' '), /valuation/i);
  assert.equal(formatPercentage(invalidPropertyFinancials.grossYield), '—');
  assert.equal(invalidMortgageSnapshot.isValid, false);
  assert.equal(invalidMortgageSnapshot.currentMonthlyPayment, null);
  assert.match(invalidMortgageSnapshot.validationIssues.join(' '), /principal/i);
  assert.match(invalidMortgageSnapshot.validationIssues.join(' '), /term/i);
});

test('bug #11: selling-cost rates at or above 100% are rejected', () => {
  assert.throws(
    () => assertValidOpportunityFinancialValues(createEmptyOpportunity({ sellingCostPct: 100 })),
    (error: unknown) => {
      assert.ok(error instanceof FinancialValidationError);
      assert.match(error.message, /sellingCostPct/);
      return true;
    }
  );
});
