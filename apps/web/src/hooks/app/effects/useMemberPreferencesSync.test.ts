import { describe, expect, it } from "vitest";
import { deriveMemberPreferenceTargetUserIds } from "./memberPreferencesUtils";

describe("deriveMemberPreferenceTargetUserIds", () => {
  it("excludes current user, empty ids and duplicates", () => {
    const result = deriveMemberPreferenceTargetUserIds(
      {
        general: [
          { userId: " u-1 ", userName: "u-1" },
          { userId: "u-2", userName: "u-2" },
          { userId: "", userName: "" }
        ],
        support: [
          { userId: "u-2", userName: "u-2" },
          { userId: "u-3", userName: "u-3" }
        ]
      },
      "u-1"
    );

    expect(result).toEqual(["u-2", "u-3"]);
  });

  it("returns empty when there are no eligible targets", () => {
    const result = deriveMemberPreferenceTargetUserIds(
      {
        general: [{ userId: "self", userName: "self" }]
      },
      "self"
    );

    expect(result).toEqual([]);
  });
});