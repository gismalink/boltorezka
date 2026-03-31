import { useCallback, useMemo, type ComponentProps } from "react";
import type { ServerProfileModalContainer } from "../../../components";

type ServerProfileModalContainerProps = ComponentProps<typeof ServerProfileModalContainer>;

type UseServerProfileModalPropsInput = {
  canManageUsers: boolean;
  canPromote: boolean;
  canManageServerControlPlane: boolean;
  canViewTelemetry: boolean;
  canManageAudioQuality: boolean;
  serverMenuTab: ServerProfileModalContainerProps["state"]["serverMenuTab"];
  serverAudioQuality: ServerProfileModalContainerProps["state"]["serverAudioQuality"];
  serverAudioQualitySaving: boolean;
  serverChatImagePolicy: ServerProfileModalContainerProps["state"]["serverChatImagePolicy"];
  serverVideoEffectType: ServerProfileModalContainerProps["state"]["serverVideoEffectType"];
  serverVideoResolution: ServerProfileModalContainerProps["state"]["serverVideoResolution"];
  serverVideoFps: ServerProfileModalContainerProps["state"]["serverVideoFps"];
  serverScreenShareResolution: ServerProfileModalContainerProps["state"]["serverScreenShareResolution"];
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  normalizedServerVideoWindowMinWidth: number;
  normalizedServerVideoWindowMaxWidth: number;
  adminUsers: ServerProfileModalContainerProps["data"]["adminUsers"];
  adminServers: ServerProfileModalContainerProps["data"]["adminServers"];
  adminServersLoading: ServerProfileModalContainerProps["data"]["adminServersLoading"];
  selectedAdminServerId: ServerProfileModalContainerProps["data"]["selectedAdminServerId"];
  adminServerOverview: ServerProfileModalContainerProps["data"]["adminServerOverview"];
  adminServerOverviewLoading: ServerProfileModalContainerProps["data"]["adminServerOverviewLoading"];
  currentUserId: string;
  currentServerRole: ServerProfileModalContainerProps["data"]["currentServerRole"];
  currentServerName: string;
  currentServerId: string;
  servers: ServerProfileModalContainerProps["data"]["servers"];
  hasCurrentServer: boolean;
  serverMembers: ServerProfileModalContainerProps["data"]["serverMembers"];
  serverMembersLoading: boolean;
  lastInviteUrl: string;
  eventLog: string[];
  telemetrySummary: ServerProfileModalContainerProps["data"]["telemetrySummary"];
  callStatus: string;
  lastCallPeer: string;
  roomVoiceConnected: boolean;
  callEventLog: string[];
  serverVideoPreviewStream: MediaStream | null;
  setAppMenuOpen: (value: boolean) => void;
  setServerMenuTab: ServerProfileModalContainerProps["actions"]["onSetServerMenuTab"];
  promote: (userId: string) => Promise<void>;
  demote: (userId: string) => Promise<void>;
  setUserBan: (userId: string, banned: boolean) => Promise<void>;
  setUserAccessState: (
    userId: string,
    accessState: "active" | "pending" | "blocked"
  ) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  forceDeleteUserNow: (userId: string) => Promise<void>;
  setSelectedAdminServerId: ServerProfileModalContainerProps["actions"]["onSelectAdminServer"];
  handleToggleAdminServerBlocked: (serverId: string, blocked: boolean) => Promise<void>;
  handleDeleteAdminServer: (serverId: string) => Promise<void>;
  handleCreateServerInvite: () => Promise<void>;
  handleCopyInviteUrl: () => Promise<void>;
  handleServerChange: (serverId: string) => void;
  handleRenameCurrentServer: (name: string) => Promise<void>;
  handleLeaveCurrentServer: () => Promise<void>;
  handleDeleteCurrentServer: () => Promise<void>;
  handleRemoveServerMember: (userId: string) => Promise<void>;
  handleBanServerMember: (userId: string) => Promise<void>;
  handleUnbanServerMember: (userId: string) => Promise<void>;
  handleTransferServerOwnership: (userId: string) => Promise<void>;
  loadTelemetrySummary: () => Promise<void>;
  setServerAudioQualityValue: (value: ServerProfileModalContainerProps["state"]["serverAudioQuality"]) => Promise<void>;
  setServerVideoEffectType: ServerProfileModalContainerProps["actions"]["onSetServerVideoEffectType"];
  setServerVideoResolution: ServerProfileModalContainerProps["actions"]["onSetServerVideoResolution"];
  setServerVideoFps: ServerProfileModalContainerProps["actions"]["onSetServerVideoFps"];
  setServerScreenShareResolution: ServerProfileModalContainerProps["actions"]["onSetServerScreenShareResolution"];
  setServerVideoPixelFxStrength: ServerProfileModalContainerProps["actions"]["onSetServerVideoPixelFxStrength"];
  setServerVideoPixelFxPixelSize: ServerProfileModalContainerProps["actions"]["onSetServerVideoPixelFxPixelSize"];
  setServerVideoPixelFxGridThickness: ServerProfileModalContainerProps["actions"]["onSetServerVideoPixelFxGridThickness"];
  setServerVideoAsciiCellSize: ServerProfileModalContainerProps["actions"]["onSetServerVideoAsciiCellSize"];
  setServerVideoAsciiContrast: ServerProfileModalContainerProps["actions"]["onSetServerVideoAsciiContrast"];
  setServerVideoAsciiColor: ServerProfileModalContainerProps["actions"]["onSetServerVideoAsciiColor"];
  setBoundedServerVideoWindowMinWidth: ServerProfileModalContainerProps["actions"]["onSetServerVideoWindowMinWidth"];
  setBoundedServerVideoWindowMaxWidth: ServerProfileModalContainerProps["actions"]["onSetServerVideoWindowMaxWidth"];
  creatingInvite: boolean;
};

export function useServerProfileModalProps({
  canManageUsers,
  canPromote,
  canManageServerControlPlane,
  canViewTelemetry,
  canManageAudioQuality,
  serverMenuTab,
  serverAudioQuality,
  serverAudioQualitySaving,
  serverChatImagePolicy,
  serverVideoEffectType,
  serverVideoResolution,
  serverVideoFps,
  serverScreenShareResolution,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor,
  normalizedServerVideoWindowMinWidth,
  normalizedServerVideoWindowMaxWidth,
  adminUsers,
  adminServers,
  adminServersLoading,
  selectedAdminServerId,
  adminServerOverview,
  adminServerOverviewLoading,
  currentUserId,
  currentServerRole,
  currentServerName,
  currentServerId,
  servers,
  hasCurrentServer,
  serverMembers,
  serverMembersLoading,
  lastInviteUrl,
  eventLog,
  telemetrySummary,
  callStatus,
  lastCallPeer,
  roomVoiceConnected,
  callEventLog,
  serverVideoPreviewStream,
  setAppMenuOpen,
  setServerMenuTab,
  promote,
  demote,
  setUserBan,
  setUserAccessState,
  deleteUser,
  forceDeleteUserNow,
  setSelectedAdminServerId,
  handleToggleAdminServerBlocked,
  handleDeleteAdminServer,
  handleCreateServerInvite,
  handleCopyInviteUrl,
  handleServerChange,
  handleRenameCurrentServer,
  handleLeaveCurrentServer,
  handleDeleteCurrentServer,
  handleRemoveServerMember,
  handleBanServerMember,
  handleUnbanServerMember,
  handleTransferServerOwnership,
  loadTelemetrySummary,
  setServerAudioQualityValue,
  setServerVideoEffectType,
  setServerVideoResolution,
  setServerVideoFps,
  setServerScreenShareResolution,
  setServerVideoPixelFxStrength,
  setServerVideoPixelFxPixelSize,
  setServerVideoPixelFxGridThickness,
  setServerVideoAsciiCellSize,
  setServerVideoAsciiContrast,
  setServerVideoAsciiColor,
  setBoundedServerVideoWindowMinWidth,
  setBoundedServerVideoWindowMaxWidth,
  creatingInvite
}: UseServerProfileModalPropsInput) {
  const permissions = useMemo<ServerProfileModalContainerProps["permissions"]>(() => ({
    canManageUsers,
    canPromote,
    canManageServerControlPlane,
    canViewTelemetry,
    canManageAudioQuality
  }), [canManageUsers, canPromote, canManageServerControlPlane, canViewTelemetry, canManageAudioQuality]);

  const state = useMemo<ServerProfileModalContainerProps["state"]>(() => ({
    serverMenuTab,
    serverAudioQuality,
    serverAudioQualitySaving,
    serverChatImagePolicy,
    serverVideoEffectType,
    serverVideoResolution,
    serverVideoFps,
    serverScreenShareResolution,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    serverVideoWindowMinWidth: normalizedServerVideoWindowMinWidth,
    serverVideoWindowMaxWidth: normalizedServerVideoWindowMaxWidth
  }), [
    serverMenuTab,
    serverAudioQuality,
    serverAudioQualitySaving,
    serverChatImagePolicy,
    serverVideoEffectType,
    serverVideoResolution,
    serverVideoFps,
    serverScreenShareResolution,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    normalizedServerVideoWindowMinWidth,
    normalizedServerVideoWindowMaxWidth
  ]);

  const data = useMemo<ServerProfileModalContainerProps["data"]>(() => ({
    adminUsers,
    adminServers,
    adminServersLoading,
    selectedAdminServerId,
    adminServerOverview,
    adminServerOverviewLoading,
    currentUserId,
    currentServerRole,
    currentServerName,
    currentServerId,
    servers,
    hasCurrentServer,
    serverMembers,
    serverMembersLoading,
    lastInviteUrl,
    eventLog,
    telemetrySummary,
    callStatus,
    lastCallPeer,
    roomVoiceConnected,
    callEventLog,
    serverVideoPreviewStream
  }), [
    adminUsers,
    adminServers,
    adminServersLoading,
    selectedAdminServerId,
    adminServerOverview,
    adminServerOverviewLoading,
    currentUserId,
    currentServerRole,
    currentServerName,
    currentServerId,
    servers,
    hasCurrentServer,
    serverMembers,
    serverMembersLoading,
    lastInviteUrl,
    eventLog,
    telemetrySummary,
    callStatus,
    lastCallPeer,
    roomVoiceConnected,
    callEventLog,
    serverVideoPreviewStream
  ]);

  const onChangeCurrentServer = useCallback<ServerProfileModalContainerProps["actions"]["onChangeCurrentServer"]>((serverId) => {
    handleServerChange(serverId);
    setSelectedAdminServerId(serverId);
  }, [handleServerChange, setSelectedAdminServerId]);

  const actions = useMemo<ServerProfileModalContainerProps["actions"]>(() => ({
    onClose: () => setAppMenuOpen(false),
    onSetServerMenuTab: setServerMenuTab,
    onPromote: (userId) => void promote(userId),
    onDemote: (userId) => void demote(userId),
    onSetBan: (userId, banned) => void setUserBan(userId, banned),
    onSetAccessState: (userId, accessState) => void setUserAccessState(userId, accessState),
    onSoftDeleteUser: (userId) => void deleteUser(userId),
    onForceDeleteUser: (userId) => void forceDeleteUserNow(userId),
    onSelectAdminServer: setSelectedAdminServerId,
    onToggleAdminServerBlocked: (serverId, blocked) => void handleToggleAdminServerBlocked(serverId, blocked),
    onDeleteAdminServer: (serverId) => void handleDeleteAdminServer(serverId),
    onCreateServerInvite: () => void handleCreateServerInvite(),
    onCopyInviteUrl: () => void handleCopyInviteUrl(),
    onChangeCurrentServer,
    onRenameCurrentServer: (name) => void handleRenameCurrentServer(name),
    onLeaveServer: () => void handleLeaveCurrentServer(),
    onDeleteServer: () => void handleDeleteCurrentServer(),
    onRemoveServerMember: (userId) => void handleRemoveServerMember(userId),
    onBanServerMember: (userId) => void handleBanServerMember(userId),
    onUnbanServerMember: (userId) => void handleUnbanServerMember(userId),
    onTransferServerOwnership: (userId) => void handleTransferServerOwnership(userId),
    onRefreshTelemetry: () => void loadTelemetrySummary(),
    onSetServerAudioQuality: (value) => void setServerAudioQualityValue(value),
    onSetServerVideoEffectType: setServerVideoEffectType,
    onSetServerVideoResolution: setServerVideoResolution,
    onSetServerVideoFps: setServerVideoFps,
    onSetServerScreenShareResolution: setServerScreenShareResolution,
    onSetServerVideoPixelFxStrength: setServerVideoPixelFxStrength,
    onSetServerVideoPixelFxPixelSize: setServerVideoPixelFxPixelSize,
    onSetServerVideoPixelFxGridThickness: setServerVideoPixelFxGridThickness,
    onSetServerVideoAsciiCellSize: setServerVideoAsciiCellSize,
    onSetServerVideoAsciiContrast: setServerVideoAsciiContrast,
    onSetServerVideoAsciiColor: setServerVideoAsciiColor,
    onSetServerVideoWindowMinWidth: setBoundedServerVideoWindowMinWidth,
    onSetServerVideoWindowMaxWidth: setBoundedServerVideoWindowMaxWidth
  }), [
    setAppMenuOpen,
    setServerMenuTab,
    promote,
    demote,
    setUserBan,
    setUserAccessState,
    deleteUser,
    forceDeleteUserNow,
    setSelectedAdminServerId,
    handleToggleAdminServerBlocked,
    handleDeleteAdminServer,
    handleCreateServerInvite,
    handleCopyInviteUrl,
    onChangeCurrentServer,
    handleRenameCurrentServer,
    handleLeaveCurrentServer,
    handleDeleteCurrentServer,
    handleRemoveServerMember,
    handleBanServerMember,
    handleUnbanServerMember,
    handleTransferServerOwnership,
    loadTelemetrySummary,
    setServerAudioQualityValue,
    setServerVideoEffectType,
    setServerVideoResolution,
    setServerVideoFps,
    setServerScreenShareResolution,
    setServerVideoPixelFxStrength,
    setServerVideoPixelFxPixelSize,
    setServerVideoPixelFxGridThickness,
    setServerVideoAsciiCellSize,
    setServerVideoAsciiContrast,
    setServerVideoAsciiColor,
    setBoundedServerVideoWindowMinWidth,
    setBoundedServerVideoWindowMaxWidth
  ]);

  const meta = useMemo<ServerProfileModalContainerProps["meta"]>(() => ({
    creatingInvite
  }), [creatingInvite]);

  return {
    permissions,
    state,
    data,
    actions,
    meta
  };
}