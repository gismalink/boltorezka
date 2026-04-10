import test from "node:test";
import assert from "node:assert/strict";
import { isReadPointerAdvance } from "./read-pointer.js";

test("isReadPointerAdvance: accepts first pointer when current is empty", () => {
  assert.equal(
    isReadPointerAdvance(null, { messageId: "m-1", createdAtIso: "2026-04-10T10:00:00.000Z" }),
    true
  );
});

test("isReadPointerAdvance: rejects stale pointer by created_at", () => {
  assert.equal(
    isReadPointerAdvance(
      { messageId: "m-2", createdAtIso: "2026-04-10T10:01:00.000Z" },
      { messageId: "m-1", createdAtIso: "2026-04-10T10:00:00.000Z" }
    ),
    false
  );
});

test("isReadPointerAdvance: accepts newer pointer by created_at", () => {
  assert.equal(
    isReadPointerAdvance(
      { messageId: "m-1", createdAtIso: "2026-04-10T10:00:00.000Z" },
      { messageId: "m-3", createdAtIso: "2026-04-10T10:02:00.000Z" }
    ),
    true
  );
});

test("isReadPointerAdvance: accepts equal created_at pointers", () => {
  assert.equal(
    isReadPointerAdvance(
      { messageId: "m-100", createdAtIso: "2026-04-10T10:00:00.000Z" },
      { messageId: "m-099", createdAtIso: "2026-04-10T10:00:00.000Z" }
    ),
    true
  );

  assert.equal(
    isReadPointerAdvance(
      { messageId: "m-099", createdAtIso: "2026-04-10T10:00:00.000Z" },
      { messageId: "m-100", createdAtIso: "2026-04-10T10:00:00.000Z" }
    ),
    true
  );
});
