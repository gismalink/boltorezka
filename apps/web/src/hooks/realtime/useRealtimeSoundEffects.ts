import { useEffect, useRef } from "react";
import type { Message, PresenceMember } from "../../domain";
import type { ServerSoundEvent } from "../media/useServerSounds";

type RealtimeWsState = "disconnected" | "connecting" | "connected";

type UseRealtimeSoundEffectsParams = {
  wsState: RealtimeWsState;
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>;
  screenShareOwnerByRoomSlug: Record<string, { userId: string | null; userName: string | null }>;
  roomSlug: string;
  userId?: string | null;
  messages: Message[];
  playServerSound: (event: ServerSoundEvent) => Promise<void>;
};

/** Plays realtime UX sounds for disconnect, room presence transitions, and incoming chat. */
export function useRealtimeSoundEffects({
  wsState,
  roomsPresenceDetailsBySlug,
  screenShareOwnerByRoomSlug,
  roomSlug,
  userId,
  messages,
  playServerSound
}: UseRealtimeSoundEffectsParams) {
  const previousWsStateRef = useRef<RealtimeWsState>("disconnected");
  const previousPresenceRoomSlugRef = useRef<string>(roomSlug);
  const previousRoomSlugRef = useRef<string>(roomSlug);
  const roomJoinSoundInitializedRef = useRef(false);
  const presenceSoundInitializedRef = useRef(false);
  const previousPresenceIdsRef = useRef<string[]>([]);
  const previousChatMessageIdRef = useRef<string | null>(null);
  const previousScreenShareOwnerIdRef = useRef<string>("");
  const screenShareSoundInitializedRef = useRef(false);

  const playStreamSignal = (kind: "start" | "stop") => {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = kind === "start" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(kind === "start" ? 1046 : 392, audioContext.currentTime);

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.16);

      window.setTimeout(() => {
        void audioContext.close();
      }, 220);
    } catch {
      // Non-critical UX sound.
    }
  };

  useEffect(() => {
    const prevState = previousWsStateRef.current;
    if (prevState === "connected" && wsState === "disconnected") {
      void playServerSound("server_disconnected");
    }

    previousWsStateRef.current = wsState;
  }, [playServerSound, wsState]);

  useEffect(() => {
    const previousRoomSlug = previousRoomSlugRef.current;
    if (!roomJoinSoundInitializedRef.current) {
      roomJoinSoundInitializedRef.current = true;
      previousRoomSlugRef.current = roomSlug;
      return;
    }

    if (roomSlug && roomSlug !== previousRoomSlug) {
      void playServerSound("self_joined_channel");
    }

    previousRoomSlugRef.current = roomSlug;
  }, [playServerSound, roomSlug]);

  useEffect(() => {
    const presenceBySlug = roomsPresenceDetailsBySlug || {};
    const currentMembers = presenceBySlug[roomSlug] || [];
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
    const currentOwnerId = String(screenShareOwnerByRoomSlug[roomSlug]?.userId || "").trim();

    if (!screenShareSoundInitializedRef.current) {
      screenShareSoundInitializedRef.current = true;
      previousScreenShareOwnerIdRef.current = currentOwnerId;
      return;
    }

    const previousOwnerId = previousScreenShareOwnerIdRef.current;
    if (!previousOwnerId && currentOwnerId) {
      playStreamSignal("start");
    } else if (previousOwnerId && !currentOwnerId) {
      playStreamSignal("stop");
    }

    previousScreenShareOwnerIdRef.current = currentOwnerId;
  }, [roomSlug, screenShareOwnerByRoomSlug]);

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
