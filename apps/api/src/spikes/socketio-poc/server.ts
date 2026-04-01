import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";

type PingPayload = {
  requestId?: string;
  clientTs?: number;
};

type RoomJoinPayload = {
  roomSlug?: string;
  requestId?: string;
};

type ChatSendPayload = {
  roomSlug?: string;
  text?: string;
  requestId?: string;
};

type AckEnvelope = {
  ok: true;
  eventType: string;
  requestId: string | null;
  serverTs: number;
  meta?: Record<string, unknown>;
};

const port = Number(process.env.SOCKETIO_POC_PORT || 3199);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

function resolveRequestId(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function sendAck(
  callback: ((response: AckEnvelope) => void) | undefined,
  eventType: string,
  requestId: unknown,
  meta?: Record<string, unknown>
) {
  if (!callback) {
    return;
  }

  callback({
    ok: true,
    eventType,
    requestId: resolveRequestId(requestId),
    serverTs: Date.now(),
    meta
  });
}

io.on("connection", (socket: Socket) => {
  const userId = String(socket.handshake.query.userId || socket.id).trim();
  socket.data.userId = userId;

  socket.emit("server.ready", {
    userId,
    socketId: socket.id,
    ts: Date.now()
  });

  socket.on("ping", (payload: PingPayload, callback?: (response: AckEnvelope) => void) => {
    sendAck(callback, "ping", payload?.requestId, {
      echoedClientTs: Number(payload?.clientTs || 0) || null
    });
  });

  socket.on("room.join", (payload: RoomJoinPayload, callback?: (response: AckEnvelope) => void) => {
    const roomSlug = String(payload?.roomSlug || "").trim();
    if (!roomSlug) {
      return;
    }

    socket.join(roomSlug);
    sendAck(callback, "room.join", payload?.requestId, {
      roomSlug,
      userId
    });

    io.to(roomSlug).emit("room.presence", {
      roomSlug,
      userId,
      action: "joined",
      ts: Date.now()
    });
  });

  socket.on("chat.send", (payload: ChatSendPayload, callback?: (response: AckEnvelope) => void) => {
    const roomSlug = String(payload?.roomSlug || "").trim();
    const text = String(payload?.text || "").trim();
    if (!roomSlug || !text) {
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      roomSlug,
      text,
      userId,
      ts: Date.now()
    };

    io.to(roomSlug).emit("chat.message", message);
    sendAck(callback, "chat.send", payload?.requestId, {
      roomSlug,
      messageId: message.id
    });
  });
});

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[socketio-poc] listening on :${port}`);
});
