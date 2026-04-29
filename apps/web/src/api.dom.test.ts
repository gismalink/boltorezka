import { describe, expect, it } from "vitest";
import { ApiError } from "./api";

describe("ApiError", () => {
  it("uses payload.message as primary message", () => {
    const err = new ApiError(400, { message: "Custom error" });
    expect(err.message).toBe("Custom error");
    expect(err.status).toBe(400);
    expect(err.name).toBe("ApiError");
  });

  it("falls back to first formErrors validation message", () => {
    const err = new ApiError(422, {
      issues: { formErrors: ["form is broken"] }
    });
    expect(err.message).toBe("form is broken");
  });

  it("falls back to first fieldErrors entry with field prefix", () => {
    const err = new ApiError(422, {
      issues: { fieldErrors: { email: ["bad email"] } }
    });
    expect(err.message).toBe("email: bad email");
  });

  it("falls back to error code", () => {
    const err = new ApiError(403, { error: "FORBIDDEN" });
    expect(err.message).toBe("FORBIDDEN");
    expect(err.code).toBe("FORBIDDEN");
  });

  it("defaults code to HTTP_ERROR when not provided", () => {
    const err = new ApiError(500, {});
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.message).toMatch(/HTTP\s*500/);
  });

  it("ignores empty/whitespace messages", () => {
    const err = new ApiError(404, { message: "   ", error: "NOT_FOUND" });
    expect(err.message).toBe("NOT_FOUND");
  });

  it("preserves payload reference", () => {
    const payload = { message: "x", extra: 42 };
    const err = new ApiError(400, payload);
    expect(err.payload).toBe(payload);
  });

  it("is instance of Error", () => {
    const err = new ApiError(400, {});
    expect(err).toBeInstanceOf(Error);
  });
});
