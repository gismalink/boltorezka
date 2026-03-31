import { useState } from "react";
import type { CallStatus } from "../../../services";
import type {
  AdminServerListItem,
  AdminServerOverview,
  Message,
  MessagesCursor,
  PresenceMember,
  Room,
  RoomMemberPreference,
  RoomsTreeResponse,
  ServerMemberItem,
  ServerListItem,
  TelemetrySummary,
  User
} from "../../../domain";
import { readPersistedBearerToken } from "../../../utils/authStorage";

type UseAppCoreStateInput = {
  versionUpdatePendingKey: string;
  cookieConsentKey: string;
  currentServerIdStorageKey: string;
  pendingAccessAutoRefreshSec: number;
};

export function useAppCoreState({
  versionUpdatePendingKey,
  cookieConsentKey,
  currentServerIdStorageKey,
  pendingAccessAutoRefreshSec
}: UseAppCoreStateInput) {
  const [token, setToken] = useState(() => readPersistedBearerToken());
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
  const [archivedRooms, setArchivedRooms] = useState<Room[]>([]);
  const [roomSlug, setRoomSlug] = useState("");
  const [chatRoomSlug, setChatRoomSlug] = useState("");
  const [showAppUpdatedOverlay, setShowAppUpdatedOverlay] = useState(
    () => sessionStorage.getItem(versionUpdatePendingKey) === "1"
  );
  const [cookieConsentAccepted, setCookieConsentAccepted] = useState(
    () => localStorage.getItem(cookieConsentKey) === "1"
  );
  const [pendingAccessRefreshInSec, setPendingAccessRefreshInSec] = useState(pendingAccessAutoRefreshSec);
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [sessionMovedOverlayMessage, setSessionMovedOverlayMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<MessagesCursor | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [chatText, setChatText] = useState("");
  const [pendingChatImageDataUrl, setPendingChatImageDataUrl] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug] = useState<Record<string, PresenceMember[]>>({});
  const [memberPreferencesByUserId, setMemberPreferencesByUserId] = useState<Record<string, RoomMemberPreference>>({});
  const [roomMediaTopologyBySlug, setRoomMediaTopologyBySlug] = useState<Record<string, "livekit">>({});
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [currentServerId, setCurrentServerId] = useState(() => String(localStorage.getItem(currentServerIdStorageKey) || "").trim());
  const [creatingServer, setCreatingServer] = useState(false);
  const [serverMembers, setServerMembers] = useState<ServerMemberItem[]>([]);
  const [serverMembersLoading, setServerMembersLoading] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [serverAgeLoading, setServerAgeLoading] = useState(false);
  const [serverAgeConfirmedAt, setServerAgeConfirmedAt] = useState<string | null>(null);
  const [serverAgeConfirming, setServerAgeConfirming] = useState(false);
  const [ageGateBlockedRoomSlug, setAgeGateBlockedRoomSlug] = useState("");
  const [pendingInviteToken, setPendingInviteToken] = useState("");
  const [inviteAccepting, setInviteAccepting] = useState(false);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummary | null>(null);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminServers, setAdminServers] = useState<AdminServerListItem[]>([]);
  const [adminServersLoading, setAdminServersLoading] = useState(false);
  const [selectedAdminServerId, setSelectedAdminServerId] = useState("");
  const [adminServerOverview, setAdminServerOverview] = useState<AdminServerOverview | null>(null);
  const [adminServerOverviewLoading, setAdminServerOverviewLoading] = useState(false);

  return {
    token, setToken,
    user, setUser,
    authMode, setAuthMode,
    rooms, setRooms,
    roomsTree, setRoomsTree,
    archivedRooms, setArchivedRooms,
    roomSlug, setRoomSlug,
    chatRoomSlug, setChatRoomSlug,
    showAppUpdatedOverlay, setShowAppUpdatedOverlay,
    cookieConsentAccepted, setCookieConsentAccepted,
    pendingAccessRefreshInSec, setPendingAccessRefreshInSec,
    showFirstRunIntro, setShowFirstRunIntro,
    sessionMovedOverlayMessage, setSessionMovedOverlayMessage,
    messages, setMessages,
    messagesHasMore, setMessagesHasMore,
    messagesNextCursor, setMessagesNextCursor,
    loadingOlderMessages, setLoadingOlderMessages,
    chatText, setChatText,
    pendingChatImageDataUrl, setPendingChatImageDataUrl,
    editingMessageId, setEditingMessageId,
    callStatus, setCallStatus,
    lastCallPeer, setLastCallPeer,
    roomsPresenceBySlug, setRoomsPresenceBySlug,
    roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug,
    memberPreferencesByUserId, setMemberPreferencesByUserId,
    roomMediaTopologyBySlug, setRoomMediaTopologyBySlug,
    servers, setServers,
    serversLoading, setServersLoading,
    currentServerId, setCurrentServerId,
    creatingServer, setCreatingServer,
    serverMembers, setServerMembers,
    serverMembersLoading, setServerMembersLoading,
    lastInviteUrl, setLastInviteUrl,
    creatingInvite, setCreatingInvite,
    serverAgeLoading, setServerAgeLoading,
    serverAgeConfirmedAt, setServerAgeConfirmedAt,
    serverAgeConfirming, setServerAgeConfirming,
    ageGateBlockedRoomSlug, setAgeGateBlockedRoomSlug,
    pendingInviteToken, setPendingInviteToken,
    inviteAccepting, setInviteAccepting,
    telemetrySummary, setTelemetrySummary,
    wsState, setWsState,
    adminUsers, setAdminUsers,
    adminServers, setAdminServers,
    adminServersLoading, setAdminServersLoading,
    selectedAdminServerId, setSelectedAdminServerId,
    adminServerOverview, setAdminServerOverview,
    adminServerOverviewLoading, setAdminServerOverviewLoading
  };
}