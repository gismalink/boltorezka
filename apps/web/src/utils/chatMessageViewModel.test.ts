import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../domain";
import { buildChatMessageViewModels } from "./chatMessageViewModel";

function msg(overrides: Partial<Message> & { id: string; user_id: string }): Message {
  return {
    id: overrides.id,
    room_id: "room-1",
    topic_id: "topic-1",
    user_id: overrides.user_id,
    text: "hi",
    created_at: "2026-04-30T00:00:00.000Z",
    user_name: `user-${overrides.user_id}`,
    ...overrides
  } as Message;
}

describe("buildChatMessageViewModels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty array for empty input", () => {
    expect(buildChatMessageViewModels([], "u1", 60_000)).toEqual([]);
  });

  it("marks own messages and within manage window", () => {
    const out = buildChatMessageViewModels([msg({ id: "a", user_id: "u1" })], "u1", 60_000);
    expect(out[0].isOwn).toBe(true);
    expect(out[0].canManageOwnMessage).toBe(true);
  });

  it("does not mark canManageOwnMessage outside the manage window", () => {
    const out = buildChatMessageViewModels(
      [msg({ id: "a", user_id: "u1", created_at: "2026-04-30T00:00:00.000Z" })],
      "u1",
      10
    );
    expect(out[0].canManageOwnMessage).toBe(false);
  });

  it("never marks canManageOwnMessage for other-user messages", () => {
    const out = buildChatMessageViewModels([msg({ id: "a", user_id: "u2" })], "u1", 60_000);
    expect(out[0].isOwn).toBe(false);
    expect(out[0].canManageOwnMessage).toBe(false);
  });

  it("hides showAuthor for consecutive messages from same user", () => {
    const out = buildChatMessageViewModels(
      [msg({ id: "a", user_id: "u2" }), msg({ id: "b", user_id: "u2" })],
      "u1",
      60_000
    );
    expect(out[0].showAuthor).toBe(true);
    expect(out[1].showAuthor).toBe(false);
  });

  it("shows avatar only on the last message of a peer's run, and never for own", () => {
    const out = buildChatMessageViewModels(
      [
        msg({ id: "a", user_id: "u2" }),
        msg({ id: "b", user_id: "u2" }),
        msg({ id: "c", user_id: "u1" })
      ],
      "u1",
      60_000
    );
    expect(out[0].showAvatar).toBe(false);
    expect(out[1].showAvatar).toBe(true);
    expect(out[2].showAvatar).toBe(false); // own
  });

  it("builds replyPreview only when reply_to_message_id is set", () => {
    const out = buildChatMessageViewModels(
      [
        msg({ id: "a", user_id: "u2" }),
        msg({
          id: "b",
          user_id: "u2",
          reply_to_message_id: "a",
          reply_to_user_name: "Alice",
          reply_to_text: "hi"
        })
      ],
      "u1",
      60_000
    );
    expect(out[0].replyPreview).toBeNull();
    expect(out[1].replyPreview).toEqual({ userName: "Alice", text: "hi" });
  });

  it("falls back to 'Unknown' reply user name when missing", () => {
    const out = buildChatMessageViewModels(
      [
        msg({
          id: "a",
          user_id: "u2",
          reply_to_message_id: "x",
          reply_to_user_name: null,
          reply_to_text: null
        })
      ],
      "u1",
      60_000
    );
    expect(out[0].replyPreview).toEqual({ userName: "Unknown", text: "" });
  });

  it("dedupes attachment image urls and skips empty ones", () => {
    const out = buildChatMessageViewModels(
      [
        msg({
          id: "a",
          user_id: "u2",
          attachments: [
            { id: "1", type: "image", download_url: "https://x/1.png", mime_type: "image/png", size_bytes: 10 },
            { id: "2", type: "image", download_url: "https://x/1.png", mime_type: "image/png", size_bytes: 10 },
            { id: "3", type: "image", download_url: "  ", mime_type: "image/png", size_bytes: 10 }
          ]
        })
      ],
      "u1",
      60_000
    );
    expect(out[0].attachmentImageUrls).toEqual(["https://x/1.png"]);
  });

  it("collects document/audio attachments and ignores invalid ones", () => {
    const out = buildChatMessageViewModels(
      [
        msg({
          id: "a",
          user_id: "u2",
          attachments: [
            { id: "1", type: "document", download_url: "https://x/d.pdf", mime_type: "application/pdf", size_bytes: 1024 },
            { id: "2", type: "audio", download_url: "", mime_type: "audio/ogg", size_bytes: 1024 },
            { id: "3", type: "document", download_url: "https://x/d2.pdf", mime_type: "application/pdf", size_bytes: 0 },
            { id: "4", type: "image", download_url: "https://x/i.png", mime_type: "image/png", size_bytes: 1 }
          ]
        })
      ],
      "u1",
      60_000
    );
    expect(out[0].attachmentFiles).toHaveLength(1);
    expect(out[0].attachmentFiles[0].id).toBe("1");
  });

  it("emits delivery presentation for known statuses", () => {
    const out = buildChatMessageViewModels(
      [
        msg({ id: "a", user_id: "u1", deliveryStatus: "sending" }),
        msg({ id: "b", user_id: "u1", deliveryStatus: "delivered" }),
        msg({ id: "c", user_id: "u1", deliveryStatus: "failed" }),
        msg({ id: "d", user_id: "u1" })
      ],
      "u1",
      60_000
    );
    expect(out[0].deliveryGlyph).toBe("•");
    expect(out[1].deliveryGlyph).toBe("✓✓");
    expect(out[2].deliveryGlyph).toBe("!");
    expect(out[3].deliveryGlyph).toBe("");
  });
});
