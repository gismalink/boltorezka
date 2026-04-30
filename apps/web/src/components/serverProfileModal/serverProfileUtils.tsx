/**
 * serverProfileUtils.tsx — вспомогательные функции и React-хелперы для ServerProfileModal.
 * Форматирование ролей, иконок, лямбды для выбора пермишнов и сообщений об ошибках.
 */
import type { ServerMemberRole } from "../../domain";
import { asTrimmedString } from "../../utils/stringUtils";

export type ServerMenuTab =
  | "users"
  | "roles"
  | "product_management"
  | "server_management"
  | "observability"
  | "sound"
  | "video"
  | "chat_images"
  | "desktop_downloads"
  | "documents_rules";
export type UserAccessTab = "active" | "blocked" | "requests" | "bots" | "deleted";
export type ProductManagementTab = "users" | "servers";
export type ObservabilityTab = "log" | "signaling" | "telemetry";
export type DocumentsRulesTab = "documents" | "rules";

export type IconAction = {
  key: string;
  label: string;
  iconClass: string;
  primary?: boolean;
  onClick: () => void;
};

export type RoleBadge = {
  key: string;
  label: string;
};

export type ServerMemberProfileDetails = {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  role: ServerMemberRole;
  customRoles: Array<{ id: string; name: string }>;
  hiddenRoomAccess: Array<{ roomId: string; roomSlug: string; roomTitle: string }>;
  hiddenRoomsAvailable: Array<{ roomId: string; roomSlug: string; roomTitle: string; hasAccess: boolean }>;
};

export type DesktopManifestFile = {
  name: string;
  relativePath?: string;
  urlPath?: string;
  url?: string;
};

export type DesktopManifest = {
  channel?: string;
  appVersion?: string;
  sha?: string;
  builtAt?: string;
  files?: DesktopManifestFile[];
};

export function resolveDisplayName(name: string | null | undefined, username: string | null | undefined, email: string): string {
  const normalizedName = asTrimmedString(name);
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedUsername = asTrimmedString(username);
  if (normalizedUsername) {
    return normalizedUsername;
  }

  const localPart = String(email || "").split("@")[0] || "";
  return localPart.trim() || email;
}

export function ActionIconButton({ action }: { action: IconAction }) {
  return (
    <button
      type="button"
      className={`${action.primary ? "" : "secondary "}icon-btn tiny admin-action-btn`}
      data-tooltip={action.label}
      aria-label={action.label}
      onClick={action.onClick}
      data-agent-id={`server.action.${action.key}`}
      data-agent-state="ready"
    >
      <i className={`bi ${action.iconClass}`} aria-hidden="true" />
    </button>
  );
}

export function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveDesktopArtifactHref(
  artifact: DesktopManifestFile | null,
  channel: "test" | "prod",
  sha: string,
  publicOrigin = ""
): string | null {
  if (!artifact) {
    return null;
  }

  const absoluteUrl = asTrimmedString(artifact.url);
  if (absoluteUrl) {
    return absoluteUrl;
  }

  const pathUrl = asTrimmedString(artifact.urlPath);
  if (pathUrl) {
    if (publicOrigin && pathUrl.startsWith("/")) {
      return `${publicOrigin}${pathUrl}`;
    }
    return pathUrl;
  }

  const relativePath = asTrimmedString(artifact.relativePath).replace(/^\/+/, "");
  if (!relativePath || !sha) {
    return null;
  }

  const relativeUrl = `/desktop/${channel}/${encodeURIComponent(sha)}/${encodePathSegments(relativePath)}`;
  return publicOrigin ? `${publicOrigin}${relativeUrl}` : relativeUrl;
}

export function normalizeDesktopChannel(value: string): "test" | "prod" {
  return asTrimmedString(value).toLowerCase() === "test" ? "test" : "prod";
}

export function resolveDesktopChannelFromOrigin(origin: string): "test" | "prod" {
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

export function getFallbackDesktopChannel(channel: "test" | "prod"): "test" | "prod" {
  return channel === "test" ? "prod" : "test";
}

export function pickDesktopArtifact(files: DesktopManifestFile[], platform: "windows" | "mac" | "linux"): DesktopManifestFile | null {
  const withHref = files.filter((item) => {
    const href = asTrimmedString(item.url || item.urlPath);
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
