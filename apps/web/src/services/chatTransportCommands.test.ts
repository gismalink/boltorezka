import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runChatDelete,
  runChatEdit,
  runChatReport,
  runChatSend,
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
  reportMessageMock,
  createTopicMessageMock,
  replyMessageMock,
  createRoomMessageMock
} = vi.hoisted(() => ({
  editMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  pinMessageMock: vi.fn(),
  unpinMessageMock: vi.fn(),
  addMessageReactionMock: vi.fn(),
  removeMessageReactionMock: vi.fn(),
  reportMessageMock: vi.fn(),
  createTopicMessageMock: vi.fn(),
  replyMessageMock: vi.fn(),
  createRoomMessageMock: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    editMessage: editMessageMock,
    deleteMessage: deleteMessageMock,
    pinMessage: pinMessageMock,
    unpinMessage: unpinMessageMock,
    addMessageReaction: addMessageReactionMock,
    removeMessageReaction: removeMessageReactionMock,
    reportMessage: reportMessageMock,
    createTopicMessage: createTopicMessageMock,
    replyMessage: replyMessageMock,
    createRoomMessage: createRoomMessageMock
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

  it("runChatReport returns ws on ack success", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => undefined);
    reportMessageMock.mockResolvedValue(undefined);

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1",
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "ws" });
    expect(sendWsEventAwaitAck).toHaveBeenCalledTimes(1);
    expect(reportMessageMock).not.toHaveBeenCalled();
  });

  it("runChatReport falls back to http on transient ws error", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("chat.report:ack_timeout");
    });
    reportMessageMock.mockResolvedValue(undefined);

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1",
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(reportMessageMock).toHaveBeenCalledWith("token", "m1", {
      reason: "spam_or_abuse"
    });
  });

  it("runChatReport preserves ws business error for code handling", async () => {
    const error = new Error("chat.report:MessageAlreadyReported:already_reported");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw error;
    });

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1",
      sendWsEventAwaitAck
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.error).toBe(error);
      expect((result.error as { code?: string }).code).toBe("MessageAlreadyReported");
    }
    expect(reportMessageMock).not.toHaveBeenCalled();
  });

  it("runChatReport preserves backend error for business handling", async () => {
    const error = Object.assign(new Error("already reported"), { code: "MessageAlreadyReported" });
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("ws_not_connected");
    });
    reportMessageMock.mockRejectedValue(error);

    const result = await runChatReport({
      authToken: "token",
      messageId: "m1",
      sendWsEventAwaitAck
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.error).toBe(error);
    }
  });

  it("runChatSend returns ws when ack succeeds", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => undefined);

    const result = await runChatSend({
      authToken: "token",
      text: "hello",
      roomSlug: "general",
      topicId: "topic-1",
      maxRetries: 2,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "ws" });
    expect(sendWsEventAwaitAck).toHaveBeenCalledTimes(1);
    expect(createTopicMessageMock).not.toHaveBeenCalled();
  });

  it("runChatSend falls back to reply http operation on transient ws error", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("chat.send:ack_timeout");
    });
    replyMessageMock.mockResolvedValue(undefined);

    const result = await runChatSend({
      authToken: "token",
      text: "hello",
      roomSlug: "general",
      topicId: "topic-1",
      replyToMessageId: "message-1",
      mentionUserIds: ["u2"],
      maxRetries: 2,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(replyMessageMock).toHaveBeenCalledWith("token", "message-1", {
      text: "hello",
      mentionUserIds: ["u2"]
    });
  });

  it("runChatSend falls back to room http operation on transient ws error", async () => {
    const sendWsEvent = vi.fn(() => "legacy-req");
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("ws_not_connected");
    });
    createRoomMessageMock.mockResolvedValue(undefined);

    const result = await runChatSend({
      authToken: "token",
      text: "hello room",
      roomSlug: "general",
      mentionUserIds: ["u2"],
      maxRetries: 2,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    expect(result).toEqual({ kind: "http", value: undefined });
    expect(createRoomMessageMock).toHaveBeenCalledWith("token", "general", {
      text: "hello room",
      mentionUserIds: ["u2"]
    });
  });
});
