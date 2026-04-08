import { describe, expect, it } from "vitest";
import { extractMentionUserIdsFromChatPayload } from "./wsMessageController";

describe("wsMessageController mention extraction", () => {
  it("extracts mention ids from direct arrays and deduplicates", () => {
    const ids = extractMentionUserIdsFromChatPayload({
      mentionUserIds: ["u-1", " u-2 ", "u-1", ""],
      mention_user_ids: ["u-3"]
    });

    expect(ids).toEqual(["u-1", "u-2"]);
  });

  it("extracts mention ids from csv and mentions array variants", () => {
    const ids = extractMentionUserIdsFromChatPayload({
      mention_user_ids: "u-1, u-2",
      mentions: [
        "u-3",
        { userId: "u-4" },
        { user_id: "u-5" },
        { targetUserId: "u-6" },
        { target_user_id: "u-7" },
        { id: "u-8" }
      ]
    });

    expect(ids).toEqual(["u-1", "u-2", "u-3", "u-4", "u-5", "u-6", "u-7", "u-8"]);
  });
});
