import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";
import { buildErrorEnvelope, buildRoomsPresenceEnvelope, buildServerReadyEnvelope } from "../ws-protocol.js";
import { initializeRealtimeConnection } from "./realtime-lifecycle.js";
import { sendJson } from "./realtime-io.js";

type WsTicketClaims = {
  userId?: string;
  userName?: string;
  name?: string;
  email?: string;
  serverId?: string | null;
};

type ConsumeWsTicketDeps = {
  connection: WebSocket;
  request: FastifyRequest;
  appBuildSha: string;
  socketState: WeakMap<WebSocket, SocketState>;
  attachUserSocket: (userId: string, socket: WebSocket) => void;
  registerRealtimeSocket: (socket: WebSocket, userId?: string) => void;
  getAllRoomsPresence: (forUserId: string | null, forServerId?: string | null) => unknown;
  broadcastAllRoomsPresence: () => void;
  redisGet: (key: string) => Promise<string | null>;
  redisDel: (key: string) => Promise<number>;
  redisHSet: (key: string, values: Record<string, string>) => Promise<number>;
  redisExpire: (key: string, seconds: number) => Promise<boolean>;
};

export async function consumeWsTicketAndInitializeConnection(deps: ConsumeWsTicketDeps): Promise<boolean> {
  const {
    connection,
    request,
    appBuildSha,
    socketState,
    attachUserSocket,
    registerRealtimeSocket,
    getAllRoomsPresence,
    broadcastAllRoomsPresence,
    redisGet,
    redisDel,
    redisHSet,
    redisExpire
  } = deps;

  const url = new URL(request.url, "http://localhost");
  const ticket = url.searchParams.get("ticket");

  if (!ticket) {
    sendJson(connection, buildErrorEnvelope("MissingTicket", "ticket query param is required", "auth"));
    connection.close(4001, "Missing ticket");
    return false;
  }

  const ticketKey = `ws:ticket:${ticket}`;
  const ticketPayload = await redisGet(ticketKey);

  if (!ticketPayload) {
    sendJson(connection, buildErrorEnvelope("InvalidTicket", "WebSocket ticket is invalid or expired", "auth"));
    connection.close(4002, "Invalid ticket");
    return false;
  }

  await redisDel(ticketKey);

  let claims: WsTicketClaims;
  try {
    claims = JSON.parse(ticketPayload);
  } catch {
    sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket payload is corrupted", "auth"));
    connection.close(4003, "Invalid ticket");
    return false;
  }

  const userId = claims.userId;
  if (!userId) {
    sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket subject is missing", "auth"));
    connection.close(4004, "Invalid ticket");
    return false;
  }

  const userName = claims.userName || claims.name || claims.email || "unknown";
  const currentServerId = String(claims.serverId || "").trim() || null;

  await initializeRealtimeConnection({
    connection,
    userId,
    userName,
    appBuildSha,
    currentServerId,
    socketState,
    attachUserSocket,
    registerRealtimeSocket,
    redisHSet,
    redisExpire,
    sendJson,
    buildServerReadyEnvelope,
    buildRoomsPresenceEnvelope,
    getAllRoomsPresence,
    broadcastAllRoomsPresence
  });

  return true;
}
