import { CountryTaxModule } from '../types';

export const portugalTaxModule: CountryTaxModule = {
  id: 'portugal',
  country: 'Portugal',
  label: 'Portugal Tax Module',
  status: 'planned',
  description:
    'Placeholder module for future Portugal-specific property tax fields, deductible-expense rules, and rental-income calculations.',
  fieldDefinitions: [],
  computationOutline: {
    annualTaxableRentalIncome: 'Country-specific annual rental-income mapping to be defined.',
    annualDeductibleExpenses: 'Country-specific deductible-expense rules to be defined.',
    estimatedAnnualTax: 'Country-specific tax estimate formula to be defined.',
  },
  supportsProperty: (property) => property.country === 'Portugal',
};
