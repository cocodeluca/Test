import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appPanelClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

export interface DemoTutorialStep {
  id: string;
  title: string;
  description: string;
  targetId?: string;
  requiresAction?: boolean;
  actionLabel?: string;
  example?: string;
  page?: string;
  propertyTab?:
    | 'summary'
    | 'overview'
    | 'finances'
    | 'mortgage'
    | 'documents'
    | 'tax'
    | 'taxes'
    | 'notes'
    | 'gallery';
  openQuickCreate?: boolean;
}

interface DemoGuidedTutorialProps {
  step: DemoTutorialStep;
  stepIndex: number;
  totalSteps: number;
  targetStatus?: 'pending' | 'ready' | 'timed-out';
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  onSkip: () => void;
  onExitDemo?: () => void;
}

export const DemoGuidedTutorial: React.FC<DemoGuidedTutorialProps> = ({
  step,
  stepIndex,
  totalSteps,
  targetStatus = 'ready',
  onBack,
  onNext,
  onClose,
  onSkip,
  onExitDemo,
}) => {
  const { t } = useSettings();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [connector, setConnector] = useState<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);

  useEffect(() => {
    if (!step.targetId || typeof document === 'undefined') {
      setConnector(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-tutorial-id="${step.targetId}"]`);
    if (!target) {
      setConnector(null);
      return;
    }

    target.classList.add('app-tutorial-target');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    const syncConnector = () => {
      if (!target || !modalRef.current) {
        setConnector(null);
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const modalRect = modalRef.current.getBoundingClientRect();
      const targetVisible =
        targetRect.width > 0 &&
        targetRect.height > 0 &&
        targetRect.bottom > 0 &&
        targetRect.right > 0 &&
        targetRect.top < window.innerHeight &&
        targetRect.left < window.innerWidth;

      if (!targetVisible) {
        setConnector(null);
        return;
      }

      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const modalCenterX = modalRect.left + modalRect.width / 2;
      const modalTopY = modalRect.top;
      const distance = Math.hypot(modalCenterX - targetCenterX, modalTopY - targetCenterY);

      if (distance < 230 || targetCenterY > modalTopY - 40) {
        setConnector(null);
        return;
      }

      setConnector({
        fromX: targetCenterX,
        fromY: Math.min(targetRect.bottom + 10, modalTopY - 48),
        toX: modalCenterX,
        toY: modalTopY - 18,
      });
    };

    const frame = window.requestAnimationFrame(() => {
      syncConnector();
    });

    window.addEventListener('resize', syncConnector);
    window.addEventListener('scroll', syncConnector, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncConnector);
      window.removeEventListener('scroll', syncConnector, true);
      target.classList.remove('app-tutorial-target');
      setConnector(null);
    };
  }, [step.targetId]);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[70] bg-slate-950/35" />
      {connector ? (
        <div className="pointer-events-none fixed inset-0 z-[72]">
          <svg className="h-full w-full" aria-hidden="true">
            <defs>
              <linearGradient id="tutorial-connector-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(96,165,250,0.52)" />
                <stop offset="100%" stopColor="rgba(96,165,250,0.08)" />
              </linearGradient>
            </defs>
            <line
              x1={connector.fromX}
              y1={connector.fromY}
              x2={connector.toX}
              y2={connector.toY}
              stroke="url(#tutorial-connector-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={connector.fromX} cy={connector.fromY} r="5" fill="rgba(255,255,255,0.96)" />
            <circle cx={connector.fromX} cy={connector.fromY} r="9" fill="rgba(96,165,250,0.22)" />
            <circle cx={connector.toX} cy={connector.toY} r="4" fill="rgba(96,165,250,0.34)" />
          </svg>
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-4 z-[75] flex justify-center px-4">
        <div ref={modalRef} className={`w-full max-w-2xl rounded-[24px] ${appPanelClass} p-5 sm:p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div>
                <h3 className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{step.title}</h3>
                <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>{step.description}</p>
                {step.example ? (
                  <p className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-inset)] px-3 py-2 text-sm leading-6">
                    {t('tutorial.ui.exampleLabel', { value: step.example })}
                  </p>
                ) : null}
                {step.requiresAction ? (
                  <p className={`mt-3 text-sm font-medium ${appTextSoftClass}`}>
                    {t('tutorial.ui.actionNeeded', { action: step.actionLabel ?? '' })}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                console.info('[demo-tutorial] X clicked');
                onClose();
              }}
              className={`pointer-events-auto rounded-full p-2 ${appButtonMutedClass} ${appTextMutedClass}`}
              title={t('tutorial.ui.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-sm ${appTextSoftClass}`}>
              {t('tutorial.ui.stepCounter', { current: stepIndex + 1, total: totalSteps })}
            </p>
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={onBack}
                  className={`pointer-events-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>{t('tutorial.ui.back')}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  console.info('[demo-tutorial] Saltar clicked');
                  onSkip();
                }}
                className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
              >
                {t('tutorial.ui.skip')}
              </button>
              {onExitDemo ? (
                <button
                  type="button"
                  onClick={onExitDemo}
                  className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium ${appButtonMutedClass} ${appTextStrongClass}`}
                >
                  {t('demoPreview.exit')}
                </button>
              ) : null}
              {!step.requiresAction ? (
                <button
                  type="button"
                  onClick={onNext}
                  className={`pointer-events-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${appButtonPrimaryClass}`}
                >
                  <span>{t('tutorial.ui.next')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : targetStatus === 'timed-out' ? (
                <button
                  type="button"
                  onClick={onNext}
                  className={`pointer-events-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${appButtonPrimaryClass}`}
                >
                  <span>{t('tutorial.ui.next')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
