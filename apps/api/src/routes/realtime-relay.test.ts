import test from "node:test";
import assert from "node:assert/strict";
import type { WebSocket as WsSocket } from "ws";
import { buildErrorCorrelationMeta, relayToTargetOrRoom } from "./realtime-relay.js";

type MockSocket = { id: string };

test("realtime-relay: relays to target sockets except sender", () => {
  const sender = { id: "sender" } as unknown as WsSocket;
  const targetA = { id: "targetA" } as unknown as WsSocket;
  const targetB = { id: "targetB" } as unknown as WsSocket;

  const sent: Array<{ id: string; payload: unknown }> = [];

  const result = relayToTargetOrRoom({
    senderSocket: sender,
    roomId: "room-1",
    targetUserId: "u-target",
    relayEnvelope: { type: "call" },
    getUserRoomSockets: () => [sender, targetA, targetB],
    socketsByRoomId: new Map(),
    sendJson: (socket, payload) => {
      sent.push({ id: (socket as unknown as MockSocket).id, payload });
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.relayedCount, 2);
  assert.deepEqual(
    sent.map((item) => item.id).sort(),
    ["targetA", "targetB"]
  );
});

test("realtime-relay: broadcast fallback relays to room except sender", () => {
  const sender = { id: "sender" } as unknown as WsSocket;
  const peer = { id: "peer" } as unknown as WsSocket;

  const roomSockets = new Set<WsSocket>([sender, peer]);
  const sent: string[] = [];

  const result = relayToTargetOrRoom({
    senderSocket: sender,
    roomId: "room-1",
    targetUserId: null,
    relayEnvelope: { type: "broadcast" },
    getUserRoomSockets: () => [],
    socketsByRoomId: new Map([["room-1", roomSockets]]),
    sendJson: (socket) => {
      sent.push((socket as unknown as MockSocket).id);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.relayedCount, 1);
  assert.deepEqual(sent, ["peer"]);
});

test("realtime-relay: returns correlation meta with defaults", () => {
  const socket = { id: "sock-1" } as unknown as WsSocket;
  const state = new WeakMap<WsSocket, { roomId?: string | null; userId?: string | null; sessionId?: string | null }>();
  state.set(socket, { roomId: "room-9", userId: "u9", sessionId: "s9" });

  const meta = buildErrorCorrelationMeta(socket, state, { traceId: "t1" });
  assert.deepEqual(meta, {
    roomId: "room-9",
    userId: "u9",
    sessionId: "s9",
    traceId: "t1"
  });
});
