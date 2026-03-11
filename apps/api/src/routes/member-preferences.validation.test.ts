import test from "node:test";
import assert from "node:assert/strict";
import { validateTargetUserId, validateTargetUserIdsCsv } from "./member-preferences.validation.js";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

test("validateTargetUserIdsCsv returns empty list for empty input", () => {
  const result = validateTargetUserIdsCsv("");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, []);
  }
});

test("validateTargetUserIdsCsv deduplicates and trims valid UUID list", () => {
  const result = validateTargetUserIdsCsv(` ${UUID_A},${UUID_B}, ${UUID_A} `);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [UUID_A, UUID_B]);
  }
});

test("validateTargetUserIdsCsv rejects invalid UUID", () => {
  const result = validateTargetUserIdsCsv(`${UUID_A},not-a-uuid`);

  assert.equal(result.ok, false);
});

test("validateTargetUserId accepts valid UUID", () => {
  const result = validateTargetUserId(UUID_A);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, UUID_A);
  }
});

test("validateTargetUserId rejects invalid UUID", () => {
  const result = validateTargetUserId("abc");

  assert.equal(result.ok, false);
});
