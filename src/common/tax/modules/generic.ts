import { CountryTaxModule } from '../types';

export const genericTaxModule: CountryTaxModule = {
  id: 'generic',
  country: 'Other',
  label: 'Generic Tax Module',
  status: 'fallback',
  description:
    'Fallback module used when no country-specific tax implementation exists yet.',
  fieldDefinitions: [],
  computationOutline: {
    annualTaxableRentalIncome: 'No country-specific taxable-income formula configured yet.',
    annualDeductibleExpenses: 'No country-specific deductible-expense formula configured yet.',
    estimatedAnnualTax: 'No country-specific tax estimate formula configured yet.',
  },
  supportsProperty: () => true,
};
