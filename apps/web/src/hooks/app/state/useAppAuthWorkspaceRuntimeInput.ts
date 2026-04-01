import { useAppAuthWorkspaceRuntime } from "./useAppAuthWorkspaceRuntime";

type AppAuthWorkspaceRuntimeInput = Parameters<typeof useAppAuthWorkspaceRuntime>[0];

export function useAppAuthWorkspaceRuntimeInput(params: Record<string, unknown>): AppAuthWorkspaceRuntimeInput {
  const p = params as any;

  return {
    desktopUpdate: {
      t: p.t,
      pushToast: p.pushToast
    },
    desktopHandoffToken: p.token,
    authProfile: {
      authController: p.authController,
      token: p.token,
      authMode: p.authMode,
      autoSsoAttemptedRef: p.autoSsoAttemptedRef,
      profileNameDraft: p.profileNameDraft,
      selectedUiTheme: p.selectedUiTheme,
      t: p.t,
      setAuthMode: p.setAuthMode,
      setAuthMenuOpen: p.setAuthMenuOpen,
      setProfileMenuOpen: p.setProfileMenuOpen,
      setAudioOutputMenuOpen: p.setAudioOutputMenuOpen,
      setVoiceSettingsOpen: p.setVoiceSettingsOpen,
      setVoiceSettingsPanel: p.setVoiceSettingsPanel,
      setUserSettingsTab: p.setUserSettingsTab,
      setUserSettingsOpen: p.setUserSettingsOpen,
      setProfileSaving: p.setProfileSaving,
      setProfileStatusText: p.setProfileStatusText,
      setUser: p.setUser,
      pushToast: p.pushToast,
      onProfileSaved: p.bumpRealtimeReconnectNonce
    },
    deletedAccount: {
      token: p.token,
      deleteAccountPending: p.deleteAccountPending,
      restoreDeletedAccountPending: p.restoreDeletedAccountPending,
      setDeleteAccountPending: p.setDeleteAccountPending,
      setRestoreDeletedAccountPending: p.setRestoreDeletedAccountPending,
      setDeleteAccountStatusText: p.setDeleteAccountStatusText,
      setDeletedAccountInfo: p.setDeletedAccountInfo,
      setToken: p.setToken,
      setUser: p.setUser,
      pushToast: p.pushToast,
      t: p.t
    }
  };
}