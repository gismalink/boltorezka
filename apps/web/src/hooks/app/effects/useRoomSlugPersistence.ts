import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { asTrimmedString } from "../../../utils/stringUtils";

const getRoomSlugStorageKey = (serverId: string, roomSlugStorageKey: string) => {
  const normalizedServerId = asTrimmedString(serverId);
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
    const serverId = asTrimmedString(currentServerId);
    if (!serverId) {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const storageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    const nextChatSlug = asTrimmedString(chatRoomSlug || roomSlug);
    if (!nextChatSlug) {
      return;
    }

    sessionStorage.setItem(storageKey, nextChatSlug);
  }, [currentServerId, roomSlug, chatRoomSlug, roomSlugStorageKey]);

  useEffect(() => {
    const serverId = asTrimmedString(currentServerId);
    skipNextPersistRef.current = true;

    if (!serverId) {
      setRoomSlug("");
      setChatRoomSlug("");
      return;
    }

    const storageKey = getRoomSlugStorageKey(serverId, roomSlugStorageKey);
    const savedChatSlug = asTrimmedString(sessionStorage.getItem(storageKey));
    const defaultChatSlug = savedChatSlug || "general";

    setRoomSlug("");
    setChatRoomSlug(defaultChatSlug);
  }, [currentServerId, roomSlugStorageKey, setRoomSlug, setChatRoomSlug]);
}
