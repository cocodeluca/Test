import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Home, X } from 'lucide-react';
import type { Property } from '../../../common/types';
import { createManualProperty, type ManualPropertyInput } from '../../../common/utils/manualProperty';
import { currencyOptions } from '../../../common/utils/currency';
import { formatLocaleNumberInput, getLocalizedCurrencyLabel } from '../../../common/utils/formatting';
import { defaultPropertyType, propertyTypeValues } from '../../../common/utils/propertyTypes';
import { useSettings } from '../context/SettingsContext';
import { LocalizedNumberInput } from './LocalizedNumberInput';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface QuickPropertyCreateModalProps {
  onClose: () => void;
  onCreateProperty: (property: Property) => void;
  onOpenAdvancedForm?: () => void;
  basicMode?: boolean;
  trackingPreference?: 'properties-only' | 'properties-and-rent' | 'properties-and-mortgages' | 'full-portfolio';
  tutorialStepOverride?: number | null;
}

const initialFormState: ManualPropertyInput = {
  operatingCurrency: 'EUR',
  propertyValueCurrency: 'EUR',
  name: '',
  address: '',
  city: '',
  country: 'Spain',
  propertyType: defaultPropertyType,
  estimatedPropertyValue: 0,
  monthlyRent: 0,
  monthlyExpenses: 0,
  monthlyInsurance: 0,
  monthlyTaxes: 0,
  notes: '',
};

const inputClass = `w-full ${appInputClass}`;

export const QuickPropertyCreateModal: React.FC<QuickPropertyCreateModalProps> = ({
  onClose,
  onCreateProperty,
  onOpenAdvancedForm,
  basicMode = false,
  trackingPreference = 'full-portfolio',
  tutorialStepOverride = null,
}) => {
  const { settings, t } = useSettings();
  const localizedDefaultCountry = useMemo(() => {
    if (settings.language === 'es') {
      return 'España';
    }

    if (settings.language === 'pt') {
      return 'Espanha';
    }

    return 'Spain';
  }, [settings.language]);
  const [form, setForm] = useState<ManualPropertyInput>(() => ({
    ...initialFormState,
    country: localizedDefaultCountry,
  }));
  const [step, setStep] = useState(1);
  const hasMortgageStep =
    trackingPreference === 'properties-and-mortgages' || trackingPreference === 'full-portfolio';
  const totalSteps = hasMortgageStep ? 5 : 4;
  const monthlyTotalExpenses = form.monthlyExpenses + form.monthlyInsurance + form.monthlyTaxes;
  const netMonthlyResult = form.monthlyRent - monthlyTotalExpenses;
  const propertyValue = form.estimatedPropertyValue;
  const nextStep = () => setStep((current) => Math.min(current + 1, totalSteps));
  const previousStep = () => setStep((current) => Math.max(current - 1, 1));

  const handleChange = <K extends keyof ManualPropertyInput>(key: K, value: ManualPropertyInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    setForm((current) => {
      if (!current.country || ['Spain', 'España', 'Espanha'].includes(current.country)) {
        return { ...current, country: localizedDefaultCountry };
      }

      return current;
    });
  }, [localizedDefaultCountry]);

  useEffect(() => {
    if (tutorialStepOverride === null) {
      return;
    }

    setStep(Math.max(1, Math.min(tutorialStepOverride, totalSteps)));
  }, [totalSteps, tutorialStepOverride]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onCreateProperty(createManualProperty(form));
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-slate-950/56 px-4 py-6 backdrop-blur-sm">
      <div className={`mx-auto max-w-3xl ${appPanelClass} rounded-[28px] p-6 sm:p-7`}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] pb-6">
          <div>
            <h2 className={`mt-3 text-[2rem] font-semibold tracking-[-0.04em] ${appTextStrongClass}`}>
              {basicMode ? t('quickProperty.basicTitle') : t('quickProperty.advancedTitle')}
            </h2>
            <p className={`mt-3 max-w-2xl text-sm leading-7 ${appTextMutedClass}`}>
              {basicMode
                ? t('quickProperty.basicDescription')
                : t('quickProperty.advancedDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${appButtonMutedClass} ${appTextStrongClass}`}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="mt-7 space-y-6" onSubmit={handleSubmit}>
          {basicMode ? (
            <div className="flex flex-wrap gap-2.5">
              {Array.from({ length: totalSteps }, (_, index) => index + 1).map((stepNumber) => (
                <span
                  key={stepNumber}
                  className={`rounded-xl border px-4 py-2 text-[12px] font-medium transition ${
                    step === stepNumber
                      ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)] text-[var(--app-text-strong)]'
                      : `${appButtonMutedClass} ${appTextMutedClass}`
                  }`}
                >
                  {stepNumber === 1
                    ? t('quickProperty.stepProperty')
                    : stepNumber === 2
                    ? t('quickProperty.stepRent')
                    : stepNumber === 3
                    ? t('quickProperty.stepExpenses')
                    : hasMortgageStep && stepNumber === 4
                    ? t('quickProperty.stepMortgage')
                    : t('quickProperty.stepReview')}
                </span>
              ))}
            </div>
          ) : null}

          {!basicMode || step === 1 ? (
          <section className={`${appPanelInsetClass} rounded-[28px] p-6`}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-inset)] p-2.5 text-[var(--app-text-strong)]">
                <Home className="h-4 w-4" />
              </div>
              <div>
                <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{t('quickProperty.propertyBasicsTitle')}</p>
                <p className={`mt-2 text-sm leading-7 ${appTextMutedClass}`}>
                  {basicMode
                    ? t('quickProperty.propertyBasicsBasicBody')
                    : t('quickProperty.propertyBasicsAdvancedBody')}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.propertyValueCurrency')}</label>
                <select
                  value={form.propertyValueCurrency}
                  onChange={(event) => handleChange('propertyValueCurrency', event.target.value as ManualPropertyInput['propertyValueCurrency'])}
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {getLocalizedCurrencyLabel(currency.code)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.operatingCurrency')}</label>
                <select
                  value={form.operatingCurrency}
                  onChange={(event) => handleChange('operatingCurrency', event.target.value as ManualPropertyInput['operatingCurrency'])}
                  className={inputClass}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {getLocalizedCurrencyLabel(currency.code)}
                    </option>
                  ))}
                </select>
                <p className={`mt-2 text-xs leading-5 ${appTextSoftClass}`}>{t('quickProperty.operatingCurrencyHelp')}</p>
              </div>
              <div className="md:col-span-2">
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.propertyName')}</label>
                <input
                  data-tutorial-id="form-property-name"
                  value={form.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                  placeholder={t('quickProperty.propertyNamePlaceholder')}
                  className={inputClass}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.address')}</label>
                <input
                  value={form.address}
                  onChange={(event) => handleChange('address', event.target.value)}
                  placeholder={t('quickProperty.addressPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.city')}</label>
                <input
                  value={form.city}
                  onChange={(event) => handleChange('city', event.target.value)}
                  placeholder={t('quickProperty.cityPlaceholder')}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.country')}</label>
                <input
                  value={form.country}
                  onChange={(event) => handleChange('country', event.target.value)}
                  placeholder={t('quickProperty.countryPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.propertyType')}</label>
                <select
                  value={form.propertyType}
                  onChange={(event) => handleChange('propertyType', event.target.value)}
                  className={inputClass}
                >
                  {propertyTypeValues.map((propertyType) => (
                    <option key={propertyType} value={propertyType}>
                      {t(`properties.form.propertyTypeOptions.${propertyType}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.estimatedPropertyValue')}</label>
                <LocalizedNumberInput
                  min={0}
                  step={1000}
                  value={form.estimatedPropertyValue}
                  onValueChange={(value) => handleChange('estimatedPropertyValue', value ?? 0)}
                  placeholder={t('quickProperty.estimatedPropertyValuePlaceholder')}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </section>
          ) : null}

          {!basicMode || step === 2 ? (
          <section className={`${appPanelInsetClass} rounded-[28px] p-6`}>
            <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{t('quickProperty.monthlyCashflowTitle')}</p>
            <p className={`mt-2 text-sm leading-7 ${appTextMutedClass}`}>
              {basicMode
                ? t('quickProperty.monthlyCashflowBasicBody')
                : t('quickProperty.monthlyCashflowAdvancedBody')}
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{basicMode ? t('quickProperty.monthlyIncome') : t('quickProperty.monthlyRent')}</label>
                <LocalizedNumberInput
                  data-tutorial-id="form-monthly-rent"
                  min={0}
                  step={10}
                  value={form.monthlyRent}
                  onValueChange={(value) => handleChange('monthlyRent', value ?? 0)}
                  placeholder={t('quickProperty.monthlyRentPlaceholder')}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
          ) : null}

          {!basicMode || step === 3 ? (
          <section className={`${appPanelInsetClass} rounded-[28px] p-6`}>
            <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{basicMode ? t('quickProperty.expensesTitle') : t('quickProperty.monthlyCashflowTitle')}</p>
            <p className={`mt-2 text-sm leading-7 ${appTextMutedClass}`}>
              {basicMode
                ? t('quickProperty.expensesBasicBody')
                : t('quickProperty.expensesAdvancedBody')}
            </p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.monthlyExpenses')}</label>
                <LocalizedNumberInput
                  data-tutorial-id="form-monthly-expenses"
                  min={0}
                  step={10}
                  value={form.monthlyExpenses}
                  onValueChange={(value) => handleChange('monthlyExpenses', value ?? 0)}
                  placeholder={t('quickProperty.monthlyExpensesPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{basicMode ? t('quickProperty.insuranceOptional') : t('quickProperty.insurance')}</label>
                <LocalizedNumberInput
                  min={0}
                  step={10}
                  value={form.monthlyInsurance}
                  onValueChange={(value) => handleChange('monthlyInsurance', value ?? 0)}
                  placeholder={t('quickProperty.insurancePlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{basicMode ? t('quickProperty.taxesOptional') : t('quickProperty.taxes')}</label>
                <LocalizedNumberInput
                  min={0}
                  step={10}
                  value={form.monthlyTaxes}
                  onValueChange={(value) => handleChange('monthlyTaxes', value ?? 0)}
                  placeholder={t('quickProperty.taxesPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={`mb-2 block text-sm font-medium ${appTextMutedClass}`}>{t('quickProperty.notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => handleChange('notes', event.target.value)}
                  placeholder={t('quickProperty.notesPlaceholder')}
                  rows={4}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </section>
          ) : null}

          {basicMode && hasMortgageStep && step === 4 ? (
          <section data-tutorial-id="form-live-results" className={`${appPanelInsetClass} rounded-[28px] p-6`}>
            <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{t('quickProperty.optionalMortgageTitle')}</p>
            <p className={`mt-2 text-sm leading-7 ${appTextMutedClass}`}>
              {t('quickProperty.optionalMortgageBody')}
            </p>
            <div className="mt-5 rounded-[22px] border border-dashed border-[var(--app-border)] bg-white/70 p-4">
              <p className={`text-sm ${appTextMutedClass}`}>
                {t('quickProperty.optionalMortgageHelp')}
              </p>
            </div>
          </section>
          ) : null}

          {basicMode && step === totalSteps ? (
          <section className={`${appPanelInsetClass} rounded-[28px] p-6`}>
            <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{t('quickProperty.reviewTitle')}</p>
            <p className={`mt-2 text-sm leading-7 ${appTextMutedClass}`}>
              {t('quickProperty.reviewBody')}
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className={`${appPanelClass} rounded-[24px] p-5`}>
                <p className={`text-xs font-medium ${appTextSoftClass}`}>{t('quickProperty.reviewProperty')}</p>
                <p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{form.name || t('quickProperty.reviewNewProperty')}</p>
                <p className={`mt-1 text-sm ${appTextMutedClass}`}>{form.address || t('quickProperty.reviewAddressLater')}</p>
              </div>
              <div className={`${appPanelClass} rounded-[24px] p-5`}>
                <p className={`text-xs font-medium ${appTextSoftClass}`}>{t('quickProperty.reviewPropertyValue')}</p>
                <p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{formatLocaleNumberInput(propertyValue)}</p>
              </div>
              <div className={`${appPanelClass} rounded-[24px] p-5`}>
                <p className={`text-xs font-medium ${appTextSoftClass}`}>{t('quickProperty.reviewMonthlyIncome')}</p>
                <p className={`mt-2 text-base font-semibold ${appTextStrongClass}`}>{formatLocaleNumberInput(form.monthlyRent)}</p>
              </div>
              <div className={`${appPanelClass} rounded-[24px] p-5`}>
                <p className={`text-xs font-medium ${appTextSoftClass}`}>{t('quickProperty.reviewNetMonthlyResult')}</p>
                <p className={`mt-2 text-base font-semibold ${netMonthlyResult >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{formatLocaleNumberInput(netMonthlyResult)}</p>
              </div>
            </div>
          </section>
          ) : null}

          <div className="-mx-6 -mb-6 mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-transparent px-6 py-5 sm:-mx-7 sm:-mb-7 sm:px-7">
            <div className="flex flex-wrap gap-2">
              {onOpenAdvancedForm ? (
                <button
                  type="button"
                  onClick={onOpenAdvancedForm}
                  className={`rounded-2xl px-4 py-2.5 text-sm ${appButtonMutedClass} ${appTextMutedClass}`}
                >
                  {t('common.openAdvancedForm')}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {basicMode ? (
                <button
                  type="button"
                  onClick={previousStep}
                  disabled={step === 1}
                  className={`rounded-2xl px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${appButtonMutedClass} ${appTextMutedClass}`}
                >
                  <span className="inline-flex items-center gap-2"><ChevronLeft className="h-4 w-4" />{t('common.back')}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className={`rounded-2xl px-4 py-2.5 text-sm ${appButtonMutedClass} ${appTextMutedClass}`}
              >
                {t('quickProperty.cancel')}
              </button>
              {basicMode && step < totalSteps ? (
                <button type="button" onClick={nextStep} className={`rounded-2xl px-5 py-2.5 text-sm ${appButtonPrimaryClass}`}>
                  <span className="inline-flex items-center gap-2">{t('quickProperty.next')}<ChevronRight className="h-4 w-4" /></span>
                </button>
              ) : (
                <button type="submit" className={`rounded-2xl px-5 py-2.5 text-sm ${appButtonPrimaryClass}`}>
                  {t('quickProperty.createProperty')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
