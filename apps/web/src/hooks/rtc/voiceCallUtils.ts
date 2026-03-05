export function parseLocalCandidateMeta(rawCandidate: string): {
  type: string;
  transport: string;
  address: string;
  port: string;
} {
  const typeMatch = rawCandidate.match(/\btyp\s+([a-z0-9]+)/i);
  const transportMatch = rawCandidate.match(/\b(udp|tcp)\b/i);
  const addressPortMatch = rawCandidate.match(/candidate:[^\s]+\s+\d+\s+(?:udp|tcp)\s+\d+\s+([^\s]+)\s+(\d+)/i);

  return {
    type: typeMatch?.[1]?.toLowerCase() || "unknown",
    transport: transportMatch?.[1]?.toLowerCase() || "unknown",
    address: addressPortMatch?.[1] || "unknown",
    port: addressPortMatch?.[2] || "unknown"
  };
}

export async function buildLocalDescriptionAfterIceGathering(
  connection: RTCPeerConnection,
  timeoutMs = 1800
): Promise<{ signal: RTCSessionDescriptionInit; settledBy: "complete" | "timeout" | "already-complete" }> {
  if (connection.iceGatheringState === "complete") {
    return {
      signal: {
        type: connection.localDescription?.type || "offer",
        sdp: connection.localDescription?.sdp || ""
      },
      settledBy: "already-complete"
    };
  }

  const settledBy = await new Promise<"complete" | "timeout">((resolve) => {
    let settled = false;
    const finalize = (value: "complete" | "timeout") => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const onStateChange = () => {
      if (connection.iceGatheringState === "complete") {
        finalize("complete");
      }
    };

    const timer = globalThis.setTimeout(() => {
      finalize("timeout");
    }, Math.max(200, timeoutMs));

    const cleanup = () => {
      globalThis.clearTimeout(timer);
      connection.removeEventListener("icegatheringstatechange", onStateChange);
    };

    connection.addEventListener("icegatheringstatechange", onStateChange);
    onStateChange();
  });

  return {
    signal: {
      type: connection.localDescription?.type || "offer",
      sdp: connection.localDescription?.sdp || ""
    },
    settledBy
  };
}
