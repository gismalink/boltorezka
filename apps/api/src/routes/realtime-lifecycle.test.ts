import test from "node:test";
import assert from "node:assert/strict";
import { closeRealtimeConnection, initializeRealtimeConnection } from "./realtime-lifecycle.js";

test("realtime-lifecycle: initialize sets state, marks presence online and sends initial envelopes", async () => {
  const connection = {} as any;
  const socketState = new WeakMap<any, any>();
  const sentPayloads: unknown[] = [];
  const redisCalls: string[] = [];

  await initializeRealtimeConnection({
    connection,
    userId: "u1",
    userName: "Alice",
    currentServerId: null,
    socketState,
    attachUserSocket: () => {},
    registerRealtimeSocket: () => {},
    redisHSet: async (key, value) => {
      redisCalls.push(`hset:${key}:${value.online}`);
      return 1;
    },
    redisExpire: async (key, seconds) => {
      redisCalls.push(`expire:${key}:${seconds}`);
      return 1;
    },
    sendJson: (_socket, payload) => {
      sentPayloads.push(payload);
    },
    buildServerReadyEnvelope: (userId, userName) => ({ type: "server.ready", userId, userName }),
    buildRoomsPresenceEnvelope: (roomsPresence) => ({ type: "rooms.presence", roomsPresence }),
    getAllRoomsPresence: () => [{ roomId: "room-1", count: 1 }]
  });

  const state = socketState.get(connection);
  assert.equal(state.userId, "u1");
  assert.equal(state.userName, "Alice");
  assert.equal(state.roomId, null);
  assert.equal(state.roomSlug, null);

  assert.deepEqual(redisCalls, [
    "hset:presence:user:u1:1",
    "expire:presence:user:u1:120"
  ]);

  assert.equal(sentPayloads.length, 2);
});

test("realtime-lifecycle: close detaches room and marks offline when last socket closes", async () => {
  const connection = {} as any;
  const socketState = new WeakMap<any, any>();
  socketState.set(connection, {
    userId: "u1",
    userName: "Alice",
    roomId: "room-1",
    roomSlug: "general"
  });

  const events: string[] = [];
  const socketsByUserId = new Map<string, Set<any>>([["u1", new Set()]]);

  await closeRealtimeConnection({
    connection,
    socketState,
    unregisterRealtimeSocket: () => {
      events.push("unregister");
    },
    detachUserSocket: () => {
      events.push("detach-user");
    },
    markRecentRoomDetach: () => {
      events.push("mark-detach");
    },
    detachRoomSocket: () => {
      events.push("detach-room");
    },
    clearCanonicalMediaState: () => {
      events.push("clear-media");
    },
    clearRoomScreenShareOwnerIfMatches: () => {
      events.push("clear-screen-owner");
    },
    broadcastRoom: () => {
      events.push("broadcast-room");
    },
    buildPresenceLeftEnvelope: () => ({ type: "presence.left" }),
    getRoomPresence: () => [],
    broadcastAllRoomsPresence: () => {
      events.push("broadcast-all-presence");
    },
    socketsByUserId,
    redisHSet: async (key, value) => {
      events.push(`hset:${key}:${value.online}`);
      return 1;
    },
    redisExpire: async (key, seconds) => {
      events.push(`expire:${key}:${seconds}`);
      return 1;
    }
  });

  assert.deepEqual(events, [
    "unregister",
    "detach-user",
    "mark-detach",
    "detach-room",
    "clear-media",
    "clear-screen-owner",
    "broadcast-room",
    "broadcast-all-presence",
    "hset:presence:user:u1:0",
    "expire:presence:user:u1:120"
  ]);
});

test("realtime-lifecycle: close does not mark offline when another user socket is still active", async () => {
  const connection = {} as any;
  const socketState = new WeakMap<any, any>();
  socketState.set(connection, {
    userId: "u1",
    userName: "Alice",
    roomId: null,
    roomSlug: null
  });

  const events: string[] = [];
  const socketsByUserId = new Map<string, Set<any>>([["u1", new Set([{}])]]);

  await closeRealtimeConnection({
    connection,
    socketState,
    unregisterRealtimeSocket: () => {
      events.push("unregister");
    },
    detachUserSocket: () => {
      events.push("detach-user");
    },
    markRecentRoomDetach: () => {
      events.push("mark-detach");
    },
    detachRoomSocket: () => {
      events.push("detach-room");
    },
    clearCanonicalMediaState: () => {
      events.push("clear-media");
    },
    clearRoomScreenShareOwnerIfMatches: () => {
      events.push("clear-screen-owner");
    },
    broadcastRoom: () => {
      events.push("broadcast-room");
    },
    buildPresenceLeftEnvelope: () => ({ type: "presence.left" }),
    getRoomPresence: () => [],
    broadcastAllRoomsPresence: () => {
      events.push("broadcast-all-presence");
    },
    socketsByUserId,
    redisHSet: async (key, value) => {
      events.push(`hset:${key}:${value.online}`);
      return 1;
    },
    redisExpire: async (key, seconds) => {
      events.push(`expire:${key}:${seconds}`);
      return 1;
    }
  });

  assert.deepEqual(events, ["unregister", "detach-user"]);
});
