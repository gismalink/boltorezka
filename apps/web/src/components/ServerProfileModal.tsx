import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminServerListItem,
  AdminServerOverview,
  AudioQuality,
  ServerMemberItem,
  ServerMemberRole,
  TelemetrySummary,
  User
} from "../domain";
import { getDesktopUpdateBridge } from "../desktopBridge";
import type { ServerScreenShareResolution, ServerVideoEffectType } from "../hooks/rtc/voiceCallTypes";
import { resolvePublicOrigin } from "../runtimeOrigin";
import { RangeSlider } from "./RangeSlider";

type ServerMenuTab =
  | "users"
  | "product_management"
  | "server_management"
  | "observability"
  | "sound"
  | "video"
  | "chat_images"
  | "desktop_downloads";
type UserAccessTab = "active" | "blocked" | "requests" | "bots";
type ProductManagementTab = "users" | "servers";
type ObservabilityTab = "log" | "signaling" | "telemetry";

type IconAction = {
  key: string;
  label: string;
  iconClass: string;
  primary?: boolean;
  onClick: () => void;
};

function ActionIconButton({ action }: { action: IconAction }) {
  return (
    <button
      type="button"
      className={`${action.primary ? "" : "secondary "}icon-btn tiny admin-action-btn`}
      data-tooltip={action.label}
      aria-label={action.label}
      onClick={action.onClick}
    >
      <i className={`bi ${action.iconClass}`} aria-hidden="true" />
    </button>
  );
}

type ServerProfileModalProps = {
  open: boolean;
  t: (key: string) => string;
  canManageUsers: boolean;
  canPromote: boolean;
  canManageServerControlPlane: boolean;
  canViewTelemetry: boolean;
  serverMenuTab: ServerMenuTab;
  adminUsers: User[];
  adminServers: AdminServerListItem[];
  adminServersLoading: boolean;
  selectedAdminServerId: string;
  adminServerOverview: AdminServerOverview | null;
  adminServerOverviewLoading: boolean;
  currentUserId: string;
  currentServerRole: ServerMemberRole | null;
  currentServerName: string;
  serverMembers: ServerMemberItem[];
  serverMembersLoading: boolean;
  serverAgeLoading: boolean;
  serverAgeConfirmedAt: string | null;
  serverAgeConfirming: boolean;
  lastInviteUrl: string;
  creatingInvite: boolean;
  eventLog: string[];
  telemetrySummary: TelemetrySummary | null;
  callStatus: string;
  lastCallPeer: string;
  roomVoiceConnected: boolean;
  callEventLog: string[];
  serverAudioQuality: AudioQuality;
  serverAudioQualitySaving: boolean;
  canManageAudioQuality: boolean;
  serverChatImagePolicy: {
    maxDataUrlLength: number;
    maxImageSide: number;
    jpegQuality: number;
  };
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoResolution: "160x120" | "320x240" | "640x480";
  serverVideoFps: 10 | 15 | 24 | 30;
  serverScreenShareResolution: ServerScreenShareResolution;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  serverVideoWindowMinWidth: number;
  serverVideoWindowMaxWidth: number;
  serverVideoPreviewStream: MediaStream | null;
  onClose: () => void;
  onSetServerMenuTab: (value: ServerMenuTab) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onSetBan: (userId: string, banned: boolean) => void;
  onSetAccessState: (userId: string, accessState: "pending" | "active" | "blocked") => void;
  onSelectAdminServer: (serverId: string) => void;
  onCreateServerInvite: () => void;
  onCopyInviteUrl: () => void;
  onRenameCurrentServer: (name: string) => void;
  onConfirmServerAge: () => void;
  onLeaveServer: () => void;
  onRemoveServerMember: (userId: string) => void;
  onBanServerMember: (userId: string) => void;
  onUnbanServerMember: (userId: string) => void;
  onTransferServerOwnership: (userId: string) => void;
  onRefreshTelemetry: () => void;
  onSetServerAudioQuality: (value: AudioQuality) => void;
  onSetServerVideoEffectType: (value: ServerVideoEffectType) => void;
  onSetServerVideoResolution: (value: "160x120" | "320x240" | "640x480") => void;
  onSetServerVideoFps: (value: 10 | 15 | 24 | 30) => void;
  onSetServerScreenShareResolution: (value: ServerScreenShareResolution) => void;
  onSetServerVideoPixelFxStrength: (value: number) => void;
  onSetServerVideoPixelFxPixelSize: (value: number) => void;
  onSetServerVideoPixelFxGridThickness: (value: number) => void;
  onSetServerVideoAsciiCellSize: (value: number) => void;
  onSetServerVideoAsciiContrast: (value: number) => void;
  onSetServerVideoAsciiColor: (value: string) => void;
  onSetServerVideoWindowMinWidth: (value: number) => void;
  onSetServerVideoWindowMaxWidth: (value: number) => void;
};

type DesktopManifestFile = {
  name: string;
  relativePath?: string;
  urlPath?: string;
  url?: string;
};

type DesktopManifest = {
  channel?: string;
  appVersion?: string;
  sha?: string;
  builtAt?: string;
  files?: DesktopManifestFile[];
};

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveDesktopArtifactHref(
  artifact: DesktopManifestFile | null,
  channel: "test" | "prod",
  sha: string,
  publicOrigin = ""
): string | null {
  if (!artifact) {
    return null;
  }

  const absoluteUrl = String(artifact.url || "").trim();
  if (absoluteUrl) {
    return absoluteUrl;
  }

  const pathUrl = String(artifact.urlPath || "").trim();
  if (pathUrl) {
    if (publicOrigin && pathUrl.startsWith("/")) {
      return `${publicOrigin}${pathUrl}`;
    }
    return pathUrl;
  }

  const relativePath = String(artifact.relativePath || "").trim().replace(/^\/+/, "");
  if (!relativePath || !sha) {
    return null;
  }

  const relativeUrl = `/desktop/${channel}/${encodeURIComponent(sha)}/${encodePathSegments(relativePath)}`;
  return publicOrigin ? `${publicOrigin}${relativeUrl}` : relativeUrl;
}

function normalizeDesktopChannel(value: string): "test" | "prod" {
  return String(value || "").trim().toLowerCase() === "test" ? "test" : "prod";
}

function resolveDesktopChannelFromOrigin(origin: string): "test" | "prod" {
  if (!origin) {
    return "prod";
  }

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname.startsWith("test.") || hostname.includes(".test.") ? "test" : "prod";
  } catch {
    return "prod";
  }
}

function getFallbackDesktopChannel(channel: "test" | "prod"): "test" | "prod" {
  return channel === "test" ? "prod" : "test";
}

function pickDesktopArtifact(files: DesktopManifestFile[], platform: "windows" | "mac" | "linux"): DesktopManifestFile | null {
  const withHref = files.filter((item) => {
    const href = String(item.url || item.urlPath || "").trim();
    return href.length > 0;
  });

  const byName = (patterns: RegExp[]): DesktopManifestFile | null => {
    for (const pattern of patterns) {
      const found = withHref.find((item) => pattern.test(item.name));
      if (found) {
        return found;
      }
    }
    return null;
  };

  if (platform === "windows") {
    return byName([/\.exe$/i, /\.msi$/i, /\.nsis(\.7z)?$/i]);
  }

  if (platform === "mac") {
    return byName([/-mac-arm\d*\.zip$/i, /-mac\.zip$/i, /\.dmg$/i, /\.pkg$/i]);
  }

  return byName([/\.AppImage$/i, /\.deb$/i, /\.rpm$/i, /\.tar\.gz$/i, /linux/i]);
}

export function ServerProfileModal({
  open,
  t,
  canManageUsers,
  canPromote,
  canManageServerControlPlane,
  canViewTelemetry,
  serverMenuTab,
  adminUsers,
  adminServers,
  adminServersLoading,
  selectedAdminServerId,
  adminServerOverview,
  adminServerOverviewLoading,
  currentUserId,
  currentServerRole,
  currentServerName,
  serverMembers,
  serverMembersLoading,
  serverAgeLoading,
  serverAgeConfirmedAt,
  serverAgeConfirming,
  lastInviteUrl,
  creatingInvite,
  eventLog,
  telemetrySummary,
  callStatus,
  lastCallPeer,
  roomVoiceConnected,
  callEventLog,
  serverAudioQuality,
  serverAudioQualitySaving,
  canManageAudioQuality,
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
  serverVideoWindowMinWidth,
  serverVideoWindowMaxWidth,
  serverVideoPreviewStream,
  onClose,
  onSetServerMenuTab,
  onPromote,
  onDemote,
  onSetBan,
  onSetAccessState,
  onSelectAdminServer,
  onCreateServerInvite,
  onCopyInviteUrl,
  onRenameCurrentServer,
  onConfirmServerAge,
  onLeaveServer,
  onRemoveServerMember,
  onBanServerMember,
  onUnbanServerMember,
  onTransferServerOwnership,
  onRefreshTelemetry,
  onSetServerAudioQuality,
  onSetServerVideoEffectType,
  onSetServerVideoResolution,
  onSetServerVideoFps,
  onSetServerScreenShareResolution,
  onSetServerVideoPixelFxStrength,
  onSetServerVideoPixelFxPixelSize,
  onSetServerVideoPixelFxGridThickness,
  onSetServerVideoAsciiCellSize,
  onSetServerVideoAsciiContrast,
  onSetServerVideoAsciiColor,
  onSetServerVideoWindowMinWidth,
  onSetServerVideoWindowMaxWidth
}: ServerProfileModalProps) {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [desktopManifest, setDesktopManifest] = useState<DesktopManifest | null>(null);
  const [desktopManifestLoading, setDesktopManifestLoading] = useState(false);
  const [desktopManifestError, setDesktopManifestError] = useState("");
  const [desktopBridgeChannel, setDesktopBridgeChannel] = useState<"test" | "prod" | null>(null);
  const [desktopManifestChannel, setDesktopManifestChannel] = useState<"test" | "prod" | null>(null);
  const [userAccessTab, setUserAccessTab] = useState<UserAccessTab>("active");
  const [productManagementTab, setProductManagementTab] = useState<ProductManagementTab>("users");
  const [observabilityTab, setObservabilityTab] = useState<ObservabilityTab>("log");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [renameServerName, setRenameServerName] = useState("");
  const totalUsers = adminUsers.length;
  const totalAdmins = adminUsers.filter((item) => item.role === "admin" || item.role === "super_admin").length;
  const totalBanned = adminUsers.filter((item) => item.is_banned).length;
  const showProductManagementTab = canManageServerControlPlane;
  const showServerManagementTab = canManageServerControlPlane;
  const showLegacyUsersTab = !canManageServerControlPlane;
  const showServerMembersPanel = serverMenuTab === "users" || serverMenuTab === "server_management";
  const showAdminUsersPanel = canManageUsers
    && ((serverMenuTab === "users" && !canManageServerControlPlane)
      || (serverMenuTab === "product_management" && productManagementTab === "users"));
  const showAdminServersPanel = canManageServerControlPlane
    && serverMenuTab === "product_management"
    && productManagementTab === "servers";
  const rnnoiseProcessSamples = telemetrySummary?.metrics.rnnoise_process_cost_samples ?? 0;
  const rnnoiseProcessAvgMs = rnnoiseProcessSamples > 0
    ? (telemetrySummary?.metrics.rnnoise_process_cost_us_sum ?? 0) / rnnoiseProcessSamples / 1000
    : 0;

  const desktopPublicOrigin = useMemo(() => resolvePublicOrigin(), []);

  const desktopOriginChannel = useMemo<"test" | "prod">(() => {
    if (desktopPublicOrigin) {
      return resolveDesktopChannelFromOrigin(desktopPublicOrigin);
    }

    if (typeof window === "undefined") {
      return "prod";
    }

    const hostname = window.location.hostname.toLowerCase();
    return hostname.startsWith("test.") || hostname.includes(".test.") ? "test" : "prod";
  }, [desktopPublicOrigin]);

  const desktopChannel = useMemo<"test" | "prod">(() => {
    // On desktop file runtime test/prod host should define the download channel.
    if (desktopOriginChannel === "test") {
      return "test";
    }

    if (desktopBridgeChannel) {
      return desktopBridgeChannel;
    }

    return desktopOriginChannel;
  }, [desktopBridgeChannel, desktopOriginChannel]);

  const effectiveDesktopChannel = desktopManifestChannel || desktopChannel;

  const desktopCards = useMemo(
    () => [
      { id: "windows" as const, label: t("server.desktopPlatformWindows"), iconClass: "bi-windows" },
      { id: "mac" as const, label: t("server.desktopPlatformMac"), iconClass: "bi-apple" },
      { id: "linux" as const, label: t("server.desktopPlatformLinux"), iconClass: "bi-ubuntu" }
    ].map((platform) => {
      const files = Array.isArray(desktopManifest?.files) ? desktopManifest.files : [];
      const artifact = pickDesktopArtifact(files, platform.id);
      const href = resolveDesktopArtifactHref(
        artifact,
        effectiveDesktopChannel,
        String(desktopManifest?.sha || "").trim(),
        desktopPublicOrigin
      );
      return {
        ...platform,
        href,
        fileName: artifact?.name || ""
      };
    }),
    [desktopManifest, desktopPublicOrigin, effectiveDesktopChannel, t]
  );

  useEffect(() => {
    setRenameServerName(String(currentServerName || "").trim());
  }, [currentServerName]);

  useEffect(() => {
    if (!canViewTelemetry && observabilityTab === "telemetry") {
      setObservabilityTab("log");
    }
  }, [canViewTelemetry, observabilityTab]);

  useEffect(() => {
    if (!open || serverMenuTab !== "desktop_downloads") {
      return;
    }

    const desktopUpdate = getDesktopUpdateBridge();
    if (!desktopUpdate) {
      return;
    }

    let disposed = false;

    void desktopUpdate.getStatus()
      .then((status) => {
        if (!disposed) {
          setDesktopBridgeChannel(normalizeDesktopChannel(status.channel));
        }
      })
      .catch(() => {
        return;
      });

    return () => {
      disposed = true;
    };
  }, [open, serverMenuTab]);

  const normalizedUserSearch = userSearchQuery.trim().toLowerCase();

  const usersByTab = useMemo(() => {
    const active = adminUsers.filter((item) => !item.is_bot && !item.is_banned && item.access_state === "active");
    const blocked = adminUsers.filter((item) => !item.is_bot && (item.is_banned || item.access_state === "blocked"));
    const requests = adminUsers.filter((item) => !item.is_bot && !item.is_banned && item.access_state === "pending");
    const bots = adminUsers.filter((item) => item.is_bot);

    return { active, blocked, requests, bots };
  }, [adminUsers]);

  const filteredAdminUsers = useMemo(() => {
    const source = usersByTab[userAccessTab];
    if (!normalizedUserSearch) {
      return source;
    }

    return source.filter((item) => {
      const haystack = [item.email, item.name, item.username || "", item.role].join(" ").toLowerCase();
      return haystack.includes(normalizedUserSearch);
    });
  }, [normalizedUserSearch, userAccessTab, usersByTab]);

  const getUserRowActions = (item: User) => {
    const actions: IconAction[] = [];
    const isProtected = item.role === "super_admin";

    if (canPromote && userAccessTab === "active" && !isProtected) {
      if (item.role === "user") {
        actions.push({
          key: "promote",
          label: t("admin.promote"),
          iconClass: "bi-arrow-up-circle-fill",
          primary: true,
          onClick: () => onPromote(item.id)
        });
      } else if (item.role === "admin") {
        actions.push({
          key: "demote",
          label: t("admin.demote"),
          iconClass: "bi-arrow-down-circle-fill",
          onClick: () => onDemote(item.id)
        });
      }
    }

    if (isProtected) {
      return actions;
    }

    if (item.is_banned) {
      actions.push({
        key: "unban",
        label: t("admin.unban"),
        iconClass: "bi-person-check-fill",
        onClick: () => onSetBan(item.id, false)
      });
      return actions;
    }

    if (userAccessTab === "requests") {
      if (item.access_state !== "active") {
        actions.push({
          key: "approve",
          label: t("admin.approve"),
          iconClass: "bi-check-circle-fill",
          onClick: () => onSetAccessState(item.id, "active")
        });
      }
      if (item.access_state !== "blocked") {
        actions.push({
          key: "block",
          label: t("admin.blockAccess"),
          iconClass: "bi-slash-circle-fill",
          onClick: () => onSetAccessState(item.id, "blocked")
        });
      }
      actions.push({
        key: "ban",
        label: t("admin.ban"),
        iconClass: "bi-person-fill-x",
        onClick: () => onSetBan(item.id, true)
      });
      return actions;
    }

    if (userAccessTab === "blocked") {
      if (item.access_state === "blocked") {
        actions.push({
          key: "approve",
          label: t("admin.approve"),
          iconClass: "bi-check-circle-fill",
          onClick: () => onSetAccessState(item.id, "active")
        });
      }
      if (item.access_state !== "pending") {
        actions.push({
          key: "toRequests",
          label: t("admin.toRequests"),
          iconClass: "bi-inbox-fill",
          onClick: () => onSetAccessState(item.id, "pending")
        });
      }
      actions.push({
        key: "ban",
        label: t("admin.ban"),
        iconClass: "bi-person-fill-x",
        onClick: () => onSetBan(item.id, true)
      });
      return actions;
    }

    if (item.access_state !== "pending") {
      actions.push({
        key: "toRequests",
        label: t("admin.toRequests"),
        iconClass: "bi-inbox-fill",
        onClick: () => onSetAccessState(item.id, "pending")
      });
    }
    if (item.access_state !== "blocked") {
      actions.push({
        key: "block",
        label: t("admin.blockAccess"),
        iconClass: "bi-slash-circle-fill",
        onClick: () => onSetAccessState(item.id, "blocked")
      });
    }
    if (userAccessTab === "bots" && item.access_state !== "active") {
      actions.push({
        key: "approve",
        label: t("admin.approve"),
        iconClass: "bi-check-circle-fill",
        onClick: () => onSetAccessState(item.id, "active")
      });
    }
    actions.push({
      key: "ban",
      label: t("admin.ban"),
      iconClass: "bi-person-fill-x",
      onClick: () => onSetBan(item.id, true)
    });

    return actions;
  };

  const getServerMemberRowActions = (member: ServerMemberItem): IconAction[] => {
    const actions: IconAction[] = [];

    if (member.userId === currentUserId && member.role !== "owner") {
      actions.push({
        key: "leave",
        label: t("server.leave"),
        iconClass: "bi-box-arrow-right",
        onClick: onLeaveServer
      });
      return actions;
    }

    const canModerateMember = member.userId !== currentUserId
      && ((currentServerRole === "owner" && member.role !== "owner")
        || (currentServerRole === "admin" && member.role === "member"));

    if (canModerateMember) {
      if (member.isServerBanned) {
        actions.push({
          key: "unban",
          label: t("server.unbanMember"),
          iconClass: "bi-person-check-fill",
          onClick: () => onUnbanServerMember(member.userId)
        });
      } else {
        actions.push({
          key: "ban",
          label: t("server.banMember"),
          iconClass: "bi-person-fill-x",
          onClick: () => onBanServerMember(member.userId)
        });
      }

      actions.push({
        key: "remove",
        label: t("server.removeMember"),
        iconClass: "bi-person-dash-fill",
        onClick: () => onRemoveServerMember(member.userId)
      });
    }

    if (member.userId !== currentUserId && currentServerRole === "owner" && member.role !== "owner") {
      actions.push({
        key: "transfer",
        label: t("server.transferOwnership"),
        iconClass: "bi-arrow-left-right",
        primary: true,
        onClick: () => onTransferServerOwnership(member.userId)
      });
    }

    return actions;
  };

  useEffect(() => {
    const element = previewVideoRef.current;
    if (!element) {
      return;
    }

    if (!serverVideoPreviewStream) {
      element.srcObject = null;
      return;
    }

    element.srcObject = serverVideoPreviewStream;
    void element.play().catch(() => {
      return;
    });
  }, [serverVideoPreviewStream]);

  useEffect(() => {
    if (!open || serverMenuTab !== "desktop_downloads") {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    async function fetchDesktopManifestForChannel(channel: "test" | "prod"): Promise<DesktopManifest> {
      const manifestPath = `/desktop/${channel}/latest.json`;
      const manifestUrl = desktopPublicOrigin ? `${desktopPublicOrigin}${manifestPath}` : manifestPath;
      const response = await fetch(manifestUrl, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`[${channel}] status ${response.status}`);
      }

      const rawBody = await response.text();
      let payload: DesktopManifest;
      try {
        payload = JSON.parse(rawBody) as DesktopManifest;
      } catch {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const bodyPreview = rawBody.slice(0, 80).replace(/\s+/g, " ").trim();
        throw new Error(`[${channel}] invalid json (${contentType || "unknown"}): ${bodyPreview || "empty body"}`);
      }

      return payload;
    }

    async function loadDesktopManifest() {
      setDesktopManifestLoading(true);
      setDesktopManifestError("");
      setDesktopManifestChannel(null);

      try {
        const channelsToTry: Array<"test" | "prod"> = [desktopChannel];
        const fallbackChannel = getFallbackDesktopChannel(desktopChannel);
        if (fallbackChannel !== desktopChannel) {
          channelsToTry.push(fallbackChannel);
        }

        if (desktopOriginChannel !== desktopChannel && desktopOriginChannel !== fallbackChannel) {
          channelsToTry.push(desktopOriginChannel);
        }

        const seen = new Set<string>();
        const uniqueChannels = channelsToTry.filter((channel) => {
          if (seen.has(channel)) {
            return false;
          }
          seen.add(channel);
          return true;
        });

        const errors: string[] = [];
        let resolved: { payload: DesktopManifest; channel: "test" | "prod" } | null = null;

        for (const channel of uniqueChannels) {
          try {
            const payload = await fetchDesktopManifestForChannel(channel);
            resolved = { payload, channel };
            break;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : `[${channel}] unknown error`);
          }
        }

        if (!resolved) {
          throw new Error(errors.join(" | "));
        }

        const manifestReportedChannel = normalizeDesktopChannel(String(resolved.payload.channel || ""));

        if (!disposed) {
          setDesktopManifest(resolved.payload);
          setDesktopManifestChannel(manifestReportedChannel || resolved.channel);
        }
      } catch (error) {
        if (disposed || controller.signal.aborted) {
          return;
        }

        setDesktopManifest(null);
        setDesktopManifestError(error instanceof Error ? error.message : "unknown");
      } finally {
        if (!disposed) {
          setDesktopManifestLoading(false);
        }
      }
    }

    void loadDesktopManifest();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [desktopChannel, desktopOriginChannel, desktopPublicOrigin, open, serverMenuTab]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="voice-preferences-overlay fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="card voice-preferences-modal user-settings-modal server-profile-modal grid w-full max-w-[980px] min-w-0 gap-4 max-desktop:h-full max-desktop:max-h-none max-desktop:min-h-0 max-desktop:overflow-hidden max-desktop:p-4 desktop:grid-cols-[250px_1fr]">
        <div className="user-settings-sidebar grid min-w-0 content-start gap-2">
          <div className="voice-preferences-kicker">{t("server.title")}</div>
          {showLegacyUsersTab ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "users" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("users")}
            >
              {t("server.tabUsers")}
            </button>
          ) : null}
          {showProductManagementTab ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "product_management" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("product_management")}
            >
              {t("server.tabProductManagement")}
            </button>
          ) : null}
          {showServerManagementTab ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "server_management" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("server_management")}
            >
              {t("server.tabServerManagement")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "observability" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("observability")}
          >
            {t("server.tabObservability")}
          </button>
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("sound")}
            >
              {t("server.tabSound")}
            </button>
          ) : null}
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "video" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("video")}
            >
              {t("server.tabVideo")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "chat_images" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("chat_images")}
          >
            {t("server.tabChatImages")}
          </button>
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "desktop_downloads" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("desktop_downloads")}
          >
            {t("server.tabDesktopApp")}
          </button>
        </div>

        <div className="user-settings-content grid min-h-0 min-w-0 content-start gap-4 overflow-auto overflow-x-hidden pr-0">
          <div className="voice-preferences-head flex items-center justify-between gap-3">
            <h2 className="mt-[var(--space-xxs)]">
              {serverMenuTab === "users" ? t("server.tabUsers") : null}
              {serverMenuTab === "product_management" ? t("server.tabProductManagement") : null}
              {serverMenuTab === "server_management" ? t("server.tabServerManagement") : null}
              {serverMenuTab === "observability" ? t("server.tabObservability") : null}
              {serverMenuTab === "sound" ? t("server.tabSound") : null}
              {serverMenuTab === "video" ? t("server.tabVideo") : null}
              {serverMenuTab === "chat_images" ? t("server.tabChatImages") : null}
              {serverMenuTab === "desktop_downloads" ? t("server.tabDesktopApp") : null}
            </h2>
            <button
              type="button"
              className="secondary icon-btn"
              onClick={onClose}
              aria-label={t("settings.closeVoiceAria")}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          {showServerMembersPanel || showAdminUsersPanel ? (
            <section className="grid gap-3">
              {showServerMembersPanel ? (
                <>
                  <h3>{t("server.membersTitle")}</h3>
                  <p className="muted">
                    {serverMembersLoading
                      ? t("server.membersLoading")
                      : `${t("server.membersCount")}: ${serverMembers.length}`}
                  </p>
                  <div className="grid gap-2">
                    <label className="grid gap-1">
                      <span className="muted">{t("server.inviteTitle")}</span>
                      <input
                        type="text"
                        readOnly
                        value={lastInviteUrl}
                        placeholder={t("server.invitePlaceholder")}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={onCreateServerInvite} disabled={creatingInvite}>
                        {creatingInvite ? t("server.inviteCreateLoading") : t("server.inviteCreate")}
                      </button>
                      <button type="button" className="secondary" onClick={onCopyInviteUrl} disabled={!lastInviteUrl}>
                        {t("server.inviteCopy")}
                      </button>
                    </div>
                  </div>
                  {(currentServerRole === "owner" || currentServerRole === "admin") ? (
                    <div className="grid gap-2">
                      <h4>{t("server.renameTitle")}</h4>
                      <label className="grid gap-1">
                        <span className="muted">{t("server.renameLabel")}</span>
                        <input
                          type="text"
                          value={renameServerName}
                          maxLength={64}
                          onChange={(event) => setRenameServerName(event.target.value)}
                          placeholder={t("server.renamePlaceholder")}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onRenameCurrentServer(renameServerName)}
                          disabled={renameServerName.trim().length < 3}
                        >
                          {t("server.renameAction")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <h4>{t("server.ageConfirmTitle")}</h4>
                    <p className="muted">
                      {serverAgeLoading
                        ? t("server.ageConfirmLoading")
                        : serverAgeConfirmedAt
                          ? `${t("server.ageConfirmConfirmedAt")}: ${new Date(serverAgeConfirmedAt).toLocaleString()}`
                          : t("server.ageConfirmNotConfirmed")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={onConfirmServerAge} disabled={serverAgeConfirming}>
                        {serverAgeConfirming ? t("server.ageConfirmActionLoading") : t("server.ageConfirmAction")}
                      </button>
                    </div>
                  </div>
                  <ul className="admin-list grid gap-2">
                    {serverMembers.map((member) => (
                      <li key={member.userId} className="admin-row grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-desktop:grid-cols-1">
                        <span className="min-w-0 break-words">
                          {member.name} · {member.email} ({member.role})
                        </span>
                        <div className="row-actions flex flex-wrap items-stretch justify-end gap-2">
                          {getServerMemberRowActions(member).map((action) => (
                            <ActionIconButton key={`${member.userId}-${action.key}`} action={action} />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!serverMembersLoading && serverMembers.length === 0 ? <p className="muted">{t("server.membersEmpty")}</p> : null}
                </>
              ) : null}

              {serverMenuTab === "product_management" && canManageServerControlPlane ? (
                <div className="quality-toggle-group" role="tablist" aria-label={t("server.productTabs")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${productManagementTab === "users" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => setProductManagementTab("users")}
                    aria-selected={productManagementTab === "users"}
                  >
                    {t("server.productTabUsers")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${productManagementTab === "servers" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => setProductManagementTab("servers")}
                    aria-selected={productManagementTab === "servers"}
                  >
                    {t("server.productTabServers")}
                  </button>
                </div>
              ) : null}

              {showAdminUsersPanel ? (
                <>
              <h3>{t("admin.title")}</h3>
              <p className="muted">Users total: {totalUsers} · Admins: {totalAdmins} · Banned: {totalBanned}</p>
              <label className="grid gap-1">
                <span className="muted">{t("admin.searchLabel")}</span>
                <input
                  type="search"
                  value={userSearchQuery}
                  onChange={(event) => setUserSearchQuery(event.target.value)}
                  placeholder={t("admin.searchPlaceholder")}
                />
              </label>
              <div className="quality-toggle-group" role="tablist" aria-label={t("admin.userTabs")}> 
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${userAccessTab === "active" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setUserAccessTab("active")}
                  aria-selected={userAccessTab === "active"}
                >
                  {t("admin.tabActive")} ({usersByTab.active.length})
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${userAccessTab === "blocked" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setUserAccessTab("blocked")}
                  aria-selected={userAccessTab === "blocked"}
                >
                  {t("admin.tabBlocked")} ({usersByTab.blocked.length})
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${userAccessTab === "requests" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setUserAccessTab("requests")}
                  aria-selected={userAccessTab === "requests"}
                >
                  {t("admin.tabRequests")} ({usersByTab.requests.length})
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${userAccessTab === "bots" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setUserAccessTab("bots")}
                  aria-selected={userAccessTab === "bots"}
                >
                  {t("admin.tabBots")} ({usersByTab.bots.length})
                </button>
              </div>
              <ul className="admin-list grid gap-2">
                {filteredAdminUsers.map((item) => (
                  <li key={item.id} className="admin-row grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-desktop:grid-cols-1">
                    <span className="min-w-0 break-words">
                      {item.email} ({item.role})
                      {item.is_banned ? ` · ${t("admin.banned")}` : ""}
                      {!item.is_banned ? ` · ${t(`admin.access.${item.access_state}`)}` : ""}
                    </span>
                    <div className="row-actions flex flex-wrap items-stretch gap-2">
                      {getUserRowActions(item).map((action) => (
                        <ActionIconButton key={`${item.id}-${action.key}`} action={action} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {filteredAdminUsers.length === 0 ? <p className="muted">{t("admin.emptyState")}</p> : null}
                </>
              ) : null}

              {showAdminServersPanel ? (
                <>
                  <h3>{t("server.managementTitle")}</h3>
                  <p className="muted">
                    {adminServersLoading
                      ? t("server.managementLoading")
                      : `${t("server.managementServersCount")}: ${adminServers.length}`}
                  </p>
                  <label className="grid gap-1">
                    <span className="muted">{t("server.managementServerSelect")}</span>
                    <select
                      value={selectedAdminServerId}
                      onChange={(event) => onSelectAdminServer(event.target.value)}
                      disabled={adminServersLoading || adminServers.length === 0}
                    >
                      {adminServers.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name} ({server.slug})
                        </option>
                      ))}
                    </select>
                  </label>

                  {adminServerOverviewLoading ? <p className="muted">{t("server.managementOverviewLoading")}</p> : null}
                  {!adminServerOverviewLoading && !adminServerOverview ? <p className="muted">{t("server.managementEmpty")}</p> : null}

                  {adminServerOverview ? (
                    <div className="grid gap-1">
                      <div>{t("server.managementOwner")}: {adminServerOverview.ownerName || "-"}</div>
                      <div>{t("server.managementMembers")}: {adminServerOverview.metrics.members.active} / {adminServerOverview.metrics.members.total}</div>
                      <div>{t("server.managementRooms")}: {adminServerOverview.metrics.rooms.total}</div>
                      <div>{t("server.managementMessages")}: {adminServerOverview.metrics.messages.total}</div>
                      <div>{t("server.managementInvites")}: {adminServerOverview.metrics.invites.active} / {adminServerOverview.metrics.invites.total}</div>
                      <div>{t("server.managementBans")}: {adminServerOverview.metrics.serverBans.active} / {adminServerOverview.metrics.serverBans.total}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "observability" ? (
            <section className="grid min-h-0 gap-3">
              <div className="quality-toggle-group" role="tablist" aria-label={t("server.observabilityTabs")}>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${observabilityTab === "log" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setObservabilityTab("log")}
                  aria-selected={observabilityTab === "log"}
                >
                  {t("server.observabilityTabLog")}
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${observabilityTab === "signaling" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => setObservabilityTab("signaling")}
                  aria-selected={observabilityTab === "signaling"}
                >
                  {t("server.observabilityTabSignaling")}
                </button>
                {canViewTelemetry ? (
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${observabilityTab === "telemetry" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => setObservabilityTab("telemetry")}
                    aria-selected={observabilityTab === "telemetry"}
                  >
                    {t("server.observabilityTabTelemetry")}
                  </button>
                ) : null}
              </div>

              {observabilityTab === "log" ? (
                <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3">
                  <h3>{t("events.title")}</h3>
                  <div className="log h-full max-h-none overflow-auto">
                    {eventLog.map((line, index) => (
                      <div key={`${line}-${index}`}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              {observabilityTab === "telemetry" && canViewTelemetry ? (
                <div className="grid gap-3">
                  <h3>{t("telemetry.title")}</h3>
                  <p className="muted">{t("telemetry.day")}: {telemetrySummary?.day || "-"}</p>
                  <div className="grid gap-1">
                    <div>ack_sent: {telemetrySummary?.metrics.ack_sent ?? 0}</div>
                    <div>nack_sent: {telemetrySummary?.metrics.nack_sent ?? 0}</div>
                    <div>chat_sent: {telemetrySummary?.metrics.chat_sent ?? 0}</div>
                    <div>chat_idempotency_hit: {telemetrySummary?.metrics.chat_idempotency_hit ?? 0}</div>
                    <div>telemetry_web_event: {telemetrySummary?.metrics.telemetry_web_event ?? 0}</div>
                    <div>rnnoise_toggle_on: {telemetrySummary?.metrics.rnnoise_toggle_on ?? 0}</div>
                    <div>rnnoise_toggle_off: {telemetrySummary?.metrics.rnnoise_toggle_off ?? 0}</div>
                    <div>rnnoise_init_error: {telemetrySummary?.metrics.rnnoise_init_error ?? 0}</div>
                    <div>rnnoise_fallback_unavailable: {telemetrySummary?.metrics.rnnoise_fallback_unavailable ?? 0}</div>
                    <div>rnnoise_process_cost_samples: {rnnoiseProcessSamples}</div>
                    <div>rnnoise_process_avg_ms: {rnnoiseProcessAvgMs.toFixed(3)}</div>
                  </div>
                  <button onClick={onRefreshTelemetry}>{t("telemetry.refresh")}</button>
                </div>
              ) : null}

              {observabilityTab === "signaling" ? (
                <div className="signaling-panel grid min-h-0 flex-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3">
                  <h3>{t("call.title")}</h3>
                  <p className="muted">{t("call.status")}: {callStatus}{lastCallPeer ? ` (${lastCallPeer})` : ""}</p>
                  <p className="muted">
                    {roomVoiceConnected ? t("call.autoConnected") : t("call.autoWaiting")}
                  </p>
                  <div className="log call-log h-full max-h-none overflow-auto">
                    {callEventLog.map((line, index) => (
                      <div key={`${line}-${index}`}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "sound" && canManageAudioQuality ? (
            <section className="grid gap-3">
              <h3>{t("server.soundTitle")}</h3>
              <p className="muted">{t("server.soundHint")}</p>
              <div className="grid gap-2">
                <span>{t("server.soundQuality")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.soundQuality")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "retro" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("retro")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "retro"}
                  >
                    {t("server.soundRetro")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "low" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("low")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "low"}
                  >
                    {t("server.soundLow")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "standard" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("standard")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "standard"}
                  >
                    {t("server.soundStandard")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "high" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("high")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "high"}
                  >
                    {t("server.soundHigh")}
                  </button>
                </div>
              </div>
              {!canManageAudioQuality ? (
                <p className="muted">{t("server.soundReadonly")}</p>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "video" && canManageAudioQuality ? (
            <section className="grid gap-3">
              <h3>{t("server.videoTitle")}</h3>
              <p className="muted">{t("server.videoHint")}</p>

              <div className="grid gap-2">
                <span>{t("server.videoPreview")}</span>
                <div className="server-video-preview-frame">
                  <video
                    ref={previewVideoRef}
                    className="server-video-preview-media"
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
                <p className="muted">{t("server.videoPreviewHint")}</p>
              </div>

              <label className="grid gap-2">
                <span>{t("server.videoEffectType")}</span>
                <select
                  value={serverVideoEffectType}
                  onChange={(event) => onSetServerVideoEffectType(event.target.value as ServerVideoEffectType)}
                >
                  <option value="none">{t("server.videoEffectNone")}</option>
                  <option value="pixel8">{t("server.videoEffectPixel8")}</option>
                  <option value="ascii">{t("server.videoEffectAscii")}</option>
                </select>
              </label>

              <div className="grid gap-2">
                <span>{t("server.videoResolution")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.videoResolution")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "160x120" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("160x120")}
                    aria-pressed={serverVideoResolution === "160x120"}
                  >
                    160x120
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "320x240" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("320x240")}
                    aria-pressed={serverVideoResolution === "320x240"}
                  >
                    320x240
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "640x480" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("640x480")}
                    aria-pressed={serverVideoResolution === "640x480"}
                  >
                    640x480
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <span>{t("server.videoFps")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.videoFps")}>
                  {[10, 15, 24, 30].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      className={`secondary quality-toggle-btn ${serverVideoFps === fps ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => onSetServerVideoFps(fps as 10 | 15 | 24 | 30)}
                      aria-pressed={serverVideoFps === fps}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <span>{t("server.screenShareResolution")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.screenShareResolution")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "hd" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("hd")}
                    aria-pressed={serverScreenShareResolution === "hd"}
                  >
                    {t("server.screenShareHd")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "fullhd" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("fullhd")}
                    aria-pressed={serverScreenShareResolution === "fullhd"}
                  >
                    {t("server.screenShareFullhd")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "max" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("max")}
                    aria-pressed={serverScreenShareResolution === "max"}
                  >
                    {t("server.screenShareMax")}
                  </button>
                </div>
              </div>

              <div className="server-video-sliders">
                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMinWidth")}: {serverVideoWindowMinWidth}px
                  <RangeSlider
                    min={80}
                    max={300}
                    step={1}
                    value={serverVideoWindowMinWidth}
                    valueSuffix="px"
                    onChange={onSetServerVideoWindowMinWidth}
                  />
                </label>

                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMaxWidth")}: {serverVideoWindowMaxWidth}px
                  <RangeSlider
                    min={120}
                    max={480}
                    step={1}
                    value={serverVideoWindowMaxWidth}
                    valueSuffix="px"
                    onChange={onSetServerVideoWindowMaxWidth}
                  />
                </label>
              </div>

              {serverVideoEffectType === "pixel8" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoFxStrength")}: {serverVideoPixelFxStrength}%
                    <RangeSlider
                      min={0}
                      max={100}
                      step={1}
                      value={serverVideoPixelFxStrength}
                      valueSuffix="%"
                      onChange={onSetServerVideoPixelFxStrength}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxPixelSize")}: {serverVideoPixelFxPixelSize}px
                    <RangeSlider
                      min={2}
                      max={10}
                      step={1}
                      value={serverVideoPixelFxPixelSize}
                      valueSuffix="px"
                      onChange={onSetServerVideoPixelFxPixelSize}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxGridThickness")}: {serverVideoPixelFxGridThickness}px
                    <RangeSlider
                      min={1}
                      max={4}
                      step={1}
                      value={serverVideoPixelFxGridThickness}
                      valueSuffix="px"
                      onChange={onSetServerVideoPixelFxGridThickness}
                    />
                  </label>
                </div>
              ) : null}

              {serverVideoEffectType === "ascii" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiCellSize")}: {serverVideoAsciiCellSize}px
                    <RangeSlider
                      min={4}
                      max={16}
                      step={1}
                      value={serverVideoAsciiCellSize}
                      valueSuffix="px"
                      onChange={onSetServerVideoAsciiCellSize}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiContrast")}: {serverVideoAsciiContrast}%
                    <RangeSlider
                      min={60}
                      max={200}
                      step={5}
                      value={serverVideoAsciiContrast}
                      valueSuffix="%"
                      onChange={onSetServerVideoAsciiContrast}
                    />
                  </label>

                  <label className="grid gap-2 server-video-slider-color">
                    <span>{t("server.videoAsciiColor")}</span>
                    <input
                      type="color"
                      value={serverVideoAsciiColor}
                      onChange={(event) => onSetServerVideoAsciiColor(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "chat_images" ? (
            <section className="grid gap-3">
              <h3>{t("server.chatImagesTitle")}</h3>
              <p className="muted">{t("server.chatImagesHint")}</p>
              <div className="grid gap-2">
                <div>maxDataUrlLength: {serverChatImagePolicy.maxDataUrlLength}</div>
                <div>maxImageSide: {serverChatImagePolicy.maxImageSide}px</div>
                <div>jpegQuality: {serverChatImagePolicy.jpegQuality}</div>
              </div>
              <p className="muted">{t("server.chatImagesReadonly")}</p>
            </section>
          ) : null}

          {serverMenuTab === "desktop_downloads" ? (
            <section className="grid gap-3">
              <h3>{t("server.desktopTitle")}</h3>
              <p className="muted">{t("server.desktopHint")}</p>
              <p className="muted">
                {t("server.desktopChannel")}: {desktopManifest?.channel || effectiveDesktopChannel}
                {desktopManifest?.appVersion ? ` · ${t("server.desktopAppVersion")}: ${desktopManifest.appVersion}` : ""}
                {desktopManifest?.sha ? ` · ${t("server.desktopVersionSha")}: ${desktopManifest.sha.slice(0, 8)}` : ""}
              </p>
              {effectiveDesktopChannel === "test" ? <p className="muted text-xs">{t("server.desktopUnsignedWarning")}</p> : null}
              {desktopManifestLoading ? <p className="muted">{t("server.desktopLoading")}</p> : null}
              {desktopManifestError ? <p className="muted">{t("server.desktopError")}: {desktopManifestError}</p> : null}
              <div className="grid gap-3 desktop:grid-cols-3">
                {desktopCards.map((platform) => (
                  <div key={platform.id} className="card compact grid place-items-center gap-2 p-3 text-center">
                    <i className={`bi ${platform.iconClass} text-xl`} aria-hidden="true" />
                    <div className="text-sm font-semibold">{platform.label}</div>
                    {platform.href ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => window.open(platform.href!, "_blank", "noopener,noreferrer")}
                        title={platform.fileName}
                        aria-label={`${t("server.desktopDownload")}: ${platform.fileName}`}
                      >
                        {t("server.desktopDownload")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        disabled
                        title={t("server.desktopSoon")}
                        aria-label={`${t("server.desktopDownload")} (${t("server.desktopSoon")})`}
                      >
                        {t("server.desktopDownload")}
                      </button>
                    )}
                    <div className="muted text-xs">
                      {platform.href ? t("server.desktopAvailable") : t("server.desktopUnavailable")}
                    </div>
                    <div className="muted text-xs break-all">
                      {platform.fileName || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
