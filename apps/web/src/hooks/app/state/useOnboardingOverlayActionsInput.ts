import { useOnboardingOverlayActions } from "../effects/useOnboardingOverlayActions";

type OnboardingOverlayActionsInput = Parameters<typeof useOnboardingOverlayActions>[0];

export function useOnboardingOverlayActionsInput(params: Record<string, unknown>): OnboardingOverlayActionsInput {
  const p = params as any;

  return {
    token: p.token,
    user: p.user,
    profileNameDraft: p.profileNameDraft,
    selectedUiTheme: p.selectedUiTheme,
    versionUpdatePendingKey: p.versionUpdatePendingKey,
    setProfileSaving: p.setProfileSaving,
    setProfileStatusText: p.setProfileStatusText,
    setUser: p.setUser,
    setShowFirstRunIntro: p.setShowFirstRunIntro,
    setShowAppUpdatedOverlay: p.setShowAppUpdatedOverlay,
    pushToast: p.pushToast,
    t: p.t
  };
}
