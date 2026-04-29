import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderMessageText, type MentionUser } from "./messageTextRenderer";

const noopResolve = (_: string): MentionUser | null => null;
const noopClick = vi.fn();

type MaybeEl = string | ReactElement;

const isEl = (node: MaybeEl, tag: string): node is ReactElement =>
  typeof node !== "string" && (node as ReactElement).type === tag;

describe("renderMessageText", () => {
  it("returns single text chunk for empty/plain input", () => {
    expect(renderMessageText("", noopResolve, noopClick)).toEqual([""]);
    const out = renderMessageText("just text", noopResolve, noopClick);
    expect(out).toEqual(["just text"]);
  });

  it("renders http link as <a> with chat-link class", () => {
    const out = renderMessageText("see https://example.com here", noopResolve, noopClick) as MaybeEl[];
    const link = out.find((node) => isEl(node, "a")) as ReactElement | undefined;
    expect(link).toBeDefined();
    expect(link?.props.href).toBe("https://example.com");
    expect(link?.props.className).toBe("chat-link");
    expect(link?.props.target).toBe("_blank");
    expect(link?.props.rel).toBe("noopener noreferrer");
  });

  it("auto-prefixes www. links with https://", () => {
    const out = renderMessageText("go www.example.com", noopResolve, noopClick) as MaybeEl[];
    const link = out.find((node) => isEl(node, "a")) as ReactElement | undefined;
    expect(link?.props.href).toBe("https://www.example.com");
    expect(link?.props.children).toBe("www.example.com");
  });

  it("strips trailing punctuation from links and pushes it as text", () => {
    const out = renderMessageText("go https://example.com).", noopResolve, noopClick) as MaybeEl[];
    const link = out.find((node) => isEl(node, "a")) as ReactElement;
    expect(link.props.href).toBe("https://example.com");
    expect(out.includes(").")).toBe(true);
  });

  it("renders mention as <button> when resolver returns user", () => {
    const resolved: MentionUser = { label: "Alice", handle: "alice", userId: "u1" };
    const onClick = vi.fn();
    const resolve = vi.fn().mockReturnValue(resolved);
    const out = renderMessageText("hi @Alice!", resolve, onClick) as MaybeEl[];
    const btn = out.find((n) => isEl(n, "button")) as ReactElement;
    expect(btn).toBeDefined();
    expect(btn.props.children).toBe("@Alice");
    expect(resolve).toHaveBeenCalledWith("alice");
    btn.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(onClick).toHaveBeenCalledWith(resolved);
  });

  it("renders unresolved mention as <span>", () => {
    const out = renderMessageText("hi @ghost there", noopResolve, noopClick) as MaybeEl[];
    const span = out.find((n) => isEl(n, "span")) as ReactElement;
    expect(span).toBeDefined();
    expect(span.props.className).toBe("chat-mention");
    expect(span.props.children).toBe("@ghost");
  });

  it("renders **bold** as <strong>", () => {
    const out = renderMessageText("very **strong** text", noopResolve, noopClick) as MaybeEl[];
    const el = out.find((n) => isEl(n, "strong")) as ReactElement;
    expect(el?.props.children).toBe("strong");
    expect(el?.props.className).toBe("chat-format-bold");
  });

  it("renders *italic* as <em>", () => {
    const out = renderMessageText("a *slanted* note", noopResolve, noopClick) as MaybeEl[];
    const el = out.find((n) => isEl(n, "em")) as ReactElement;
    expect(el?.props.children).toBe("slanted");
  });

  it("renders `code` as <code>", () => {
    const out = renderMessageText("run `npm i` now", noopResolve, noopClick) as MaybeEl[];
    const el = out.find((n) => isEl(n, "code")) as ReactElement;
    expect(el?.props.children).toBe("npm i");
  });

  it("renders ||spoiler|| as <span class=chat-format-spoiler>", () => {
    const out = renderMessageText("secret ||hidden|| text", noopResolve, noopClick) as MaybeEl[];
    const spoiler = out.find(
      (n) => isEl(n, "span") && (n as ReactElement).props.className === "chat-format-spoiler"
    ) as ReactElement | undefined;
    expect(spoiler?.props.children).toBe("hidden");
  });

  it("does not parse mentions inside link text", () => {
    const out = renderMessageText("https://example.com/@alice/x", noopResolve, noopClick) as MaybeEl[];
    expect(out.some((n) => isEl(n, "button"))).toBe(false);
    expect(out.some((n) => isEl(n, "a"))).toBe(true);
  });

  it("ignores too-short mentions", () => {
    const out = renderMessageText("hi @a", noopResolve, noopClick);
    expect(out).toEqual(["hi @a"]);
  });

  it("handles mixed content: link + mention + bold", () => {
    const resolve = vi.fn().mockImplementation((h) => (h === "bob" ? { label: "Bob", handle: "bob" } : null));
    const out = renderMessageText("@bob see https://x.com **now**", resolve, noopClick) as MaybeEl[];
    expect(out.some((n) => isEl(n, "button"))).toBe(true);
    expect(out.some((n) => isEl(n, "a"))).toBe(true);
    expect(out.some((n) => isEl(n, "strong"))).toBe(true);
  });

  it("coerces non-string input to string", () => {
    const out = renderMessageText(undefined as unknown as string, noopResolve, noopClick);
    expect(out).toEqual([""]);
  });
});
