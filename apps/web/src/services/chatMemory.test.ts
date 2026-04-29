import { describe, expect, it } from "vitest";
import type { Message } from "../domain";
import { trimMessagesInMemory } from "./chatMemory";
import { CHAT_MESSAGES_IN_MEMORY_LIMIT } from "../constants/appConfig";

const make = (n: number): Message[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}` } as Message));

describe("trimMessagesInMemory", () => {
  it("returns same array when under limit", () => {
    const msgs = make(10);
    expect(trimMessagesInMemory(msgs)).toBe(msgs);
  });

  it("returns same array when exactly at limit", () => {
    const msgs = make(CHAT_MESSAGES_IN_MEMORY_LIMIT);
    expect(trimMessagesInMemory(msgs)).toBe(msgs);
  });

  it("keeps newest messages when over limit", () => {
    const msgs = make(CHAT_MESSAGES_IN_MEMORY_LIMIT + 5);
    const trimmed = trimMessagesInMemory(msgs);
    expect(trimmed.length).toBe(CHAT_MESSAGES_IN_MEMORY_LIMIT);
    expect(trimmed[0].id).toBe("m5");
    expect(trimmed[trimmed.length - 1].id).toBe(`m${CHAT_MESSAGES_IN_MEMORY_LIMIT + 4}`);
  });

  it("returns empty array unchanged", () => {
    const empty: Message[] = [];
    expect(trimMessagesInMemory(empty)).toBe(empty);
  });
});
