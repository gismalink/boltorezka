import type { ComponentProps } from "react";
import { ServerProfileModal } from "./ServerProfileModal";

type ServerProfileModalProps = ComponentProps<typeof ServerProfileModal>;

type ServerProfileModalContainerProps = {
  open: boolean;
  t: ServerProfileModalProps["t"];
  permissions: {
    canManageUsers: boolean;
    canPromote: boolean;
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
};

export function ServerProfileModalContainer({ open, t, permissions, state, data, actions }: ServerProfileModalContainerProps) {
  return (
    <ServerProfileModal
      open={open}
      t={t}
      canManageUsers={permissions.canManageUsers}
      canPromote={permissions.canPromote}
      canViewTelemetry={permissions.canViewTelemetry}
      serverMenuTab={state.serverMenuTab}
      adminUsers={data.adminUsers}
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
