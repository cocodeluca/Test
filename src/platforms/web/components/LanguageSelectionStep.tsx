import React from 'react';
import type { AppLanguage, DisplayCurrency } from '../../../common/types/settings';
import { currencyOptions } from '../../../common/utils/currency';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface LanguageSelectionStepProps {
  currentLanguage: AppLanguage;
  currentCurrency: DisplayCurrency;
  onChangeLanguage: (language: AppLanguage) => void;
  onChangeCurrency: (currency: DisplayCurrency) => void;
  onContinue: () => void;
  title: string;
  description: string;
  helper: string;
  languageLabel: string;
  currencyLabel: string;
  continueLabel: string;
}

const languageOptions: Array<{ value: AppLanguage; nativeLabel: string }> = [
  { value: 'en', nativeLabel: 'English' },
  { value: 'es', nativeLabel: 'Español' },
  { value: 'pt', nativeLabel: 'Português' },
];

export const LanguageSelectionStep: React.FC<LanguageSelectionStepProps> = ({
  currentLanguage,
  currentCurrency,
  onChangeLanguage,
  onChangeCurrency,
  onContinue,
  title,
  description,
  helper,
  languageLabel,
  currencyLabel,
  continueLabel,
}) => {
  const { t } = useSettings();

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px]" />
      <div className="fixed inset-0 z-[75] flex items-center justify-center px-4 py-6">
        <div className={`w-full max-w-2xl rounded-[30px] ${appPanelClass} p-6 sm:p-7`}>
          <div className={`${appPanelInsetClass} rounded-[24px] p-5 sm:p-6`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
              {t('tutorial.languagePrompt.eyebrow')}
            </p>
            <h2 className={`mt-3 text-2xl font-semibold tracking-tight ${appTextStrongClass}`}>
              {title}
            </h2>
            <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>
              {description}
            </p>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section>
              <p className={`mb-3 text-sm font-semibold ${appTextStrongClass}`}>{languageLabel}</p>
              <div className="grid gap-3">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChangeLanguage(option.value)}
                    className={`rounded-[22px] border px-4 py-4 text-left transition-all duration-200 ${
                      currentLanguage === option.value
                        ? `${appButtonPrimaryClass} border-transparent shadow-[0_18px_36px_-28px_rgba(15,23,42,0.25)]`
                        : `${appButtonMutedClass} ${appTextStrongClass} border-slate-200/70 hover:-translate-y-0.5 hover:border-slate-300/80`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base font-semibold">{option.nativeLabel}</p>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                          currentLanguage === option.value
                            ? 'border-white/60 bg-white/15 text-white'
                            : 'border-slate-300/80 text-slate-500'
                        }`}
                      >
                        {currentLanguage === option.value ? '✓' : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className={`mb-3 text-sm font-semibold ${appTextStrongClass}`}>{currencyLabel}</p>
              <div className="grid gap-3">
                {currencyOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => onChangeCurrency(option.code)}
                    className={`rounded-[22px] border px-4 py-4 text-left transition-all duration-200 ${
                      currentCurrency === option.code
                        ? `${appButtonPrimaryClass} border-transparent shadow-[0_18px_36px_-28px_rgba(15,23,42,0.25)]`
                        : `${appButtonMutedClass} ${appTextStrongClass} border-slate-200/70 hover:-translate-y-0.5 hover:border-slate-300/80`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">
                          {t(`common.currencyOptions.${option.code}`)}
                        </p>
                        <p className={`mt-1 text-sm ${appTextSoftClass}`}>{option.code}</p>
                      </div>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                          currentCurrency === option.code
                            ? 'border-white/60 bg-white/15 text-white'
                            : 'border-slate-300/80 text-slate-500'
                        }`}
                      >
                        {currentCurrency === option.code ? '✓' : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-xs leading-5 ${appTextSoftClass}`}>{helper}</p>
            </div>
            <button
              type="button"
              onClick={onContinue}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold ${appButtonPrimaryClass}`}
            >
              {continueLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
