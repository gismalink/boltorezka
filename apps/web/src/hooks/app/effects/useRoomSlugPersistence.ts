import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

const getRoomSlugStorageKey = (serverId: string, roomSlugStorageKey: string) => {
  const normalizedServerId = String(serverId || "").trim();
  return normalizedServerId ? `${roomSlugStorageKey}:${normalizedServerId}` : roomSlugStorageKey;
};

type UseRoomSlugPersistenceArgs = {
  currentServerId: string;
  roomSlug: string;
  chatRoomSlug: string;
  roomSlugStorageKey: string;
  setRoomSlug: Dispatch<SetStateAction<string>>;
  setChatRoomSlug: Dispatch<SetStateAction<string>>;
};

export function useRoomSlugPersistence({
  currentServerId,
  roomSlug,
  chatRoomSlug,
  roomSlugStorageKey,
  setRoomSlug,
  setChatRoomSlug
}: UseRoomSlugPersistenceArgs) {
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    const serverId = String(currentServerId || "").trim();
    if (!serverId) {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const storageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    const nextChatSlug = String(chatRoomSlug || roomSlug || "").trim();
    if (!nextChatSlug) {
      return;
    }

    sessionStorage.setItem(storageKey, nextChatSlug);
  }, [currentServerId, roomSlug, chatRoomSlug, roomSlugStorageKey]);

  useEffect(() => {
    const serverId = String(currentServerId || "").trim();
    skipNextPersistRef.current = true;

    if (!serverId) {
      setRoomSlug("");
      setChatRoomSlug("");
      return;
    }

    const storageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    const savedChatSlug = String(sessionStorage.getItem(storageKey) || "").trim();
    const defaultChatSlug = savedChatSlug || "general";

    setRoomSlug("");
    setChatRoomSlug(defaultChatSlug);
  }, [currentServerId, roomSlugStorageKey, setRoomSlug, setChatRoomSlug]);
}
