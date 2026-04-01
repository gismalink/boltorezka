import { useAppWorkspaceLifecycleGuardsRuntime } from "../effects/useAppWorkspaceLifecycleGuardsRuntime";

type AppWorkspaceLifecycleGuardsRuntimeInput = Parameters<typeof useAppWorkspaceLifecycleGuardsRuntime>[0];

export function useAppWorkspaceLifecycleGuardsRuntimeInput(params: Record<string, unknown>): AppWorkspaceLifecycleGuardsRuntimeInput {
  const p = params as any;

  return {
    pendingAccessAutoRefresh: {
      user: p.user,
      resetValue: p.pendingAccessAutoRefreshSec,
      setPendingAccessRefreshInSec: p.setPendingAccessRefreshInSec
    },
    autoRoomVoiceConnection: {
      roomMediaResolved: p.roomMediaResolved,
      currentRoomSupportsRtc: p.currentRoomSupportsRtc,
      roomVoiceTargetsCount: p.currentRoomVoiceTargets.length,
      roomVoiceConnected: p.roomVoiceConnected,
      keepConnectedWithoutTargets: true,
      connectRoom: p.connectRoom,
      disconnectRoom: p.disconnectRoom
    },
    serverMenuAccessGuard: {
      serverMenuTab: p.serverMenuTab,
      canManageUsers: p.canManageUsers,
      canManageServerControlPlane: p.canManageServerControlPlane,
      canViewTelemetry: p.canViewTelemetry,
      canManageAudioQuality: p.canManageAudioQuality,
      canManageChatImages: p.canPromote,
      hasCurrentServer: Boolean(p.currentServer?.id),
      setServerMenuTab: p.setServerMenuTab
    },
    screenWakeLockEnabled: Boolean(p.user && p.roomSlug && p.currentRoomSupportsRtc && p.roomVoiceConnected)
  };
}
