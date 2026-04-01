import { WebSocket } from "ws";

type AckPayload = {
  ok: true;
  eventType: string;
  requestId: string | null;
  serverTs: number;
  meta?: Record<string, unknown>;
};

type IncomingEnvelope = {
  type?: string;
  payload?: Record<string, unknown>;
};

const baseUrl = String(process.env.NATIVE_WS_POC_URL || "ws://127.0.0.1:3200/ws").trim();
const roomSlug = String(process.env.NATIVE_WS_POC_ROOM || "poc-room").trim();

function makeRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function connectClient(userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    url.searchParams.set("userId", userId);

    const socket = new WebSocket(url.toString());
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`connect timeout: ${userId}`));
    }, 5000);

    socket.once("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForType(socket: WebSocket, targetType: string, timeoutMs = 5000): Promise<{ envelope: IncomingEnvelope; durationMs: number }> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`timeout waiting for ${targetType}`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      let envelope: IncomingEnvelope;
      try {
        envelope = JSON.parse(String(raw || "")) as IncomingEnvelope;
      } catch {
        return;
      }

      if (String(envelope.type || "") !== targetType) {
        return;
      }

      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve({
        envelope,
        durationMs: Number((performance.now() - startedAt).toFixed(2))
      });
    };

    socket.on("message", onMessage);
  });
}

async function emitWithAck(socket: WebSocket, type: string, payload: Record<string, unknown>) {
  const requestId = makeRequestId(type);
  const ackPromise = waitForType(socket, "ack");
  socket.send(JSON.stringify({ type, requestId, payload }));
  const { envelope, durationMs } = await ackPromise;
  const ack = (envelope.payload || {}) as AckPayload;

  if (ack.eventType !== type) {
    throw new Error(`ack event mismatch: expected=${type}, actual=${ack.eventType}`);
  }

  return { ack, durationMs };
}

async function main() {
  const clientA = await connectClient("native-ws-poc-a");
  const clientB = await connectClient("native-ws-poc-b");

  try {
    const ping = await emitWithAck(clientA, "ping", {
      clientTs: Date.now()
    });

    const roomJoinA = await emitWithAck(clientA, "room.join", {
      roomSlug
    });

    const roomJoinB = await emitWithAck(clientB, "room.join", {
      roomSlug
    });

    const receivePromise = waitForType(clientB, "chat.message");
    const chatSend = await emitWithAck(clientA, "chat.send", {
      roomSlug,
      text: "hello from native ws poc"
    });
    const chatReceive = await receivePromise;

    const summary = {
      baseUrl,
      roomSlug,
      transport: "native-ws",
      pingAckMs: ping.durationMs,
      roomJoinAckMs: {
        peerA: roomJoinA.durationMs,
        peerB: roomJoinB.durationMs
      },
      chat: {
        sendAckMs: chatSend.durationMs,
        receiveMsOnPeerB: chatReceive.durationMs,
        messageId: String(chatReceive.envelope.payload?.id || "") || null
      }
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    clientA.close();
    clientB.close();
  }
}

void main();
