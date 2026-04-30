export type OnboardingLifecycleState =
  | 'pending'
  | 'in-progress'
  | 'ready-to-complete'
  | 'completed';

export interface OnboardingStateMachineSnapshot {
  selectedUseCaseId: string | null;
  workspaceInitialized: boolean;
  tutorialEntryResolved: boolean;
  finalizationCommitted: boolean;
  lifecycleState: OnboardingLifecycleState;
}

export interface OnboardingStateMachineInput {
  selectedUseCaseId?: string | null;
  workspaceInitialized?: boolean;
  tutorialEntryResolved?: boolean;
  finalizationCommitted?: boolean;
}

export const isOnboardingReadyToComplete = (
  state: OnboardingStateMachineSnapshot
): boolean => state.lifecycleState === 'ready-to-complete';

const normalizeBoolean = (value: boolean | undefined): boolean => value === true;

const resolveLifecycleState = (snapshot: {
  selectedUseCaseId: string | null;
  workspaceInitialized: boolean;
  tutorialEntryResolved: boolean;
  finalizationCommitted: boolean;
}): OnboardingLifecycleState => {
  if (snapshot.finalizationCommitted) {
    return 'completed';
  }

  if (snapshot.selectedUseCaseId === null || snapshot.selectedUseCaseId.trim().length === 0) {
    return 'pending';
  }

  if (!snapshot.workspaceInitialized || !snapshot.tutorialEntryResolved) {
    return 'in-progress';
  }

  return 'ready-to-complete';
};

const buildSnapshot = (input: OnboardingStateMachineInput): OnboardingStateMachineSnapshot => {
  const selectedUseCaseId =
    typeof input.selectedUseCaseId === 'string' && input.selectedUseCaseId.trim().length > 0
      ? input.selectedUseCaseId.trim()
      : null;
  const workspaceInitialized = normalizeBoolean(input.workspaceInitialized);
  const tutorialEntryResolved = normalizeBoolean(input.tutorialEntryResolved);
  const finalizationCommitted = normalizeBoolean(input.finalizationCommitted);

  return {
    selectedUseCaseId,
    workspaceInitialized,
    tutorialEntryResolved,
    finalizationCommitted,
    lifecycleState: resolveLifecycleState({
      selectedUseCaseId,
      workspaceInitialized,
      tutorialEntryResolved,
      finalizationCommitted,
    }),
  };
};

export const createPendingOnboardingState = (): OnboardingStateMachineSnapshot =>
  buildSnapshot({});

export const beginOnboarding = (selectedUseCaseId: string): OnboardingStateMachineSnapshot =>
  buildSnapshot({
    selectedUseCaseId,
    workspaceInitialized: false,
    tutorialEntryResolved: false,
    finalizationCommitted: false,
  });

export const markWorkspaceInitialized = (
  state: OnboardingStateMachineSnapshot
): OnboardingStateMachineSnapshot => buildSnapshot({
  selectedUseCaseId: state.selectedUseCaseId,
  workspaceInitialized: true,
  tutorialEntryResolved: state.tutorialEntryResolved,
  finalizationCommitted: state.finalizationCommitted,
});

export const markTutorialEntryResolved = (
  state: OnboardingStateMachineSnapshot
): OnboardingStateMachineSnapshot => buildSnapshot({
  selectedUseCaseId: state.selectedUseCaseId,
  workspaceInitialized: state.workspaceInitialized,
  tutorialEntryResolved: true,
  finalizationCommitted: state.finalizationCommitted,
});

export const markReadyToComplete = (
  state: OnboardingStateMachineSnapshot
): OnboardingStateMachineSnapshot =>
  buildSnapshot({
    selectedUseCaseId: state.selectedUseCaseId,
    workspaceInitialized: true,
    tutorialEntryResolved: true,
    finalizationCommitted: state.finalizationCommitted,
  });

export const completeOnboarding = (
  state: OnboardingStateMachineSnapshot
): OnboardingStateMachineSnapshot =>
  buildSnapshot({
    selectedUseCaseId: state.selectedUseCaseId,
    workspaceInitialized: true,
    tutorialEntryResolved: true,
    finalizationCommitted: true,
  });

export const resumeOnboardingState = (
  snapshot: OnboardingStateMachineInput
): OnboardingStateMachineSnapshot => buildSnapshot(snapshot);

export const getOnboardingResumeState = (
  state: OnboardingStateMachineSnapshot
): OnboardingLifecycleState => state.lifecycleState;

export const isOnboardingComplete = (state: OnboardingStateMachineSnapshot): boolean =>
  state.lifecycleState === 'completed';

export const getResumeHintForState = (
  state: OnboardingStateMachineSnapshot
): 'pending' | 'in-progress' | 'ready-to-complete' | 'completed' => state.lifecycleState;
