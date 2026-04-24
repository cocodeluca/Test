import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Mortgage, MortgageBonification, Property } from '../../../common/types';
import {
  calculateCurrentRate,
  calculateMortgageBonificationSummary,
  calculateMonthlyPayment,
  mergeMortgageBonifications,
} from '../../../common/utils/calculations';
import { currencyOptions } from '../../../common/utils/currency';
import { formatCurrency, formatPercentage, getLocalizedCurrencyLabel } from '../../../common/utils/formatting';
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

interface MortgageFormProps {
  properties: Property[];
  onAddMortgage: (mortgage: Mortgage) => void;
  onEditMortgage?: (mortgage: Mortgage) => void;
  onClose: () => void;
  isEditing?: boolean;
  editingMortgage?: Mortgage | null;
  initialSection?: string | null;
}

type MortgageEditorSection =
  | 'property'
  | 'lender'
  | 'loan'
  | 'rate'
  | 'bonifications'
  | 'notes';

const normalizeMortgageEditorSection = (
  section: string | null | undefined
): MortgageEditorSection => {
  switch (section) {
    case 'property':
    case 'lender':
    case 'loan':
    case 'rate':
    case 'bonifications':
    case 'notes':
      return section;
    default:
      return 'loan';
  }
};

const createBlankBonification = (index: number): MortgageBonification => ({
  key: `bonification_${Date.now()}_${index}`,
  label: '',
  active: false,
  available: true,
  bonusPoints: 0,
  status: 'inactive',
  notes: '',
});

export const MortgageForm: React.FC<MortgageFormProps> = ({
  properties,
  onAddMortgage,
  onEditMortgage,
  onClose,
  isEditing = false,
  editingMortgage = null,
  initialSection = null,
}) => {
  const { t } = useSettings();
  const [formData, setFormData] = useState<Omit<Mortgage, 'id'>>({
    propertyId: properties[0]?.id || '',
    currency: properties[0]?.currency ?? 'EUR',
    lenderName: '',
    originalLoanAmount: 0,
    currentBalance: 0,
    interestRate: 0,
    mortgageTermYears: 0,
    monthlyMortgagePayment: 0,
    mortgageStartDate: new Date().toISOString().split('T')[0],
    fixedOrVariable: 'fixed',
    mortgageType: 'Fixed',
    initialInterestRate: null,
    baseInterestRate: null,
    currentInterestRate: null,
    maxBonifiedRate: null,
    maxTotalBonificationPoints: null,
    openingFees: null,
    valuationFee: null,
    brokerFee: null,
    insuranceRequirements: null,
    payrollBonificationConditions: null,
    rateNotes: '',
    availableBonifications: [],
    activeBonifications: [],
    notes: '',
  });
  const [bonifications, setBonifications] = useState<MortgageBonification[]>([]);
  const [editorMode, setEditorMode] = useState<'section' | 'full'>(isEditing ? 'section' : 'full');
  const [activeSection, setActiveSection] = useState<MortgageEditorSection>(
    normalizeMortgageEditorSection(initialSection)
  );

  useEffect(() => {
    setEditorMode(isEditing ? 'section' : 'full');
    setActiveSection(normalizeMortgageEditorSection(initialSection));
  }, [initialSection, isEditing]);

  useEffect(() => {
    if (isEditing && editingMortgage) {
      setFormData({
        propertyId: editingMortgage.propertyId,
        currency:
          editingMortgage.currency ??
          properties.find((property) => property.id === editingMortgage.propertyId)?.currency ??
          'EUR',
        lenderName: editingMortgage.lenderName,
        originalLoanAmount: editingMortgage.originalLoanAmount,
        currentBalance: editingMortgage.currentBalance,
        interestRate: editingMortgage.interestRate,
        mortgageTermYears: editingMortgage.mortgageTermYears,
        monthlyMortgagePayment: editingMortgage.monthlyMortgagePayment,
        mortgageStartDate: editingMortgage.mortgageStartDate,
        fixedOrVariable: editingMortgage.fixedOrVariable,
        mortgageType: editingMortgage.mortgageType,
        initialInterestRate: editingMortgage.initialInterestRate,
        baseInterestRate: editingMortgage.baseInterestRate,
        currentInterestRate: editingMortgage.currentInterestRate,
        maxBonifiedRate: editingMortgage.maxBonifiedRate,
        maxTotalBonificationPoints: editingMortgage.maxTotalBonificationPoints,
        openingFees: editingMortgage.openingFees ?? null,
        valuationFee: editingMortgage.valuationFee ?? null,
        brokerFee: editingMortgage.brokerFee ?? null,
        insuranceRequirements: editingMortgage.insuranceRequirements ?? null,
        payrollBonificationConditions: editingMortgage.payrollBonificationConditions ?? null,
        rateNotes: editingMortgage.rateNotes,
        availableBonifications: editingMortgage.availableBonifications,
        activeBonifications: editingMortgage.activeBonifications,
        notes: editingMortgage.notes,
      });
      setBonifications(mergeMortgageBonifications(editingMortgage));
      return;
    }

    setFormData({
      propertyId: properties[0]?.id || '',
      currency: properties[0]?.currency ?? 'EUR',
      lenderName: '',
      originalLoanAmount: 0,
      currentBalance: 0,
      interestRate: 0,
      mortgageTermYears: 0,
      monthlyMortgagePayment: 0,
      mortgageStartDate: new Date().toISOString().split('T')[0],
      fixedOrVariable: 'fixed',
      mortgageType: 'Fixed',
      initialInterestRate: null,
      baseInterestRate: null,
      currentInterestRate: null,
      maxBonifiedRate: null,
      maxTotalBonificationPoints: null,
      openingFees: null,
      valuationFee: null,
      brokerFee: null,
      insuranceRequirements: null,
      payrollBonificationConditions: null,
      rateNotes: '',
      availableBonifications: [],
      activeBonifications: [],
      notes: '',
    });
    setBonifications([]);
  }, [editingMortgage, isEditing, properties]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === formData.propertyId),
    [formData.propertyId, properties]
  );

  useEffect(() => {
    if (!selectedProperty) {
      return;
    }

    setFormData((currentFormData) =>
      currentFormData.currency === selectedProperty.currency
        ? currentFormData
        : {
            ...currentFormData,
            currency: selectedProperty.currency,
          }
    );
  }, [selectedProperty]);

  const previewMortgage = useMemo<Mortgage>(
    () => ({
      ...formData,
      id: editingMortgage?.id ?? 'preview-mortgage',
      availableBonifications: bonifications
        .filter((item) => item.available)
        .map((item) => ({
          ...item,
          active: item.active,
          status: item.active ? 'active' : 'inactive',
          notes: item.notes || null,
        })),
      activeBonifications: bonifications
        .filter((item) => item.active)
        .map((item) => ({
          ...item,
          active: true,
          available: true,
          status: 'active',
          notes: item.notes || null,
        })),
    }),
    [bonifications, editingMortgage?.id, formData]
  );

  const previewCurrentRate = calculateCurrentRate(previewMortgage);
  const previewMonthlyPayment = calculateMonthlyPayment(previewMortgage);
  const bonificationSummary = calculateMortgageBonificationSummary(previewMortgage);
  const sectionItems = [
    { id: 'property', label: 'Property' },
    { id: 'lender', label: 'Lender' },
    { id: 'loan', label: 'Loan Terms' },
    { id: 'rate', label: 'Rate' },
    { id: 'bonifications', label: 'Bonifications' },
    { id: 'notes', label: 'Notes' },
  ] as Array<{ id: MortgageEditorSection; label: string }>;
  const showSection = (sectionId: MortgageEditorSection) =>
    editorMode === 'full' || activeSection === sectionId;

  const handleStringChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  };

  const handleNumberChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    nullable = false
  ) => {
    const { name, value } = event.target;
    const parsedValue = value === '' && nullable ? null : Number(value);

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: Number.isNaN(parsedValue) ? (nullable ? null : 0) : parsedValue,
    }));
  };

  const updateBonification = (
    index: number,
    updates: Partial<MortgageBonification>
  ) => {
    setBonifications((currentBonifications) =>
      currentBonifications.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const nextItem = {
          ...item,
          ...updates,
        };

        if (updates.available === false) {
          nextItem.active = false;
        }

        if (updates.active === true) {
          nextItem.available = true;
        }

        nextItem.status = nextItem.active
          ? 'active'
          : nextItem.available
          ? 'inactive'
          : 'unknown';

        return nextItem;
      })
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedBonifications: MortgageBonification[] = bonifications.map((item) => ({
      ...item,
      label: item.label.trim() || item.key,
      notes: item.notes?.trim() ? item.notes.trim() : null,
      active: item.active,
      available: item.active ? true : item.available,
      status: item.active ? 'active' : item.available ? 'inactive' : 'unknown',
    }));

    const mortgagePayload: Mortgage = {
      ...(editingMortgage ?? {}),
      ...formData,
      id: editingMortgage?.id ?? `mort${Date.now()}`,
      lenderName: formData.lenderName.trim(),
      mortgageType: formData.mortgageType.trim() || 'Fixed',
      rateNotes: formData.rateNotes.trim(),
      notes: formData.notes.trim(),
      availableBonifications: normalizedBonifications.filter((item) => item.available),
      activeBonifications: normalizedBonifications.filter((item) => item.active),
    };

    if (isEditing && editingMortgage && onEditMortgage) {
      onEditMortgage(mortgagePayload);
      return;
    }

    onAddMortgage(mortgagePayload);
  };

  const panelClass = `${appPanelInsetClass} rounded-3xl p-5`;
  const inputClass = appInputClass;
  const labelClass = `mb-2 block text-xs font-semibold uppercase tracking-[0.18em] ${appTextMutedClass}`;

  return (
    <CompactEditModal
      eyebrow={selectedProperty ? selectedProperty.name : t('mortgages.form.propertyInformation')}
      title={isEditing ? t('mortgages.form.editTitle') : t('mortgages.form.addTitle')}
      subtitle={
        editorMode === 'section'
          ? t('mortgages.form.editSectionSubtitle')
          : t('mortgages.form.fullEditSubtitle')
      }
      onClose={onClose}
      sections={sectionItems}
      activeSection={activeSection}
      onSectionChange={(sectionId) => setActiveSection(sectionId as MortgageEditorSection)}
      mode={editorMode}
      onModeChange={setEditorMode}
      sectionWidthClassName="sm:max-w-3xl"
      fullWidthClassName="sm:max-w-5xl"
      sectionsAreLocked={initialSection !== null && initialSection !== undefined && editorMode === 'section'}
      aside={
        <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
          <div className={`rounded-3xl p-5 ${appPanelInsetClass}`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-teal-500/15 p-2 text-teal-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/80">
                  {t('mortgages.form.liveRatePreview')}
                </p>
                <h3 className={`mt-1 text-lg font-semibold ${appTextStrongClass}`}>
                  {selectedProperty?.name ?? t('mortgages.form.editTitle')}
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <div className={`rounded-2xl p-4 ${appPanelInsetClass}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('mortgages.card.currentRate')}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>
                  {previewCurrentRate !== null
                    ? formatPercentage(previewCurrentRate, 2)
                    : t('common.notSpecified')}
                </p>
              </div>
              <div className={`rounded-2xl p-4 ${appPanelInsetClass}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('mortgages.form.projectedPayment')}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>
                  {previewMonthlyPayment !== null
                    ? formatCurrency(previewMonthlyPayment, formData.currency)
                    : t('common.notSpecified')}
                </p>
              </div>
            </div>
          </div>

          <div className={`rounded-3xl p-5 ${appPanelInsetClass}`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
              {t('mortgages.card.knownActiveBonification')}
            </p>
            <p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>
              {bonificationSummary.knownActiveBonificationPoints.toFixed(2)} {t('mortgages.card.pointsSuffix')}
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className={appTextMutedClass}>{t('mortgages.card.activeBonifications')}</span>
                <span className="font-medium text-teal-300">
                  {bonificationSummary.activeBonifications.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={appTextMutedClass}>{t('mortgages.card.availableBonifications')}</span>
                <span className="font-medium text-amber-300">
                  {bonificationSummary.availableBonifications.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={appTextMutedClass}>{t('mortgages.form.property')}</span>
                <span className={`font-medium ${appTextStrongClass}`}>
                  {selectedProperty?.city ?? t('common.notSpecified')}
                </span>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-6">
        <div className="space-y-5 sm:space-y-6">
            {showSection('property') ? (
            <section className={panelClass}>
              <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${appTextStrongClass}`}>
                {t('mortgages.form.propertyInformation')}
              </h3>
              <div className="mt-4">
                <label htmlFor="propertyId" className={labelClass}>
                  {t('mortgages.form.property')}
                </label>
                {properties.length === 0 ? (
                  <p className="text-sm text-rose-600 dark:text-rose-400">{t('mortgages.addPropertyFirst')}</p>
                ) : (
                  <select
                    id="propertyId"
                    name="propertyId"
                    value={formData.propertyId}
                    onChange={handleStringChange}
                    required
                    className={inputClass}
                  >
                    <option value="">{t('mortgages.form.selectProperty')}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} - {property.address}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mt-4">
                <label htmlFor="currency" className={labelClass}>Currency</label>
                <select
                  id="currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleStringChange}
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {getLocalizedCurrencyLabel(currency.code)}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            ) : null}

            {showSection('lender') ? (
            <section className={panelClass}>
              <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${appTextStrongClass}`}>
                {t('mortgages.form.lenderInformation')}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="lenderName" className={labelClass}>
                    {t('mortgages.form.lenderName')}
                  </label>
                  <input
                    id="lenderName"
                    name="lenderName"
                    value={formData.lenderName}
                    onChange={handleStringChange}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="mortgageType" className={labelClass}>
                    {t('mortgages.card.type')}
                  </label>
                  <input
                    id="mortgageType"
                    name="mortgageType"
                    value={formData.mortgageType}
                    onChange={handleStringChange}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>
            ) : null}

            {showSection('loan') ? (
            <section className={panelClass}>
              <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${appTextStrongClass}`}>
                {t('mortgages.form.loanInformation')}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="originalLoanAmount" className={labelClass}>
                    {t('mortgages.form.originalLoanAmount')}
                  </label>
                  <input
                    type="number"
                    id="originalLoanAmount"
                    name="originalLoanAmount"
                    value={formData.originalLoanAmount}
                    onChange={(event) => handleNumberChange(event)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="currentBalance" className={labelClass}>
                    {t('mortgages.form.currentBalance')}
                  </label>
                  <input
                    type="number"
                    id="currentBalance"
                    name="currentBalance"
                    value={formData.currentBalance}
                    onChange={(event) => handleNumberChange(event)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="mortgageStartDate" className={labelClass}>
                    {t('mortgages.form.mortgageStartDate')}
                  </label>
                  <input
                    type="date"
                    id="mortgageStartDate"
                    name="mortgageStartDate"
                    value={formData.mortgageStartDate}
                    onChange={handleStringChange}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="mortgageTermYears" className={labelClass}>
                    {t('mortgages.form.mortgageTermYears')}
                  </label>
                  <input
                    type="number"
                    id="mortgageTermYears"
                    name="mortgageTermYears"
                    value={formData.mortgageTermYears}
                    onChange={(event) => handleNumberChange(event)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>
            ) : null}

            {showSection('rate') ? (
            <section className={panelClass}>
              <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${appTextStrongClass}`}>
                {t('mortgages.form.interestAndPayment')}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="fixedOrVariable" className={labelClass}>
                    {t('mortgages.form.typeOfRate')}
                  </label>
                  <select
                    id="fixedOrVariable"
                    name="fixedOrVariable"
                    value={formData.fixedOrVariable}
                    onChange={handleStringChange}
                    className={inputClass}
                  >
                    <option value="fixed">{t('mortgages.form.fixedRate')}</option>
                    <option value="variable">{t('mortgages.form.variableRate')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="interestRate" className={labelClass}>
                    {t('mortgages.form.interestRate')}
                  </label>
                  <input
                    type="number"
                    id="interestRate"
                    name="interestRate"
                    value={formData.interestRate}
                    onChange={(event) => handleNumberChange(event)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="baseInterestRate" className={labelClass}>
                    {t('mortgages.card.baseRate')}
                  </label>
                  <input
                    type="number"
                    id="baseInterestRate"
                    name="baseInterestRate"
                    value={formData.baseInterestRate ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="initialInterestRate" className={labelClass}>
                    {t('mortgages.card.initialRate')}
                  </label>
                  <input
                    type="number"
                    id="initialInterestRate"
                    name="initialInterestRate"
                    value={formData.initialInterestRate ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="maxBonifiedRate" className={labelClass}>
                    {t('mortgages.card.maxBonifiedRate')}
                  </label>
                  <input
                    type="number"
                    id="maxBonifiedRate"
                    name="maxBonifiedRate"
                    value={formData.maxBonifiedRate ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="maxTotalBonificationPoints" className={labelClass}>
                    {t('mortgages.card.maxTotalBonification')}
                  </label>
                  <input
                    type="number"
                    id="maxTotalBonificationPoints"
                    name="maxTotalBonificationPoints"
                    value={formData.maxTotalBonificationPoints ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="monthlyMortgagePayment" className={labelClass}>
                    {t('mortgages.form.monthlyMortgagePayment')}
                  </label>
                  <input
                    type="number"
                    id="monthlyMortgagePayment"
                    name="monthlyMortgagePayment"
                    value={formData.monthlyMortgagePayment}
                    onChange={(event) => handleNumberChange(event)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>
            ) : null}

            {showSection('bonifications') ? (
            <section className={panelClass}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-[0.18em] ${appTextStrongClass}`}>
                    {t('mortgages.form.bonifications')}
                  </h3>
                  <p className={`mt-2 text-sm ${appTextMutedClass}`}>
                    {t('mortgages.form.activeToggleHelp')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBonifications((currentBonifications) => [
                      ...currentBonifications,
                      createBlankBonification(currentBonifications.length),
                    ])
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm ${appButtonMutedClass}`}
                >
                  <Plus className="h-4 w-4" />
                  {t('mortgages.form.addBonification')}
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {bonifications.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed p-5 text-sm ${appBorderClass} ${appTextMutedClass}`}>
                    {t('mortgages.form.noBonificationsConfigured')}
                  </div>
                ) : (
                  bonifications.map((item, index) => (
                    <div
                      key={`${item.key}-${index}`}
                      className={`rounded-2xl border p-4 transition ${
                        item.active
                          ? 'border-teal-500/40 bg-teal-500/10'
                          : item.available
                          ? 'border-amber-500/30 bg-amber-500/10'
                          : 'border-slate-700 bg-slate-950/70'
                      }`}
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelClass}>{t('mortgages.form.bonificationLabel')}</label>
                          <input
                            value={item.label}
                            onChange={(event) =>
                              updateBonification(index, { label: event.target.value })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>{t('mortgages.form.bonificationKey')}</label>
                          <input
                            value={item.key}
                            onChange={(event) =>
                              updateBonification(index, { key: event.target.value })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>{t('mortgages.form.bonusPoints')}</label>
                          <input
                            type="number"
                            value={item.bonusPoints ?? ''}
                            onChange={(event) =>
                              updateBonification(index, {
                                bonusPoints:
                                  event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                              })
                            }
                            step="0.01"
                            className={inputClass}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm ${appPanelInsetClass} ${appTextStrongClass}`}>
                            <span>{t('mortgages.form.available')}</span>
                            <input
                              type="checkbox"
                              checked={item.available}
                              onChange={(event) =>
                                updateBonification(index, { available: event.target.checked })
                              }
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
                            />
                          </label>
                          <label className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm ${appPanelInsetClass} ${appTextStrongClass}`}>
                            <span>{t('mortgages.form.active')}</span>
                            <input
                              type="checkbox"
                              checked={item.active}
                              onChange={(event) =>
                                updateBonification(index, { active: event.target.checked })
                              }
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
                            />
                          </label>
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelClass}>{t('mortgages.form.bonificationNotes')}</label>
                          <textarea
                            value={item.notes ?? ''}
                            onChange={(event) =>
                              updateBonification(index, { notes: event.target.value })
                            }
                            rows={2}
                            placeholder={t('mortgages.form.bonificationNotesPlaceholder')}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
            ) : null}

            {showSection('notes') ? (
            <section className={panelClass}>
              <label htmlFor="notes" className={labelClass}>
                {t('mortgages.form.notesAndTerms')}
              </label>
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="openingFees" className={labelClass}>Opening fees</label>
                  <input
                    type="number"
                    id="openingFees"
                    name="openingFees"
                    value={formData.openingFees ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="valuationFee" className={labelClass}>Valuation fee</label>
                  <input
                    type="number"
                    id="valuationFee"
                    name="valuationFee"
                    value={formData.valuationFee ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="brokerFee" className={labelClass}>Broker fee</label>
                  <input
                    type="number"
                    id="brokerFee"
                    name="brokerFee"
                    value={formData.brokerFee ?? ''}
                    onChange={(event) => handleNumberChange(event, true)}
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-3">
                  <label htmlFor="insuranceRequirements" className={labelClass}>Insurance requirements</label>
                  <textarea
                    id="insuranceRequirements"
                    name="insuranceRequirements"
                    value={formData.insuranceRequirements ?? ''}
                    onChange={handleStringChange}
                    rows={2}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-3">
                  <label htmlFor="payrollBonificationConditions" className={labelClass}>Payroll / bonification conditions</label>
                  <textarea
                    id="payrollBonificationConditions"
                    name="payrollBonificationConditions"
                    value={formData.payrollBonificationConditions ?? ''}
                    onChange={handleStringChange}
                    rows={2}
                    className={inputClass}
                  />
                </div>
              </div>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleStringChange}
                rows={5}
                placeholder={t('mortgages.form.notesPlaceholder')}
                className={inputClass}
              />
              <div className="mt-4">
                <label htmlFor="rateNotes" className={labelClass}>
                  {t('mortgages.card.rateAndBonifications')}
                </label>
                <textarea
                  id="rateNotes"
                  name="rateNotes"
                  value={formData.rateNotes}
                  onChange={handleStringChange}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </section>
            ) : null}
        </div>

        <div className={`sticky bottom-0 mt-6 flex gap-3 border-t pt-5 ${appBorderClass} ${appPanelClass}`}>
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 px-4 py-3 text-sm ${appButtonMutedClass}`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={properties.length === 0}
            className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 ${appButtonPrimaryClass}`}
          >
            {isEditing ? t('mortgages.form.updateMortgage') : t('mortgages.form.addMortgage')}
          </button>
        </div>
      </form>
    </CompactEditModal>
  );
};
