import type { AppSettings, OnboardingStep } from '../types/settings';

export const hasCompletedOnboarding = (settings: AppSettings): boolean =>
  Boolean(settings.onboardingCompleted ?? settings.onboarding.completed);

export const getPendingOnboardingStep = (settings: AppSettings): OnboardingStep | null => {
  if (hasCompletedOnboarding(settings)) {
    return settings.onboardingStep === 'basic-mode-setup' ? 'basic-mode-setup' : null;
  }

  return settings.onboardingStep ?? 'welcome';
};
