import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

type ClientState = {
  userId: string;
  joinedRooms: Set<string>;
};

type IncomingEnvelope = {
  type?: string;
  requestId?: string;
  payload?: Record<string, unknown>;
};

const port = Number(process.env.NATIVE_WS_POC_PORT || 3200);

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const states = new WeakMap<WebSocket, ClientState>();
const roomSockets = new Map<string, Set<WebSocket>>();

function resolveRequestId(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function broadcastToRoom(roomSlug: string, payload: unknown) {
  const sockets = roomSockets.get(roomSlug);
  if (!sockets) {
    return;
  }

  for (const socket of sockets) {
    sendJson(socket, payload);
  }
}

function addSocketToRoom(socket: WebSocket, roomSlug: string) {
  const current = roomSockets.get(roomSlug) || new Set<WebSocket>();
  current.add(socket);
  roomSockets.set(roomSlug, current);
}

function removeSocketFromAllRooms(socket: WebSocket) {
  for (const [roomSlug, sockets] of roomSockets.entries()) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      roomSockets.delete(roomSlug);
    }
  }
}

wss.on("connection", (socket, request) => {
  const url = new URL(request.url || "", "http://localhost");
  const userId = String(url.searchParams.get("userId") || "").trim() || crypto.randomUUID();

  states.set(socket, {
    userId,
    joinedRooms: new Set<string>()
  });

  sendJson(socket, {
    type: "server.ready",
    payload: {
      userId,
      ts: Date.now()
    }
  });

  socket.on("message", (raw) => {
    let message: IncomingEnvelope | null = null;
    try {
      message = JSON.parse(String(raw || "")) as IncomingEnvelope;
    } catch {
      return;
    }

    const state = states.get(socket);
    if (!message || !state) {
      return;
    }

    const type = String(message.type || "").trim();
    const requestId = resolveRequestId(message.requestId);

    if (type === "ping") {
      sendJson(socket, {
        type: "ack",
        payload: {
          ok: true,
          eventType: "ping",
          requestId,
          serverTs: Date.now()
        }
      });
      return;
    }

    if (type === "room.join") {
      const roomSlug = String(message.payload?.roomSlug || "").trim();
      if (!roomSlug) {
        return;
      }

      state.joinedRooms.add(roomSlug);
      addSocketToRoom(socket, roomSlug);

      sendJson(socket, {
        type: "ack",
        payload: {
          ok: true,
          eventType: "room.join",
          requestId,
          serverTs: Date.now(),
          meta: {
            roomSlug,
            userId: state.userId
          }
        }
      });

      broadcastToRoom(roomSlug, {
        type: "room.presence",
        payload: {
          roomSlug,
          userId: state.userId,
          action: "joined",
          ts: Date.now()
        }
      });
      return;
    }

    if (type === "chat.send") {
      const roomSlug = String(message.payload?.roomSlug || "").trim();
      const text = String(message.payload?.text || "").trim();
      if (!roomSlug || !text) {
        return;
      }

      const messageId = crypto.randomUUID();
      broadcastToRoom(roomSlug, {
        type: "chat.message",
        payload: {
          id: messageId,
          roomSlug,
          text,
          userId: state.userId,
          ts: Date.now()
        }
      });

      sendJson(socket, {
        type: "ack",
        payload: {
          ok: true,
          eventType: "chat.send",
          requestId,
          serverTs: Date.now(),
          meta: {
            roomSlug,
            messageId
          }
        }
      });
    }
  });

  socket.on("close", () => {
    removeSocketFromAllRooms(socket);
  });
});

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[native-ws-poc] listening on :${port}`);
});
