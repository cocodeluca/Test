import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Home, Wallet } from 'lucide-react';
import type { Property } from '../../../common/types';
import { createManualProperty } from '../../../common/utils/manualProperty';
import { useSettings } from '../context/SettingsContext';
import { CompactEditModal } from './CompactEditModal';
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

interface BasicModeSetupWizardProps {
  onClose: () => void;
  onFinish: (property: Property | null) => void;
}

type WizardStep = 'welcome' | 'property' | 'rent' | 'expenses' | 'finish';

export const BasicModeSetupWizard: React.FC<BasicModeSetupWizardProps> = ({
  onClose,
  onFinish,
}) => {
  const { t } = useSettings();
  const [step, setStep] = useState<WizardStep>('welcome');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [propertyValue, setPropertyValue] = useState(0);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const steps: WizardStep[] = ['welcome', 'property', 'rent', 'expenses', 'finish'];
  const currentStepIndex = steps.indexOf(step);
  const canGoBack = currentStepIndex > 0;

  const nextStep = () => {
    const nextIndex = Math.min(currentStepIndex + 1, steps.length - 1);
    setStep(steps[nextIndex]);
  };

  const previousStep = () => {
    const previousIndex = Math.max(currentStepIndex - 1, 0);
    setStep(steps[previousIndex]);
  };

  const handleSave = () => {
    try {
      onFinish(createManualProperty({
        operatingCurrency: 'EUR',
        propertyValueCurrency: 'EUR',
        name,
        address,
        city,
        country: 'Spain',
        propertyType: 'Apartment',
        estimatedPropertyValue: propertyValue,
        monthlyRent,
        monthlyExpenses,
        monthlyInsurance: 0,
        monthlyTaxes: 0,
        notes: '',
      }));
      setValidationError(null);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Invalid property financial values'
      );
    }
  };

  const helperTextClass = `mt-2 text-sm leading-6 ${appTextMutedClass}`;
  const labelClass = `mb-2 block text-sm font-medium ${appTextStrongClass}`;

  const stepLabels: Record<WizardStep, string> = {
    welcome: t('basicModeSetupWizard.welcome'),
    property: t('basicModeSetupWizard.property'),
    rent: t('basicModeSetupWizard.rent'),
    expenses: t('basicModeSetupWizard.expenses'),
    finish: t('basicModeSetupWizard.finish'),
  };

  return (
    <CompactEditModal
      eyebrow={t('basicModeSetupWizard.eyebrow')}
      title={t('basicModeSetupWizard.title')}
      subtitle={t('basicModeSetupWizard.subtitle')}
      onClose={onClose}
      sectionWidthClassName="sm:max-w-2xl"
      fullWidthClassName="sm:max-w-2xl"
    >
      <div className="space-y-5 p-4 sm:p-6">
        {validationError ? (
          <p className="rounded-xl border border-rose-300/60 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            {validationError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {steps.map((item, index) => (
            <span
              key={item}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                index === currentStepIndex
                  ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                  : `${appButtonMutedClass} ${appTextMutedClass}`
              }`}
            >
              {stepLabels[item]}
            </span>
          ))}
        </div>

        {step === 'welcome' ? (
          <section className={`${appPanelInsetClass} rounded-[26px] p-5`}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-cyan-300/40 bg-cyan-500/10 p-2 text-cyan-600 dark:border-cyan-500/25 dark:text-cyan-300">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <p className={`text-lg font-semibold ${appTextStrongClass}`}>
                  {t('basicModeSetupWizard.welcome_section')}
                </p>
                <p className={helperTextClass}>{t('basicModeSetupWizard.welcomeDescription')}</p>
              </div>
            </div>
          </section>
        ) : null}

        {step === 'property' ? (
          <section className={`${appPanelInsetClass} rounded-[26px] p-5`}>
            <p className={`text-lg font-semibold ${appTextStrongClass}`}>
              {t('basicModeSetupWizard.addPropertyPrompt')}
            </p>
            <p className={helperTextClass}>{t('basicModeSetupWizard.addPropertyDescription')}</p>
            <div className="mt-5 grid gap-4">
              <div>
                <label className={labelClass}>{t('basicModeSetupWizard.propertyNameLabel')}</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={appInputClass}
                />
                <p className={helperTextClass}>{t('basicModeSetupWizard.propertyNameHint')}</p>
              </div>
              <div>
                <label className={labelClass}>{t('basicModeSetupWizard.addressLabel')}</label>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className={appInputClass}
                />
                <p className={helperTextClass}>{t('basicModeSetupWizard.addressHint')}</p>
              </div>
              <div>
                <label className={labelClass}>{t('basicModeSetupWizard.cityLabel')}</label>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className={appInputClass}
                />
                <p className={helperTextClass}>{t('basicModeSetupWizard.cityHint')}</p>
              </div>
              <div>
                <label className={labelClass}>{t('basicModeSetupWizard.propertyValueLabel')}</label>
                <input
                  type="number"
                  min="0.01"
                  value={propertyValue || ''}
                  onChange={(event) => setPropertyValue(Number(event.target.value) || 0)}
                  className={appInputClass}
                />
                <p className={helperTextClass}>{t('basicModeSetupWizard.propertyValueHint')}</p>
              </div>
            </div>
          </section>
        ) : null}

        {step === 'rent' ? (
          <section className={`${appPanelInsetClass} rounded-[26px] p-5`}>
            <p className={`text-lg font-semibold ${appTextStrongClass}`}>
              {t('basicModeSetupWizard.addRentPrompt')}
            </p>
            <p className={helperTextClass}>{t('basicModeSetupWizard.addRentDescription')}</p>
            <div className="mt-5">
              <label className={labelClass}>{t('basicModeSetupWizard.monthlyRentLabel')}</label>
              <input
                type="number"
                min="0"
                value={monthlyRent || ''}
                onChange={(event) => setMonthlyRent(Number(event.target.value) || 0)}
                className={appInputClass}
              />
              <p className={helperTextClass}>{t('basicModeSetupWizard.monthlyRentHint')}</p>
            </div>
          </section>
        ) : null}

        {step === 'expenses' ? (
          <section className={`${appPanelInsetClass} rounded-[26px] p-5`}>
            <p className={`text-lg font-semibold ${appTextStrongClass}`}>
              {t('basicModeSetupWizard.addExpensesPrompt')}
            </p>
            <p className={helperTextClass}>{t('basicModeSetupWizard.addExpensesDescription')}</p>
            <div className="mt-5">
              <label className={labelClass}>{t('basicModeSetupWizard.monthlyExpensesLabel')}</label>
              <input
                type="number"
                min="0"
                value={monthlyExpenses || ''}
                onChange={(event) => setMonthlyExpenses(Number(event.target.value) || 0)}
                className={appInputClass}
              />
              <p className={helperTextClass}>{t('basicModeSetupWizard.monthlyExpensesHint')}</p>
            </div>
          </section>
        ) : null}

        {step === 'finish' ? (
          <section className={`${appPanelInsetClass} rounded-[26px] p-5`}>
            <p className={`text-lg font-semibold ${appTextStrongClass}`}>
              {t('basicModeSetupWizard.finishPrompt')}
            </p>
            <p className={helperTextClass}>{t('basicModeSetupWizard.finishDescription')}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className={`${appPanelClass} rounded-2xl p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('basicModeSetupWizard.cardPropertyValue')}
                </p>
                <p className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{propertyValue}</p>
              </div>
              <div className={`${appPanelClass} rounded-2xl p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('basicModeSetupWizard.cardMonthlyRent')}
                </p>
                <p className={`mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300`}>
                  {monthlyRent}
                </p>
              </div>
              <div className={`${appPanelClass} rounded-2xl p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('basicModeSetupWizard.cardMonthlyExpenses')}
                </p>
                <p className={`mt-2 text-lg font-semibold text-amber-700 dark:text-amber-300`}>
                  {monthlyExpenses}
                </p>
              </div>
              <div className={`${appPanelClass} rounded-2xl p-4`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  {t('basicModeSetupWizard.cardNetMonthly')}
                </p>
                <p
                  className={`mt-2 text-lg font-semibold ${
                    monthlyRent - monthlyExpenses >= 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {monthlyRent - monthlyExpenses}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onFinish(null)}
              className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}
            >
              {t('basicModeSetupWizard.skipButton')}
            </button>
            {step === 'rent' || step === 'expenses' ? (
              <button
                type="button"
                onClick={nextStep}
                className={`rounded-xl px-4 py-2.5 ${appButtonMutedClass} ${appTextMutedClass}`}
              >
                {t('basicModeSetupWizard.skipLabel')}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={previousStep}
              disabled={!canGoBack}
              className={`rounded-xl px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60 ${appButtonMutedClass} ${appTextMutedClass}`}
            >
              <span className="inline-flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                {t('basicModeSetupWizard.backButton')}
              </span>
            </button>
            {step === 'finish' ? (
              <button
                type="button"
                onClick={handleSave}
                className={`rounded-xl px-5 py-2.5 ${appButtonPrimaryClass}`}
              >
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  {t('basicModeSetupWizard.saveButton')}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                className={`rounded-xl px-5 py-2.5 ${appButtonPrimaryClass}`}
              >
                <span className="inline-flex items-center gap-2">
                  {t('basicModeSetupWizard.nextButton')}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </CompactEditModal>
  );
};
