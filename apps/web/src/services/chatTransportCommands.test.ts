import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runChatDelete,
  runChatEdit,
  runChatReport,
  runChatTogglePin,
  runChatToggleReaction
} from "./chatTransportCommands";

const {
  editMessageMock,
  deleteMessageMock,
  pinMessageMock,
  unpinMessageMock,
  addMessageReactionMock,
  removeMessageReactionMock,
  reportMessageMock
} = vi.hoisted(() => ({
  editMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  pinMessageMock: vi.fn(),
  unpinMessageMock: vi.fn(),
  addMessageReactionMock: vi.fn(),
  removeMessageReactionMock: vi.fn(),
  reportMessageMock: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    editMessage: editMessageMock,
    deleteMessage: deleteMessageMock,
    pinMessage: pinMessageMock,
    unpinMessage: unpinMessageMock,
    addMessageReaction: addMessageReactionMock,
    removeMessageReaction: removeMessageReactionMock,
    reportMessage: reportMessageMock
  }
}));

describe("chatTransportCommands", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runChatEdit returns ws when ack succeeds", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => undefined);
    editMessageMock.mockResolvedValue(undefined);

    const result = await runChatEdit({
      authToken: "token",
      messageId: "m1",
      text: "updated",
      roomSlug: "general",
      topicId: "topic-1",
      maxRetries: 1,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "ws" });
    expect(sendWsEventAwaitAck).toHaveBeenCalledTimes(1);
    expect(sendWsEvent).not.toHaveBeenCalled();
    expect(editMessageMock).not.toHaveBeenCalled();
  });

  it("runChatDelete falls back to http on transient ws error", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("ws_not_connected");
    });
    deleteMessageMock.mockResolvedValue(undefined);

    const result = await runChatDelete({
      authToken: "token",
      messageId: "m1",
      roomSlug: "general",
      topicId: "topic-1",
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(deleteMessageMock).toHaveBeenCalledWith("token", "m1");
  });

  it("runChatTogglePin falls back to pin http operation", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("chat.pin:ack_timeout");
    });
    pinMessageMock.mockResolvedValue(undefined);

    const result = await runChatTogglePin({
      authToken: "token",
      messageId: "m1",
      currentlyPinned: false,
      roomSlug: "general",
      topicId: "topic-1",
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: true });
    expect(pinMessageMock).toHaveBeenCalledWith("token", "m1");
  });

  it("runChatToggleReaction falls back to remove reaction http operation", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("ws_disposed");
    });
    removeMessageReactionMock.mockResolvedValue(undefined);

    const result = await runChatToggleReaction({
      authToken: "token",
      messageId: "m1",
      emoji: "👍",
      currentlyActive: true,
      roomSlug: "general",
      topicId: "topic-1",
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(removeMessageReactionMock).toHaveBeenCalledWith("token", "m1", "👍");
  });

  it("runChatReport returns http on success", async () => {
    reportMessageMock.mockResolvedValue(undefined);

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1"
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(reportMessageMock).toHaveBeenCalledWith("token", "m1", {
      reason: "spam_or_abuse"
    });
  });

  it("runChatReport preserves backend error for business handling", async () => {
    const error = Object.assign(new Error("already reported"), { code: "MessageAlreadyReported" });
    reportMessageMock.mockRejectedValue(error);

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed" && "error" in result) {
      expect(result.error).toBe(error);
    }
  });
});
