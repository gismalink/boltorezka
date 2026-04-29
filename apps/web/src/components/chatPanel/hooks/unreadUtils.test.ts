import { describe, expect, it } from "vitest";
import type { Message } from "../../../types";
import {
  countTrailingOwnMessagesInList,
  countUnreadMessagesExcludingOwn,
  subtractTrailingOwnMessagesFromUnread
} from "./unreadUtils";

function msg(id: string, userId: string): Message {
  return {
    id,
    room_id: "room-1",
    topic_id: "topic-1",
    user_id: userId,
    text: "x",
    created_at: "2026-01-01T00:00:00.000Z",
    user_name: "u"
  };
}

describe("unreadUtils", () => {
  describe("countTrailingOwnMessagesInList", () => {
    it("returns 0 for empty list or empty userId", () => {
      expect(countTrailingOwnMessagesInList([], "u1")).toBe(0);
      expect(countTrailingOwnMessagesInList([msg("a", "u1")], "")).toBe(0);
      expect(countTrailingOwnMessagesInList([msg("a", "u1")], null)).toBe(0);
    });

    it("counts contiguous own messages from the tail", () => {
      const list = [msg("a", "u2"), msg("b", "u1"), msg("c", "u1"), msg("d", "u1")];
      expect(countTrailingOwnMessagesInList(list, "u1")).toBe(3);
    });

    it("stops on first non-own message from the tail", () => {
      const list = [msg("a", "u1"), msg("b", "u2"), msg("c", "u1")];
      expect(countTrailingOwnMessagesInList(list, "u1")).toBe(1);
    });

    it("returns 0 if last message is not own", () => {
      const list = [msg("a", "u1"), msg("b", "u2")];
      expect(countTrailingOwnMessagesInList(list, "u1")).toBe(0);
    });

    it("trims whitespace in id comparisons", () => {
      const list = [msg("a", "  u1  ")];
      expect(countTrailingOwnMessagesInList(list, "u1")).toBe(1);
    });
  });

  describe("subtractTrailingOwnMessagesFromUnread", () => {
    it("returns 0 if source unread is 0 or negative", () => {
      expect(subtractTrailingOwnMessagesFromUnread(0, [], "u1")).toBe(0);
      expect(subtractTrailingOwnMessagesFromUnread(-3, [], "u1")).toBe(0);
    });

    it("does not subtract when there are no trailing own messages", () => {
      const list = [msg("a", "u2")];
      expect(subtractTrailingOwnMessagesFromUnread(5, list, "u1")).toBe(5);
    });

    it("subtracts trailing own messages count", () => {
      const list = [msg("a", "u2"), msg("b", "u1"), msg("c", "u1")];
      expect(subtractTrailingOwnMessagesFromUnread(5, list, "u1")).toBe(3);
    });

    it("never goes below zero", () => {
      const list = [msg("a", "u1"), msg("b", "u1"), msg("c", "u1")];
      expect(subtractTrailingOwnMessagesFromUnread(2, list, "u1")).toBe(0);
    });
  });

  describe("countUnreadMessagesExcludingOwn", () => {
    it("returns 0 for empty list", () => {
      expect(countUnreadMessagesExcludingOwn([], "u1")).toBe(0);
    });

    it("returns full length when current user id is empty", () => {
      const list = [msg("a", "u1"), msg("b", "u2")];
      expect(countUnreadMessagesExcludingOwn(list, "")).toBe(2);
      expect(countUnreadMessagesExcludingOwn(list, null)).toBe(2);
    });

    it("excludes own messages", () => {
      const list = [msg("a", "u1"), msg("b", "u2"), msg("c", "u3"), msg("d", "u1")];
      expect(countUnreadMessagesExcludingOwn(list, "u1")).toBe(2);
    });
  });
});
