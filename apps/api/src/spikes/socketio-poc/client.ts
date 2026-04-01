import { io, type Socket } from "socket.io-client";

type AckEnvelope = {
  ok: true;
  eventType: string;
  requestId: string | null;
  serverTs: number;
  meta?: Record<string, unknown>;
};

const baseUrl = String(process.env.SOCKETIO_POC_URL || "http://127.0.0.1:3199").trim();
const roomSlug = String(process.env.SOCKETIO_POC_ROOM || "poc-room").trim();

function makeRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function connectClient(userId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ["websocket"],
      query: { userId }
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`connect timeout: ${userId}`));
    }, 5000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function emitWithAck<TPayload>(
  socket: Socket,
  eventType: string,
  payload: TPayload
): Promise<{ ack: AckEnvelope; durationMs: number }> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(eventType, payload, (error: unknown, ack: AckEnvelope) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        ack,
        durationMs: Number((performance.now() - startedAt).toFixed(2))
      });
    });
  });
}

async function waitForChatMessage(socket: Socket, timeoutMs = 5000): Promise<{ message: Record<string, unknown>; durationMs: number }> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("chat.message", onMessage);
      reject(new Error("chat.message timeout"));
    }, timeoutMs);

    const onMessage = (message: Record<string, unknown>) => {
      clearTimeout(timeout);
      socket.off("chat.message", onMessage);
      resolve({
        message,
        durationMs: Number((performance.now() - startedAt).toFixed(2))
      });
    };

    socket.on("chat.message", onMessage);
  });
}

async function main() {
  const clientA = await connectClient("socketio-poc-a");
  const clientB = await connectClient("socketio-poc-b");

  try {
    const ping = await emitWithAck(clientA, "ping", {
      requestId: makeRequestId("ping"),
      clientTs: Date.now()
    });

    const roomJoinA = await emitWithAck(clientA, "room.join", {
      requestId: makeRequestId("join-a"),
      roomSlug
    });

    const roomJoinB = await emitWithAck(clientB, "room.join", {
      requestId: makeRequestId("join-b"),
      roomSlug
    });

    const receivePromise = waitForChatMessage(clientB);
    const chatSend = await emitWithAck(clientA, "chat.send", {
      requestId: makeRequestId("chat"),
      roomSlug,
      text: "hello from socket.io poc"
    });
    const chatReceive = await receivePromise;

    const summary = {
      baseUrl,
      roomSlug,
      transport: "socket.io/websocket",
      pingAckMs: ping.durationMs,
      roomJoinAckMs: {
        peerA: roomJoinA.durationMs,
        peerB: roomJoinB.durationMs
      },
      chat: {
        sendAckMs: chatSend.durationMs,
        receiveMsOnPeerB: chatReceive.durationMs,
        messageId: String(chatReceive.message.id || "") || null
      }
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    clientA.disconnect();
    clientB.disconnect();
  }
}

void main();
