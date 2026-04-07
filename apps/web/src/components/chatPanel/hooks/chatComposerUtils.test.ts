import { describe, expect, it } from "vitest";
import { applyMentionToText, applyQuoteToText, formatAttachmentSizeValue } from "./chatComposerUtils";

describe("chatComposerUtils", () => {
  it("formats attachment sizes", () => {
    expect(formatAttachmentSizeValue(0)).toBe("0 B");
    expect(formatAttachmentSizeValue(900)).toBe("900 B");
    expect(formatAttachmentSizeValue(2048)).toBe("2.0 KB");
  });

  it("inserts mention with proper separator", () => {
    expect(applyMentionToText("hello", "mike")).toBe("hello @mike ");
    expect(applyMentionToText("hello ", "mike")).toBe("hello @mike ");
  });

  it("builds quote block", () => {
    const result = applyQuoteToText("text", "line1\nline2");
    expect(result).toContain("> line1");
    expect(result).toContain("> line2");
    expect(result.endsWith("\n")).toBe(true);
  });
});
