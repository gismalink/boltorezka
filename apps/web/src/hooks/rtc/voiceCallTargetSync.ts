import type { MutableRefObject } from "react";
import type { PresenceMember } from "../../domain";
import type { VoicePeerContext } from "./voiceCallTypes";

export function clearRoomTargetsResyncTimerForRtc(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function scheduleRoomTargetsResyncForRtc(args: {
  timerRef: MutableRefObject<number | null>;
  roomVoiceConnectedRef: MutableRefObject<boolean>;
  syncRoomTargetsRef: MutableRefObject<(() => Promise<void>) | null>;
  delayMs: number;
}): void {
  const {
    timerRef,
    roomVoiceConnectedRef,
    syncRoomTargetsRef,
    delayMs
  } = args;

  clearRoomTargetsResyncTimerForRtc(timerRef);
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    if (!roomVoiceConnectedRef.current) {
      return;
    }
    const sync = syncRoomTargetsRef.current;
    if (sync) {
      void sync();
    }
  }, Math.max(0, delayMs));
}

export async function syncRoomTargetsForRtc(args: {
  roomVoiceConnectedRef: MutableRefObject<boolean>;
  roomVoiceTargetsRef: MutableRefObject<PresenceMember[]>;
  peersRef: MutableRefObject<Map<string, VoicePeerContext>>;
  isTargetTemporarilyBlocked: (targetUserId: string) => boolean;
  shouldInitiateOffer: (targetUserId: string) => boolean;
  startOffer: (targetUserId: string, targetLabel: string) => Promise<void>;
  closePeer: (targetUserId: string, reason?: string) => void;
  updateCallStatus: () => void;
  pushCallLog: (text: string) => void;
}): Promise<void> {
  const {
    roomVoiceConnectedRef,
    roomVoiceTargetsRef,
    peersRef,
    isTargetTemporarilyBlocked,
    shouldInitiateOffer,
    startOffer,
    closePeer,
    updateCallStatus,
    pushCallLog
  } = args;

  if (!roomVoiceConnectedRef.current) {
    return;
  }

  const targetsById = new Map(
    roomVoiceTargetsRef.current
      .map((member) => ({
        userId: String(member.userId || "").trim(),
        userName: String(member.userName || member.userId || "").trim()
      }))
      .filter((member) => member.userId)
      .map((member) => [member.userId, member.userName || member.userId])
  );

  const toDisconnect = Array.from(peersRef.current.keys()).filter((userId) => !targetsById.has(userId));
  toDisconnect.forEach((userId) => {
    closePeer(userId, `peer left room: ${userId}`);
  });

  for (const [userId, userName] of targetsById) {
    if (isTargetTemporarilyBlocked(userId)) {
      continue;
    }

    const exists = peersRef.current.has(userId);
    if (!exists) {
      if (shouldInitiateOffer(userId)) {
        await startOffer(userId, userName);
      } else {
        pushCallLog(`voice room awaiting offer <- ${userName}`);
      }
    }
  }

  updateCallStatus();
}
