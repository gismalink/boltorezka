import { describe, expect, it } from "vitest";
import { decideRealtimeGapRecovery } from "./realtimeGapRecoveryPolicy";

describe("realtimeGapRecoveryPolicy", () => {
  it("skips non-chat scopes", () => {
    const result = decideRealtimeGapRecovery({
      scope: "stream:presence.joined",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toBeNull();
  });

  it("reloads messages and topics for chat global scope", () => {
    const result = decideRealtimeGapRecovery({
      scope: "chat:global",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toEqual({
      scope: "chat:global",
      shouldReloadMessages: true,
      shouldReloadTopics: true,
      recoveryMode: "messages+topics"
    });
  });

  it("reloads messages and topics for room scope in active room", () => {
    const result = decideRealtimeGapRecovery({
      scope: "room:room-1",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toEqual({
      scope: "room:room-1",
      shouldReloadMessages: true,
      shouldReloadTopics: true,
      recoveryMode: "messages+topics"
    });
  });

  it("skips room scope for foreign room", () => {
    const result = decideRealtimeGapRecovery({
      scope: "room:room-2",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toBeNull();
  });

  it("reloads messages and topics for topic scope when active topic matches", () => {
    const result = decideRealtimeGapRecovery({
      scope: "topic:room-1:topic-1",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toEqual({
      scope: "topic:room-1:topic-1",
      shouldReloadMessages: true,
      shouldReloadTopics: true,
      recoveryMode: "messages+topics"
    });
  });

  it("reloads only topics for topic scope in active room when active topic differs", () => {
    const result = decideRealtimeGapRecovery({
      scope: "topic:room-1:topic-2",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    });

    expect(result).toEqual({
      scope: "topic:room-1:topic-2",
      shouldReloadMessages: false,
      shouldReloadTopics: true,
      recoveryMode: "topics-only"
    });
  });

  it("skips malformed topic and room scopes", () => {
    expect(decideRealtimeGapRecovery({
      scope: "topic:room-1",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    })).toBeNull();

    expect(decideRealtimeGapRecovery({
      scope: "room:",
      activeRoomId: "room-1",
      activeTopicId: "topic-1"
    })).toBeNull();
  });
});
