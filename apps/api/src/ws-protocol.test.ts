import test from "node:test";
import assert from "node:assert/strict";
import {
  asKnownWsIncomingEnvelope,
  getPayloadString,
  isCallMicStateEventType,
  isCallVideoStateEventType,
  parseWsIncomingEnvelope
} from "./ws-protocol.js";

test("ws-protocol: parseWsIncomingEnvelope rejects invalid payloads", () => {
  assert.equal(parseWsIncomingEnvelope(""), null);
  assert.equal(parseWsIncomingEnvelope("not-json"), null);
  assert.equal(parseWsIncomingEnvelope(JSON.stringify({})), null);
  assert.equal(parseWsIncomingEnvelope(JSON.stringify({ type: "   " })), null);
});

test("ws-protocol: parseWsIncomingEnvelope accepts string and buffer payload", () => {
  const raw = JSON.stringify({
    type: "chat.send",
    requestId: "req-1",
    idempotencyKey: "idem-1",
    payload: {
      text: "hello"
    }
  });

  const parsedFromString = parseWsIncomingEnvelope(raw);
  const parsedFromBuffer = parseWsIncomingEnvelope(Buffer.from(raw));

  assert.deepEqual(parsedFromString, {
    type: "chat.send",
    requestId: "req-1",
    idempotencyKey: "idem-1",
    payload: {
      text: "hello"
    }
  });
  assert.deepEqual(parsedFromBuffer, parsedFromString);
});

test("ws-protocol: asKnownWsIncomingEnvelope filters unknown event types", () => {
  const known = asKnownWsIncomingEnvelope({ type: "chat.send", requestId: "r1", payload: {} });
  const knownPin = asKnownWsIncomingEnvelope({ type: "chat.pin", requestId: "r-pin", payload: {} });
  const knownReactionAdd = asKnownWsIncomingEnvelope({ type: "chat.reaction.add", requestId: "r-react", payload: {} });
  const unknown = asKnownWsIncomingEnvelope({ type: "custom.event", requestId: "r2", payload: {} });

  assert.equal(known?.type, "chat.send");
  assert.equal(knownPin?.type, "chat.pin");
  assert.equal(knownReactionAdd?.type, "chat.reaction.add");
  assert.equal(unknown, null);
});

test("ws-protocol: getPayloadString trims and enforces max length", () => {
  const payload = {
    value: "  hello  ",
    empty: "    ",
    long: "a".repeat(16)
  };

  assert.equal(getPayloadString(payload, "value", 10), "hello");
  assert.equal(getPayloadString(payload, "empty", 10), null);
  assert.equal(getPayloadString(payload, "missing", 10), null);
  assert.equal(getPayloadString(payload, "long", 8), "aaaaaaaa");
});

test("ws-protocol: call event type guards detect supported event names", () => {
  assert.equal(isCallMicStateEventType("call.mic_state"), true);
  assert.equal(isCallMicStateEventType("call.video_state"), false);
  assert.equal(isCallVideoStateEventType("call.video_state"), true);
  assert.equal(isCallVideoStateEventType("call.mic_state"), false);
});
