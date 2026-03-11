import test from "node:test";
import assert from "node:assert/strict";
import type { WebSocket as WsSocket } from "ws";
import { createRealtimeRoomStateStore } from "./realtime-room-state.js";

test("realtime-room-state: getRoomPresence deduplicates users across multiple sockets", () => {
  const socketState = new WeakMap<WsSocket, any>();
  const socketA = {} as WsSocket;
  const socketB = {} as WsSocket;
  const socketC = {} as WsSocket;

  socketState.set(socketA, { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" });
  socketState.set(socketB, { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" });
  socketState.set(socketC, { userId: "u2", userName: "Bob", roomId: "room-1", roomSlug: "general" });

  const store = createRealtimeRoomStateStore({
    socketState,
    sendJson: () => {},
    buildRoomsPresenceEnvelope: (rooms) => ({ type: "rooms.presence", payload: rooms }),
    resolveRoomMediaTopology: () => "livekit"
  });

  store.attachRoomSocket("room-1", socketA);
  store.attachRoomSocket("room-1", socketB);
  store.attachRoomSocket("room-1", socketC);

  const presence = store.getRoomPresence("room-1");
  assert.equal(presence.length, 2);
  assert.deepEqual(
    presence.map((item) => item.userId).sort(),
    ["u1", "u2"]
  );
});

test("realtime-room-state: broadcastAllRoomsPresence sends one envelope per socket", () => {
  const socketState = new WeakMap<WsSocket, any>();
  const socketA = {} as WsSocket;
  const socketB = {} as WsSocket;

  socketState.set(socketA, { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" });
  socketState.set(socketB, { userId: "u2", userName: "Bob", roomId: "room-1", roomSlug: "general" });

  const sent: Array<{ socket: WsSocket; payload: unknown }> = [];
  const store = createRealtimeRoomStateStore({
    socketState,
    sendJson: (socket, payload) => {
      sent.push({ socket, payload });
    },
    buildRoomsPresenceEnvelope: (rooms) => ({ type: "rooms.presence", payload: rooms }),
    resolveRoomMediaTopology: () => "livekit"
  });

  store.attachUserSocket("u1", socketA);
  store.attachUserSocket("u2", socketB);
  store.attachRoomSocket("room-1", socketA);
  store.attachRoomSocket("room-1", socketB);

  store.broadcastAllRoomsPresence();

  assert.equal(sent.length, 2);
  assert.equal(sent.every((entry) => (entry.payload as any)?.type === "rooms.presence"), true);
});
