import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ApiError, api } from "../../../api";
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

// When built with VITE_AUTH_COOKIE_MODE=1 the HttpOnly cookie is the primary
// session mechanism. localStorage is not used for token persistence.
const COOKIE_MODE = import.meta.env.VITE_AUTH_COOKIE_MODE === "1";

type UseSessionStateLifecycleArgs = {
  token: string;
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
};

export function useSessionStateLifecycle({
  token,
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
  setServerChatImagePolicy
}: UseSessionStateLifecycleArgs) {
  const resetSessionState = useCallback(() => {
    setUser(null);
    setRooms([]);
    setRoomsTree(null);
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
    api.authRefresh("")
      .then(({ token: refreshedToken }) => {
        const jwt = String(refreshedToken || "").trim();
        if (jwt) {
          if (COOKIE_MODE) localStorage.removeItem("boltorezka_token");
          setToken(jwt);
          // bootstrapSessionState fires automatically via the token useEffect
        } else {
          resetSessionState();
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          resetSessionState();
          return;
        }
        pushLog(`cookie-session bootstrap failed: ${error.message}`);
        resetSessionState();
      });
  }, [pushLog, resetSessionState, setToken]);

  const bootstrapSessionState = useCallback((nextToken: string) => {
    if (!COOKIE_MODE) localStorage.setItem("boltorezka_token", nextToken);

    const bootstrap = async () => {
      let sessionUser: User | null = null;
      try {
        const me = await api.me(nextToken);
        sessionUser = me.user;
        setUser(me.user);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            const refreshed = await api.authRefresh(nextToken);
            const refreshedToken = String(refreshed.token || "").trim();
            if (refreshedToken) {
              setToken(refreshedToken);
              if (!COOKIE_MODE) localStorage.setItem("boltorezka_token", refreshedToken);
              const me = await api.me(refreshedToken);
              sessionUser = me.user;
              setUser(me.user);
              nextToken = refreshedToken;
            }
          } catch {
            // Fall through to hard reset when refresh fails.
          }
        }

        if (!sessionUser) {
          setToken("");
          localStorage.removeItem("boltorezka_token");
          return;
        }
      }

      const role = String(sessionUser?.role || "user");
      const hasServiceAccess = role === "admin" || role === "super_admin" || sessionUser?.access_state === "active";
      if (!hasServiceAccess) {
        setRooms([]);
        setRoomsTree(null);
        return;
      }

      api.rooms(nextToken)
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
    };

    void bootstrap();
  }, [
    defaultChatImageDataUrlLength,
    defaultChatImageMaxSide,
    defaultChatImageQuality,
    pushLog,
    roomAdminController,
    setRooms,
    setServerAudioQuality,
    setServerChatImagePolicy,
    setToken,
    setUser
  ]);

  useEffect(() => {
    if (!token) {
      if (!COOKIE_MODE) {
        const persistedToken = localStorage.getItem("boltorezka_token");
        if (persistedToken) {
          setToken(persistedToken);
          bootstrapSessionState(persistedToken);
          return;
        }
      }
      bootstrapCookieSessionState();
      return;
    }

    bootstrapSessionState(token);
  }, [bootstrapCookieSessionState, bootstrapSessionState, setToken, token]);
}
