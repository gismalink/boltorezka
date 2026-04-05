import { useAppShellRoomRuntimeEffects } from "../effects/useAppShellRoomRuntimeEffects";

type AppShellRoomRuntimeEffectsInput = Parameters<typeof useAppShellRoomRuntimeEffects>[0];

export function useAppShellRoomRuntimeEffectsInput(params: Record<string, unknown>): AppShellRoomRuntimeEffectsInput {
  const p = params as any;

  return {
    shellLifecycle: {
      lang: p.lang,
      selectedUiTheme: p.selectedUiTheme,
      user: p.user,
      chatRoomSlug: p.chatRoomSlug,
      setIsMobileViewport: p.setIsMobileViewport,
      setProfileNameDraft: p.setProfileNameDraft,
      setSelectedUiTheme: p.setSelectedUiTheme,
      setProfileStatusText: p.setProfileStatusText,
      setWalkieTalkieEnabled: p.setWalkieTalkieEnabled,
      setWalkieTalkieHotkey: p.setWalkieTalkieHotkey,
      setShowFirstRunIntro: p.setShowFirstRunIntro,
      setEditingMessageId: p.setEditingMessageId,
      setPendingChatImageDataUrl: p.setPendingChatImageDataUrl
    },
    roomSlugPersistence: {
      currentServerId: p.currentServerId,
      roomSlug: p.roomSlug,
      chatRoomSlug: p.chatRoomSlug,
      roomSlugStorageKey: p.roomSlugStorageKey,
      setRoomSlug: p.setRoomSlug,
      setChatRoomSlug: p.setChatRoomSlug
    }
  };
}
