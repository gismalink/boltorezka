import type { ComponentProps } from "react";
import { ServerProfileModal } from "./ServerProfileModal";

type ServerProfileModalProps = ComponentProps<typeof ServerProfileModal>;

type ServerProfileModalContainerProps = {
  open: boolean;
  t: ServerProfileModalProps["t"];
  permissions: {
    canManageUsers: boolean;
    canPromote: boolean;
    canManageServerControlPlane: boolean;
    canViewTelemetry: boolean;
    canManageAudioQuality: boolean;
  };
  state: {
    serverMenuTab: ServerProfileModalProps["serverMenuTab"];
    serverAudioQuality: ServerProfileModalProps["serverAudioQuality"];
    serverAudioQualitySaving: boolean;
    serverChatImagePolicy: ServerProfileModalProps["serverChatImagePolicy"];
    serverVideoEffectType: ServerProfileModalProps["serverVideoEffectType"];
    serverVideoResolution: ServerProfileModalProps["serverVideoResolution"];
    serverVideoFps: ServerProfileModalProps["serverVideoFps"];
    serverScreenShareResolution: ServerProfileModalProps["serverScreenShareResolution"];
    serverVideoPixelFxStrength: number;
    serverVideoPixelFxPixelSize: number;
    serverVideoPixelFxGridThickness: number;
    serverVideoAsciiCellSize: number;
    serverVideoAsciiContrast: number;
    serverVideoAsciiColor: string;
    serverVideoWindowMinWidth: number;
    serverVideoWindowMaxWidth: number;
  };
  data: {
    adminUsers: ServerProfileModalProps["adminUsers"];
    adminServers: ServerProfileModalProps["adminServers"];
    adminServersLoading: ServerProfileModalProps["adminServersLoading"];
    selectedAdminServerId: ServerProfileModalProps["selectedAdminServerId"];
    adminServerOverview: ServerProfileModalProps["adminServerOverview"];
    adminServerOverviewLoading: ServerProfileModalProps["adminServerOverviewLoading"];
    currentUserId: string;
    currentServerRole: ServerProfileModalProps["currentServerRole"];
    currentServerName: string;
    serverMembers: ServerProfileModalProps["serverMembers"];
    serverMembersLoading: boolean;
    serverAgeLoading: boolean;
    serverAgeConfirmedAt: string | null;
    serverAgeConfirming: boolean;
    lastInviteUrl: string;
    eventLog: string[];
    telemetrySummary: ServerProfileModalProps["telemetrySummary"];
    callStatus: string;
    lastCallPeer: string;
    roomVoiceConnected: boolean;
    callEventLog: string[];
    serverVideoPreviewStream: MediaStream | null;
  };
  actions: {
    onClose: () => void;
    onSetServerMenuTab: ServerProfileModalProps["onSetServerMenuTab"];
    onPromote: ServerProfileModalProps["onPromote"];
    onDemote: ServerProfileModalProps["onDemote"];
    onSetBan: ServerProfileModalProps["onSetBan"];
    onSetAccessState: ServerProfileModalProps["onSetAccessState"];
    onSelectAdminServer: ServerProfileModalProps["onSelectAdminServer"];
    onCreateServerInvite: ServerProfileModalProps["onCreateServerInvite"];
    onCopyInviteUrl: ServerProfileModalProps["onCopyInviteUrl"];
    onRenameCurrentServer: ServerProfileModalProps["onRenameCurrentServer"];
    onConfirmServerAge: ServerProfileModalProps["onConfirmServerAge"];
    onLeaveServer: ServerProfileModalProps["onLeaveServer"];
    onRemoveServerMember: ServerProfileModalProps["onRemoveServerMember"];
    onBanServerMember: ServerProfileModalProps["onBanServerMember"];
    onUnbanServerMember: ServerProfileModalProps["onUnbanServerMember"];
    onTransferServerOwnership: ServerProfileModalProps["onTransferServerOwnership"];
    onRefreshTelemetry: () => void;
    onSetServerAudioQuality: ServerProfileModalProps["onSetServerAudioQuality"];
    onSetServerVideoEffectType: ServerProfileModalProps["onSetServerVideoEffectType"];
    onSetServerVideoResolution: ServerProfileModalProps["onSetServerVideoResolution"];
    onSetServerVideoFps: ServerProfileModalProps["onSetServerVideoFps"];
    onSetServerScreenShareResolution: ServerProfileModalProps["onSetServerScreenShareResolution"];
    onSetServerVideoPixelFxStrength: ServerProfileModalProps["onSetServerVideoPixelFxStrength"];
    onSetServerVideoPixelFxPixelSize: ServerProfileModalProps["onSetServerVideoPixelFxPixelSize"];
    onSetServerVideoPixelFxGridThickness: ServerProfileModalProps["onSetServerVideoPixelFxGridThickness"];
    onSetServerVideoAsciiCellSize: ServerProfileModalProps["onSetServerVideoAsciiCellSize"];
    onSetServerVideoAsciiContrast: ServerProfileModalProps["onSetServerVideoAsciiContrast"];
    onSetServerVideoAsciiColor: ServerProfileModalProps["onSetServerVideoAsciiColor"];
    onSetServerVideoWindowMinWidth: ServerProfileModalProps["onSetServerVideoWindowMinWidth"];
    onSetServerVideoWindowMaxWidth: ServerProfileModalProps["onSetServerVideoWindowMaxWidth"];
  };
  meta: {
    creatingInvite: boolean;
  };
};

export function ServerProfileModalContainer({ open, t, permissions, state, data, actions, meta }: ServerProfileModalContainerProps) {
  return (
    <ServerProfileModal
      open={open}
      t={t}
      canManageUsers={permissions.canManageUsers}
      canPromote={permissions.canPromote}
      canManageServerControlPlane={permissions.canManageServerControlPlane}
      canViewTelemetry={permissions.canViewTelemetry}
      serverMenuTab={state.serverMenuTab}
      adminUsers={data.adminUsers}
      adminServers={data.adminServers}
      adminServersLoading={data.adminServersLoading}
      selectedAdminServerId={data.selectedAdminServerId}
      adminServerOverview={data.adminServerOverview}
      adminServerOverviewLoading={data.adminServerOverviewLoading}
      currentUserId={data.currentUserId}
      currentServerRole={data.currentServerRole}
      currentServerName={data.currentServerName}
      serverMembers={data.serverMembers}
      serverMembersLoading={data.serverMembersLoading}
      serverAgeLoading={data.serverAgeLoading}
      serverAgeConfirmedAt={data.serverAgeConfirmedAt}
      serverAgeConfirming={data.serverAgeConfirming}
      lastInviteUrl={data.lastInviteUrl}
      creatingInvite={meta.creatingInvite}
      eventLog={data.eventLog}
      telemetrySummary={data.telemetrySummary}
      callStatus={data.callStatus}
      lastCallPeer={data.lastCallPeer}
      roomVoiceConnected={data.roomVoiceConnected}
      callEventLog={data.callEventLog}
      serverAudioQuality={state.serverAudioQuality}
      serverAudioQualitySaving={state.serverAudioQualitySaving}
      canManageAudioQuality={permissions.canManageAudioQuality}
      serverChatImagePolicy={state.serverChatImagePolicy}
      serverVideoEffectType={state.serverVideoEffectType}
      serverVideoResolution={state.serverVideoResolution}
      serverVideoFps={state.serverVideoFps}
      serverScreenShareResolution={state.serverScreenShareResolution}
      serverVideoPixelFxStrength={state.serverVideoPixelFxStrength}
      serverVideoPixelFxPixelSize={state.serverVideoPixelFxPixelSize}
      serverVideoPixelFxGridThickness={state.serverVideoPixelFxGridThickness}
      serverVideoAsciiCellSize={state.serverVideoAsciiCellSize}
      serverVideoAsciiContrast={state.serverVideoAsciiContrast}
      serverVideoAsciiColor={state.serverVideoAsciiColor}
      serverVideoWindowMinWidth={state.serverVideoWindowMinWidth}
      serverVideoWindowMaxWidth={state.serverVideoWindowMaxWidth}
      serverVideoPreviewStream={data.serverVideoPreviewStream}
      onClose={actions.onClose}
      onSetServerMenuTab={actions.onSetServerMenuTab}
      onPromote={actions.onPromote}
      onDemote={actions.onDemote}
      onSetBan={actions.onSetBan}
      onSetAccessState={actions.onSetAccessState}
      onSelectAdminServer={actions.onSelectAdminServer}
      onCreateServerInvite={actions.onCreateServerInvite}
      onCopyInviteUrl={actions.onCopyInviteUrl}
      onRenameCurrentServer={actions.onRenameCurrentServer}
      onConfirmServerAge={actions.onConfirmServerAge}
      onLeaveServer={actions.onLeaveServer}
      onRemoveServerMember={actions.onRemoveServerMember}
      onBanServerMember={actions.onBanServerMember}
      onUnbanServerMember={actions.onUnbanServerMember}
      onTransferServerOwnership={actions.onTransferServerOwnership}
      onRefreshTelemetry={actions.onRefreshTelemetry}
      onSetServerAudioQuality={actions.onSetServerAudioQuality}
      onSetServerVideoEffectType={actions.onSetServerVideoEffectType}
      onSetServerVideoResolution={actions.onSetServerVideoResolution}
      onSetServerVideoFps={actions.onSetServerVideoFps}
      onSetServerScreenShareResolution={actions.onSetServerScreenShareResolution}
      onSetServerVideoPixelFxStrength={actions.onSetServerVideoPixelFxStrength}
      onSetServerVideoPixelFxPixelSize={actions.onSetServerVideoPixelFxPixelSize}
      onSetServerVideoPixelFxGridThickness={actions.onSetServerVideoPixelFxGridThickness}
      onSetServerVideoAsciiCellSize={actions.onSetServerVideoAsciiCellSize}
      onSetServerVideoAsciiContrast={actions.onSetServerVideoAsciiContrast}
      onSetServerVideoAsciiColor={actions.onSetServerVideoAsciiColor}
      onSetServerVideoWindowMinWidth={actions.onSetServerVideoWindowMinWidth}
      onSetServerVideoWindowMaxWidth={actions.onSetServerVideoWindowMaxWidth}
    />
  );
}
