import { useEffect, type Dispatch, type SetStateAction } from "react";

const getRoomSlugStorageKey = (serverId: string, roomSlugStorageKey: string) => {
  const normalizedServerId = String(serverId || "").trim();
  return normalizedServerId ? `${roomSlugStorageKey}:${normalizedServerId}` : roomSlugStorageKey;
};

type UseRoomSlugPersistenceArgs = {
  currentServerId: string;
  roomSlug: string;
  roomSlugStorageKey: string;
  setRoomSlug: Dispatch<SetStateAction<string>>;
  setChatRoomSlug: Dispatch<SetStateAction<string>>;
};

export function useRoomSlugPersistence({
  currentServerId,
  roomSlug,
  roomSlugStorageKey,
  setRoomSlug,
  setChatRoomSlug
}: UseRoomSlugPersistenceArgs) {
  useEffect(() => {
    const serverId = String(currentServerId || "").trim();
    if (!serverId) {
      return;
    }

    const storageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    if (roomSlug) {
      localStorage.setItem(storageKey, roomSlug);
      return;
    }

    localStorage.removeItem(storageKey);
  }, [currentServerId, roomSlug, roomSlugStorageKey]);

  useEffect(() => {
    const serverId = String(currentServerId || "").trim();
    if (!serverId) {
      setRoomSlug("");
      setChatRoomSlug("");
      return;
    }

    const scopedStorageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    const scopedStoredSlug = String(localStorage.getItem(scopedStorageKey) || "").trim();
    const legacyStoredSlug = String(localStorage.getItem(roomSlugStorageKey) || "").trim();
    const nextSlug = scopedStoredSlug || legacyStoredSlug;

    setRoomSlug(nextSlug);
    setChatRoomSlug(nextSlug);
  }, [currentServerId, roomSlugStorageKey, setRoomSlug, setChatRoomSlug]);
}
