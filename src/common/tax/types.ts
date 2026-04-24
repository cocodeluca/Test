import { Property } from '../types';

export type TaxModuleId = 'spain' | 'argentina' | 'portugal' | 'generic';
export type TaxModuleStatus = 'ready' | 'planned' | 'fallback';

export interface CountryTaxFieldDefinition {
  key: string;
  label: string;
  description: string;
}

export interface CountryTaxComputationOutline {
  annualTaxableRentalIncome: string;
  annualDeductibleExpenses: string;
  estimatedAnnualTax: string;
}

export interface CountryTaxModule {
  id: TaxModuleId;
  country: string;
  label: string;
  status: TaxModuleStatus;
  description: string;
  fieldDefinitions: CountryTaxFieldDefinition[];
  computationOutline: CountryTaxComputationOutline;
  supportsProperty: (property: Pick<Property, 'country'>) => boolean;
}

export interface PropertyTaxProfile {
  moduleId: TaxModuleId;
  country: string;
  label: string;
  status: TaxModuleStatus;
  description: string;
  fieldDefinitions: CountryTaxFieldDefinition[];
  computationOutline: CountryTaxComputationOutline;
}

export interface TaxDataSourceBadge {
  id: string;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning';
}

export interface TaxStatusIndicator {
  id: string;
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning';
}

export interface GenericTaxLineItem {
  id: string;
  label: string;
  value: number;
  uiLabel?: string;
  groupLabel?: string;
  description?: string;
  badges?: TaxDataSourceBadge[];
}

export interface GenericPropertyTaxSummary {
  grossRentalIncome: number;
  deductibleExpenses: number;
  nonDeductibleExpenses: number;
  netIncomeBeforeTax: number;
  estimatedTax: number;
  annualAfterTaxCashflow: number;
  monthlyAfterTaxCashflow: number;
  ownershipPercentage: number;
  taxYear: number;
  deductibleExpenseItems: GenericTaxLineItem[];
  nonDeductibleExpenseItems: GenericTaxLineItem[];
  dataSourceBadges: TaxDataSourceBadge[];
  statusIndicators: TaxStatusIndicator[];
  notes: string[];
  disclaimers: string[];
}

export interface SpainTaxSummary {
  ownerType: string;
  rentalType: string;
  autonomousCommunity: string;
  reductionRate: number;
  taxableIncomeAfterHousingReduction: number;
  estimatedPersonalMarginalIrpfRate: number;
  deductibleLabels: Array<{
    genericLabel: string;
    spainLabel: string;
    description: string;
  }>;
  assumptions: string[];
  howItWorks: string;
}

export interface PropertyTaxRuntime {
  profile: PropertyTaxProfile;
  generic: GenericPropertyTaxSummary;
  spain: SpainTaxSummary | null;
}
