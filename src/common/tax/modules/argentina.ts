import { CountryTaxModule } from '../types';

export const argentinaTaxModule: CountryTaxModule = {
  id: 'argentina',
  country: 'Argentina',
  label: 'Argentina Tax Module',
  status: 'planned',
  description:
    'Placeholder module for future Argentina-specific property tax fields, deductible-expense rules, and rental-income calculations.',
  fieldDefinitions: [],
  computationOutline: {
    annualTaxableRentalIncome: 'Country-specific annual rental-income mapping to be defined.',
    annualDeductibleExpenses: 'Country-specific deductible-expense rules to be defined.',
    estimatedAnnualTax: 'Country-specific tax estimate formula to be defined.',
  },
  supportsProperty: (property) => property.country === 'Argentina',
};
