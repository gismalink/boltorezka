import { useEffect, useRef } from "react";
import type { Message, PresenceMember } from "../domain";
import type { ServerSoundEvent } from "./useServerSounds";

type RealtimeWsState = "disconnected" | "connecting" | "connected";

type UseRealtimeSoundEffectsParams = {
  wsState: RealtimeWsState;
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>;
  roomSlug: string;
  userId?: string | null;
  messages: Message[];
  playServerSound: (event: ServerSoundEvent) => Promise<void>;
};

/** Plays realtime UX sounds for disconnect, room presence transitions, and incoming chat. */
export function useRealtimeSoundEffects({
  wsState,
  roomsPresenceDetailsBySlug,
  roomSlug,
  userId,
  messages,
  playServerSound
}: UseRealtimeSoundEffectsParams) {
  const previousWsStateRef = useRef<RealtimeWsState>("disconnected");
  const previousPresenceRoomSlugRef = useRef<string>(roomSlug);
  const presenceSoundInitializedRef = useRef(false);
  const previousPresenceIdsRef = useRef<string[]>([]);
  const previousChatMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevState = previousWsStateRef.current;
    if (prevState === "connected" && wsState === "disconnected") {
      void playServerSound("server_disconnected");
    }

    previousWsStateRef.current = wsState;
  }, [playServerSound, wsState]);

  useEffect(() => {
    const currentMembers = roomsPresenceDetailsBySlug[roomSlug] || [];
    const currentIds = currentMembers
      .map((member) => String(member.userId || "").trim())
      .filter((memberId) => memberId.length > 0);

    if (previousPresenceRoomSlugRef.current !== roomSlug) {
      previousPresenceRoomSlugRef.current = roomSlug;
      previousPresenceIdsRef.current = currentIds;
      presenceSoundInitializedRef.current = true;
      return;
    }

    if (!presenceSoundInitializedRef.current) {
      presenceSoundInitializedRef.current = true;
      previousPresenceIdsRef.current = currentIds;
      return;
    }

    const prevIds = previousPresenceIdsRef.current;
    const myId = String(userId || "").trim();
    const prevSet = new Set(prevIds);
    const nextSet = new Set(currentIds);

    const joined = currentIds.some((id) => id !== myId && !prevSet.has(id));
    const left = prevIds.some((id) => id !== myId && !nextSet.has(id));

    if (joined) {
      void playServerSound("member_join");
    } else if (left) {
      void playServerSound("member_leave");
    }

    previousPresenceIdsRef.current = currentIds;
  }, [playServerSound, roomSlug, roomsPresenceDetailsBySlug, userId]);

  useEffect(() => {
    const latest = messages.length > 0 ? messages[messages.length - 1] : null;
    if (!latest) {
      previousChatMessageIdRef.current = null;
      return;
    }

    if (!previousChatMessageIdRef.current) {
      previousChatMessageIdRef.current = latest.id;
      return;
    }

    if (previousChatMessageIdRef.current !== latest.id) {
      if (latest.user_id !== userId) {
        void playServerSound("chat_message");
      }
      previousChatMessageIdRef.current = latest.id;
    }
  }, [messages, playServerSound, userId]);
}
