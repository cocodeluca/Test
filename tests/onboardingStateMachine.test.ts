import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginOnboarding,
  completeOnboarding,
  createPendingOnboardingState,
  getOnboardingResumeState,
  isOnboardingComplete,
  markReadyToComplete,
  markTutorialEntryResolved,
  markWorkspaceInitialized,
  resumeOnboardingState,
} from '../src/common/utils/onboardingStateMachine';

test('fresh onboarding starts pending', () => {
  const state = createPendingOnboardingState();

  assert.equal(state.lifecycleState, 'pending');
  assert.equal(getOnboardingResumeState(state), 'pending');
  assert.equal(isOnboardingComplete(state), false);
});

test('selected use case moves onboarding to in-progress until workspace and tutorial resolve', () => {
  const state = beginOnboarding('properties-and-rent');

  assert.equal(state.lifecycleState, 'in-progress');
  assert.equal(state.selectedUseCaseId, 'properties-and-rent');
  assert.equal(isOnboardingComplete(state), false);
});

test('workspace or tutorial resolution alone keeps onboarding in-progress', () => {
  const withWorkspaceOnly = markWorkspaceInitialized(beginOnboarding('full-portfolio'));
  const withTutorialOnly = markTutorialEntryResolved(beginOnboarding('full-portfolio'));

  assert.equal(withWorkspaceOnly.lifecycleState, 'in-progress');
  assert.equal(withTutorialOnly.lifecycleState, 'in-progress');
});

test('workspace and tutorial resolution move onboarding to ready-to-complete', () => {
  const state = markReadyToComplete(beginOnboarding('properties-and-mortgages'));

  assert.equal(state.lifecycleState, 'ready-to-complete');
  assert.equal(state.workspaceInitialized, true);
  assert.equal(state.tutorialEntryResolved, true);
  assert.equal(isOnboardingComplete(state), false);
});

test('final explicit completion marks onboarding completed', () => {
  const readyState = markReadyToComplete(beginOnboarding('properties-mortgages-cash'));
  const completed = completeOnboarding(readyState);

  assert.equal(completed.lifecycleState, 'completed');
  assert.equal(completed.finalizationCommitted, true);
  assert.equal(isOnboardingComplete(completed), true);
});

test('resume preserves pending state when interrupted before selection', () => {
  const resumed = resumeOnboardingState({});

  assert.equal(resumed.lifecycleState, 'pending');
  assert.equal(resumed.selectedUseCaseId, null);
});

test('resume preserves in-progress state when interrupted after selection', () => {
  const resumed = resumeOnboardingState({
    selectedUseCaseId: 'full-portfolio',
  });

  assert.equal(resumed.lifecycleState, 'in-progress');
  assert.equal(resumed.selectedUseCaseId, 'full-portfolio');
});

test('resume preserves ready-to-complete state when interrupted after resolution', () => {
  const resumed = resumeOnboardingState({
    selectedUseCaseId: 'properties-and-rent',
    workspaceInitialized: true,
    tutorialEntryResolved: true,
  });

  assert.equal(resumed.lifecycleState, 'ready-to-complete');
});

test('resume preserves completed state only after explicit finalization', () => {
  const resumed = resumeOnboardingState({
    selectedUseCaseId: 'properties-and-rent',
    workspaceInitialized: true,
    tutorialEntryResolved: true,
    finalizationCommitted: true,
  });

  assert.equal(resumed.lifecycleState, 'completed');
  assert.equal(resumed.finalizationCommitted, true);
});

test('partial progression cannot be mistaken for completion', () => {
  const pendingCompletion = completeOnboarding(beginOnboarding('properties-and-rent'));

  assert.equal(pendingCompletion.lifecycleState, 'completed');
  assert.equal(pendingCompletion.finalizationCommitted, true);
});

