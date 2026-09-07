import type { Mortgage, Property } from '../types';
import { assertValidMortgageFinancialValues } from './financialValidation';

export interface MortgageRelationshipState {
  properties: Property[];
  mortgages: Mortgage[];
}

const clearPropertyMortgageFields = (property: Property): Property => ({
  ...property,
  hasMortgage: false,
  lenderName: undefined,
  originalLoanAmount: 0,
  currentMortgageBalance: 0,
  monthlyMortgagePayment: 0,
  loanToValueAtPurchase: 0,
  mortgageTermYears: 0,
  initialInterestRateYear1: 0,
  interestType: '',
  baseRateWithoutBonificationsAfterYear1: 0,
  maxBonifiedRateAfterYear1: 0,
  monthlyMortgagePaymentYear1: 0,
  monthlyMortgagePaymentWithoutBonificationsReference: 0,
  monthlyMortgagePaymentWithMaxBonificationsReference: 0,
  firstYearInterestAnnual: 0,
  firstYearPrincipalAnnual: 0,
  propertyValuationForMortgage: 0,
  mortgageAppraisalCost: 0,
  registryCheckCost: 0,
  estimatedAnnualHomeInsuranceForBank: 0,
  estimatedAnnualLifeInsurance: 0,
  estimatedAnnualPaymentProtectionInsurance: 0,
  annualMortgageInterest: null,
  annualPrincipalAmortized: null,
  annualTotalMortgagePaid: 0,
  annualMortgageInterestTax: 0,
});

const synchronizePropertyFromMortgage = (
  property: Property,
  mortgage: Mortgage
): Property => {
  const cleared = clearPropertyMortgageFields(property);
  const valuationAmount = mortgage.valuationAmount ?? 0;
  const loanToValueAtPurchase =
    valuationAmount > 0
      ? (mortgage.originalLoanAmount / valuationAmount) * 100
      : 0;

  return {
    ...cleared,
    hasMortgage: true,
    lenderName: mortgage.lenderName,
    originalLoanAmount: mortgage.originalLoanAmount,
    currentMortgageBalance: mortgage.currentBalance,
    monthlyMortgagePayment: mortgage.monthlyMortgagePayment,
    loanToValueAtPurchase,
    mortgageTermYears: mortgage.mortgageTermYears,
    initialInterestRateYear1:
      mortgage.initialInterestRate ?? mortgage.interestRate,
    interestType: mortgage.mortgageType,
    baseRateWithoutBonificationsAfterYear1:
      mortgage.baseInterestRate ?? mortgage.interestRate,
    maxBonifiedRateAfterYear1:
      mortgage.maxBonifiedRate ?? mortgage.currentInterestRate ?? mortgage.interestRate,
    monthlyMortgagePaymentYear1:
      mortgage.initialMonthlyPayment ?? mortgage.monthlyMortgagePayment,
    monthlyMortgagePaymentWithoutBonificationsReference:
      mortgage.regularMonthlyPayment ?? mortgage.monthlyMortgagePayment,
    monthlyMortgagePaymentWithMaxBonificationsReference:
      mortgage.monthlyMortgagePayment,
    propertyValuationForMortgage: valuationAmount,
    mortgageAppraisalCost: mortgage.valuationFee ?? 0,
  };
};

export const synchronizeMortgageProperties = (
  properties: Property[],
  mortgages: Mortgage[]
): Property[] =>
  properties.map((property) => {
    const mortgage = mortgages.find(
      (candidate) => candidate.propertyId === property.id
    );
    return mortgage
      ? synchronizePropertyFromMortgage(property, mortgage)
      : clearPropertyMortgageFields(property);
  });

const assertKnownProperty = (properties: Property[], mortgage: Mortgage): void => {
  if (!properties.some((property) => property.id === mortgage.propertyId)) {
    throw new Error('A mortgage must be linked to an existing property');
  }
};

const assertPropertyAvailable = (
  mortgages: Mortgage[],
  mortgage: Mortgage
): void => {
  const conflict = mortgages.find(
    (candidate) =>
      candidate.id !== mortgage.id && candidate.propertyId === mortgage.propertyId
  );
  if (conflict) {
    throw new Error('This property already has an active mortgage');
  }
};

export const addMortgageRelationship = (
  properties: Property[],
  mortgages: Mortgage[],
  mortgage: Mortgage
): MortgageRelationshipState => {
  assertValidMortgageFinancialValues(mortgage);
  assertKnownProperty(properties, mortgage);
  assertPropertyAvailable(mortgages, mortgage);
  if (mortgages.some((candidate) => candidate.id === mortgage.id)) {
    throw new Error('A mortgage with this id already exists');
  }

  const nextMortgages = [...mortgages, mortgage];
  return {
    mortgages: nextMortgages,
    properties: synchronizeMortgageProperties(properties, nextMortgages),
  };
};

export const editMortgageRelationship = (
  properties: Property[],
  mortgages: Mortgage[],
  mortgage: Mortgage
): MortgageRelationshipState => {
  assertValidMortgageFinancialValues(mortgage);
  assertKnownProperty(properties, mortgage);
  assertPropertyAvailable(mortgages, mortgage);
  if (!mortgages.some((candidate) => candidate.id === mortgage.id)) {
    throw new Error('The mortgage to edit does not exist');
  }

  const nextMortgages = mortgages.map((candidate) =>
    candidate.id === mortgage.id ? mortgage : candidate
  );
  return {
    mortgages: nextMortgages,
    properties: synchronizeMortgageProperties(properties, nextMortgages),
  };
};

export const deleteMortgageRelationship = (
  properties: Property[],
  mortgages: Mortgage[],
  mortgageId: string
): MortgageRelationshipState => {
  const nextMortgages = mortgages.filter(
    (mortgage) => mortgage.id !== mortgageId
  );
  return {
    mortgages: nextMortgages,
    properties: synchronizeMortgageProperties(properties, nextMortgages),
  };
};
