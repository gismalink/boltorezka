import { describe, expect, it } from "vitest";
import type { Message } from "../../../domain";
import {
  countTrailingOwnMessagesInList,
  countUnreadMessagesExcludingOwn,
  subtractTrailingOwnMessagesFromUnread
} from "./unreadUtils";

const buildMessage = (id: string, userId: string): Message => ({
  id,
  room_id: "room-1",
  topic_id: "topic-1",
  user_id: userId,
  text: `message-${id}`,
  created_at: "2026-04-07T00:00:00.000Z",
  user_name: userId
});

describe("countTrailingOwnMessagesInList", () => {
  it("counts only contiguous own-message tail", () => {
    const messages: Message[] = [
      buildMessage("1", "u-2"),
      buildMessage("2", "u-1"),
      buildMessage("3", "u-1")
    ];

    expect(countTrailingOwnMessagesInList(messages, "u-1")).toBe(2);
  });

  it("returns zero when last message is not own", () => {
    const messages: Message[] = [
      buildMessage("1", "u-1"),
      buildMessage("2", "u-2")
    ];

    expect(countTrailingOwnMessagesInList(messages, "u-1")).toBe(0);
  });
});

describe("subtractTrailingOwnMessagesFromUnread", () => {
  it("subtracts trailing own messages from unread count", () => {
    const messages: Message[] = [
      buildMessage("1", "u-2"),
      buildMessage("2", "u-3"),
      buildMessage("3", "u-1"),
      buildMessage("4", "u-1")
    ];

    expect(subtractTrailingOwnMessagesFromUnread(4, messages, "u-1")).toBe(2);
  });

  it("never returns negative count", () => {
    const messages: Message[] = [
      buildMessage("1", "u-1"),
      buildMessage("2", "u-1")
    ];

    expect(subtractTrailingOwnMessagesFromUnread(1, messages, "u-1")).toBe(0);
  });
});

describe("countUnreadMessagesExcludingOwn", () => {
  it("counts only messages from other users", () => {
    const messages: Message[] = [
      buildMessage("1", "u-1"),
      buildMessage("2", "u-2"),
      buildMessage("3", "u-3"),
      buildMessage("4", "u-1")
    ];

    expect(countUnreadMessagesExcludingOwn(messages, "u-1")).toBe(2);
  });

  it("falls back to full count when current user id is missing", () => {
    const messages: Message[] = [
      buildMessage("1", "u-2"),
      buildMessage("2", "u-3")
    ];

    expect(countUnreadMessagesExcludingOwn(messages, null)).toBe(2);
  });
});
