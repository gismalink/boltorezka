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

  const bootstrapCookieSessionState = useCallback(() => {
    api.me("")
      .then((res) => setUser(res.user))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          setToken("");
          return;
        }
        pushLog(`cookie-session validation failed: ${error.message}`);
        setToken("");
      });

    api.rooms("")
      .then((res) => setRooms(res.rooms))
      .catch((error) => pushLog(`rooms failed: ${error.message}`));

    api.serverAudioQuality("")
      .then((res) => setServerAudioQuality(res.audioQuality))
      .catch((error) => pushLog(`server audio quality failed: ${error.message}`));

    api.serverChatImagePolicy("")
      .then((res) => {
        setServerChatImagePolicy({
          maxDataUrlLength: Math.max(8000, Math.min(250000, Math.round(Number(res.maxDataUrlLength) || defaultChatImageDataUrlLength))),
          maxImageSide: Math.max(256, Math.min(4096, Math.round(Number(res.maxImageSide) || defaultChatImageMaxSide))),
          jpegQuality: Math.max(0.3, Math.min(0.95, Number(res.jpegQuality) || defaultChatImageQuality))
        });
      })
      .catch((error) => pushLog(`server chat image policy failed: ${error.message}`));

    void roomAdminController.loadRoomTree("");
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

  const bootstrapSessionState = useCallback((nextToken: string) => {
    localStorage.setItem("boltorezka_token", nextToken);

    api.me(nextToken)
      .then((res) => setUser(res.user))
      .catch(async (error) => {
        if (error instanceof ApiError && error.status === 401) {
          try {
            const refreshed = await api.authRefresh(nextToken);
            const refreshedToken = String(refreshed.token || "").trim();
            if (refreshedToken) {
              setToken(refreshedToken);
              localStorage.setItem("boltorezka_token", refreshedToken);
              const me = await api.me(refreshedToken);
              setUser(me.user);
              return;
            }
          } catch {
            // Fall through to hard reset when refresh fails.
          }
        }

        setToken("");
        localStorage.removeItem("boltorezka_token");
      });

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
      const persistedToken = localStorage.getItem("boltorezka_token");
      if (persistedToken) {
        setToken(persistedToken);
        bootstrapSessionState(persistedToken);
        return;
      }

      bootstrapCookieSessionState();
      return;
    }

    bootstrapSessionState(token);
  }, [bootstrapCookieSessionState, bootstrapSessionState, setToken, token]);
}
