import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

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
    if (!roomSlug) {
      return;
    }

    localStorage.setItem(storageKey, roomSlug);
  }, [currentServerId, roomSlug, roomSlugStorageKey]);

  useEffect(() => {
    const serverId = String(currentServerId || "").trim();
    skipNextPersistRef.current = true;

    if (!serverId) {
      setRoomSlug("");
      setChatRoomSlug("");
      return;
    }

    // Selecting a server should not auto-enter any room on that server.
    setRoomSlug("");
    setChatRoomSlug("");
  }, [currentServerId, roomSlugStorageKey, setRoomSlug, setChatRoomSlug]);
}
