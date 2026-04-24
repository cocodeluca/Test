import { CountryTaxModule } from '../types';

export const spainTaxModule: CountryTaxModule = {
  id: 'spain',
  country: 'Spain',
  label: 'Spain Tax Module',
  status: 'ready',
  description:
    'Base structure for Spain-specific rental tax logic, cadastral values, ITP, depreciation, and deductible expense handling.',
  fieldDefinitions: [
    {
      key: 'transferTaxAmount',
      label: 'Transfer Tax Amount',
      description: 'Purchase transfer tax amount used for Spain acquisition-tax workflows.',
    },
    {
      key: 'cadastralValueTotal',
      label: 'Cadastral Value Total',
      description: 'Shared Spain tax reference for depreciation and cadastral breakdown workflows.',
    },
    {
      key: 'cadastralConstructionValue',
      label: 'Cadastral Construction Value',
      description: 'Construction-value component for future Spain depreciation handling.',
    },
    {
      key: 'annualMortgageInterestTax',
      label: 'Annual Mortgage Interest Tax',
      description: 'Mortgage-interest amount that can later feed Spain deductible-expense logic.',
    },
  ],
  computationOutline: {
    annualTaxableRentalIncome:
      'Start from annual rent and future Spain rental-income adjustments.',
    annualDeductibleExpenses:
      'Combine recurring expenses, eligible mortgage interest, and Spain-specific depreciation inputs.',
    estimatedAnnualTax:
      'Apply Spain-specific net taxable income rules, reductions, and marginal tax assumptions.',
  },
  supportsProperty: (property) => property.country === 'Spain',
};
