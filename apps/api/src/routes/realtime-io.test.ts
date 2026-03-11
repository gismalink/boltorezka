import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRequestId, sendAck, sendJson, sendNack } from "./realtime-io.js";

type MockSocket = {
  OPEN: number;
  readyState: number;
  sent: string[];
  send: (payload: string) => void;
};

function createMockSocket(readyState = 1): MockSocket {
  return {
    OPEN: 1,
    readyState,
    sent: [],
    send(payload: string) {
      this.sent.push(payload);
    }
  };
}

test("realtime-io: sendJson sends only when socket is open", () => {
  const openSocket = createMockSocket(1);
  const closedSocket = createMockSocket(0);

  sendJson(openSocket as any, { type: "ping" });
  sendJson(closedSocket as any, { type: "ping" });

  assert.equal(openSocket.sent.length, 1);
  assert.equal(closedSocket.sent.length, 0);
});

test("realtime-io: normalizeRequestId trims, truncates and rejects empty", () => {
  assert.equal(normalizeRequestId("  abc  "), "abc");
  assert.equal(normalizeRequestId(" "), null);
  assert.equal(normalizeRequestId(42), null);

  const longId = "x".repeat(200);
  const normalized = normalizeRequestId(longId);
  assert.equal(normalized?.length, 128);
});

test("realtime-io: sendAck skips when requestId is missing", () => {
  const socket = createMockSocket();

  sendAck(socket as any, null, "chat.send", { marker: true });

  assert.equal(socket.sent.length, 0);
});

test("realtime-io: sendAck sends ack envelope with request metadata", () => {
  const socket = createMockSocket();

  sendAck(socket as any, "req-1", "chat.send", { marker: true });

  assert.equal(socket.sent.length, 1);
  const parsed = JSON.parse(socket.sent[0]);
  assert.equal(parsed.type, "ack");
  assert.equal(parsed.payload.requestId, "req-1");
  assert.equal(parsed.payload.eventType, "chat.send");
  assert.equal(parsed.payload.marker, true);
});

test("realtime-io: sendNack maps categories for error and nack envelopes", () => {
  const noRequestSocket = createMockSocket();
  const withRequestSocket = createMockSocket();

  sendNack(noRequestSocket as any, null, "room.join", "RoomNotFound", "room missing");
  sendNack(withRequestSocket as any, "req-2", "room.kick", "Forbidden", "denied", { from: "test" });

  assert.equal(noRequestSocket.sent.length, 1);
  const errorParsed = JSON.parse(noRequestSocket.sent[0]);
  assert.equal(errorParsed.type, "error");
  assert.equal(errorParsed.payload.code, "RoomNotFound");
  assert.equal(errorParsed.payload.category, "topology");

  assert.equal(withRequestSocket.sent.length, 1);
  const nackParsed = JSON.parse(withRequestSocket.sent[0]);
  assert.equal(nackParsed.type, "nack");
  assert.equal(nackParsed.payload.requestId, "req-2");
  assert.equal(nackParsed.payload.code, "Forbidden");
  assert.equal(nackParsed.payload.category, "permissions");
  assert.equal(nackParsed.payload.from, "test");
});
