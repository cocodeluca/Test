import React, { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Building2, FileText, Settings, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appOverlayClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface DemoTutorialModalProps {
  onClose: () => void;
}

export const DemoTutorialModal: React.FC<DemoTutorialModalProps> = ({ onClose }) => {
  const { t } = useSettings();
  const [stepIndex, setStepIndex] = useState(0);

  const tutorialSteps = useMemo(
    () => [
      {
        title: t('demoTutorialModal.welcomeTitle'),
        description: t('demoTutorialModal.welcomeBody'),
        icon: BarChart3,
        bullets: [
          t('demoTutorialModal.welcomeStep1'),
          t('demoTutorialModal.welcomeStep2'),
        ],
      },
      {
        title: t('demoTutorialModal.dashboardTitle'),
        description: t('demoTutorialModal.dashboardBody'),
        icon: BarChart3,
        bullets: [
          t('demoTutorialModal.dashboardStep1'),
          t('demoTutorialModal.dashboardStep2'),
        ],
      },
      {
        title: t('demoTutorialModal.propertiesTitle'),
        description: t('demoTutorialModal.propertiesBody'),
        icon: Building2,
        bullets: [
          t('demoTutorialModal.propertiesStep1'),
          t('demoTutorialModal.propertiesStep2'),
        ],
      },
      {
        title: t('demoTutorialModal.mortgagesTitle'),
        description: t('demoTutorialModal.mortgagesBody'),
        icon: FileText,
        bullets: [
          t('demoTutorialModal.mortgagesStep1'),
          t('demoTutorialModal.mortgagesStep2'),
        ],
      },
      {
        title: t('demoTutorialModal.settingsTitle'),
        description: t('demoTutorialModal.settingsBody'),
        icon: Settings,
        bullets: [
          t('demoTutorialModal.settingsStep1'),
          t('demoTutorialModal.settingsStep2'),
        ],
      },
    ],
    [t]
  );

  const currentStep = tutorialSteps[stepIndex];
  const Icon = currentStep.icon;
  const isLastStep = stepIndex === tutorialSteps.length - 1;

  const progressLabel = useMemo(
    () => `${stepIndex + 1} / ${tutorialSteps.length}`,
    [stepIndex, tutorialSteps.length]
  );

  return (
    <div className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${appOverlayClass}`}>
      <div className={`w-full max-w-2xl overflow-hidden rounded-[24px] ${appPanelClass}`}>
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 sm:px-7 sm:py-6 ${appBorderClass}`}>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>
              {t('demoTutorialModal.eyebrow')}
            </p>
            <h2 className={`mt-2 text-2xl font-bold ${appTextStrongClass}`}>
              {t('demoTutorialModal.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 ${appButtonMutedClass} ${appTextMutedClass}`}
            title={t('demoTutorialModal.closeTitle')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-7 sm:py-7">
          <div className={`rounded-[26px] border p-5 sm:p-6 ${appBorderClass} ${appPanelInsetClass}`}>
            <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-inset)] p-3">
              <Icon className="h-6 w-6" />
            </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-xl font-semibold ${appTextStrongClass}`}>
                    {currentStep.title}
                  </h3>
                  <span className={`text-sm font-medium ${appTextMutedClass}`}>{progressLabel}</span>
                </div>
                <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>
                  {currentStep.description}
                </p>
                <div className="mt-4 space-y-2">
                  {currentStep.bullets.map((bullet, index) => (
                    <div key={index} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-500" />
                      <p className={`text-sm leading-6 ${appTextMutedClass}`}>{bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${appTextSoftClass}`}>
              {t('demoTutorialModal.closingBody')}
            </p>
            <div className="flex gap-2">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((current) => current - 1)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
                >
                  {t('demoTutorialModal.backButton')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    onClose();
                    return;
                  }

                  setStepIndex((current) => current + 1);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${appButtonPrimaryClass}`}
              >
                <span>{isLastStep ? t('demoTutorialModal.exploreButton') : t('demoTutorialModal.nextButton')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
