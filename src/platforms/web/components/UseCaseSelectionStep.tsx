import React, { useMemo } from 'react';
import type { UseCaseOption } from '../utils/useCaseCatalog';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface UseCaseSelectionStepProps {
  options: UseCaseOption[];
  selectedOptionId: string | null;
  onContinue: (option: UseCaseOption) => void;
  onSelectOptionId: (optionId: string) => void;
  onSkip: () => void;
  showSkipButton?: boolean;
  title: string;
  description: string;
  continueLabel: string;
  skipLabel: string;
}

export const UseCaseSelectionStep: React.FC<UseCaseSelectionStepProps> = ({
  options = [],
  selectedOptionId,
  onContinue,
  onSelectOptionId,
  onSkip,
  showSkipButton = true,
  title,
  description,
  continueLabel,
  skipLabel,
}) => {
  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedOptionId) ?? null,
    [options, selectedOptionId]
  );

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[3px]" />
      <div className="fixed inset-0 z-[75] flex items-center justify-center px-4 py-6">
        <div className={`w-full max-w-5xl rounded-[32px] ${appPanelClass} p-5 shadow-[0_32px_80px_-40px_rgba(15,23,42,0.28)] sm:p-7`}>
          <div className={`${appPanelInsetClass} rounded-[26px] px-5 py-6 sm:px-7 sm:py-7`}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className={`text-[1.95rem] font-bold tracking-tight ${appTextStrongClass}`}>
                {title}
              </h2>
              <p className={`mt-3 text-sm leading-6 sm:text-[15px] ${appTextMutedClass}`}>
                {description}
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {options.map((option) => {
              const isSelected = selectedOption?.id === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectOptionId(option.id)}
                  className={`group relative min-h-[232px] rounded-[24px] border px-5 py-5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-300 sm:px-6 sm:py-6 ${
                    isSelected
                      ? 'border-[var(--app-border-strong)] bg-[var(--app-panel-inset)]'
                      : `${appButtonMutedClass} border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]`
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex h-full flex-col">
                    <div>
                      <p className={`text-[1.28rem] font-semibold tracking-[-0.03em] ${appTextStrongClass} sm:text-[1.42rem]`}>
                        {option.title}
                      </p>
                      <p className={`mt-3 text-[15px] leading-7 sm:text-base ${appTextMutedClass}`}>
                        {option.description}
                      </p>
                    </div>
                    {option.helper ? (
                      <p className={`mt-5 text-[13px] leading-6 ${appTextSoftClass}`}>
                        {option.helper}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[var(--app-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => selectedOption && onContinue(selectedOption)}
              disabled={!selectedOption}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold sm:w-auto sm:min-w-[170px] ${appButtonPrimaryClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {continueLabel}
            </button>
            {showSkipButton ? (
              <button
                type="button"
                onClick={onSkip}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-medium sm:w-auto ${appButtonMutedClass} ${appTextMutedClass}`}
              >
                {skipLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};
