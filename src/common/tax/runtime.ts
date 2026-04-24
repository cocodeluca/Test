import { Property } from '../types';
import { getCurrentSettings } from '../utils/settingsStore';
import { calculateRecurringExpensePortfolioSummary } from '../utils/recurringExpenses';
import { getPropertyTaxProfile } from './registry';
import {
  GenericTaxLineItem,
  GenericPropertyTaxSummary,
  PropertyTaxRuntime,
  SpainTaxSummary,
} from './types';

const getNumericValue = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const normalizePercentageInput = (value: number): number =>
  value > 1 ? value / 100 : value;

const normalizeCountryName = (country: string | undefined | null): string =>
  (country ?? '').trim().toLowerCase();

export const isSpainProperty = (property: Pick<Property, 'country'>): boolean => {
  const normalized = normalizeCountryName(property.country);
  return normalized === 'spain' || normalized === 'espana' || normalized === 'españa';
};

const getAnnualRent = (property: Partial<Property>): number => {
  const storedAnnualRent = getNumericValue(property.annualRent);

  if (storedAnnualRent > 0) {
    return storedAnnualRent;
  }

  if (property.occupancyStatus !== 'occupied') {
    return 0;
  }

  return getNumericValue(property.monthlyRent) * 12;
};

const getGenericDeductibleExpenseItems = (property: Partial<Property>) => {
  const recurringSummary = calculateRecurringExpensePortfolioSummary(property);
  const projectedRecurringExpenses = recurringSummary.projectedNext12Months;
  const propertyTax = getNumericValue(property.annualIBI || property.ibiAndLocalTaxesAnnual);
  const communityFees = getNumericValue(property.annualCommunityFees || property.communityAnnual);
  const homeInsurance = getNumericValue(property.annualHomeInsurance || property.homeInsuranceAnnual);
  const rentDefaultInsurance = getNumericValue(
    property.annualRentDefaultInsurance || property.annualNonPaymentInsurance
  );
  const managementFees = getNumericValue(property.annualManagementFees);
  const maintenance = getNumericValue(property.annualMaintenance || property.maintenanceAnnual);
  const utilities = getNumericValue(property.annualUtilitiesPaidByOwner);
  const otherOperating = getNumericValue(
    property.annualOtherExpenses || property.otherOperatingExpensesAnnual
  );
  const mortgageInterestImported = getNumericValue(property.annualMortgageInterest) > 0;
  const mortgageInterestManual = getNumericValue(property.annualMortgageInterestTax);
  const mortgageInterest = mortgageInterestImported
    ? getNumericValue(property.annualMortgageInterest)
    : mortgageInterestManual;
  const loanRelatedCosts = 0;
  const depreciation = getNumericValue(property.annualDepreciationTax);

  const items = [
    {
      id: 'property-tax',
      label: 'Property tax / municipal tax',
      value: propertyTax,
      uiLabel: isSpainProperty(property as Pick<Property, 'country'>)
        ? 'IBI (Property Tax)'
        : undefined,
      description: 'Annual municipal or property-level taxation applied to the asset.',
    },
    {
      id: 'community-fees',
      label: 'Community / HOA fees',
      value: communityFees,
      uiLabel: isSpainProperty(property as Pick<Property, 'country'>)
        ? 'Community fees'
        : undefined,
      description: 'Shared-building or community maintenance costs.',
    },
    {
      id: 'home-insurance',
      label: 'Home insurance',
      value: homeInsurance,
      description: 'Property insurance paid by the owner.',
    },
    {
      id: 'rent-default-insurance',
      label: 'Rent default insurance',
      value: rentDefaultInsurance,
      uiLabel: isSpainProperty(property as Pick<Property, 'country'>)
        ? 'Seguro de impago / Rent default insurance'
        : undefined,
      description: 'Coverage against missed rent or tenant default.',
    },
    {
      id: 'management-fees',
      label: 'Property management fees',
      value: managementFees,
      description: 'Fees paid to managers or administrators.',
    },
    {
      id: 'maintenance',
      label: 'Maintenance and repairs',
      value: maintenance,
      description: 'Recurring upkeep, repairs, and maintenance reserves.',
    },
    {
      id: 'utilities',
      label: 'Owner-paid utilities',
      value: utilities,
      description: 'Utilities paid directly by the owner.',
    },
    {
      id: 'other-operating',
      label: 'Other operating expenses',
      value: otherOperating,
      description: 'Any additional annual operating costs.',
    },
    {
      id: 'mortgage-interest',
      label: 'Mortgage interest (deductible)',
      value: mortgageInterest,
      groupLabel: 'Financing costs',
      description:
        'Imported mortgage interest is deductible. Mortgage principal repayment is excluded.',
      badges: mortgageInterestImported
        ? [
            {
              id: 'imported-from-mortgage',
              label: 'Imported from mortgage',
              tone: 'info' as const,
            },
          ]
        : mortgageInterest > 0
        ? [
            {
              id: 'manual-interest',
              label: 'Manual input',
              tone: 'neutral' as const,
            },
          ]
        : undefined,
    },
    {
      id: 'loan-related-costs',
      label: 'Loan-related costs',
      value: loanRelatedCosts,
      groupLabel: 'Financing costs',
      description: 'Other deductible financing costs, if applicable.',
    },
    {
      id: 'depreciation',
      label: 'Depreciation',
      value: depreciation,
      description: 'Depreciation input used only when supported by local tax rules.',
    },
  ].filter((item) => item.value > 0);

  const deductibleExpenses =
    projectedRecurringExpenses > 0
      ? projectedRecurringExpenses + mortgageInterest + loanRelatedCosts + depreciation
      : items.reduce((sum, item) => sum + item.value, 0);

  return {
    items,
    deductibleExpenses,
    mortgageInterestImported,
    hasMortgageLinked:
      Boolean(property.hasMortgage) || mortgageInterestImported || getNumericValue(property.currentMortgageBalance) > 0,
  };
};

const calculateGenericPropertyTaxSummary = (
  property: Partial<Property>,
  annualNetCashflow: number
): GenericPropertyTaxSummary => {
  const annualRent = getAnnualRent(property);
  const {
    items: deductibleExpenseItems,
    deductibleExpenses,
    mortgageInterestImported,
    hasMortgageLinked,
  } =
    getGenericDeductibleExpenseItems(property);
  const nonDeductibleExpenseItems: GenericTaxLineItem[] = [];
  const nonDeductibleExpenses = 0;
  const netIncomeBeforeTax = annualRent - deductibleExpenses - nonDeductibleExpenses;
  const estimatedTax = getNumericValue(property.estimatedAnnualTax);
  const ownershipPercentage = getNumericValue(property.spainOwnershipPercentage) || 100;
  const taxYear = new Date().getFullYear();

  return {
    grossRentalIncome: annualRent,
    deductibleExpenses,
    nonDeductibleExpenses,
    netIncomeBeforeTax,
    estimatedTax,
    annualAfterTaxCashflow: annualNetCashflow - estimatedTax,
    monthlyAfterTaxCashflow: (annualNetCashflow - estimatedTax) / 12,
    ownershipPercentage,
    taxYear,
    deductibleExpenseItems,
    nonDeductibleExpenseItems,
    dataSourceBadges: [
      {
        id: 'manual-inputs',
        label: 'Manual inputs',
        tone: 'neutral',
      },
      {
        id: 'computed-summary',
        label: 'Computed summary',
        tone: 'info',
      },
      {
        id: 'country-module',
        label: isSpainProperty(property as Pick<Property, 'country'>)
          ? 'Spain country module'
          : 'Generic country layer',
        tone: isSpainProperty(property as Pick<Property, 'country'>) ? 'success' : 'warning',
      },
      ...(mortgageInterestImported
        ? [
            {
              id: 'mortgage-import',
              label: 'Mortgage interest imported',
              tone: 'info' as const,
            },
          ]
        : []),
    ],
    statusIndicators: [
      {
        id: 'estimate-status',
        label: estimatedTax > 0 ? 'Estimated tax available' : 'Tax estimate needs review',
        tone: estimatedTax > 0 ? 'success' : 'warning',
      },
      {
        id: 'country-status',
        label: isSpainProperty(property as Pick<Property, 'country'>)
          ? 'Country-specific rules applied'
          : 'Generic tax mode',
        tone: isSpainProperty(property as Pick<Property, 'country'>) ? 'info' : 'neutral',
      },
    ],
    notes: [
      'This section keeps the core tax view country-neutral and reusable across markets.',
      hasMortgageLinked
        ? 'Financing costs include deductible mortgage interest only. Principal repayment is never deducted.'
        : 'No mortgage linked. Add a mortgage or enter manual financing interest to reduce taxable income.',
    ],
    disclaimers: [
      'Tax outputs are planning estimates and should be confirmed with a local tax professional.',
    ],
  };
};

export const calculateSpainTaxSummary = (property: Partial<Property>): SpainTaxSummary => {
  const settings = getCurrentSettings();
  const annualRent = getAnnualRent(property);
  const { deductibleExpenses } = getGenericDeductibleExpenseItems(property);
  const netIncomeBeforeTax = annualRent - deductibleExpenses;
  const reductionRate =
    property.spainRentalType === 'long-term'
      ? 0.5
      : property.spainRentalType === 'seasonal' || property.spainRentalType === 'tourist'
      ? 0
      : 0;
  const marginalIrpfRate = normalizePercentageInput(
    getNumericValue(property.spainEstimatedMarginalTaxRate) ||
      getNumericValue(property.marginalTaxRate) ||
      getNumericValue(settings.taxProfile.estimatedMarginalTaxRate)
  );

  return {
    ownerType: property.spainOwnerType === 'company' ? 'Company' : 'Individual',
    rentalType:
      property.spainRentalType === 'room-by-room'
        ? 'Room-by-room'
        : property.spainRentalType === 'seasonal'
        ? 'Seasonal'
        : property.spainRentalType === 'tourist'
        ? 'Tourist'
        : property.spainRentalType === 'vacant-owner-use'
        ? 'Vacant / owner use'
        : 'Long-term',
    autonomousCommunity: property.spainAutonomousCommunity || 'Not specified',
    reductionRate,
    taxableIncomeAfterHousingReduction: netIncomeBeforeTax * (1 - reductionRate),
    estimatedPersonalMarginalIrpfRate: marginalIrpfRate,
    deductibleLabels: [
      {
        genericLabel: 'Property tax / municipal tax',
        spainLabel: 'IBI',
        description: 'Local annual property tax commonly referenced as IBI in Spain.',
      },
      {
        genericLabel: 'Community / HOA fees',
        spainLabel: 'Comunidad',
        description: 'Building community fees may be deductible in Spain rental calculations.',
      },
      {
        genericLabel: 'Rent default insurance',
        spainLabel: 'Seguro de impago',
        description: 'Non-payment coverage can be tracked using a Spain-friendly label.',
      },
      {
        genericLabel: 'Financing costs',
        spainLabel: 'Intereses hipotecarios',
        description: 'Only mortgage interest is treated as deductible. Principal amortization is excluded.',
      },
    ],
    assumptions: [
      'Long-term residential rentals use a housing reduction assumption in this Spain module.',
      'Marginal IRPF is estimated from property-level settings first, then user tax profile defaults.',
      'Spain deductions are shown as overlays on top of the generic tax categories.',
    ],
    howItWorks:
      'The Spain layer starts from generic rental income and deductible expenses, then applies Spain-specific housing reduction and marginal IRPF assumptions to estimate tax.',
  };
};

export const calculatePropertyTaxRuntime = (
  property: Partial<Property>,
  annualNetCashflow: number
): PropertyTaxRuntime => {
  const profile = getPropertyTaxProfile(property as Pick<Property, 'country'>);
  const generic = calculateGenericPropertyTaxSummary(property, annualNetCashflow);
  const spain = isSpainProperty(property as Pick<Property, 'country'>)
    ? calculateSpainTaxSummary(property)
    : null;

  if (spain) {
    generic.estimatedTax =
      generic.netIncomeBeforeTax * (1 - spain.reductionRate) * spain.estimatedPersonalMarginalIrpfRate;
    generic.annualAfterTaxCashflow = annualNetCashflow - generic.estimatedTax;
    generic.monthlyAfterTaxCashflow = generic.annualAfterTaxCashflow / 12;
  }

  return {
    profile,
    generic,
    spain,
  };
};
