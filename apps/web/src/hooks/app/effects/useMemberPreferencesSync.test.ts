import { describe, expect, it } from "vitest";
import { deriveMemberPreferenceTargetUserIds } from "./useMemberPreferencesSync";

describe("deriveMemberPreferenceTargetUserIds", () => {
  it("excludes current user, empty ids and duplicates", () => {
    const result = deriveMemberPreferenceTargetUserIds(
      {
        general: [
          { userId: " u-1 " } as { userId: string },
          { userId: "u-2" } as { userId: string },
          { userId: "" } as { userId: string }
        ],
        support: [
          { userId: "u-2" } as { userId: string },
          { userId: "u-3" } as { userId: string }
        ]
      },
      "u-1"
    );

    expect(result).toEqual(["u-2", "u-3"]);
  });

  it("returns empty when there are no eligible targets", () => {
    const result = deriveMemberPreferenceTargetUserIds(
      {
        general: [{ userId: "self" } as { userId: string }]
      },
      "self"
    );

    expect(result).toEqual([]);
  });
});