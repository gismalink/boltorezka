// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractImageSourceFromClipboardHtml } from "./chatImagePayload";

describe("extractImageSourceFromClipboardHtml (DOMParser)", () => {
  it("returns empty string for empty input", () => {
    expect(extractImageSourceFromClipboardHtml("")).toBe("");
  });

  it("extracts src from a single img tag", () => {
    const html = `<div><img src="https://example.com/a.png" alt="x"></div>`;
    expect(extractImageSourceFromClipboardHtml(html)).toBe("https://example.com/a.png");
  });

  it("trims whitespace around src", () => {
    const html = `<img src="   https://example.com/a.png   ">`;
    expect(extractImageSourceFromClipboardHtml(html)).toBe("https://example.com/a.png");
  });

  it("extracts data: URL src", () => {
    const html = `<img src="data:image/png;base64,AAAA">`;
    expect(extractImageSourceFromClipboardHtml(html)).toBe("data:image/png;base64,AAAA");
  });

  it("returns empty string when there is no img tag", () => {
    expect(extractImageSourceFromClipboardHtml(`<p>no images here</p>`)).toBe("");
  });

  it("returns the first img when multiple are present", () => {
    const html = `<img src="https://a.com/1.png"><img src="https://b.com/2.png">`;
    expect(extractImageSourceFromClipboardHtml(html)).toBe("https://a.com/1.png");
  });
});
