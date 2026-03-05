import type { VoicePeerContext } from "./voiceCallTypes";

type IceCandidateFactory = (candidate: RTCIceCandidateInit) => RTCIceCandidate;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error || "unknown error");
}

export async function flushQueuedRemoteCandidatesForPeer({
  peer,
  targetUserId,
  targetLabel,
  pushCallLog,
  createIceCandidate = (candidate) => new RTCIceCandidate(candidate)
}: {
  peer: VoicePeerContext | undefined;
  targetUserId: string;
  targetLabel: string;
  pushCallLog: (text: string) => void;
  createIceCandidate?: IceCandidateFactory;
}): Promise<void> {
  if (!peer) {
    return;
  }

  if (!peer.connection.remoteDescription || peer.pendingRemoteCandidates.length === 0) {
    return;
  }

  const pending = peer.pendingRemoteCandidates.splice(0, peer.pendingRemoteCandidates.length);
  const settled = await Promise.allSettled(
    pending.map((candidate) => peer.connection.addIceCandidate(createIceCandidate(candidate)))
  );

  settled.forEach((result) => {
    if (result.status === "rejected") {
      pushCallLog(`call.ice queued handling failed (${targetLabel || targetUserId}): ${getErrorMessage(result.reason)}`);
    }
  });

  pushCallLog(`call.ice queued flushed <- ${targetLabel || targetUserId} (${pending.length})`);
}
