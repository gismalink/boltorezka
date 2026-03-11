import test from "node:test";
import assert from "node:assert/strict";
import { createRealtimeMediaStateStore } from "./realtime-media-state.js";

test("realtime-media-state: participants and lag stats follow current presence", () => {
  const presenceByRoom = new Map<string, Array<{ userId: string; userName: string }>>();
  presenceByRoom.set("room-1", [{ userId: "u1", userName: "Alice" }]);

  const store = createRealtimeMediaStateStore((roomId) => presenceByRoom.get(roomId) || []);

  const originalNow = Date.now;
  try {
    Date.now = () => 1000;
    store.setCanonicalMediaState("room-1", "u1", { muted: true, speaking: true, audioMuted: false });
    store.setCanonicalMediaState("room-1", "u2", { muted: false, speaking: false, audioMuted: false });

    const participants = store.getCallInitialStateParticipants("room-1");
    assert.equal(participants.length, 1);
    assert.equal(participants[0]?.userId, "u1");
    assert.equal(participants[0]?.userName, "Alice");
    assert.equal(participants[0]?.mic.muted, true);
    assert.equal(participants[0]?.mic.speaking, true);

    Date.now = () => 1600;
    const lag = store.getCallInitialStateLagStats("room-1");
    assert.equal(lag.count, 1);
    assert.equal(lag.totalLagMs, 600);

    store.clearCanonicalMediaState("room-1", "u1");
    assert.equal(store.getCallInitialStateParticipants("room-1").length, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("realtime-media-state: reconnect mark is consumed once", () => {
  const store = createRealtimeMediaStateStore(() => []);

  const originalNow = Date.now;
  try {
    Date.now = () => 10_000;
    store.markRecentRoomDetach("room-2", "u2");

    Date.now = () => 10_050;
    assert.equal(store.consumeRecentReconnectMark("room-2", "u2"), true);
    assert.equal(store.consumeRecentReconnectMark("room-2", "u2"), false);
  } finally {
    Date.now = originalNow;
  }
});
