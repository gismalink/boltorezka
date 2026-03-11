import test from "node:test";
import assert from "node:assert/strict";
import { buildCallIdempotencyKey, isDuplicateCallSignal } from "./realtime-idempotency.js";

test("realtime-idempotency: builds deterministic key", () => {
  assert.equal(
    buildCallIdempotencyKey("user-1", "call.mic_state", "req-1"),
    "ws:idempotency:call:user-1:call.mic_state:req-1"
  );
});

test("realtime-idempotency: first request is not duplicate", async () => {
  let setCalls = 0;
  const redis = {
    set: async () => {
      setCalls += 1;
      return "OK";
    }
  };

  const duplicate = await isDuplicateCallSignal(redis, "u-1", "call.video_state", "r-1");
  assert.equal(duplicate, false);
  assert.equal(setCalls, 1);
});

test("realtime-idempotency: repeated request is duplicate", async () => {
  const redis = {
    set: async () => null
  };

  const duplicate = await isDuplicateCallSignal(redis, "u-2", "call.mic_state", "r-2");
  assert.equal(duplicate, true);
});

test("realtime-idempotency: forwards custom ttl", async () => {
  const seen: Array<{ key: string; options: { NX: boolean; EX: number } }> = [];
  const redis = {
    set: async (key: string, _value: string, options: { NX: boolean; EX: number }) => {
      seen.push({ key, options });
      return "OK";
    }
  };

  await isDuplicateCallSignal(redis, "u-3", "call.video_state", "r-3", 30);

  assert.deepEqual(seen, [
    {
      key: "ws:idempotency:call:u-3:call.video_state:r-3",
      options: { NX: true, EX: 30 }
    }
  ]);
});