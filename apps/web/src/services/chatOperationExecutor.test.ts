import { describe, expect, it, vi } from "vitest";
import {
  CHAT_OPERATION_POLICIES,
  executeChatOperation,
  executeChatOperationWithError,
  executeWsFirstWithHttpFallbackAwaitAck,
  executeWsFirstWithHttpFallback
} from "./chatOperationExecutor";

describe("chatOperationExecutor", () => {
  it("executeWsFirstWithHttpFallback returns ws result when socket accepted event", async () => {
    const httpFallback = vi.fn(async () => "http");
    const sendWsEvent = vi.fn(() => "req-1");

    const result = await executeWsFirstWithHttpFallback({
      sendWsEvent,
      eventType: "chat.edit",
      payload: { messageId: "m1" },
      withIdempotency: true,
      maxRetries: 2,
      httpFallback
    });

    expect(result).toEqual({ kind: "ws", requestId: "req-1" });
    expect(httpFallback).not.toHaveBeenCalled();
  });

  it("executeWsFirstWithHttpFallback uses http fallback when socket unavailable", async () => {
    const httpFallback = vi.fn(async () => "ok");
    const sendWsEvent = vi.fn(() => null);

    const result = await executeWsFirstWithHttpFallback({
      sendWsEvent,
      eventType: "chat.delete",
      payload: { messageId: "m1" },
      httpFallback
    });

    expect(result).toEqual({ kind: "http", value: "ok" });
    expect(httpFallback).toHaveBeenCalledTimes(1);
  });

  it("executeWsFirstWithHttpFallbackAwaitAck returns ws result on ack", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => undefined);
    const httpFallback = vi.fn(async () => "http");

    const result = await executeWsFirstWithHttpFallbackAwaitAck({
      sendWsEventAwaitAck,
      eventType: "chat.edit",
      payload: { messageId: "m1" },
      withIdempotency: true,
      maxRetries: 1,
      httpFallback
    });

    expect(result).toEqual({ kind: "ws" });
    expect(httpFallback).not.toHaveBeenCalled();
  });

  it("executeWsFirstWithHttpFallbackAwaitAck uses http fallback on transient ws error", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("chat.edit:ack_timeout");
    });
    const httpFallback = vi.fn(async () => "ok");

    const result = await executeWsFirstWithHttpFallbackAwaitAck({
      sendWsEventAwaitAck,
      eventType: "chat.edit",
      payload: { messageId: "m1" },
      httpFallback
    });

    expect(result).toEqual({ kind: "http", value: "ok" });
    expect(httpFallback).toHaveBeenCalledTimes(1);
  });

  it("executeWsFirstWithHttpFallbackAwaitAck does not fallback on nack-like business error", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => {
      throw new Error("chat.edit:Forbidden:cannot_edit");
    });
    const httpFallback = vi.fn(async () => "ok");

    const result = await executeWsFirstWithHttpFallbackAwaitAck({
      sendWsEventAwaitAck,
      eventType: "chat.edit",
      payload: { messageId: "m1" },
      httpFallback
    });

    expect(result).toEqual({ kind: "failed" });
    expect(httpFallback).not.toHaveBeenCalled();
  });

  it("executeChatOperation handles http-only policy", async () => {
    const httpRequest = vi.fn(async () => 42);

    const result = await executeChatOperation({
      policy: CHAT_OPERATION_POLICIES["chat.report"],
      httpRequest
    });

    expect(result).toEqual({ kind: "http", value: 42 });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it("executeChatOperation handles ws-only policy", async () => {
    const sendWsEvent = vi.fn(() => "req-ws");

    const result = await executeChatOperation({
      policy: {
        transport: "ws-only",
        ws: {
          eventType: "chat.sample",
          withIdempotency: true,
          maxRetries: 1
        }
      },
      sendWsEvent,
      payload: { id: "1" }
    });

    expect(result).toEqual({ kind: "ws", requestId: "req-ws" });
    expect(sendWsEvent).toHaveBeenCalledWith(
      "chat.sample",
      { id: "1" },
      { withIdempotency: true, maxRetries: 1 }
    );
  });

  it("executeChatOperation prefers ack sender for ws-first policy", async () => {
    const sendWsEventAwaitAck = vi.fn(async () => undefined);
    const sendWsEvent = vi.fn(() => "req-legacy");
    const httpRequest = vi.fn(async () => "ok");

    const result = await executeChatOperation({
      policy: CHAT_OPERATION_POLICIES["chat.edit"],
      sendWsEventAwaitAck,
      sendWsEvent,
      payload: { messageId: "m1", text: "x" },
      httpRequest
    });

    expect(result).toEqual({ kind: "ws" });
    expect(sendWsEventAwaitAck).toHaveBeenCalledTimes(1);
    expect(sendWsEvent).not.toHaveBeenCalled();
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it("executeChatOperationWithError preserves http error for code-specific handling", async () => {
    const error = Object.assign(new Error("already reported"), { code: "MessageAlreadyReported" });

    const result = await executeChatOperationWithError({
      policy: CHAT_OPERATION_POLICIES["chat.report"],
      httpRequest: async () => {
        throw error;
      }
    });

    // Ошибка должна вернуться наружу, чтобы вызывающий код мог различать бизнес-коды.
    expect(result.kind).toBe("failed");
    if (result.kind === "failed" && "error" in result) {
      expect(result.error).toBe(error);
    }
  });
});
