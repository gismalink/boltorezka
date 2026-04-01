import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { buildPresenceLeftEnvelope } from "../ws-protocol.js";
import { closeRealtimeConnection } from "./realtime-lifecycle.js";
import { consumeWsTicketAndInitializeConnection } from "./realtime-ws-auth.js";
import { registerRealtimeSocket } from "../realtime-broadcast.js";

type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type RegisterRealtimeWsRouteDeps = {
  socketState: WeakMap<WebSocket, SocketState>;
  attachUserSocket: (userId: string, socket: WebSocket) => void;
  getAllRoomsPresence: (forUserId: string | null) => unknown;
  handleMessage: (connection: WebSocket, raw: RawData) => Promise<void>;
  detachUserSocket: (userId: string, socket: WebSocket) => void;
  markRecentRoomDetach: (roomId: string, userId: string) => void;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  clearRoomScreenShareOwnerIfMatches: (roomId: string, userId: string, roomSlug: string | null) => void;
  broadcastRoom: (roomId: string, payload: unknown) => void;
  getRoomPresence: (roomId: string, forUserId?: string | null) => Array<{ userId: string; userName: string }>;
  broadcastAllRoomsPresence: () => void;
  socketsByUserId: Map<string, Set<WebSocket>>;
  logWsConnectionFailed: (error: unknown) => void;
};

export function registerRealtimeWsRoute(fastify: FastifyInstance, deps: RegisterRealtimeWsRouteDeps) {
  const {
    socketState,
    attachUserSocket,
    getAllRoomsPresence,
    handleMessage,
    detachUserSocket,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    broadcastRoom,
    getRoomPresence,
    broadcastAllRoomsPresence,
    socketsByUserId,
    logWsConnectionFailed
  } = deps;

  fastify.get(
    "/v1/realtime/ws",
    {
      websocket: true
    },
    async (connection: WebSocket, request: FastifyRequest) => {
      try {
        const initialized = await consumeWsTicketAndInitializeConnection({
          connection,
          request,
          socketState,
          attachUserSocket,
          registerRealtimeSocket,
          getAllRoomsPresence,
          redisGet: fastify.redis.get.bind(fastify.redis),
          redisDel: fastify.redis.del.bind(fastify.redis),
          redisHSet: fastify.redis.hSet.bind(fastify.redis),
          redisExpire: fastify.redis.expire.bind(fastify.redis)
        });

        if (!initialized) {
          return;
        }

        connection.on("message", async (raw) => {
          await handleMessage(connection, raw);
        });

        connection.on("close", async () => {
          await closeRealtimeConnection({
            connection,
            socketState,
            unregisterRealtimeSocket,
            detachUserSocket,
            markRecentRoomDetach,
            detachRoomSocket,
            clearCanonicalMediaState,
            clearRoomScreenShareOwnerIfMatches,
            broadcastRoom,
            buildPresenceLeftEnvelope,
            getRoomPresence,
            broadcastAllRoomsPresence,
            socketsByUserId,
            redisHSet: fastify.redis.hSet.bind(fastify.redis),
            redisExpire: fastify.redis.expire.bind(fastify.redis)
          });
        });
      } catch (error) {
        logWsConnectionFailed(error);
        try {
          connection.close(1011, "Internal error");
        } catch {
          return;
        }
      }
    }
  );
}
