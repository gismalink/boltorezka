import { describe, expect, it } from "vitest";
import { extractFirstLinkPreview } from "./messageTextRenderer";

describe("extractFirstLinkPreview", () => {
  it("returns null for empty/no-link text", () => {
    expect(extractFirstLinkPreview("")).toBeNull();
    expect(extractFirstLinkPreview("hello world")).toBeNull();
  });

  it("extracts http URL with host and path", () => {
    const out = extractFirstLinkPreview("see https://example.com/page?x=1 thanks");
    expect(out).toEqual({
      href: "https://example.com/page?x=1",
      host: "example.com",
      path: "/page?x=1"
    });
  });

  it("prefixes www. URLs with https://", () => {
    const out = extractFirstLinkPreview("visit www.example.com/x");
    expect(out?.href).toBe("https://www.example.com/x");
    expect(out?.host).toBe("www.example.com");
  });

  it("strips trailing punctuation", () => {
    const out = extractFirstLinkPreview("link: https://example.com/page).");
    expect(out?.href).toBe("https://example.com/page");
  });

  it("returns null when stripped url is empty", () => {
    expect(extractFirstLinkPreview("...")).toBeNull();
  });

  it("truncates long path with ellipsis", () => {
    const longPath = "/" + "a".repeat(200);
    const out = extractFirstLinkPreview(`https://example.com${longPath}`);
    expect(out).not.toBeNull();
    expect(out!.path.length).toBe(72);
    expect(out!.path.endsWith("...")).toBe(true);
  });

  it("uses '/' as path when URL has no pathname", () => {
    const out = extractFirstLinkPreview("https://example.com");
    expect(out?.path).toBe("/");
  });

  it("returns null for malformed URL after http prefix", () => {
    expect(extractFirstLinkPreview("http://")).toBeNull();
  });
});
