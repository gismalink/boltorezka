import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ApiError, api } from "../../../api";
import {
  clearPersistedBearerToken,
  persistBearerToken,
  readPersistedBearerToken
} from "../../../utils/authStorage";
import type {
  AudioQuality,
  Message,
  MessagesCursor,
  PresenceMember,
  Room,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "../../../domain";
import type { RealtimeClient, RoomAdminController } from "../../../services";

// Primary mode is cookie + in-memory token. localStorage bearer persistence is
// allowed only in explicitly enabled legacy mode.

type UseSessionStateLifecycleArgs = {
  token: string;
  currentServerId: string;
  roomAdminController: RoomAdminController;
  pushLog: (text: string) => void;
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
  defaultChatImageDataUrlLength: number;
  defaultChatImageMaxSide: number;
  defaultChatImageQuality: number;
  setToken: Dispatch<SetStateAction<string>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  setRoomsTree: Dispatch<SetStateAction<RoomsTreeResponse | null>>;
  setArchivedRooms: Dispatch<SetStateAction<Room[]>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setChatText: Dispatch<SetStateAction<string>>;
  setPendingChatImageDataUrl: Dispatch<SetStateAction<string | null>>;
  setMessagesHasMore: Dispatch<SetStateAction<boolean>>;
  setMessagesNextCursor: Dispatch<SetStateAction<MessagesCursor | null>>;
  setLoadingOlderMessages: Dispatch<SetStateAction<boolean>>;
  setAdminUsers: Dispatch<SetStateAction<User[]>>;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  setRoomMediaTopologyBySlug: Dispatch<SetStateAction<Record<string, "livekit">>>;
  setVoiceCameraEnabledByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVoiceInitialMicStateByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, "muted" | "silent" | "speaking">>>;
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, boolean>>>;
  setTelemetrySummary: Dispatch<SetStateAction<TelemetrySummary | null>>;
  setServerAudioQuality: Dispatch<SetStateAction<AudioQuality>>;
  setServerAudioQualitySaving: Dispatch<SetStateAction<boolean>>;
  setServerChatImagePolicy: Dispatch<SetStateAction<{ maxDataUrlLength: number; maxImageSide: number; jpegQuality: number }>>;
  setDeletedAccountInfo: Dispatch<SetStateAction<{ daysRemaining: number; purgeScheduledAt: string | null } | null>>;
};

function resolveDeletedAccountInfo(error: unknown): { daysRemaining: number; purgeScheduledAt: string | null } | null {
  if (!(error instanceof ApiError) || error.code !== "AccountDeleted") {
    return null;
  }

  const daysRemaining = Math.max(0, Number(error.payload.daysRemaining ?? 30) || 30);
  const purgeScheduledAt = typeof error.payload.purgeScheduledAt === "string"
    ? error.payload.purgeScheduledAt
    : null;
  return { daysRemaining, purgeScheduledAt };
}

export function useSessionStateLifecycle({
  token,
  currentServerId,
  roomAdminController,
  pushLog,
  realtimeClientRef,
  defaultChatImageDataUrlLength,
  defaultChatImageMaxSide,
  defaultChatImageQuality,
  setToken,
  setUser,
  setRooms,
  setRoomsTree,
  setArchivedRooms,
  setMessages,
  setChatText,
  setPendingChatImageDataUrl,
  setMessagesHasMore,
  setMessagesNextCursor,
  setLoadingOlderMessages,
  setAdminUsers,
  setRoomsPresenceBySlug,
  setRoomsPresenceDetailsBySlug,
  setRoomMediaTopologyBySlug,
  setVoiceCameraEnabledByUserIdInCurrentRoom,
  setVoiceInitialMicStateByUserIdInCurrentRoom,
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
  setTelemetrySummary,
  setServerAudioQuality,
  setServerAudioQualitySaving,
  setServerChatImagePolicy,
  setDeletedAccountInfo
}: UseSessionStateLifecycleArgs) {
  const cookieBootstrapBlockedUntilRef = useRef(0);
  const cookieBootstrapInFlightRef = useRef(false);
  const cookieBootstrapLastAttemptAtRef = useRef(0);
  const sessionBootstrapInFlightRef = useRef(false);
  const sessionBootstrapLastKeyRef = useRef("");
  const sessionBootstrapLastAttemptAtRef = useRef(0);

  const resetSessionState = useCallback(() => {
    setUser(null);
    setRooms([]);
    setRoomsTree(null);
    setArchivedRooms([]);
    setMessages([]);
    setChatText("");
    setPendingChatImageDataUrl(null);
    setMessagesHasMore(false);
    setMessagesNextCursor(null);
    setLoadingOlderMessages(false);
    setAdminUsers([]);
    setRoomsPresenceBySlug({});
    setRoomsPresenceDetailsBySlug({});
    setRoomMediaTopologyBySlug({});
    setVoiceCameraEnabledByUserIdInCurrentRoom({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
    setTelemetrySummary(null);
    setServerAudioQuality("standard");
    setServerAudioQualitySaving(false);
    realtimeClientRef.current?.dispose();
    realtimeClientRef.current = null;
  }, [
    realtimeClientRef,
    setAdminUsers,
    setChatText,
    setLoadingOlderMessages,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    setPendingChatImageDataUrl,
    setRoomMediaTopologyBySlug,
    setRooms,
    setArchivedRooms,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    setRoomsTree,
    setServerAudioQuality,
    setServerAudioQualitySaving,
    setTelemetrySummary,
    setUser,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom
  ]);

  // In cookie-mode the page may reload with token="" while the user is still
  // authenticated via HttpOnly cookie. Use authRefresh (which reads the cookie)
  // to obtain a real JWT, then put it in state — this re-establishes the full
  // bearer flow so all existing !token guards across the app work correctly.
  const bootstrapCookieSessionState = useCallback(() => {
    if (cookieBootstrapInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if ((now - cookieBootstrapLastAttemptAtRef.current) < 3000) {
      return;
    }

    if (Date.now() < cookieBootstrapBlockedUntilRef.current) {
      return;
    }

    cookieBootstrapInFlightRef.current = true;
    cookieBootstrapLastAttemptAtRef.current = now;

    api.authRefresh("")
      .then(({ token: refreshedToken }) => {
        const jwt = String(refreshedToken || "").trim();
        if (jwt) {
          cookieBootstrapBlockedUntilRef.current = 0;
          clearPersistedBearerToken();
          setToken(jwt);
          setDeletedAccountInfo(null);
          // bootstrapSessionState fires automatically via the token useEffect
        } else {
          // Anonymous state is normal: avoid immediate repeated bootstrap hits.
          cookieBootstrapBlockedUntilRef.current = Date.now() + 15000;
          resetSessionState();
        }
      })
      .catch((error) => {
        const deletedInfo = resolveDeletedAccountInfo(error);
        if (deletedInfo) {
          setDeletedAccountInfo(deletedInfo);
          setToken("");
          clearPersistedBearerToken();
          resetSessionState();
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          // Expected for signed-out users; keep a calm retry cadence.
          cookieBootstrapBlockedUntilRef.current = Date.now() + 15000;
          resetSessionState();
          return;
        }

        if (error instanceof ApiError && error.status === 429) {
          cookieBootstrapBlockedUntilRef.current = Date.now() + 15000;
          pushLog("cookie-session bootstrap throttled (429), retry deferred for 15s");
          return;
        }

        cookieBootstrapBlockedUntilRef.current = Date.now() + 5000;
        pushLog(`cookie-session bootstrap failed: ${error.message}`);
        // Keep state as-is on transient failures and retry later.
      })
      .finally(() => {
        cookieBootstrapInFlightRef.current = false;
      });
  }, [pushLog, resetSessionState, setDeletedAccountInfo, setToken]);

  const bootstrapSessionState = useCallback((nextToken: string) => {
    const normalizedToken = String(nextToken || "").trim();
    if (!normalizedToken) {
      return;
    }

    const activeServerId = String(currentServerId || "").trim();
    const bootstrapKey = `${normalizedToken}:${activeServerId || "no-server"}`;

    if (sessionBootstrapInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if (
      sessionBootstrapLastKeyRef.current === bootstrapKey
      && (now - sessionBootstrapLastAttemptAtRef.current) < 15000
    ) {
      return;
    }

    sessionBootstrapInFlightRef.current = true;
    sessionBootstrapLastKeyRef.current = bootstrapKey;
    sessionBootstrapLastAttemptAtRef.current = now;
    persistBearerToken(nextToken);

    const bootstrap = async () => {
      try {
        let sessionUser: User | null = null;
        let bootstrapError: unknown = null;
        try {
          const me = await api.me(nextToken);
          sessionUser = me.user;
          setUser(me.user);
          setDeletedAccountInfo(null);
        } catch (error) {
          bootstrapError = error;
          if (error instanceof ApiError && error.status === 401) {
            try {
              const refreshed = await api.authRefresh(nextToken);
              const refreshedToken = String(refreshed.token || "").trim();
              if (refreshedToken) {
                setToken(refreshedToken);
                persistBearerToken(refreshedToken);
                const me = await api.me(refreshedToken);
                sessionUser = me.user;
                setUser(me.user);
                setDeletedAccountInfo(null);
                nextToken = refreshedToken;
              }
            } catch (refreshError) {
              const deletedInfo = resolveDeletedAccountInfo(refreshError);
              if (deletedInfo) {
                setDeletedAccountInfo(deletedInfo);
                setToken("");
                clearPersistedBearerToken();
                resetSessionState();
                return;
              }

              // Bearer can expire earlier than HttpOnly cookie in cookie-mode.
              // Try cookie-backed refresh before declaring the session invalid.
              if (refreshError instanceof ApiError && refreshError.status === 401) {
                try {
                  const cookieRefreshed = await api.authRefresh("");
                  const cookieToken = String(cookieRefreshed.token || "").trim();
                  if (cookieToken) {
                    setToken(cookieToken);
                    clearPersistedBearerToken();
                    persistBearerToken(cookieToken);
                    const me = await api.me(cookieToken);
                    sessionUser = me.user;
                    setUser(me.user);
                    setDeletedAccountInfo(null);
                    nextToken = cookieToken;
                  }
                } catch (cookieRefreshError) {
                  bootstrapError = cookieRefreshError;
                }
              } else {
                bootstrapError = refreshError;
              }
            }
          }

          const deletedInfo = resolveDeletedAccountInfo(error);
          if (deletedInfo) {
            setDeletedAccountInfo(deletedInfo);
            setToken("");
            clearPersistedBearerToken();
            resetSessionState();
            return;
          }

          if (!sessionUser) {
            if (bootstrapError instanceof ApiError && bootstrapError.status === 401) {
              setToken("");
              clearPersistedBearerToken();
              resetSessionState();
              return;
            }

            pushLog(`session bootstrap skipped hard logout: ${(bootstrapError as Error)?.message || "transient failure"}`);
            return;
          }
        }

        const role = String(sessionUser?.role || "user");
        const hasServiceAccess = role === "admin" || role === "super_admin" || sessionUser?.access_state === "active";
        if (!hasServiceAccess) {
          setRooms([]);
          setRoomsTree(null);
          setArchivedRooms([]);
          return;
        }

        const activeServerId = String(currentServerId || "").trim();
        if (!activeServerId) {
          setRooms([]);
          setRoomsTree(null);
          setArchivedRooms([]);
          return;
        }

        api.rooms(nextToken, activeServerId)
          .then((res) => setRooms(res.rooms))
          .catch((error) => pushLog(`rooms failed: ${error.message}`));

        api.serverAudioQuality(nextToken)
          .then((res) => setServerAudioQuality(res.audioQuality))
          .catch((error) => pushLog(`server audio quality failed: ${error.message}`));

        api.serverChatImagePolicy(nextToken)
          .then((res) => {
            setServerChatImagePolicy({
              maxDataUrlLength: Math.max(8000, Math.min(250000, Math.round(Number(res.maxDataUrlLength) || defaultChatImageDataUrlLength))),
              maxImageSide: Math.max(256, Math.min(4096, Math.round(Number(res.maxImageSide) || defaultChatImageMaxSide))),
              jpegQuality: Math.max(0.3, Math.min(0.95, Number(res.jpegQuality) || defaultChatImageQuality))
            });
          })
          .catch((error) => pushLog(`server chat image policy failed: ${error.message}`));

        void roomAdminController.loadRoomTree(nextToken);
      } finally {
        sessionBootstrapInFlightRef.current = false;
      }
    };

    void bootstrap();
  }, [
    defaultChatImageDataUrlLength,
    defaultChatImageMaxSide,
    defaultChatImageQuality,
    pushLog,
    roomAdminController,
    setRooms,
    setArchivedRooms,
    setServerAudioQuality,
    setServerChatImagePolicy,
    setDeletedAccountInfo,
    setToken,
    setUser,
    currentServerId
  ]);

  useEffect(() => {
    if (token) {
      return;
    }

    const persistedToken = readPersistedBearerToken();
    if (persistedToken) {
      setToken(persistedToken);
      return;
    }

    bootstrapCookieSessionState();
  }, [bootstrapCookieSessionState, setToken, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    bootstrapSessionState(token);
  }, [bootstrapSessionState, token]);
}
