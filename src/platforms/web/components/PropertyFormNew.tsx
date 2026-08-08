import React, { useEffect, useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import {
  Lease,
  Property,
  RecurringExpense,
  RecurringExpensePaymentEntry,
  RecurringExpenseScheduleEntry,
  RentAdjustmentHistoryEntry,
  RentUpdateScheduleEntry,
} from '../../../common/types';
import { DisplayCurrency } from '../../../common/types/settings';
import {
  calculatePropertyDetails,
  calculateSpainDeductibleExpenseSummary,
} from '../../../common/utils/calculations';
import { convertCurrency, currencyOptions } from '../../../common/utils/currency';
import {
  defaultPropertyType,
  isGarageParkingPropertyType,
  propertyTypeValues,
  usesResidentialAmenityFields,
  usesResidentialRoomFields,
} from '../../../common/utils/propertyTypes';
import {
  calculateLeaseAdjustmentHistory,
  calculateLeaseNextUpdateDate,
  createDefaultLease,
  createRentUpdateRuleTemplate,
  getActiveLease,
  rentUpdateFrequencies,
  rentUpdateIndexTypes,
  rentUpdateRuleTypes,
} from '../../../common/utils/leaseUpdates';
import { createRecurringExpense, ensureRecurringExpenses } from '../../../common/utils/recurringExpenses';
import {
  formatCurrency,
  formatCurrencyValue,
  getLocalizedCurrencyLabel,
  formatPercentage,
} from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import { CompactEditModal } from './CompactEditModal';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface PropertyFormProps {
  onAddProperty: (property: Property) => void;
  onEditProperty?: (property: Property) => void;
  onClose: () => void;
  isEditing?: boolean;
  editingProperty?: Property | null;
  initialSection?: string | null;
  tutorialTargetId?: string | null;
}

interface PropertyFormData {
  operatingCurrency: DisplayCurrency;
  propertyValueCurrency: DisplayCurrency;
  purchasePriceCurrency: DisplayCurrency;
  currentEstimatedValueCurrency: DisplayCurrency;
  monthlyRentCurrency: DisplayCurrency;
  securityDeposit: number;
  securityDepositCurrency: DisplayCurrency;
  lateFeeAmount: number;
  lateFeeCurrency: DisplayCurrency;
  name: string;
  address: string;
  city: string;
  country: string;
  purchaseDate: string;
  occupancyStatus: Property['occupancyStatus'];
  notes: string;
  builtAreaSqm: number;
  bedrooms: number;
  bathrooms: number;
  floor: number;
  propertyType: string;
  leaseType: string;
  leaseEndDate: string;
  leaseContractSignatureDate: string;
  rentRuleType: Lease['rentUpdateRule']['type'];
  rentRuleFrequency: Lease['rentUpdateRule']['frequency'];
  rentRuleCustomFrequencyMonths: number;
  rentRuleIndexType: NonNullable<Lease['rentUpdateRule']['indexType']> | '';
  rentRuleFirstAdjustmentDate: string;
  rentRuleNextUpdateDate: string;
  rentRuleBaseRent: number;
  rentRuleFixedPercentage: number;
  rentRuleReferenceRatePct: number;
  rentRuleMinimumCapPct: number;
  rentRuleMaximumCapPct: number;
  rentRuleNotes: string;
  rentManualCustomSchedule: RentUpdateScheduleEntry[];
  rentAdjustmentHistory: RentAdjustmentHistoryEntry[];
  yearBuilt: number;
  renovatedYear: number;
  furnishedStatus: string;
  hasElevator: boolean;
  hasBalcony: boolean;
  hasParking: boolean;
  hasStorageRoom: boolean;
  parkingSpaces: number;
  parkingCoverage: '' | 'covered' | 'uncovered';
  condition: string;
  imageUrl: string;
  imageUrls: string[];
  primaryImageIndex: number;
  purchasePrice: number;
  acquisitionTaxes: number;
  notaryAndRegistryCosts: number;
  agencyFees: number;
  renovationCosts: number;
  furnishingCosts: number;
  totalInitialInvestment: number;
  currentEstimatedValue: number;
  monthlyRent: number;
  annualIBI: number;
  annualHomeInsurance: number;
  annualNonPaymentInsurance: number;
  annualCommunityFees: number;
  annualManagementFees: number;
  annualMaintenance: number;
  annualUtilitiesPaidByOwner: number;
  annualOtherExpenses: number;
  annualMortgageInterestTax: number;
  recurringExpenses: RecurringExpense[];
  hasMortgage: boolean;
  lenderName: string;
  currentMortgageBalance: number;
  monthlyMortgagePayment: number;
  spainOwnerType: 'individual' | 'company';
  spainRentalType: 'long-term' | 'room-by-room' | 'seasonal' | 'tourist' | 'vacant-owner-use';
  spainOwnershipPercentage: number;
  spainAutonomousCommunity: string;
  spainEstimatedMarginalTaxRate: number;
  spainMonthsRentedInTaxYear: number;
}

type PropertyEditorSection =
  | 'basic-info'
  | 'gallery'
  | 'investment-summary'
  | 'cashflow'
  | 'operating-expenses'
  | 'mortgage'
  | 'lease-rent-rule'
  | 'notes'
  | 'spain-tax-settings'
  | 'deductible-expenses';

const propertyEditorSectionFields: Record<PropertyEditorSection, Array<keyof PropertyFormData>> = {
  'basic-info': [
    'name',
    'address',
    'city',
    'country',
    'purchaseDate',
    'occupancyStatus',
    'operatingCurrency',
    'propertyValueCurrency',
    'builtAreaSqm',
    'bedrooms',
    'bathrooms',
    'floor',
    'propertyType',
    'yearBuilt',
    'renovatedYear',
    'furnishedStatus',
    'hasElevator',
    'hasBalcony',
    'hasParking',
    'hasStorageRoom',
    'parkingSpaces',
    'parkingCoverage',
    'condition',
  ],
  gallery: ['imageUrl', 'imageUrls', 'primaryImageIndex'],
  'investment-summary': [
    'purchasePrice',
    'purchasePriceCurrency',
    'acquisitionTaxes',
    'notaryAndRegistryCosts',
    'agencyFees',
    'renovationCosts',
    'furnishingCosts',
    'totalInitialInvestment',
    'currentEstimatedValue',
    'currentEstimatedValueCurrency',
  ],
  cashflow: ['monthlyRent', 'monthlyRentCurrency'],
  'operating-expenses': [
    'annualIBI',
    'annualHomeInsurance',
    'annualNonPaymentInsurance',
    'annualCommunityFees',
    'annualManagementFees',
    'annualMaintenance',
    'annualUtilitiesPaidByOwner',
    'annualOtherExpenses',
    'recurringExpenses',
  ],
  mortgage: ['hasMortgage', 'lenderName', 'currentMortgageBalance', 'monthlyMortgagePayment'],
  'lease-rent-rule': [
    'leaseType',
    'leaseEndDate',
    'leaseContractSignatureDate',
    'securityDeposit',
    'securityDepositCurrency',
    'lateFeeAmount',
    'lateFeeCurrency',
    'rentRuleType',
    'rentRuleFrequency',
    'rentRuleCustomFrequencyMonths',
    'rentRuleIndexType',
    'rentRuleFirstAdjustmentDate',
    'rentRuleNextUpdateDate',
    'rentRuleBaseRent',
    'rentRuleFixedPercentage',
    'rentRuleReferenceRatePct',
    'rentRuleMinimumCapPct',
    'rentRuleMaximumCapPct',
    'rentRuleNotes',
    'rentManualCustomSchedule',
    'rentAdjustmentHistory',
  ],
  notes: ['notes'],
  'spain-tax-settings': [
    'spainOwnerType',
    'spainRentalType',
    'spainOwnershipPercentage',
    'spainAutonomousCommunity',
    'spainEstimatedMarginalTaxRate',
  ],
  'deductible-expenses': [
    'annualCommunityFees',
    'annualIBI',
    'annualHomeInsurance',
    'annualNonPaymentInsurance',
    'annualManagementFees',
    'annualMaintenance',
    'annualMortgageInterestTax',
    'annualOtherExpenses',
  ],
};

const normalizePropertyEditorSection = (
  section: string | null | undefined
): PropertyEditorSection => {
  switch (section) {
    case 'gallery':
      return 'gallery';
    case 'cashflow':
      return 'cashflow';
    case 'operating-expenses':
      return 'operating-expenses';
    case 'mortgage':
      return 'mortgage';
    case 'lease-rent-rule':
      return 'lease-rent-rule';
    case 'notes':
      return 'notes';
    case 'spain-tax-settings':
      return 'spain-tax-settings';
    case 'deductible-expenses':
      return 'deductible-expenses';
    case 'investment-summary':
      return 'investment-summary';
    default:
      return 'basic-info';
  }
};

export const PropertyFormNew: React.FC<PropertyFormProps> = ({
  onAddProperty,
  onEditProperty,
  onClose,
  isEditing = false,
  editingProperty = null,
  initialSection = null,
  tutorialTargetId = null,
}) => {
  const { settings, t } = useSettings();
  const isBasicMode = settings.userMode === 'basic';
  const trackingPreference = settings.onboarding.trackingPreference ?? 'full-portfolio';
  const countryOptions = [
    { value: 'Spain', label: t('properties.form.countryOptions.spain') },
    { value: 'Argentina', label: t('properties.form.countryOptions.argentina') },
    { value: 'Portugal', label: t('properties.form.countryOptions.portugal') },
    { value: 'Other', label: t('properties.form.countryOptions.other') },
  ];
  const ownerTypeOptions = [
    { value: 'individual', label: t('properties.form.ownerTypeOptions.individual') },
    { value: 'company', label: t('properties.form.ownerTypeOptions.company') },
  ] as const;
  const rentalTypeOptions = [
    { value: 'long-term', label: t('properties.form.rentalTypeOptions.longTerm') },
    { value: 'room-by-room', label: 'Room-by-room' },
    { value: 'seasonal', label: t('properties.form.rentalTypeOptions.seasonal') },
    { value: 'tourist', label: t('properties.form.rentalTypeOptions.tourist') },
    { value: 'vacant-owner-use', label: 'Vacant / owner use' },
  ] as const;
  const autonomousCommunityOptions = [
    t('properties.form.autonomousCommunityOptions.andalusia'),
    t('properties.form.autonomousCommunityOptions.aragon'),
    t('properties.form.autonomousCommunityOptions.asturias'),
    t('properties.form.autonomousCommunityOptions.balearicIslands'),
    t('properties.form.autonomousCommunityOptions.basqueCountry'),
    t('properties.form.autonomousCommunityOptions.canaryIslands'),
    t('properties.form.autonomousCommunityOptions.cantabria'),
    t('properties.form.autonomousCommunityOptions.castileAndLeon'),
    t('properties.form.autonomousCommunityOptions.castileLaMancha'),
    t('properties.form.autonomousCommunityOptions.catalonia'),
    t('properties.form.autonomousCommunityOptions.extremadura'),
    t('properties.form.autonomousCommunityOptions.galicia'),
    t('properties.form.autonomousCommunityOptions.laRioja'),
    t('properties.form.autonomousCommunityOptions.communityOfMadrid'),
    t('properties.form.autonomousCommunityOptions.regionOfMurcia'),
    t('properties.form.autonomousCommunityOptions.navarre'),
    t('properties.form.autonomousCommunityOptions.valencianCommunity'),
  ];
  const initialLeaseTemplate = createRentUpdateRuleTemplate(
    'Spain',
    0,
    new Date().toISOString().split('T')[0]
  );
  const expenseTypeOptions = [
    { value: 'property-tax', label: 'Property tax' },
    { value: 'home-insurance', label: 'Home insurance' },
    { value: 'life-insurance', label: 'Life insurance' },
    { value: 'rent-default-insurance', label: 'Rent default insurance' },
    { value: 'community-fees', label: 'Community fees' },
    { value: 'management-fees', label: 'Management fees' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'other-operating', label: 'Other operating' },
    { value: 'custom', label: 'Custom' },
  ] as const;
  const billingFrequencyOptions = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'every-4-months', label: 'Every 4 months' },
    { value: 'semi-annual', label: 'Every 6 months' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'custom', label: 'Custom' },
  ] as const;
  const projectionModeOptions = [
    { value: 'fixed-amount', label: 'Fixed amount' },
    { value: 'manual-annual-estimate', label: 'Manual annual estimate' },
    { value: 'use-last-known-amount', label: 'Use last known amount' },
    { value: 'increase-by-x-every-y-months', label: 'Increase by X% every Y months' },
    { value: 'custom-schedule', label: 'Custom schedule' },
  ] as const;
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  // Import dynamically to avoid SSR issues and keep bundle small
  const resizeIfNeeded = async (file: File): Promise<File> => {
    try {
      // threshold: 1.5 MB
      const threshold = 1.5 * 1024 * 1024;
      if (file.size <= threshold) return file;
      const mod = await import('../utils/imageResize');
      const blob = await mod.resizeImageFile(file, 1600, 0.8);
      return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    } catch (e) {
      return file;
    }
  };

  const calculateDerivedTotalInvestment = (data: {
    operatingCurrency: DisplayCurrency;
    purchasePrice: number;
    purchasePriceCurrency: DisplayCurrency;
    acquisitionTaxes: number;
    notaryAndRegistryCosts: number;
    agencyFees: number;
    renovationCosts: number;
    furnishingCosts: number;
  }) =>
    convertCurrency(data.purchasePrice, data.purchasePriceCurrency, data.operatingCurrency) +
    data.acquisitionTaxes +
    data.notaryAndRegistryCosts +
    data.agencyFees +
    data.renovationCosts +
    data.furnishingCosts;

  const [formData, setFormData] = useState<PropertyFormData>({
    operatingCurrency: 'EUR',
    propertyValueCurrency: 'EUR',
    purchasePriceCurrency: 'EUR',
    currentEstimatedValueCurrency: 'EUR',
    monthlyRentCurrency: 'EUR',
    securityDeposit: 0,
    securityDepositCurrency: 'EUR',
    lateFeeAmount: 0,
    lateFeeCurrency: 'EUR',
    name: '',
    address: '',
    city: '',
    country: 'Spain',
    purchaseDate: new Date().toISOString().split('T')[0],
    occupancyStatus: 'occupied',
    notes: '',
    builtAreaSqm: 0,
    bedrooms: 0,
    bathrooms: 0,
    floor: 0,
    propertyType: defaultPropertyType,
    leaseType: '',
    leaseEndDate: '',
    leaseContractSignatureDate: new Date().toISOString().split('T')[0],
    rentRuleType: initialLeaseTemplate.type,
    rentRuleFrequency: initialLeaseTemplate.frequency,
    rentRuleCustomFrequencyMonths: 12,
    rentRuleIndexType: initialLeaseTemplate.indexType ?? '',
    rentRuleFirstAdjustmentDate: initialLeaseTemplate.firstAdjustmentDate ?? '',
    rentRuleNextUpdateDate: initialLeaseTemplate.nextUpdateDate ?? '',
    rentRuleBaseRent: 0,
    rentRuleFixedPercentage: 0,
    rentRuleReferenceRatePct: 0,
    rentRuleMinimumCapPct: 0,
    rentRuleMaximumCapPct: 0,
    rentRuleNotes: '',
    rentManualCustomSchedule: [],
    rentAdjustmentHistory: [],
    yearBuilt: 0,
    renovatedYear: 0,
    furnishedStatus: '',
    hasElevator: false,
    hasBalcony: false,
    hasParking: false,
    hasStorageRoom: false,
    parkingSpaces: 0,
    parkingCoverage: '',
    condition: '',
    imageUrl: '',
    imageUrls: [],
    primaryImageIndex: 0,
    purchasePrice: 0,
    acquisitionTaxes: 0,
    notaryAndRegistryCosts: 0,
    agencyFees: 0,
    renovationCosts: 0,
    furnishingCosts: 0,
    totalInitialInvestment: 0,
    currentEstimatedValue: 0,
    monthlyRent: 0,
    annualIBI: 0,
    annualHomeInsurance: 0,
    annualNonPaymentInsurance: 0,
    annualCommunityFees: 0,
    annualManagementFees: 0,
    annualMaintenance: 0,
    annualUtilitiesPaidByOwner: 0,
    annualOtherExpenses: 0,
    annualMortgageInterestTax: 0,
    recurringExpenses: ensureRecurringExpenses({ country: 'Spain' }),
    hasMortgage: false,
    lenderName: '',
      currentMortgageBalance: 0,
      monthlyMortgagePayment: 0,
      spainOwnerType: 'individual',
    spainRentalType: 'long-term',
    spainOwnershipPercentage: 100,
    spainAutonomousCommunity: t('properties.form.autonomousCommunityOptions.andalusia'),
    spainEstimatedMarginalTaxRate: 24,
    spainMonthsRentedInTaxYear: 12,
  });
  const [lastSavedFormData, setLastSavedFormData] = useState<PropertyFormData>(() => formData);
  const [activeSection, setActiveSection] = useState<PropertyEditorSection>(
    normalizePropertyEditorSection(initialSection)
  );
  const [pendingSectionChange, setPendingSectionChange] = useState<PropertyEditorSection | null>(null);
  const [isPendingClose, setIsPendingClose] = useState(false);

  useEffect(() => {
    setActiveSection(normalizePropertyEditorSection(initialSection));
  }, [initialSection]);

  const editingPropertyHydrationKey = useMemo(() => {
    if (!isEditing || !editingProperty) {
      return 'create';
    }

    const activeLease = getActiveLease(editingProperty) ?? createDefaultLease(editingProperty);
    return [
      editingProperty.id ?? '',
      editingProperty.operatingCurrency ?? editingProperty.currency ?? 'EUR',
      editingProperty.propertyValueCurrency ?? '',
      editingProperty.purchasePriceCurrency ?? '',
      editingProperty.currentEstimatedValueCurrency ?? '',
      editingProperty.monthlyRentCurrency ?? '',
      activeLease.monthlyRentCurrency ?? '',
      activeLease.securityDeposit ?? editingProperty.rentalDeposit ?? 0,
      activeLease.securityDepositCurrency ?? '',
      activeLease.lateFeeAmount ?? editingProperty.lateFeeAmount ?? 0,
      activeLease.lateFeeCurrency ?? '',
      editingProperty.name ?? '',
      editingProperty.address ?? '',
      editingProperty.city ?? '',
      editingProperty.country ?? '',
      editingProperty.purchaseDate ?? '',
      editingProperty.occupancyStatus ?? '',
      editingProperty.notes ?? '',
      editingProperty.builtAreaSqm ?? 0,
      editingProperty.bedrooms ?? 0,
      editingProperty.bathrooms ?? 0,
      editingProperty.floor ?? 0,
      editingProperty.propertyType ?? defaultPropertyType,
      editingProperty.leaseType ?? '',
      editingProperty.leaseEndDate ?? '',
      activeLease.rentUpdateRule.contractSignatureDate ?? activeLease.startDate,
      activeLease.rentUpdateRule.type,
      activeLease.rentUpdateRule.frequency,
      activeLease.rentUpdateRule.customFrequencyMonths ?? 12,
      activeLease.rentUpdateRule.indexType ?? '',
      activeLease.rentUpdateRule.firstAdjustmentDate ?? '',
      activeLease.rentUpdateRule.nextUpdateDate ?? '',
      activeLease.rentUpdateRule.baseRent ?? activeLease.monthlyRent,
      activeLease.rentUpdateRule.fixedPercentage ?? 0,
      activeLease.rentUpdateRule.referenceRatePct ?? 0,
      activeLease.rentUpdateRule.minimumCapPct ?? 0,
      activeLease.rentUpdateRule.maximumCapPct ?? 0,
      activeLease.rentUpdateRule.notes ?? '',
      (activeLease.rentUpdateRule.manualCustomSchedule ?? []).length,
      (activeLease.adjustmentHistory ?? []).length,
      editingProperty.yearBuilt ?? 0,
      editingProperty.renovatedYear ?? 0,
      editingProperty.furnishedStatus ?? '',
      editingProperty.hasElevator ?? false,
      editingProperty.hasBalcony ?? false,
      editingProperty.hasParking ?? false,
      editingProperty.hasStorageRoom ?? false,
      editingProperty.parkingSpaces ?? 0,
      editingProperty.parkingCoverage ?? '',
      editingProperty.condition ?? '',
      editingProperty.imageUrl ?? '',
      (editingProperty.imageUrls ?? []).join('\u0001'),
      editingProperty.primaryImageIndex ?? 0,
      editingProperty.purchasePrice ?? 0,
      editingProperty.acquisitionTaxes ?? 0,
      editingProperty.notaryAndRegistryCosts ?? 0,
      editingProperty.agencyFees ?? 0,
      editingProperty.renovationCosts ?? 0,
      editingProperty.furnishingCosts ?? 0,
      editingProperty.totalInitialInvestment ?? 0,
      editingProperty.currentEstimatedValue ?? 0,
      editingProperty.monthlyRent ?? 0,
      editingProperty.annualIBI ?? 0,
      editingProperty.annualHomeInsurance ?? 0,
      editingProperty.annualNonPaymentInsurance ?? 0,
      editingProperty.annualCommunityFees ?? 0,
      editingProperty.annualManagementFees ?? 0,
      editingProperty.annualMaintenance ?? 0,
      editingProperty.annualUtilitiesPaidByOwner ?? 0,
      editingProperty.annualOtherExpenses ?? 0,
      editingProperty.annualMortgageInterestTax ?? editingProperty.annualMortgageInterest ?? 0,
      editingProperty.hasMortgage ?? false,
      editingProperty.lenderName ?? '',
      editingProperty.currentMortgageBalance ?? 0,
      editingProperty.monthlyMortgagePayment ?? 0,
      editingProperty.spainOwnerType ?? 'individual',
      editingProperty.spainRentalType ?? 'long-term',
      editingProperty.spainOwnershipPercentage ?? 100,
      editingProperty.spainAutonomousCommunity || t('properties.form.autonomousCommunityOptions.andalusia'),
      editingProperty.spainEstimatedMarginalTaxRate ?? editingProperty.marginalTaxRate ?? 24,
      editingProperty.spainMonthsRentedInTaxYear ?? 12,
    ].join('|');
  }, [editingProperty, isEditing, t]);

  useEffect(() => {
    if (isEditing && editingProperty) {
      const activeLease = getActiveLease(editingProperty) ?? createDefaultLease(editingProperty);

      const nextFormData: PropertyFormData = {
        operatingCurrency: editingProperty.operatingCurrency ?? editingProperty.currency ?? 'EUR',
        propertyValueCurrency:
          editingProperty.propertyValueCurrency ??
          editingProperty.currentEstimatedValueCurrency ??
          editingProperty.purchasePriceCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        purchasePriceCurrency:
          editingProperty.purchasePriceCurrency ??
          editingProperty.propertyValueCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        currentEstimatedValueCurrency:
          editingProperty.currentEstimatedValueCurrency ??
          editingProperty.propertyValueCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        monthlyRentCurrency:
          activeLease.monthlyRentCurrency ??
          editingProperty.monthlyRentCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        securityDeposit: activeLease.securityDeposit ?? editingProperty.rentalDeposit ?? 0,
        securityDepositCurrency:
          activeLease.securityDepositCurrency ??
          editingProperty.rentalDepositCurrency ??
          activeLease.monthlyRentCurrency ??
          editingProperty.monthlyRentCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        lateFeeAmount: activeLease.lateFeeAmount ?? editingProperty.lateFeeAmount ?? 0,
        lateFeeCurrency:
          activeLease.lateFeeCurrency ??
          editingProperty.lateFeeCurrency ??
          activeLease.monthlyRentCurrency ??
          editingProperty.monthlyRentCurrency ??
          editingProperty.operatingCurrency ??
          editingProperty.currency ??
          'EUR',
        name: editingProperty.name,
        address: editingProperty.address,
        city: editingProperty.city,
        country: editingProperty.country || 'Spain',
        purchaseDate: editingProperty.purchaseDate,
        occupancyStatus: editingProperty.occupancyStatus,
        notes: editingProperty.notes,
        builtAreaSqm: editingProperty.builtAreaSqm ?? 0,
        bedrooms: editingProperty.bedrooms ?? 0,
        bathrooms: editingProperty.bathrooms ?? 0,
        floor: editingProperty.floor ?? 0,
        propertyType: editingProperty.propertyType ?? defaultPropertyType,
        leaseType: editingProperty.leaseType ?? '',
        leaseEndDate: editingProperty.leaseEndDate ?? '',
        leaseContractSignatureDate:
          activeLease.rentUpdateRule.contractSignatureDate ?? activeLease.startDate,
        rentRuleType: activeLease.rentUpdateRule.type,
        rentRuleFrequency: activeLease.rentUpdateRule.frequency,
        rentRuleCustomFrequencyMonths: activeLease.rentUpdateRule.customFrequencyMonths ?? 12,
        rentRuleIndexType:
          (activeLease.rentUpdateRule.indexType ?? '') as PropertyFormData['rentRuleIndexType'],
        rentRuleFirstAdjustmentDate: activeLease.rentUpdateRule.firstAdjustmentDate ?? '',
        rentRuleNextUpdateDate: activeLease.rentUpdateRule.nextUpdateDate ?? '',
        rentRuleBaseRent: activeLease.rentUpdateRule.baseRent ?? activeLease.monthlyRent,
        rentRuleFixedPercentage: activeLease.rentUpdateRule.fixedPercentage ?? 0,
        rentRuleReferenceRatePct: activeLease.rentUpdateRule.referenceRatePct ?? 0,
        rentRuleMinimumCapPct: activeLease.rentUpdateRule.minimumCapPct ?? 0,
        rentRuleMaximumCapPct: activeLease.rentUpdateRule.maximumCapPct ?? 0,
        rentRuleNotes: activeLease.rentUpdateRule.notes ?? '',
        rentManualCustomSchedule: activeLease.rentUpdateRule.manualCustomSchedule ?? [],
        rentAdjustmentHistory: activeLease.adjustmentHistory ?? [],
        yearBuilt: editingProperty.yearBuilt ?? 0,
        renovatedYear: editingProperty.renovatedYear ?? 0,
        furnishedStatus: editingProperty.furnishedStatus ?? '',
        hasElevator: editingProperty.hasElevator ?? false,
        hasBalcony: editingProperty.hasBalcony ?? false,
        hasParking: editingProperty.hasParking ?? false,
        hasStorageRoom: editingProperty.hasStorageRoom ?? false,
        parkingSpaces: editingProperty.parkingSpaces ?? 0,
        parkingCoverage: editingProperty.parkingCoverage ?? '',
        condition: editingProperty.condition ?? '',
        imageUrl: editingProperty.imageUrl,
        imageUrls:
          editingProperty.imageUrls && editingProperty.imageUrls.length > 0
            ? editingProperty.imageUrls
            : editingProperty.imageUrl
            ? [editingProperty.imageUrl]
            : [],
        primaryImageIndex: editingProperty.primaryImageIndex ?? 0,
        purchasePrice: editingProperty.purchasePrice,
        acquisitionTaxes: editingProperty.acquisitionTaxes,
        notaryAndRegistryCosts: editingProperty.notaryAndRegistryCosts,
        agencyFees: editingProperty.agencyFees,
        renovationCosts: editingProperty.renovationCosts,
        furnishingCosts: editingProperty.furnishingCosts,
        totalInitialInvestment: editingProperty.totalInitialInvestment,
        currentEstimatedValue: editingProperty.currentEstimatedValue,
        monthlyRent: editingProperty.monthlyRent,
        annualIBI: editingProperty.annualIBI,
        annualHomeInsurance: editingProperty.annualHomeInsurance,
        annualNonPaymentInsurance: editingProperty.annualNonPaymentInsurance,
        annualCommunityFees: editingProperty.annualCommunityFees,
        annualManagementFees: editingProperty.annualManagementFees,
        annualMaintenance: editingProperty.annualMaintenance,
        annualUtilitiesPaidByOwner: editingProperty.annualUtilitiesPaidByOwner,
        annualOtherExpenses: editingProperty.annualOtherExpenses,
        annualMortgageInterestTax:
          editingProperty.annualMortgageInterestTax ?? editingProperty.annualMortgageInterest ?? 0,
        recurringExpenses: ensureRecurringExpenses(editingProperty),
        hasMortgage: editingProperty.hasMortgage,
        lenderName: editingProperty.lenderName ?? '',
        currentMortgageBalance: editingProperty.currentMortgageBalance,
        monthlyMortgagePayment: editingProperty.monthlyMortgagePayment,
        spainOwnerType: editingProperty.spainOwnerType ?? 'individual',
        spainRentalType: editingProperty.spainRentalType ?? 'long-term',
        spainOwnershipPercentage: editingProperty.spainOwnershipPercentage ?? 100,
        spainAutonomousCommunity:
          editingProperty.spainAutonomousCommunity ||
          t('properties.form.autonomousCommunityOptions.andalusia'),
        spainEstimatedMarginalTaxRate:
          editingProperty.spainEstimatedMarginalTaxRate ??
          editingProperty.marginalTaxRate ??
          24,
        spainMonthsRentedInTaxYear: editingProperty.spainMonthsRentedInTaxYear ?? 12,
      };

      setFormData((currentFormData) =>
        JSON.stringify(currentFormData) === JSON.stringify(nextFormData)
          ? currentFormData
          : nextFormData
      );
      setLastSavedFormData((currentLastSavedFormData) =>
        JSON.stringify(currentLastSavedFormData) === JSON.stringify(nextFormData)
          ? currentLastSavedFormData
          : nextFormData
      );
    }
  }, [editingPropertyHydrationKey, isEditing]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = event.target;

    if (type === 'checkbox') {
      setFormData((currentFormData) => ({
        ...currentFormData,
        [name]: (event.target as HTMLInputElement).checked,
      }));
      return;
    }

    const numericFields = [
      'purchasePrice',
      'acquisitionTaxes',
      'notaryAndRegistryCosts',
      'agencyFees',
      'renovationCosts',
      'furnishingCosts',
      'currentEstimatedValue',
      'rentRuleBaseRent',
      'builtAreaSqm',
      'bedrooms',
      'bathrooms',
      'floor',
      'yearBuilt',
      'renovatedYear',
      'parkingSpaces',
      'monthlyRent',
      'securityDeposit',
      'lateFeeAmount',
      'annualIBI',
      'annualHomeInsurance',
      'annualNonPaymentInsurance',
      'annualCommunityFees',
      'annualManagementFees',
      'annualMaintenance',
      'annualUtilitiesPaidByOwner',
      'annualOtherExpenses',
      'annualMortgageInterestTax',
      'currentMortgageBalance',
      'monthlyMortgagePayment',
      'spainOwnershipPercentage',
      'spainEstimatedMarginalTaxRate',
      'spainMonthsRentedInTaxYear',
    ];

    const parsedValue = numericFields.includes(name) ? parseFloat(value) || 0 : value;

    setFormData((currentFormData) => {
      const nextFormData = {
        ...currentFormData,
        ...(name === 'operatingCurrency'
          ? {
              operatingCurrency: value as DisplayCurrency,
              purchasePriceCurrency:
                currentFormData.purchasePriceCurrency === currentFormData.operatingCurrency
                  ? currentFormData.purchasePriceCurrency
                  : currentFormData.purchasePriceCurrency,
              currentEstimatedValueCurrency:
                currentFormData.currentEstimatedValueCurrency === currentFormData.operatingCurrency
                  ? currentFormData.currentEstimatedValueCurrency
                  : currentFormData.currentEstimatedValueCurrency,
              monthlyRentCurrency:
                currentFormData.monthlyRentCurrency === currentFormData.operatingCurrency
                  ? (value as DisplayCurrency)
                  : currentFormData.monthlyRentCurrency,
              securityDepositCurrency:
                currentFormData.securityDepositCurrency === currentFormData.operatingCurrency
                  ? (value as DisplayCurrency)
                  : currentFormData.securityDepositCurrency,
              lateFeeCurrency:
                currentFormData.lateFeeCurrency === currentFormData.operatingCurrency
                  ? (value as DisplayCurrency)
                  : currentFormData.lateFeeCurrency,
            }
          : {}),
        ...(name === 'propertyValueCurrency'
          ? {
              propertyValueCurrency: value as DisplayCurrency,
              purchasePriceCurrency:
                currentFormData.purchasePriceCurrency === currentFormData.propertyValueCurrency
                  ? (value as DisplayCurrency)
                  : currentFormData.purchasePriceCurrency,
              currentEstimatedValueCurrency:
                currentFormData.currentEstimatedValueCurrency === currentFormData.propertyValueCurrency
                  ? (value as DisplayCurrency)
                  : currentFormData.currentEstimatedValueCurrency,
            }
          : {}),
        [name]: parsedValue,
      };

      return {
        ...nextFormData,
        totalInitialInvestment: calculateDerivedTotalInvestment(nextFormData),
      };
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const processedFiles = await Promise.all(files.map((f) => resizeIfNeeded(f)));
    const uploadedImages = await Promise.all(processedFiles.map(readFileAsDataUrl));

    setFormData((currentFormData) => {
      const nextImageUrls = [...currentFormData.imageUrls, ...uploadedImages];
      const nextPrimaryImageIndex =
        currentFormData.imageUrls.length === 0 ? 0 : currentFormData.primaryImageIndex;

      return {
        ...currentFormData,
        imageUrls: nextImageUrls,
        primaryImageIndex: nextPrimaryImageIndex,
        imageUrl: nextImageUrls[nextPrimaryImageIndex] ?? '',
      };
    });

    event.target.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setFormData((currentFormData) => {
      const nextImageUrls = currentFormData.imageUrls.filter((_, index) => index !== indexToRemove);
      const nextPrimaryImageIndex =
        nextImageUrls.length === 0
          ? 0
          : indexToRemove < currentFormData.primaryImageIndex
          ? currentFormData.primaryImageIndex - 1
          : Math.min(currentFormData.primaryImageIndex, nextImageUrls.length - 1);

      return {
        ...currentFormData,
        imageUrls: nextImageUrls,
        primaryImageIndex: nextPrimaryImageIndex,
        imageUrl: nextImageUrls[nextPrimaryImageIndex] ?? '',
      };
    });
  };

  const handleSetPrimaryImage = (nextPrimaryImageIndex: number) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      primaryImageIndex: nextPrimaryImageIndex,
      imageUrl: currentFormData.imageUrls[nextPrimaryImageIndex] ?? '',
    }));
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    setFormData((currentFormData) => {
      const draftLease = createDefaultLease(
        {
          country: currentFormData.country,
          purchaseDate: currentFormData.purchaseDate,
          leaseEndDate: currentFormData.leaseEndDate,
          monthlyRent: currentFormData.monthlyRent,
          monthlyRentCurrency: currentFormData.monthlyRentCurrency,
          notes: currentFormData.notes,
        },
        {
          monthlyRent: currentFormData.monthlyRent,
          monthlyRentCurrency: currentFormData.monthlyRentCurrency,
          securityDeposit: currentFormData.securityDeposit,
          securityDepositCurrency: currentFormData.securityDepositCurrency,
          lateFeeAmount: currentFormData.lateFeeAmount,
          lateFeeCurrency: currentFormData.lateFeeCurrency,
          startDate: currentFormData.leaseContractSignatureDate || currentFormData.purchaseDate,
          endDate: currentFormData.leaseEndDate,
          rentUpdateRule: {
            type: currentFormData.rentRuleType,
            frequency: currentFormData.rentRuleFrequency,
            customFrequencyMonths: currentFormData.rentRuleCustomFrequencyMonths || null,
            indexType: currentFormData.rentRuleIndexType || null,
            contractSignatureDate:
              currentFormData.leaseContractSignatureDate || currentFormData.purchaseDate,
            firstAdjustmentDate: currentFormData.rentRuleFirstAdjustmentDate,
            nextUpdateDate: currentFormData.rentRuleNextUpdateDate,
            baseRent: currentFormData.rentRuleBaseRent || currentFormData.monthlyRent,
            fixedPercentage: currentFormData.rentRuleFixedPercentage || null,
            referenceRatePct: currentFormData.rentRuleReferenceRatePct || null,
            minimumCapPct: currentFormData.rentRuleMinimumCapPct || null,
            maximumCapPct: currentFormData.rentRuleMaximumCapPct || null,
            notes: currentFormData.rentRuleNotes,
            manualCustomSchedule: currentFormData.rentManualCustomSchedule,
          },
          adjustmentHistory:
            currentFormData.rentRuleType === 'no-automatic-update'
              ? currentFormData.rentAdjustmentHistory
              : [],
        }
      );
      const nextUpdateDate = calculateLeaseNextUpdateDate(draftLease);
      const adjustmentHistory = calculateLeaseAdjustmentHistory(draftLease);

      if (
        nextUpdateDate === currentFormData.rentRuleNextUpdateDate &&
        JSON.stringify(adjustmentHistory) === JSON.stringify(currentFormData.rentAdjustmentHistory)
      ) {
        return currentFormData;
      }

      return {
        ...currentFormData,
        rentRuleNextUpdateDate: nextUpdateDate,
        rentAdjustmentHistory: adjustmentHistory,
      };
    });
  }, [
    formData.country,
    formData.lateFeeAmount,
    formData.lateFeeCurrency,
    formData.leaseContractSignatureDate,
    formData.leaseEndDate,
    formData.monthlyRent,
    formData.monthlyRentCurrency,
    formData.notes,
    formData.purchaseDate,
    formData.rentManualCustomSchedule,
    formData.rentRuleBaseRent,
    formData.rentRuleCustomFrequencyMonths,
    formData.rentRuleFirstAdjustmentDate,
    formData.rentRuleFixedPercentage,
    formData.rentRuleFrequency,
    formData.rentRuleIndexType,
    formData.rentRuleMaximumCapPct,
    formData.rentRuleMinimumCapPct,
    formData.rentRuleNotes,
    formData.rentRuleReferenceRatePct,
    formData.rentRuleType,
    formData.securityDeposit,
    formData.securityDepositCurrency,
  ]);

  const isGarageParking = isGarageParkingPropertyType(formData.propertyType);
  const showResidentialRooms = usesResidentialRoomFields(formData.propertyType);
  const showResidentialAmenities = usesResidentialAmenityFields(formData.propertyType);

  const buildPropertyPayload = (data: PropertyFormData): Property => {
    const recurringExpenseMap = Object.fromEntries(
      data.recurringExpenses.map((expense) => [expense.expenseType, expense])
    ) as Record<string, RecurringExpense | undefined>;
    const annualizedRecurringAmount = (expenseType: string, fallback: number) => {
      const expense = recurringExpenseMap[expenseType];
      if (!expense) {
        return fallback;
      }

      if (expense.projectionMode === 'manual-annual-estimate' && expense.manualAnnualEstimate) {
        return expense.manualAnnualEstimate;
      }

      const months =
        expense.billingFrequency === 'monthly'
          ? 1
          : expense.billingFrequency === 'quarterly'
          ? 3
          : expense.billingFrequency === 'every-4-months'
          ? 4
          : expense.billingFrequency === 'semi-annual'
          ? 6
          : expense.billingFrequency === 'custom'
          ? Math.max(Math.trunc(expense.customBillingFrequencyMonths ?? 0), 1)
          : 12;

      return months > 0 ? (expense.lastKnownAmount * 12) / months : fallback;
    };

    const activeLease: Lease = {
      id: editingProperty?.activeLeaseId ?? editingProperty?.leases?.find((lease) => lease.active)?.id ?? `lease-${Date.now()}`,
      name: data.leaseType || 'Current lease',
      startDate: data.leaseContractSignatureDate || data.purchaseDate,
      endDate: data.leaseEndDate,
      monthlyRent: data.monthlyRent,
      monthlyRentCurrency: data.monthlyRentCurrency,
      securityDeposit: data.securityDeposit || null,
      securityDepositCurrency: data.securityDepositCurrency,
      lateFeeAmount: data.lateFeeAmount || null,
      lateFeeCurrency: data.lateFeeCurrency,
      notes: data.notes,
      active: true,
      rentUpdateRule: {
        type: data.rentRuleType,
        frequency: data.rentRuleFrequency,
        customFrequencyMonths:
          data.rentRuleFrequency === 'custom' ? data.rentRuleCustomFrequencyMonths : null,
        indexType: data.rentRuleType === 'official-index' ? data.rentRuleIndexType || null : null,
        contractSignatureDate: data.leaseContractSignatureDate || data.purchaseDate,
        firstAdjustmentDate: data.rentRuleFirstAdjustmentDate,
        nextUpdateDate: data.rentRuleNextUpdateDate,
        baseRent: data.rentRuleBaseRent || data.monthlyRent,
        fixedPercentage: data.rentRuleType === 'fixed-percentage' ? data.rentRuleFixedPercentage : null,
        referenceRatePct: data.rentRuleType === 'official-index' ? data.rentRuleReferenceRatePct : null,
        minimumCapPct: data.rentRuleMinimumCapPct || null,
        maximumCapPct: data.rentRuleMaximumCapPct || null,
        notes: data.rentRuleNotes,
        manualCustomSchedule:
          data.rentRuleType === 'manual-custom-schedule' ? data.rentManualCustomSchedule : [],
      },
      adjustmentHistory: data.rentAdjustmentHistory,
    };

    const existingInactiveLeases =
      editingProperty?.leases?.filter((lease) => lease.id !== activeLease.id) ?? [];
    const purchasePriceInOperatingCurrency = convertCurrency(
      data.purchasePrice,
      data.purchasePriceCurrency,
      data.operatingCurrency
    );

    const propertyPayload: Property = {
      ...data,
      id: isEditing && editingProperty ? editingProperty.id : `prop${Date.now()}`,
      currency: data.operatingCurrency,
      operatingCurrency: data.operatingCurrency,
      propertyValueCurrency: data.propertyValueCurrency,
      totalInitialInvestment: calculateDerivedTotalInvestment(data),
      itpValueBase: purchasePriceInOperatingCurrency,
      transferTaxRate:
        purchasePriceInOperatingCurrency === 0
          ? 0
          : (data.acquisitionTaxes / purchasePriceInOperatingCurrency) * 100,
      transferTaxAmount: data.acquisitionTaxes,
      notaryCost: data.notaryAndRegistryCosts,
      registryCost: 0,
      totalPurchaseCost:
        purchasePriceInOperatingCurrency +
        data.acquisitionTaxes +
        data.notaryAndRegistryCosts +
        data.agencyFees,
      renovationConservation: data.renovationCosts,
      renovationImprovements: 0,
      furnishingAndOther: data.furnishingCosts,
      cashInvested: 0,
      annualRent: data.monthlyRent * 12,
      monthlyRentCurrency: data.monthlyRentCurrency,
      annualIncomeGrowthRate: 0,
      expectedRentGrowthPct: 0,
      expectedAnnualAppreciationPct:
        editingProperty?.expectedAnnualAppreciationPct ??
        editingProperty?.expectedPropertyAppreciationPct ??
        0,
      expectedPropertyAppreciationPct:
        editingProperty?.expectedPropertyAppreciationPct ??
        editingProperty?.expectedAnnualAppreciationPct ??
        0,
      lastRentUpdateDate: '',
      lastPropertyValuationDate: '',
      communityMonthly: data.annualCommunityFees / 12,
      communityAnnual: data.annualCommunityFees,
      ibiAndLocalTaxesMonthly: data.annualIBI / 12,
      ibiAndLocalTaxesAnnual: data.annualIBI,
      homeInsuranceMonthly: data.annualHomeInsurance / 12,
      homeInsuranceAnnual: data.annualHomeInsurance,
      propertyManagementRate: 0,
      maintenanceMonthly: data.annualMaintenance / 12,
      maintenanceAnnual: data.annualMaintenance,
      otherOperatingExpensesMonthly: data.annualOtherExpenses / 12,
      otherOperatingExpensesAnnual: data.annualOtherExpenses,
      totalOperatingExpensesMonthly:
        (data.annualIBI +
          data.annualHomeInsurance +
          data.annualNonPaymentInsurance +
          data.annualCommunityFees +
          data.annualManagementFees +
          data.annualMaintenance +
          data.annualUtilitiesPaidByOwner +
          data.annualOtherExpenses) / 12,
      totalOperatingExpensesAnnual:
        data.annualIBI +
        data.annualHomeInsurance +
        data.annualNonPaymentInsurance +
        data.annualCommunityFees +
        data.annualManagementFees +
        data.annualMaintenance +
        data.annualUtilitiesPaidByOwner +
        data.annualOtherExpenses,
      annualExpenseGrowthRate: 0,
      expectedCommunityGrowthPct: 0,
      expectedInsuranceGrowthPct: 0,
      expectedTaxGrowthPct: 0,
      expectedMaintenanceGrowthPct: 0,
      originalLoanAmount: 0,
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
      annualLifeInsurance: 0,
      annualRentDefaultInsurance: data.annualNonPaymentInsurance,
      annualMortgageInterest: data.annualMortgageInterestTax,
      annualPrincipalAmortized: 0,
      annualTotalMortgagePaid: 0,
      oneTimeTenantPlacementFee: 0,
      rentalDeposit: data.securityDeposit,
      rentalDepositCurrency: data.securityDepositCurrency,
      lateFeeAmount: data.lateFeeAmount,
      lateFeeCurrency: data.lateFeeCurrency,
      furnitureCost: data.furnishingCosts,
      totalCashInvestedForPurchase: 0,
      cadastralValueTotal: 0,
      cadastralConstructionValue: 0,
      cadastralLandValue: 0,
      annualTaxableRentalIncome: 0,
      annualDeductibleExpenses:
        data.annualCommunityFees +
        data.annualIBI +
        data.annualHomeInsurance +
        data.annualNonPaymentInsurance +
        data.annualManagementFees +
        data.annualMaintenance +
        data.annualMortgageInterestTax +
        data.annualOtherExpenses,
      annualDepreciationTax: 0,
      annualMortgageInterestTax: data.annualMortgageInterestTax,
      recurringExpenses: data.recurringExpenses,
      annualNetTaxableIncome: 0,
      taxReductionPercentage: 0,
      marginalTaxRate: 0,
      estimatedAnnualTax: 0,
      taxNotes: '',
      spainOwnerType: data.spainOwnerType,
      spainRentalType: data.spainRentalType,
      spainOwnershipPercentage: data.spainOwnershipPercentage,
      spainAutonomousCommunity: data.spainAutonomousCommunity,
      spainEstimatedMarginalTaxRate: data.spainEstimatedMarginalTaxRate,
      spainMonthsRentedInTaxYear: data.spainMonthsRentedInTaxYear,
      builtAreaSqm: data.builtAreaSqm,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      floor: data.floor,
      propertyType: data.propertyType,
      leaseType: data.leaseType,
      leaseEndDate: data.leaseEndDate,
      leases: [activeLease, ...existingInactiveLeases.map((lease) => ({ ...lease, active: false }))],
      activeLeaseId: activeLease.id,
      yearBuilt: data.yearBuilt,
      renovatedYear: data.renovatedYear,
      furnishedStatus: data.furnishedStatus,
      hasElevator: data.hasElevator,
      hasBalcony: data.hasBalcony,
      hasParking: isGarageParkingPropertyType(data.propertyType) ? true : data.hasParking,
      hasStorageRoom: data.hasStorageRoom,
      parkingSpaces: data.parkingSpaces,
      parkingCoverage: data.parkingCoverage || null,
      condition: data.condition,
      grossYield: 0,
      netYield: 0,
      monthlyCashflow: 0,
      roceYear1: 0,
      rocePlusAppreciation5Years: 0,
      rocePlusAppreciation10Years: 0,
      rocePlusAppreciation15Years: 0,
      mortgageVsRentPercentage: 0,
      cashflowVsRentPercentage: 0,
      imageUrls: data.imageUrls,
      primaryImageIndex: data.primaryImageIndex,
    };

    propertyPayload.annualIBI = annualizedRecurringAmount('property-tax', propertyPayload.annualIBI);
    propertyPayload.annualHomeInsurance = annualizedRecurringAmount(
      'home-insurance',
      propertyPayload.annualHomeInsurance
    );
    propertyPayload.annualLifeInsurance = annualizedRecurringAmount(
      'life-insurance',
      propertyPayload.annualLifeInsurance ?? 0
    );
    propertyPayload.annualNonPaymentInsurance = annualizedRecurringAmount(
      'rent-default-insurance',
      propertyPayload.annualNonPaymentInsurance
    );
    propertyPayload.annualCommunityFees = annualizedRecurringAmount(
      'community-fees',
      propertyPayload.annualCommunityFees
    );
    propertyPayload.annualManagementFees = annualizedRecurringAmount(
      'management-fees',
      propertyPayload.annualManagementFees
    );
    propertyPayload.annualMaintenance = annualizedRecurringAmount(
      'maintenance',
      propertyPayload.annualMaintenance
    );
    propertyPayload.annualUtilitiesPaidByOwner = annualizedRecurringAmount(
      'utilities',
      propertyPayload.annualUtilitiesPaidByOwner
    );
    propertyPayload.annualOtherExpenses = annualizedRecurringAmount(
      'other-operating',
      propertyPayload.annualOtherExpenses
    );

    if (propertyPayload.country === 'Spain') {
      const spainTaxSummary = calculateSpainDeductibleExpenseSummary(propertyPayload);
      propertyPayload.annualTaxableRentalIncome = spainTaxSummary.annualRent;
      propertyPayload.annualDeductibleExpenses = spainTaxSummary.annualDeductibleExpenses;
      propertyPayload.annualNetTaxableIncome = spainTaxSummary.estimatedNetTaxableIncome;
      propertyPayload.taxReductionPercentage = spainTaxSummary.reductionRate * 100;
      propertyPayload.estimatedAnnualTax = spainTaxSummary.estimatedTax;
    }

    return propertyPayload;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSectionSave();
  };

  const inputClass = `${appInputClass} shadow-[0_1px_0_rgba(255,255,255,0.72),0_10px_20px_-22px_rgba(15,23,42,0.14)] hover:border-[var(--app-border-strong)]`;
  const labelClass = `mb-1 block text-[13px] font-medium tracking-[-0.01em] ${appTextMutedClass}`;
  const derivedTotalInitialInvestment = calculateDerivedTotalInvestment(formData);
  const draftProperty = useMemo(
    () => buildPropertyPayload(formData),
    [editingProperty, formData, isEditing]
  );
  const liveFinancials = useMemo(
    () => calculatePropertyDetails(draftProperty),
    [draftProperty]
  );
  const livePreviewItems = [
    {
      label: isBasicMode ? 'Net monthly result' : 'Monthly Cashflow',
      value: formatCurrency(liveFinancials.netMonthlyCashflow, formData.operatingCurrency),
      tone:
        liveFinancials.netMonthlyCashflow >= 0
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-rose-700 dark:text-rose-300',
    },
    {
      label: isBasicMode ? 'Property value' : 'Gross Yield',
      value: isBasicMode
        ? formatCurrencyValue(
            draftProperty.currentEstimatedValue,
            formData.currentEstimatedValueCurrency
          )
        : formatPercentage(liveFinancials.grossYield),
      tone: appTextStrongClass,
    },
    ...(isBasicMode
      ? [
          {
            label: 'Monthly income',
            value: formatCurrencyValue(formData.monthlyRent, formData.monthlyRentCurrency),
            tone: 'text-emerald-700 dark:text-emerald-300',
          },
          {
            label: 'Monthly expenses',
            value: formatCurrency(liveFinancials.totalMonthlyExpenses, formData.operatingCurrency),
            tone: 'text-amber-700 dark:text-amber-300',
          },
        ]
      : [
        {
      label: 'Gross Yield',
      value: formatPercentage(liveFinancials.grossYield),
      tone: appTextStrongClass,
    },
    {
      label: 'Net Yield',
      value: formatPercentage(liveFinancials.netYield),
      tone: appTextStrongClass,
    },
    {
      label: 'ROCE',
      value: formatPercentage(liveFinancials.roce),
      tone: 'text-cyan-700 dark:text-cyan-300',
    },
    {
      label: 'Annual Tax Estimate',
      value: formatCurrency(draftProperty.estimatedAnnualTax, formData.operatingCurrency),
      tone: 'text-amber-700 dark:text-amber-300',
    },
    {
      label: 'Current Equity',
      value: formatCurrency(liveFinancials.equity, formData.operatingCurrency),
      tone: appTextStrongClass,
    },
      ]),
  ];
  const sectionItems = useMemo(
    () =>
      [
        { id: 'basic-info', label: 'Basic Info' },
        { id: 'gallery', label: 'Documents' },
        { id: 'investment-summary', label: 'Financial Info' },
        { id: 'cashflow', label: 'Income' },
        { id: 'operating-expenses', label: 'Expenses' },
        ...(trackingPreference === 'properties-and-mortgages' || trackingPreference === 'full-portfolio'
          ? [{ id: 'mortgage' as PropertyEditorSection, label: 'Mortgage' }]
          : []),
        ...(!isBasicMode ? [{ id: 'lease-rent-rule' as PropertyEditorSection, label: 'Lease' }] : []),
        { id: 'notes', label: 'Notes' },
        ...(!isBasicMode && formData.country === 'Spain'
          ? [
              { id: 'spain-tax-settings', label: 'Tax Settings' },
              { id: 'deductible-expenses', label: 'Tax Expenses' },
            ]
          : []),
      ] as Array<{ id: PropertyEditorSection; label: string }>,
    [formData.country, isBasicMode, trackingPreference]
  );
  const financeSections: PropertyEditorSection[] = useMemo(
    () => ['investment-summary', 'cashflow', 'operating-expenses', 'mortgage'],
    []
  );
  const safeActiveSection = sectionItems.some((section) => section.id === activeSection)
    ? activeSection
    : sectionItems[0]?.id ?? 'basic-info';
  const showLiveResults = financeSections.includes(safeActiveSection);
  const activeSectionLabel =
    sectionItems.find((section) => section.id === safeActiveSection)?.label ?? 'Basic Info';
  const getSectionSnapshot = (data: PropertyFormData, section: PropertyEditorSection) =>
    propertyEditorSectionFields[section].reduce<Record<string, unknown>>((snapshot, fieldName) => {
      snapshot[fieldName] = data[fieldName];
      return snapshot;
    }, {});
  const isSectionDirty = (section: PropertyEditorSection) =>
    JSON.stringify(getSectionSnapshot(formData, section)) !==
    JSON.stringify(getSectionSnapshot(lastSavedFormData, section));
  const sectionUnsavedState = Object.fromEntries(
    sectionItems.map((section) => [section.id, isSectionDirty(section.id)])
  ) as Record<PropertyEditorSection, boolean>;
  const activeSectionHasUnsavedChanges = sectionUnsavedState[safeActiveSection] ?? false;

  const applySectionSnapshot = (section: PropertyEditorSection, source: PropertyFormData) => {
    const sectionPatch = Object.fromEntries(
      propertyEditorSectionFields[section].map((fieldName) => [fieldName, source[fieldName]])
    ) as Partial<PropertyFormData>;

    setFormData((currentFormData) => {
      const nextFormData = {
        ...currentFormData,
        ...sectionPatch,
      };

      if (JSON.stringify(nextFormData) === JSON.stringify(currentFormData)) {
        return currentFormData;
      }

      return {
        ...nextFormData,
        totalInitialInvestment: calculateDerivedTotalInvestment(nextFormData),
      };
    });
  };

  const commitSectionChanges = () => {
    setLastSavedFormData((currentLastSaved) => {
      const nextLastSaved = {
        ...currentLastSaved,
        ...(Object.fromEntries(
          propertyEditorSectionFields[activeSection].map((fieldName) => [fieldName, formData[fieldName]])
        ) as Partial<PropertyFormData>),
        totalInitialInvestment: calculateDerivedTotalInvestment(formData),
      };

      return JSON.stringify(nextLastSaved) === JSON.stringify(currentLastSaved)
        ? currentLastSaved
        : nextLastSaved;
    });
  };

  const discardActiveSectionChanges = () => {
    applySectionSnapshot(activeSection, lastSavedFormData);
  };

  const closeUnsavedChangesPrompt = () => {
    setPendingSectionChange(null);
    setIsPendingClose(false);
  };

  const handleSectionSave = () => {
    const propertyPayload = buildPropertyPayload(formData);
    commitSectionChanges();

    if (isEditing && editingProperty && onEditProperty) {
      onEditProperty(propertyPayload);
      closeUnsavedChangesPrompt();
      return;
    }

    onAddProperty(propertyPayload);
    closeUnsavedChangesPrompt();
    onClose();
  };

  const handleSectionCancel = () => {
    discardActiveSectionChanges();
  };

  const handleSectionNavigation = (nextSection: PropertyEditorSection) => {
    if (nextSection === activeSection) {
      return;
    }

    if (activeSectionHasUnsavedChanges) {
      setPendingSectionChange(nextSection);
      return;
    }

    setActiveSection(nextSection);
  };

  const handleRequestClose = () => {
    if (activeSectionHasUnsavedChanges) {
      setIsPendingClose(true);
      return;
    }

    onClose();
  };

  const handleConfirmSaveAndContinue = () => {
    handleSectionSave();

    if (pendingSectionChange) {
      setActiveSection(pendingSectionChange);
    }

    if (isPendingClose) {
      onClose();
    }

    closeUnsavedChangesPrompt();
  };

  const handleDiscardAndContinue = () => {
    discardActiveSectionChanges();

    if (pendingSectionChange) {
      setActiveSection(pendingSectionChange);
    }

    if (isPendingClose) {
      onClose();
    }

    closeUnsavedChangesPrompt();
  };

  const renderSectionTitle = (sectionId: string, title: string, borderClass: string) => {
    const accentClass =
      borderClass.includes('blue')
        ? 'bg-blue-100 text-blue-700'
        : borderClass.includes('green')
        ? 'bg-emerald-100 text-emerald-700'
        : borderClass.includes('orange')
        ? 'bg-amber-100 text-amber-700'
        : borderClass.includes('indigo')
        ? 'bg-indigo-100 text-indigo-700'
        : borderClass.includes('cyan')
        ? 'bg-cyan-100 text-cyan-700'
        : 'bg-slate-100 text-slate-700';

    return (
    <div id={`property-form-section-${sectionId}`} className="scroll-mt-24">
      <div className={`mb-4 flex items-center gap-3 rounded-[24px] border px-4 py-3.5 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.18)] ${appBorderClass} ${appPanelInsetClass}`}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(214,224,234,0.95)] bg-white shadow-[0_10px_18px_-18px_rgba(15,23,42,0.16)] ${accentClass}`}>
          <div className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--app-text-strong)]">
            {title}
          </h3>
        </div>
      </div>
    </div>
    );
  };
  const renderAmountWithCurrency = (
    amountName:
      | 'purchasePrice'
      | 'currentEstimatedValue'
      | 'monthlyRent'
      | 'securityDeposit'
      | 'lateFeeAmount'
      | 'rentRuleBaseRent',
    currencyName:
      | 'purchasePriceCurrency'
      | 'currentEstimatedValueCurrency'
      | 'monthlyRentCurrency'
      | 'securityDepositCurrency'
      | 'lateFeeCurrency',
    label: string,
    options?: {
      tutorialId?: string;
      hint?: string;
      step?: string;
    }
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
        <input
          data-tutorial-id={options?.tutorialId}
          type="number"
          name={amountName}
          value={formData[amountName]}
          onChange={handleChange}
          step={options?.step ?? '1000'}
          className={`${inputClass} ${options?.tutorialId && tutorialTargetId === options.tutorialId ? 'app-tutorial-target' : ''}`}
        />
        <select
          name={currencyName}
          value={formData[currencyName]}
          onChange={handleChange}
          className={inputClass}
        >
          {currencyOptions.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code}
            </option>
          ))}
        </select>
      </div>
      {options?.hint ? <p className={`mt-2 text-xs ${appTextSoftClass}`}>{options.hint}</p> : null}
    </div>
  );
  const showSection = (sectionId: PropertyEditorSection) => activeSection === sectionId;

  const addManualScheduleEntry = () => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      rentManualCustomSchedule: [
        ...currentFormData.rentManualCustomSchedule,
        {
          id: `rent-schedule-${Date.now()}`,
          effectiveDate: currentFormData.rentRuleNextUpdateDate || currentFormData.leaseEndDate || '',
          percentageApplied: 0,
          newRent: currentFormData.monthlyRent,
          notes: '',
        },
      ],
    }));
  };

  const updateManualScheduleEntry = (
    entryId: string,
    patch: Partial<RentUpdateScheduleEntry>
  ) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      rentManualCustomSchedule: currentFormData.rentManualCustomSchedule.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry
      ),
    }));
  };

  const removeManualScheduleEntry = (entryId: string) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      rentManualCustomSchedule: currentFormData.rentManualCustomSchedule.filter(
        (entry) => entry.id !== entryId
      ),
    }));
  };

  const updateRecurringExpense = (expenseId: string, patch: Partial<RecurringExpense>) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.map((expense) =>
        expense.id === expenseId ? { ...expense, ...patch } : expense
      ),
    }));
  };

  const addRecurringExpense = () => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: [
        ...currentFormData.recurringExpenses,
        createRecurringExpense('custom', 'Custom expense', currentFormData.country, 'monthly', 0),
      ],
    }));
  };

  const removeRecurringExpense = (expenseId: string) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.filter((expense) => expense.id !== expenseId),
    }));
  };

  const addExpensePaymentHistory = (expenseId: string) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              paymentHistory: [
                ...expense.paymentHistory,
                {
                  id: `expense-payment-${Date.now()}`,
                  paymentDate: '',
                  amount: expense.lastKnownAmount,
                  coveredPeriod: '',
                  notes: '',
                  attachedDocumentUrl: '',
                },
              ],
            }
          : expense
      ),
    }));
  };

  const updateExpensePaymentHistory = (
    expenseId: string,
    paymentId: string,
    patch: Partial<RecurringExpensePaymentEntry>
  ) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              paymentHistory: expense.paymentHistory.map((payment) =>
                payment.id === paymentId ? { ...payment, ...patch } : payment
              ),
            }
          : expense
      ),
    }));
  };

  const addExpenseScheduleEntry = (expenseId: string) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              customSchedule: [
                ...(expense.customSchedule ?? []),
                {
                  id: `expense-schedule-${Date.now()}`,
                  effectiveDate: expense.nextExpectedUpdateDate || '',
                  amount: expense.lastKnownAmount,
                  notes: '',
                },
              ],
            }
          : expense
      ),
    }));
  };

  const updateExpenseScheduleEntry = (
    expenseId: string,
    entryId: string,
    patch: Partial<RecurringExpenseScheduleEntry>
  ) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      recurringExpenses: currentFormData.recurringExpenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              customSchedule: (expense.customSchedule ?? []).map((entry) =>
                entry.id === entryId ? { ...entry, ...patch } : entry
              ),
            }
          : expense
      ),
    }));
  };

  return (
    <CompactEditModal
      eyebrow="Properties"
      title={isEditing ? t('properties.form.editTitle') : t('properties.form.addTitle')}
      subtitle={
        isEditing && initialSection
          ? t('properties.form.editSectionOnly', { section: activeSectionLabel })
          : isEditing
          ? t('properties.form.editTitle')
          : `Build this property one section at a time. Currently editing: ${activeSectionLabel}.`
      }
      onClose={handleRequestClose}
      sections={sectionItems}
      activeSection={activeSection}
      onSectionChange={(sectionId) => handleSectionNavigation(sectionId as PropertyEditorSection)}
      sectionStatusById={Object.fromEntries(
        sectionItems.map((section) => [section.id, { unsaved: sectionUnsavedState[section.id] }])
      )}
      sectionWidthClassName="sm:max-w-3xl"
      sectionsAreLocked={initialSection !== null && initialSection !== undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-7 bg-[linear-gradient(180deg,rgba(247,250,253,0.98)_0%,rgba(251,253,255,1)_100%)] p-4 pb-28 sm:space-y-8 sm:p-6 sm:pb-6">

          {showLiveResults ? (
            <div
              data-tutorial-id="form-live-results"
              className={`rounded-[26px] border border-[rgba(201,213,227,0.95)] bg-[linear-gradient(180deg,rgba(244,248,253,0.95),rgba(238,244,251,0.92))] p-3 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.18)] sm:p-4 ${tutorialTargetId === 'form-live-results' ? 'app-tutorial-target' : ''}`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-text-soft)]">
                    Live Results
                  </p>
                  <span className="text-[12px] text-[var(--app-text-soft)]">
                    Updates automatically
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {livePreviewItems.map((item) => (
                    <div key={item.label} className="rounded-[18px] border border-[rgba(214,224,234,0.95)] bg-white px-3 py-2 shadow-[0_8px_18px_-22px_rgba(15,23,42,0.18)]">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-soft)]">{item.label}</p>
                      <p className={`mt-1 text-sm font-semibold ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {showSection('basic-info') ? (
          <div>
            {renderSectionTitle('basic-info', t('properties.form.basicInformation'), 'border-blue-200')}
            <div className={`rounded-[30px] border border-[rgba(201,213,227,0.96)] bg-[var(--app-panel-inset)] p-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.16)] sm:p-5`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="name" className={labelClass}>{t('properties.form.propertyName')} *</label>
                <input data-tutorial-id="form-property-name" id="name" name="name" value={formData.name} onChange={handleChange} required placeholder={t('properties.form.placeholderPropertyName')} className={`${inputClass} ${tutorialTargetId === 'form-property-name' ? 'app-tutorial-target' : ''}`} />
              </div>
              <div>
                <label htmlFor="occupancyStatus" className={labelClass}>{t('properties.form.occupancyStatus')}</label>
                <select id="occupancyStatus" name="occupancyStatus" value={formData.occupancyStatus} onChange={handleChange} className={inputClass}>
                  <option value="occupied">{t('properties.status.occupied')}</option>
                  <option value="vacant">{t('properties.status.vacant')}</option>
                  <option value="tenant-to-be-confirmed">{t('properties.status.tbc')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="address" className={labelClass}>{t('properties.form.address')} *</label>
                <input id="address" name="address" value={formData.address} onChange={handleChange} required placeholder={t('properties.form.placeholderAddress')} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className={labelClass}>{t('properties.form.city')} *</label>
                  <input id="city" name="city" value={formData.city} onChange={handleChange} required placeholder={t('properties.form.placeholderCity')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="country" className={labelClass}>{t('properties.form.country')}</label>
                  <select
                    id="country"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    {countryOptions.map((countryOption) => (
                      <option key={countryOption.value} value={countryOption.value}>
                        {countryOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="purchaseDate" className={labelClass}>{t('properties.form.purchaseDate')}</label>
                <input type="date" id="purchaseDate" name="purchaseDate" value={formData.purchaseDate} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label htmlFor="propertyValueCurrency" className={labelClass}>{t('propertiesUi.propertyValueCurrency')}</label>
                <select
                  id="propertyValueCurrency"
                  name="propertyValueCurrency"
                  value={formData.propertyValueCurrency}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {getLocalizedCurrencyLabel(currency.code)}
                    </option>
                  ))}
                </select>
                <p className={`mt-2 text-xs ${appTextSoftClass}`}>
                  {t('propertiesUi.valueCurrencyHelp')}
                </p>
              </div>
              <div>
                <label htmlFor="operatingCurrency" className={labelClass}>{t('propertiesUi.operatingCurrency')}</label>
                <select
                  id="operatingCurrency"
                  name="operatingCurrency"
                  value={formData.operatingCurrency}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {getLocalizedCurrencyLabel(currency.code)}
                    </option>
                  ))}
                </select>
                <p className={`mt-2 text-xs ${appTextSoftClass}`}>
                  {t('propertiesUi.operatingCurrencyHelp')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:grid-cols-5">
                <div>
                  <label htmlFor="builtAreaSqm" className={labelClass}>{t('properties.form.builtAreaSqm')}</label>
                  <input id="builtAreaSqm" type="number" name="builtAreaSqm" value={formData.builtAreaSqm} onChange={handleChange} step="1" className={inputClass} />
                </div>
                {showResidentialRooms ? (
                  <div>
                    <label htmlFor="bedrooms" className={labelClass}>{t('properties.form.bedrooms')}</label>
                    <input id="bedrooms" type="number" name="bedrooms" value={formData.bedrooms} onChange={handleChange} step="1" className={inputClass} />
                  </div>
                ) : null}
                {showResidentialRooms ? (
                  <div>
                    <label htmlFor="bathrooms" className={labelClass}>{t('properties.form.bathrooms')}</label>
                    <input id="bathrooms" type="number" name="bathrooms" value={formData.bathrooms} onChange={handleChange} step="1" className={inputClass} />
                  </div>
                ) : null}
                <div>
                  <label htmlFor="floor" className={labelClass}>{t('properties.form.floor')}</label>
                  <input id="floor" type="number" name="floor" value={formData.floor} onChange={handleChange} step="1" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="condition" className={labelClass}>{t('properties.form.condition')}</label>
                  <input id="condition" name="condition" value={formData.condition} onChange={handleChange} placeholder={t('properties.form.conditionPlaceholder')} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:grid-cols-3">
                <div>
                  <label htmlFor="propertyType" className={labelClass}>{t('properties.form.propertyType')}</label>
                  <select id="propertyType" name="propertyType" value={formData.propertyType} onChange={handleChange} className={inputClass} required>
                    {propertyTypeValues.map((propertyType) => (
                      <option key={propertyType} value={propertyType}>
                        {t(`properties.form.propertyTypeOptions.${propertyType}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="furnishedStatus" className={labelClass}>{t('properties.form.furnishedStatus')}</label>
                  <input id="furnishedStatus" name="furnishedStatus" value={formData.furnishedStatus} onChange={handleChange} placeholder={t('properties.form.furnishedStatusPlaceholder')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="yearBuilt" className={labelClass}>{t('properties.form.yearBuilt')}</label>
                  <input id="yearBuilt" type="number" name="yearBuilt" value={formData.yearBuilt} onChange={handleChange} step="1" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="renovatedYear" className={labelClass}>{t('properties.form.renovatedYear')}</label>
                  <input id="renovatedYear" type="number" name="renovatedYear" value={formData.renovatedYear} onChange={handleChange} step="1" className={inputClass} />
                </div>
              </div>
              {isGarageParking ? (
                <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label htmlFor="parkingSpaces" className={labelClass}>{t('properties.form.parkingSpaces')}</label>
                    <input id="parkingSpaces" type="number" name="parkingSpaces" value={formData.parkingSpaces} onChange={handleChange} step="1" min="0" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="parkingCoverage" className={labelClass}>{t('properties.form.parkingCoverage')}</label>
                    <select id="parkingCoverage" name="parkingCoverage" value={formData.parkingCoverage} onChange={handleChange} className={inputClass}>
                      <option value="">{t('common.select')}</option>
                      <option value="covered">{t('properties.form.parkingCoverageOptions.covered')}</option>
                      <option value="uncovered">{t('properties.form.parkingCoverageOptions.uncovered')}</option>
                    </select>
                  </div>
                  <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                    <input type="checkbox" name="hasStorageRoom" checked={formData.hasStorageRoom} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                    <span className={`text-sm ${appTextMutedClass}`}>{t('properties.form.storageIncluded')}</span>
                  </label>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {showResidentialAmenities ? (
                    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                      <input type="checkbox" name="hasElevator" checked={formData.hasElevator} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                      <span className={`text-sm ${appTextMutedClass}`}>{t('properties.form.hasElevator')}</span>
                    </label>
                  ) : null}
                  {showResidentialAmenities ? (
                    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                      <input type="checkbox" name="hasBalcony" checked={formData.hasBalcony} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                      <span className={`text-sm ${appTextMutedClass}`}>{t('properties.form.hasBalcony')}</span>
                    </label>
                  ) : null}
                  <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                    <input type="checkbox" name="hasParking" checked={formData.hasParking} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                    <span className={`text-sm ${appTextMutedClass}`}>{t('properties.form.hasParking')}</span>
                  </label>
                  <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                    <input type="checkbox" name="hasStorageRoom" checked={formData.hasStorageRoom} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                    <span className={`text-sm ${appTextMutedClass}`}>{t('properties.form.hasStorageRoom')}</span>
                  </label>
                </div>
              </div>
            </div>
            </div>
          </div>
          ) : null}

          {showSection('gallery') ? (
          <div>
            {renderSectionTitle('gallery', isGarageParking ? t('properties.form.photosDocuments') : t('properties.tabs.gallery'), 'border-blue-100')}
            <label htmlFor="imageUrl" className={labelClass}>
              {isGarageParking ? t('properties.form.photosDocuments') : t('properties.form.propertyImage')}
            </label>
            <label className={`${inputClass} flex cursor-pointer items-center justify-center hover:brightness-[1.02]`}>
              <input type="file" id="imageUrl" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              <div className={`flex items-center gap-2 ${appTextMutedClass}`}>
                <Upload className="h-4 w-4" />
                <span>
                  {formData.imageUrls.length > 0
                    ? t('properties.form.imagesUploaded', { count: formData.imageUrls.length })
                    : t('properties.form.clickToUpload')}
                </span>
              </div>
            </label>
            {formData.imageUrls.length > 0 ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {formData.imageUrls.map((imageUrl, index) => {
                    const isPrimary = index === formData.primaryImageIndex;

                    return (
                      <div
                        key={`${imageUrl}-${index}`}
                        className={`overflow-hidden rounded-xl border ${isPrimary ? 'border-blue-500 shadow-sm shadow-blue-200/40 dark:shadow-blue-950/30' : appBorderClass}`}
                      >
                        <button type="button" onClick={() => handleSetPrimaryImage(index)} className="w-full">
                          <img
                            src={imageUrl}
                            alt={`Property upload ${index + 1}`}
                            className="h-24 w-full bg-[var(--app-panel-inset)] object-contain object-center"
                          />
                        </button>
                        <div className={`flex items-center justify-between gap-2 border-t px-2 py-2 ${appBorderClass} ${appPanelInsetClass}`}>
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryImage(index)}
                            className={`text-xs font-medium ${isPrimary ? 'text-blue-600 dark:text-blue-300' : `${appTextMutedClass} hover:text-slate-900 dark:hover:text-white`}`}
                          >
                            {isPrimary ? t('properties.form.primaryImage') : t('properties.form.setPrimary')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className={`rounded-md p-1 transition ${appTextSoftClass} hover:text-rose-600 dark:hover:text-rose-300`}
                            title={t('common.delete')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`mt-3 rounded-2xl border border-dashed px-4 py-5 text-center ${appBorderClass} ${appPanelInsetClass}`}>
                <p className={`text-sm font-medium ${appTextMutedClass}`}>{t('properties.form.clickToUpload')}</p>
              </div>
            )}
          </div>
          ) : null}

          {showSection('investment-summary') ? (
          <div>
            {renderSectionTitle('investment-summary', t('properties.form.purchaseAndInvestment'), 'border-green-200')}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {renderAmountWithCurrency(
                'purchasePrice',
                'purchasePriceCurrency',
                t('properties.form.purchasePrice'),
                {
                  tutorialId: 'form-purchase-price',
                  hint: 'Store the purchase price in the currency used on the deed or contract.',
                }
              )}
              {renderAmountWithCurrency(
                'currentEstimatedValue',
                'currentEstimatedValueCurrency',
                t('properties.form.currentEstimatedValue'),
                {
                  hint: 'This value can use a different currency from rent, expenses, or the mortgage.',
                }
              )}
              <div><label className={labelClass}>{t('properties.form.acquisitionTaxes')}</label><input type="number" name="acquisitionTaxes" value={formData.acquisitionTaxes} onChange={handleChange} step="100" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.notaryAndRegistryCosts')}</label><input type="number" name="notaryAndRegistryCosts" value={formData.notaryAndRegistryCosts} onChange={handleChange} step="100" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.agencyFees')}</label><input type="number" name="agencyFees" value={formData.agencyFees} onChange={handleChange} step="100" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.renovationCosts')}</label><input type="number" name="renovationCosts" value={formData.renovationCosts} onChange={handleChange} step="100" className={inputClass} /></div>
              <div className="md:col-span-2"><label className={labelClass}>{t('properties.form.furnishingCosts')}</label><input type="number" name="furnishingCosts" value={formData.furnishingCosts} onChange={handleChange} step="100" className={inputClass} /></div>
              <div className={`rounded-xl p-4 md:col-span-2 ${appPanelInsetClass}`}>
                <label className={labelClass}>{t('properties.form.totalInitialInvestment')}</label>
                <input type="number" value={derivedTotalInitialInvestment} readOnly className={`${inputClass} ${appTextMutedClass}`} />
              </div>
            </div>
          </div>
          ) : null}

          {showSection('cashflow') ? (
          <div>
            {renderSectionTitle('cashflow', isGarageParking ? t('properties.form.rentalAndCashflow') : t('properties.form.income'), 'border-green-200')}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {renderAmountWithCurrency(
                'monthlyRent',
                'monthlyRentCurrency',
                t('properties.form.monthlyRent'),
                {
                  step: '50',
                  tutorialId: 'form-monthly-rent',
                  hint: 'Rent can use a different currency from the property value or mortgage.',
                }
              )}
              {isGarageParking ? (
                <div>
                  <label className={labelClass}>{t('properties.form.monthlyExpenses')}</label>
                  <input
                    data-tutorial-id="form-monthly-expenses"
                    type="number"
                    value={Math.round((formData.annualOtherExpenses / 12) * 100) / 100}
                    onChange={(event) =>
                      setFormData((currentFormData) => ({
                        ...currentFormData,
                        annualOtherExpenses: (parseFloat(event.target.value) || 0) * 12,
                      }))
                    }
                    step="10"
                    className={`${inputClass} ${tutorialTargetId === 'form-monthly-expenses' ? 'app-tutorial-target' : ''}`}
                  />
                </div>
              ) : null}
            </div>
          </div>
          ) : null}

          {showSection('operating-expenses') ? (
          <div>
            {renderSectionTitle('operating-expenses', isGarageParking ? t('properties.form.operatingCosts') : t('properties.form.annualExpenses'), 'border-orange-200')}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><label className={labelClass}>{t('properties.form.annualIBI')}</label><input type="number" name="annualIBI" value={formData.annualIBI} onChange={handleChange} step="50" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.annualHomeInsurance')}</label><input type="number" name="annualHomeInsurance" value={formData.annualHomeInsurance} onChange={handleChange} step="50" className={inputClass} /></div>
              {!isGarageParking ? <div><label className={labelClass}>{t('properties.form.annualNonPaymentInsurance')}</label><input type="number" name="annualNonPaymentInsurance" value={formData.annualNonPaymentInsurance} onChange={handleChange} step="50" className={inputClass} /></div> : null}
              <div><label className={labelClass}>{t('properties.form.annualCommunityFees')}</label><input type="number" name="annualCommunityFees" value={formData.annualCommunityFees} onChange={handleChange} step="50" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.annualManagementFees')}</label><input type="number" name="annualManagementFees" value={formData.annualManagementFees} onChange={handleChange} step="50" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.annualMaintenance')}</label><input type="number" name="annualMaintenance" value={formData.annualMaintenance} onChange={handleChange} step="50" className={inputClass} /></div>
              <div><label className={labelClass}>{t('properties.form.annualUtilitiesPaidByOwner')}</label><input type="number" name="annualUtilitiesPaidByOwner" value={formData.annualUtilitiesPaidByOwner} onChange={handleChange} step="50" className={inputClass} /></div>
              {!isGarageParking ? <div><label className={labelClass}>{t('properties.form.annualOtherExpenses')}</label><input data-tutorial-id="form-monthly-expenses" type="number" name="annualOtherExpenses" value={formData.annualOtherExpenses} onChange={handleChange} step="50" className={`${inputClass} ${tutorialTargetId === 'form-monthly-expenses' ? 'app-tutorial-target' : ''}`} /></div> : null}
            </div>
            {!isBasicMode ? (
            <details className={`mt-5 rounded-2xl border p-4 ${appBorderClass} ${appPanelInsetClass}`}>
              <summary className={`cursor-pointer text-sm font-semibold ${appTextStrongClass}`}>
                {t('propertiesUi.recurringExpenseEngine')}
              </summary>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>
                {t('propertiesUi.recurringExpenseEngineHelp')}
              </p>
              <div className="mt-4 space-y-4">
                {formData.recurringExpenses.map((expense) => (
                  <div key={expense.id} className={`rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className={`text-sm font-semibold ${appTextStrongClass}`}>{expense.label}</h4>
                      <button type="button" onClick={() => removeRecurringExpense(expense.id)} className={`rounded-xl px-3 py-1.5 text-xs ${appButtonMutedClass}`}>
                        {t('common.delete')}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <label className={labelClass}>Expense type</label>
                        <select value={expense.expenseType} onChange={(event) => updateRecurringExpense(expense.id, { expenseType: event.target.value as RecurringExpense['expenseType'] })} className={inputClass}>
                          {expenseTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Label</label>
                        <input value={expense.label} onChange={(event) => updateRecurringExpense(expense.id, { label: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Country</label>
                        <input value={expense.country} onChange={(event) => updateRecurringExpense(expense.id, { country: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Billing frequency</label>
                        <select value={expense.billingFrequency} onChange={(event) => updateRecurringExpense(expense.id, { billingFrequency: event.target.value as RecurringExpense['billingFrequency'] })} className={inputClass}>
                          {billingFrequencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Last known amount</label>
                        <input type="number" value={expense.lastKnownAmount} onChange={(event) => updateRecurringExpense(expense.id, { lastKnownAmount: parseFloat(event.target.value) || 0 })} step="10" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Last payment date</label>
                        <input type="date" value={expense.lastPaymentDate || ''} onChange={(event) => updateRecurringExpense(expense.id, { lastPaymentDate: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Period covered</label>
                        <input value={expense.periodCovered || ''} onChange={(event) => updateRecurringExpense(expense.id, { periodCovered: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Projection mode</label>
                        <select value={expense.projectionMode} onChange={(event) => updateRecurringExpense(expense.id, { projectionMode: event.target.value as RecurringExpense['projectionMode'] })} className={inputClass}>
                          {projectionModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Growth frequency</label>
                        <select value={expense.growthFrequency || 'yearly'} onChange={(event) => updateRecurringExpense(expense.id, { growthFrequency: event.target.value as RecurringExpense['growthFrequency'] })} className={inputClass}>
                          {rentUpdateFrequencies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Growth percentage</label>
                        <input type="number" value={expense.growthPercentage ?? 0} onChange={(event) => updateRecurringExpense(expense.id, { growthPercentage: parseFloat(event.target.value) || 0 })} step="0.1" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Manual annual estimate</label>
                        <input type="number" value={expense.manualAnnualEstimate ?? 0} onChange={(event) => updateRecurringExpense(expense.id, { manualAnnualEstimate: parseFloat(event.target.value) || 0 })} step="10" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Next expected update date</label>
                        <input type="date" value={expense.nextExpectedUpdateDate || ''} onChange={(event) => updateRecurringExpense(expense.id, { nextExpectedUpdateDate: event.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Optional document upload</label>
                        <input value={expense.documentUrl || ''} onChange={(event) => updateRecurringExpense(expense.id, { documentUrl: event.target.value })} placeholder="Receipt URL or file reference" className={inputClass} />
                      </div>
                      <div className="md:col-span-2 xl:col-span-3">
                        <label className={labelClass}>Notes</label>
                        <textarea value={expense.notes || ''} onChange={(event) => updateRecurringExpense(expense.id, { notes: event.target.value })} rows={2} className={inputClass} />
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-semibold ${appTextStrongClass}`}>Payment history</p>
                        <button type="button" onClick={() => addExpensePaymentHistory(expense.id)} className={`rounded-xl px-3 py-1.5 text-xs ${appButtonMutedClass}`}>Add payment</button>
                      </div>
                      {(expense.paymentHistory ?? []).map((payment) => (
                        <div key={payment.id} className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <input type="date" value={payment.paymentDate} onChange={(event) => updateExpensePaymentHistory(expense.id, payment.id, { paymentDate: event.target.value })} className={inputClass} />
                          <input type="number" value={payment.amount} onChange={(event) => updateExpensePaymentHistory(expense.id, payment.id, { amount: parseFloat(event.target.value) || 0 })} step="10" className={inputClass} />
                          <input value={payment.coveredPeriod} onChange={(event) => updateExpensePaymentHistory(expense.id, payment.id, { coveredPeriod: event.target.value })} placeholder="Covered period" className={inputClass} />
                          <input value={payment.attachedDocumentUrl || ''} onChange={(event) => updateExpensePaymentHistory(expense.id, payment.id, { attachedDocumentUrl: event.target.value })} placeholder="Receipt/document" className={inputClass} />
                        </div>
                      ))}
                    </div>
                    {expense.projectionMode === 'custom-schedule' ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-semibold ${appTextStrongClass}`}>Custom schedule</p>
                          <button type="button" onClick={() => addExpenseScheduleEntry(expense.id)} className={`rounded-xl px-3 py-1.5 text-xs ${appButtonMutedClass}`}>Add schedule row</button>
                        </div>
                        {(expense.customSchedule ?? []).map((entry) => (
                          <div key={entry.id} className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <input type="date" value={entry.effectiveDate} onChange={(event) => updateExpenseScheduleEntry(expense.id, entry.id, { effectiveDate: event.target.value })} className={inputClass} />
                            <input type="number" value={entry.amount} onChange={(event) => updateExpenseScheduleEntry(expense.id, entry.id, { amount: parseFloat(event.target.value) || 0 })} step="10" className={inputClass} />
                            <input value={entry.notes || ''} onChange={(event) => updateExpenseScheduleEntry(expense.id, entry.id, { notes: event.target.value })} placeholder="Notes" className={inputClass} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                <button type="button" onClick={addRecurringExpense} className={`rounded-xl px-4 py-2.5 text-sm ${appButtonMutedClass}`}>
                  Add recurring expense
                </button>
              </div>
            </details>
            ) : null}
          </div>
          ) : null}

          {(trackingPreference === 'properties-and-mortgages' || trackingPreference === 'full-portfolio') && showSection('mortgage') ? (
          <div>
            {renderSectionTitle('mortgage', t('properties.form.mortgageInformation'), 'border-indigo-200')}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="hasMortgage" name="hasMortgage" checked={formData.hasMortgage} onChange={handleChange} className="h-4 w-4 cursor-pointer" />
                <label htmlFor="hasMortgage" className={`cursor-pointer text-sm font-medium ${appTextMutedClass}`}>
                  {t('properties.form.hasMortgage')}
                </label>
              </div>

              {formData.hasMortgage && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><label className={labelClass}>{t('properties.form.lenderName')}</label><input type="text" name="lenderName" value={formData.lenderName} onChange={handleChange} placeholder={t('properties.form.placeholderLender')} className={inputClass} /></div>
                </div>
              )}

              <p className={`text-xs italic ${appTextSoftClass}`}>{t('properties.hints.tipMortgage')}</p>
            </div>
          </div>
          ) : null}

          {!isBasicMode && showSection('lease-rent-rule') ? (
          <div>
            {renderSectionTitle('lease-rent-rule', 'Lease & Rent Update Rule', 'border-cyan-200')}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lease type</label>
                <input name="leaseType" value={formData.leaseType} onChange={handleChange} placeholder={t('properties.form.leaseTypePlaceholder')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contract signature date</label>
                <input type="date" name="leaseContractSignatureDate" value={formData.leaseContractSignatureDate} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Lease end date</label>
                <input type="date" name="leaseEndDate" value={formData.leaseEndDate} onChange={handleChange} className={inputClass} />
              </div>
              {renderAmountWithCurrency('rentRuleBaseRent', 'monthlyRentCurrency', 'Base rent', {
                step: '10',
                hint: 'Use the same rent currency throughout the lease rule and rent history.',
              })}
              {renderAmountWithCurrency(
                'securityDeposit',
                'securityDepositCurrency',
                'Deposit',
                { step: '50' }
              )}
              {renderAmountWithCurrency(
                'lateFeeAmount',
                'lateFeeCurrency',
                'Late fee',
                { step: '10', hint: 'Leave this at 0 if the lease does not use late fees.' }
              )}
              <div>
                <label className={labelClass}>Rule type</label>
                <select name="rentRuleType" value={formData.rentRuleType} onChange={handleChange} className={inputClass}>
                  {rentUpdateRuleTypes.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Frequency</label>
                <select name="rentRuleFrequency" value={formData.rentRuleFrequency} onChange={handleChange} className={inputClass}>
                  {rentUpdateFrequencies.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {formData.rentRuleFrequency === 'custom' ? (
                <div>
                  <label className={labelClass}>Custom frequency (months)</label>
                  <input type="number" name="rentRuleCustomFrequencyMonths" value={formData.rentRuleCustomFrequencyMonths} onChange={handleChange} min="1" step="1" className={inputClass} />
                </div>
              ) : null}
              {formData.rentRuleType === 'official-index' ? (
                <>
                  <div>
                    <label className={labelClass}>Index type</label>
                    <select name="rentRuleIndexType" value={formData.rentRuleIndexType} onChange={handleChange} className={inputClass}>
                      <option value="">{t('common.select')}</option>
                      {rentUpdateIndexTypes.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Reference index change (%)</label>
                    <input type="number" name="rentRuleReferenceRatePct" value={formData.rentRuleReferenceRatePct} onChange={handleChange} step="0.1" className={inputClass} />
                  </div>
                </>
              ) : null}
              {formData.rentRuleType === 'fixed-percentage' ? (
                <div>
                  <label className={labelClass}>Fixed percentage (%)</label>
                  <input type="number" name="rentRuleFixedPercentage" value={formData.rentRuleFixedPercentage} onChange={handleChange} step="0.1" className={inputClass} />
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Effective date of first adjustment</label>
                <input type="date" name="rentRuleFirstAdjustmentDate" value={formData.rentRuleFirstAdjustmentDate} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Next update date</label>
                <input type="date" name="rentRuleNextUpdateDate" value={formData.rentRuleNextUpdateDate} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Optional minimum cap (%)</label>
                <input type="number" name="rentRuleMinimumCapPct" value={formData.rentRuleMinimumCapPct} onChange={handleChange} step="0.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Optional maximum cap (%)</label>
                <input type="number" name="rentRuleMaximumCapPct" value={formData.rentRuleMaximumCapPct} onChange={handleChange} step="0.1" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Rule notes</label>
                <textarea name="rentRuleNotes" value={formData.rentRuleNotes} onChange={handleChange} rows={3} className={inputClass} />
              </div>
            </div>

            {formData.rentRuleType === 'manual-custom-schedule' ? (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className={`text-sm font-semibold ${appTextStrongClass}`}>Manual custom schedule</h4>
                  <button type="button" onClick={addManualScheduleEntry} className={`rounded-xl px-3 py-2 text-sm ${appButtonMutedClass}`}>Add custom increase</button>
                </div>
                <div className="space-y-3">
                  {formData.rentManualCustomSchedule.map((entry) => (
                    <div key={entry.id} className={`grid grid-cols-1 gap-3 rounded-xl border p-3 md:grid-cols-4 ${appBorderClass} ${appPanelInsetClass}`}>
                      <input type="date" value={entry.effectiveDate} onChange={(event) => updateManualScheduleEntry(entry.id, { effectiveDate: event.target.value })} className={inputClass} />
                      <input type="number" value={entry.percentageApplied ?? 0} onChange={(event) => updateManualScheduleEntry(entry.id, { percentageApplied: parseFloat(event.target.value) || 0 })} placeholder="Percentage" step="0.1" className={inputClass} />
                      <input type="number" value={entry.newRent ?? 0} onChange={(event) => updateManualScheduleEntry(entry.id, { newRent: parseFloat(event.target.value) || 0 })} placeholder="New rent" step="10" className={inputClass} />
                      <div className="flex gap-2">
                        <input value={entry.notes ?? ''} onChange={(event) => updateManualScheduleEntry(entry.id, { notes: event.target.value })} placeholder="Notes" className={inputClass} />
                        <button type="button" onClick={() => removeManualScheduleEntry(entry.id)} className={`rounded-xl px-3 ${appButtonMutedClass}`}>{t('common.delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className={`text-sm font-semibold ${appTextStrongClass}`}>Rent adjustment history</h4>
                <p className={`text-xs ${appTextSoftClass}`}>Current rent {formatCurrencyValue(formData.monthlyRent, formData.monthlyRentCurrency)}</p>
                </div>
              <div className={`overflow-hidden rounded-xl border ${appBorderClass}`}>
                <table className="w-full text-sm">
                  <thead className={appPanelInsetClass}>
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Previous</th>
                      <th className="px-3 py-2 text-right">New</th>
                      <th className="px-3 py-2 text-right">Applied %</th>
                      <th className="px-3 py-2 text-left">Index</th>
                      <th className="px-3 py-2 text-left">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.rentAdjustmentHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={`px-3 py-4 text-center ${appTextMutedClass}`}>
                          No rent adjustments generated yet.
                        </td>
                      </tr>
                    ) : (
                      formData.rentAdjustmentHistory.map((entry) => (
                        <tr key={entry.id} className={`border-t ${appBorderClass}`}>
                          <td className="px-3 py-2">{entry.adjustmentDate}</td>
                          <td className="px-3 py-2 text-right">{formatCurrencyValue(entry.previousRent, formData.monthlyRentCurrency)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrencyValue(entry.newRent, formData.monthlyRentCurrency)}</td>
                          <td className="px-3 py-2 text-right">{formatPercentage(entry.percentageApplied)}</td>
                          <td className="px-3 py-2">{entry.indexUsed || '—'}</td>
                          <td className="px-3 py-2">{entry.ruleSource}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          ) : null}

          {showSection('notes') ? (
          <div id="property-form-section-notes" className="scroll-mt-24">
            <h3 className={`mb-4 border-b-2 border-slate-200 pb-2 text-lg font-semibold ${appTextStrongClass}`}>
              {t('properties.form.notes')}
            </h3>
            <label htmlFor="notes" className={labelClass}>{t('properties.form.notes')}</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              placeholder={t('properties.form.placeholderNotes')}
              className={inputClass}
            />
          </div>
          ) : null}

          {formData.country === 'Spain' && !isBasicMode && showSection('spain-tax-settings') && (
            <div>
              {renderSectionTitle('spain-tax-settings', t('properties.labels.spainTaxSettings'), 'border-amber-200')}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="spainOwnerType" className={labelClass}>{t('properties.form.ownerType')}</label>
                  <select id="spainOwnerType" name="spainOwnerType" value={formData.spainOwnerType} onChange={handleChange} className={inputClass}>
                    {ownerTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="spainRentalType" className={labelClass}>{t('properties.form.rentalType')}</label>
                  <select id="spainRentalType" name="spainRentalType" value={formData.spainRentalType} onChange={handleChange} className={inputClass}>
                    {rentalTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="spainOwnershipPercentage" className={labelClass}>{t('properties.form.ownershipPercentage')}</label>
                  <input type="number" id="spainOwnershipPercentage" name="spainOwnershipPercentage" value={formData.spainOwnershipPercentage} onChange={handleChange} step="1" min="0" max="100" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="spainEstimatedMarginalTaxRate" className={labelClass}>{t('properties.form.estimatedMarginalTaxRate')}</label>
                  <input type="number" id="spainEstimatedMarginalTaxRate" name="spainEstimatedMarginalTaxRate" value={formData.spainEstimatedMarginalTaxRate} onChange={handleChange} step="0.1" min="0" className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="spainAutonomousCommunity" className={labelClass}>{t('properties.form.autonomousCommunity')}</label>
                  <select id="spainAutonomousCommunity" name="spainAutonomousCommunity" value={formData.spainAutonomousCommunity} onChange={handleChange} className={inputClass}>
                    {autonomousCommunityOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          )}

          {formData.country === 'Spain' && !isBasicMode && showSection('deductible-expenses') ? (
            <div>
              {renderSectionTitle('deductible-expenses', t('properties.labels.spainDeductibleExpenses'), 'border-amber-100')}
              <p className={`mb-4 text-sm ${appTextMutedClass}`}>{t('properties.form.deductibleExpensesHelp')}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div><label className={labelClass}>{t('properties.form.annualCommunityFees')}</label><input type="number" name="annualCommunityFees" value={formData.annualCommunityFees} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualIBI')}</label><input type="number" name="annualIBI" value={formData.annualIBI} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualHomeInsurance')}</label><input type="number" name="annualHomeInsurance" value={formData.annualHomeInsurance} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualRentDefaultInsurance')}</label><input type="number" name="annualNonPaymentInsurance" value={formData.annualNonPaymentInsurance} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualManagementFees')}</label><input type="number" name="annualManagementFees" value={formData.annualManagementFees} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualMaintenance')}</label><input type="number" name="annualMaintenance" value={formData.annualMaintenance} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.mortgageInterestDeductible')}</label><input type="number" name="annualMortgageInterestTax" value={formData.annualMortgageInterestTax} onChange={handleChange} step="50" className={inputClass} /></div>
                <div><label className={labelClass}>{t('properties.form.annualOtherExpenses')}</label><input data-tutorial-id="form-monthly-expenses" type="number" name="annualOtherExpenses" value={formData.annualOtherExpenses} onChange={handleChange} step="50" className={`${inputClass} ${tutorialTargetId === 'form-monthly-expenses' ? 'app-tutorial-target' : ''}`} /></div>
              </div>
            </div>
          ) : null}

          <div className="modal-footer -mx-4 -mb-4 mt-6 flex justify-end gap-3 sm:-mx-6 sm:-mb-6">
            <button type="button" onClick={handleSectionCancel} className={`rounded-xl px-6 py-2.5 ${appButtonMutedClass}`}>
              Cancel
            </button>
            <button type="submit" className={`rounded-xl px-6 py-2.5 font-medium ${appButtonPrimaryClass}`}>
              {isEditing ? `Save ${activeSectionLabel}` : 'Save section'}
            </button>
          </div>
        </form>
        {pendingSectionChange || isPendingClose ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4">
            <div className={`w-full max-w-md rounded-[24px] border p-5 shadow-2xl ${appBorderClass} ${appPanelClass}`}>
              <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Unsaved changes</h3>
              <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                You have unsaved changes in {activeSectionLabel}. Save this section before you continue, or discard just this section's edits.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeUnsavedChangesPrompt} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass}`}>
                  Keep editing
                </button>
                <button type="button" onClick={handleDiscardAndContinue} className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} text-rose-300`}>
                  Discard changes
                </button>
                <button type="button" onClick={handleConfirmSaveAndContinue} className={`rounded-xl px-4 py-2.5 font-medium ${appButtonPrimaryClass}`}>
                  Save section
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </CompactEditModal>
  );
};
