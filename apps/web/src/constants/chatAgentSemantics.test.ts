import { describe, it, expect } from "vitest";
import {
  CHAT_AGENT_IDS,
  CHAT_AGENT_STATUS_STYLE,
  CHAT_AGENT_FAILURE_REASONS,
  normalizeChatAgentFailureReason,
  buildChatAgentStatus,
  chatAgentMessageId,
  chatAgentMentionOptionId
} from "./chatAgentSemantics";

describe("CHAT_AGENT_IDS", () => {
  it("exposes stable canonical ids", () => {
    expect(CHAT_AGENT_IDS.panel).toBe("chat.panel");
    expect(CHAT_AGENT_IDS.timeline).toBe("chat.timeline");
    expect(CHAT_AGENT_IDS.messageBase).toBe("chat.message");
    expect(CHAT_AGENT_IDS.composerMentionOptionBase).toBe("chat.composer.mention-option");
    expect(CHAT_AGENT_IDS.searchPanel).toBe("chat.search.panel");
    expect(CHAT_AGENT_IDS.topicContextMenu).toBe("chat.topic-context-menu");
  });

  it("values are unique", () => {
    const values = Object.values(CHAT_AGENT_IDS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("CHAT_AGENT_STATUS_STYLE", () => {
  it("defines visually-hidden style", () => {
    expect(CHAT_AGENT_STATUS_STYLE.position).toBe("absolute");
    expect(CHAT_AGENT_STATUS_STYLE.width).toBe("1px");
    expect(CHAT_AGENT_STATUS_STYLE.height).toBe("1px");
    expect(CHAT_AGENT_STATUS_STYLE.clip).toBe("rect(0, 0, 0, 0)");
    expect(CHAT_AGENT_STATUS_STYLE.overflow).toBe("hidden");
  });
});

describe("normalizeChatAgentFailureReason", () => {
  it("returns unknown for null/undefined/empty", () => {
    expect(normalizeChatAgentFailureReason(null)).toBe(CHAT_AGENT_FAILURE_REASONS.unknown);
    expect(normalizeChatAgentFailureReason(undefined)).toBe(CHAT_AGENT_FAILURE_REASONS.unknown);
    expect(normalizeChatAgentFailureReason("")).toBe(CHAT_AGENT_FAILURE_REASONS.unknown);
    expect(normalizeChatAgentFailureReason("   ")).toBe(CHAT_AGENT_FAILURE_REASONS.unknown);
  });

  it("matches timeout via 'timeout' or 'timed out'", () => {
    expect(normalizeChatAgentFailureReason(new Error("Request timeout"))).toBe(CHAT_AGENT_FAILURE_REASONS.timeout);
    expect(normalizeChatAgentFailureReason("Connection timed out")).toBe(CHAT_AGENT_FAILURE_REASONS.timeout);
  });

  it("matches unauthorized via word or 401", () => {
    expect(normalizeChatAgentFailureReason("unauthorized")).toBe(CHAT_AGENT_FAILURE_REASONS.unauthorized);
    expect(normalizeChatAgentFailureReason("HTTP 401")).toBe(CHAT_AGENT_FAILURE_REASONS.unauthorized);
  });

  it("matches forbidden via word or 403", () => {
    expect(normalizeChatAgentFailureReason("Forbidden")).toBe(CHAT_AGENT_FAILURE_REASONS.forbidden);
    expect(normalizeChatAgentFailureReason("status 403")).toBe(CHAT_AGENT_FAILURE_REASONS.forbidden);
  });

  it("matches validation via 'validation'/'invalid'/'bad request'/'400'", () => {
    expect(normalizeChatAgentFailureReason("Validation failed")).toBe(CHAT_AGENT_FAILURE_REASONS.validationError);
    expect(normalizeChatAgentFailureReason("invalid input")).toBe(CHAT_AGENT_FAILURE_REASONS.validationError);
    expect(normalizeChatAgentFailureReason("Bad Request")).toBe(CHAT_AGENT_FAILURE_REASONS.validationError);
    expect(normalizeChatAgentFailureReason("HTTP 400")).toBe(CHAT_AGENT_FAILURE_REASONS.validationError);
  });

  it("matches network via 'network'/'fetch'/'connection'/'ecconn'", () => {
    expect(normalizeChatAgentFailureReason("Network error")).toBe(CHAT_AGENT_FAILURE_REASONS.networkError);
    expect(normalizeChatAgentFailureReason("fetch failed")).toBe(CHAT_AGENT_FAILURE_REASONS.networkError);
    expect(normalizeChatAgentFailureReason("connection refused")).toBe(CHAT_AGENT_FAILURE_REASONS.networkError);
    expect(normalizeChatAgentFailureReason("ECCONNRESET")).toBe(CHAT_AGENT_FAILURE_REASONS.networkError);
  });

  it("falls back to unknown for unrecognized message", () => {
    expect(normalizeChatAgentFailureReason("something weird")).toBe(CHAT_AGENT_FAILURE_REASONS.unknown);
  });

  it("accepts plain string as input", () => {
    expect(normalizeChatAgentFailureReason("timeout")).toBe(CHAT_AGENT_FAILURE_REASONS.timeout);
  });

  it("priority: timeout beats unauthorized when message contains both", () => {
    // 'timeout' branch is checked first
    expect(normalizeChatAgentFailureReason("401 unauthorized timeout")).toBe(CHAT_AGENT_FAILURE_REASONS.timeout);
  });
});

describe("buildChatAgentStatus", () => {
  it("normalizes action token (trim, lowercase, collapse spaces)", () => {
    expect(buildChatAgentStatus("  Send Message  ", "requested")).toBe("send-message:requested");
  });

  it("returns 'action' fallback for empty action", () => {
    expect(buildChatAgentStatus("", "accepted")).toBe("action:accepted");
    expect(buildChatAgentStatus("   ", "accepted")).toBe("action:accepted");
  });

  it("formats failed phase with reason", () => {
    expect(buildChatAgentStatus("send", "failed", CHAT_AGENT_FAILURE_REASONS.timeout)).toBe("send:failed:timeout");
  });

  it("formats failed phase with default unknown reason", () => {
    expect(buildChatAgentStatus("send", "failed")).toBe("send:failed:unknown");
  });
});

describe("chatAgentMessageId / chatAgentMentionOptionId", () => {
  it("composes message id with trim", () => {
    expect(chatAgentMessageId("  m-1  ")).toBe("chat.message.m-1");
  });

  it("composes mention option id with trim", () => {
    expect(chatAgentMentionOptionId("  alice  ")).toBe("chat.composer.mention-option.alice");
  });

  it("handles empty inputs", () => {
    expect(chatAgentMessageId("")).toBe("chat.message.");
    expect(chatAgentMentionOptionId("")).toBe("chat.composer.mention-option.");
  });
});
