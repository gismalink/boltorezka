import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { api } from "../../../api";
import type {
  AdminServerListItem,
  Message,
  MessagesCursor,
  Room,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "../../../domain";
import { AuthController, ChatController, RoomAdminController } from "../../../services";

type DeletedAccountInfo = {
  daysRemaining: number;
  purgeScheduledAt: string | null;
};

type UseAppControllersArgs = {
  token: string;
  canViewTelemetry: boolean;
  pushLog: (message: string) => void;
  pushToast: (message: string) => void;
  sendWsEvent: (eventType: string, payload: Record<string, unknown>) => unknown;
  sendRoomJoinEvent: (slug: string) => Promise<unknown>;
  currentServerIdRef: MutableRefObject<string>;
  setToken: Dispatch<SetStateAction<string>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  setDeletedAccountInfo: Dispatch<SetStateAction<DeletedAccountInfo | null>>;
  setRoomSlug: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: Dispatch<SetStateAction<boolean>>;
  setMessagesNextCursor: Dispatch<SetStateAction<MessagesCursor | null>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  setRoomsTree: Dispatch<SetStateAction<RoomsTreeResponse | null>>;
  setRoomsTreeLoading: Dispatch<SetStateAction<boolean>>;
  setArchivedRooms: Dispatch<SetStateAction<Room[]>>;
  setAdminUsers: Dispatch<SetStateAction<User[]>>;
  setLoadingOlderMessages: Dispatch<SetStateAction<boolean>>;
  setTelemetrySummary: Dispatch<SetStateAction<TelemetrySummary | null>>;
};

export function useAppControllers({
  token,
  canViewTelemetry,
  pushLog,
  pushToast,
  sendWsEvent,
  sendRoomJoinEvent,
  currentServerIdRef,
  setToken,
  setUser,
  setDeletedAccountInfo,
  setRoomSlug,
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor,
  setRooms,
  setRoomsTree,
  setRoomsTreeLoading,
  setArchivedRooms,
  setAdminUsers,
  setLoadingOlderMessages,
  setTelemetrySummary
}: UseAppControllersArgs) {
  const authController = useMemo(
    () =>
      new AuthController({
        pushLog,
        setToken,
        setUser,
        setDeletedAccountInfo
      }),
    [pushLog, setDeletedAccountInfo, setToken, setUser]
  );

  const roomAdminController = useMemo(
    () =>
      new RoomAdminController({
        pushLog,
        pushToast,
        setRoomSlug,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        sendRoomJoinEvent,
        setRooms,
        setRoomsTree,
        setRoomsTreeLoading,
        setArchivedRooms,
        setAdminUsers,
        getCurrentServerId: () => currentServerIdRef.current
      }),
    [
      currentServerIdRef,
      pushLog,
      pushToast,
      sendRoomJoinEvent,
      setAdminUsers,
      setArchivedRooms,
      setMessages,
      setMessagesHasMore,
      setMessagesNextCursor,
      setRoomSlug,
      setRooms,
      setRoomsTree,
      setRoomsTreeLoading
    ]
  );

  const loadTelemetrySummary = useCallback(async () => {
    if (!token || !canViewTelemetry) {
      return;
    }

    try {
      const summary = await api.telemetrySummary(token);
      setTelemetrySummary(summary);
    } catch (error) {
      pushLog(`telemetry summary failed: ${(error as Error).message}`);
    }
  }, [token, canViewTelemetry, pushLog, setTelemetrySummary]);

  const chatController = useMemo(
    () =>
      new ChatController({
        pushLog,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        setLoadingOlderMessages,
        sendWsEvent,
        loadTelemetrySummary
      }),
    [loadTelemetrySummary, pushLog, sendWsEvent, setLoadingOlderMessages, setMessages, setMessagesHasMore, setMessagesNextCursor]
  );

  return {
    authController,
    roomAdminController,
    loadTelemetrySummary,
    chatController
  };
}