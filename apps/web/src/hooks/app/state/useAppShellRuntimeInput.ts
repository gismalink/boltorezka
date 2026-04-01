import { useAppShellRuntime } from "./useAppShellRuntime";

type AppShellRuntimeInput = Parameters<typeof useAppShellRuntime>[0];

export function useAppShellRuntimeInput(params: Record<string, unknown>): AppShellRuntimeInput {
  const p = params as any;

  return {
      topChrome: {
        t: p.t,
        user: p.user,
        currentServer: p.currentServer,
        servers: p.servers,
        currentServerId: p.currentServerId,
        creatingServer: p.creatingServer,
        buildDateLabel: p.buildDateLabel,
        pendingJoinRequestsCount: p.pendingJoinRequestsCount,
        appMenuOpen: p.appMenuOpen,
        authMenuOpen: p.authMenuOpen,
        profileMenuOpen: p.profileMenuOpen,
        authMenuRef: p.authMenuRef,
        profileMenuRef: p.profileMenuRef,
        onBeginSso: p.beginSso,
        onLogout: p.logout,
        openProfileSettings: p.openProfileSettings,
        setCurrentServerId: p.setCurrentServerId,
        onCreateServer: p.handleCreateServer,
        mediaDevicesState: p.mediaDevicesState,
        onRequestMediaAccess: p.requestMediaAccess,
        remoteAudioAutoplayBlocked: p.remoteAudioAutoplayBlocked,
        audioMuted: p.audioMuted,
        desktopUpdateReadyVersion: p.desktopUpdateReadyVersion,
        desktopUpdateBannerDismissed: p.desktopUpdateBannerDismissed,
        desktopUpdateApplying: p.desktopUpdateApplying,
        onDismissDesktopUpdateBanner: p.dismissDesktopUpdateBanner,
        onApplyDesktopUpdate: p.applyDesktopUpdate,
        setAppMenuOpen: p.setAppMenuOpen,
        setAuthMenuOpen: p.setAuthMenuOpen,
        setProfileMenuOpen: p.setProfileMenuOpen
      },
      mainSection: {
        t: p.t,
        user: p.user,
        authMode: p.authMode,
        beginSso: p.beginSso,
        showEmptyServerOnboarding: p.showEmptyServerOnboarding,
        creatingServer: p.creatingServer,
        handleCreateServer: p.handleCreateServer,
        isMobileViewport: p.isMobileViewport,
        mobileTab: p.mobileTab,
        setMobileTab: p.setMobileTab,
        userDockSharedProps: p.userDockSharedProps,
        roomsPanelProps: p.roomsPanelProps,
        chatPanelProps: p.chatPanelProps,
        videoWindowsOverlayProps: p.videoWindowsOverlayProps,
        userSettingsOpen: p.userSettingsOpen,
        inviteAccepting: p.inviteAccepting,
        appMenuOpen: p.appMenuOpen,
        serverProfileModalProps: p.serverProfileModalProps
      },
      overlays: {
        toasts: p.toasts,
        showAppUpdatedOverlay: p.showAppUpdatedOverlay,
        t: p.t,
        acknowledgeUpdatedApp: p.acknowledgeUpdatedApp,
        user: p.user,
        showFirstRunIntro: p.showFirstRunIntro,
        profileNameDraft: p.profileNameDraft,
        setProfileNameDraft: p.setProfileNameDraft,
        profileSaving: p.profileSaving,
        completeFirstRunIntro: p.completeFirstRunIntro,
        sessionMovedOverlayMessage: p.sessionMovedOverlayMessage,
        setSessionMovedOverlayMessage: p.setSessionMovedOverlayMessage,
        ageGateBlockedRoomSlug: p.ageGateBlockedRoomSlug,
        serverAgeConfirming: p.serverAgeConfirming,
        openUserSettings: p.openUserSettings,
        handleConfirmServerAge: p.handleConfirmServerAge,
        setAgeGateBlockedRoomSlug: p.setAgeGateBlockedRoomSlug,
        joinRoom: p.joinRoom,
        lang: p.lang,
        cookieConsentAccepted: p.cookieConsentAccepted,
        cookieConsentKey: p.cookieConsentKey,
        setCookieConsentAccepted: p.setCookieConsentAccepted
      }
  };
}