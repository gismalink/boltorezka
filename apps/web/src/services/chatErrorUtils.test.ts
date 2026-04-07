import { describe, expect, it } from "vitest";
import {
  extractBusinessCodeFromErrorMessage,
  getErrorCode,
  normalizeBusinessErrorCode
} from "./chatErrorUtils";

describe("chatErrorUtils", () => {
  it("extractBusinessCodeFromErrorMessage returns code from ws-style message", () => {
    expect(extractBusinessCodeFromErrorMessage("chat.report:MessageAlreadyReported:already_reported")).toBe(
      "MessageAlreadyReported"
    );
  });

  it("getErrorCode prefers explicit code", () => {
    const error = Object.assign(new Error("chat.report:Ignored:detail"), { code: "MessageAlreadyReported" });
    expect(getErrorCode(error)).toBe("MessageAlreadyReported");
  });

  it("getErrorCode parses ws-style message when code is absent", () => {
    const error = new Error("chat.report:MessageAlreadyReported:already_reported");
    expect(getErrorCode(error)).toBe("MessageAlreadyReported");
  });

  it("normalizeBusinessErrorCode mutates object error with parsed code", () => {
    const error = new Error("chat.report:MessageAlreadyReported:already_reported");
    const normalized = normalizeBusinessErrorCode(error) as Error & { code?: string };

    expect(normalized).toBe(error);
    expect(normalized.code).toBe("MessageAlreadyReported");
  });
});