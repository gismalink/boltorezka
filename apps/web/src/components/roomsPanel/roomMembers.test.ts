import { describe, expect, it } from "vitest";
import { mapRoomMembersForSlug } from "./roomMembers";

describe("roomMembers", () => {
  it("deduplicates only by userId and keeps same-name users with different ids", () => {
    const result = mapRoomMembersForSlug(
      {
        room: [
          { userId: "u-1", userName: "Alex" },
          { userId: "u-2", userName: "Alex" },
          { userId: "u-1", userName: "Alex" }
        ]
      },
      {},
      "room"
    );

    expect(result).toEqual([
      { userId: "u-1", userName: "Alex" },
      { userId: "u-2", userName: "Alex" }
    ]);
  });

  it("keeps entries without userId as separate display-only rows", () => {
    const result = mapRoomMembersForSlug(
      {
        room: [
          { userId: "", userName: "Alex" },
          { userId: "", userName: "Alex" }
        ]
      },
      {},
      "room"
    );

    expect(result).toEqual([
      { userId: "", userName: "Alex" },
      { userId: "", userName: "Alex" }
    ]);
  });
});
