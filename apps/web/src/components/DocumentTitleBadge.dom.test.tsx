// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Mock DmContext to avoid needing DmProvider/token/api stack.
vi.mock("./dm/DmContext", () => ({
  useDm: () => mockedUseDm()
}));

let mockedThreads: Array<{ unreadCount: number }> = [];
function mockedUseDm() {
  return { threads: mockedThreads } as unknown as { threads: unknown };
}

import { DocumentTitleBadge } from "./DocumentTitleBadge";

beforeEach(() => {
  mockedThreads = [];
  document.title = "Datute";
});

afterEach(() => {
  cleanup();
});

describe("DocumentTitleBadge", () => {
  it("does not change document.title when total unread is zero", () => {
    render(<DocumentTitleBadge roomUnreadBySlug={{}} />);
    expect(document.title).toBe("Datute");
  });

  it("prefixes document.title with (N) when there are unread rooms", () => {
    render(<DocumentTitleBadge roomUnreadBySlug={{ a: 2, b: 3 }} />);
    expect(document.title).toBe("(5) Datute");
  });

  it("includes DM thread unread counts in the total", () => {
    mockedThreads = [{ unreadCount: 1 }, { unreadCount: 4 }];
    render(<DocumentTitleBadge roomUnreadBySlug={{ a: 2 }} />);
    expect(document.title).toBe("(7) Datute");
  });

  it("ignores non-finite / negative values", () => {
    mockedThreads = [{ unreadCount: NaN }, { unreadCount: -3 }];
    render(<DocumentTitleBadge roomUnreadBySlug={{ a: NaN as unknown as number, b: -2 as unknown as number, c: 4 }} />);
    expect(document.title).toBe("(4) Datute");
  });

  it("strips an existing (N) prefix on first mount, then re-applies", () => {
    document.title = "(99) Datute";
    render(<DocumentTitleBadge roomUnreadBySlug={{ a: 3 }} />);
    expect(document.title).toBe("(3) Datute");
  });

  it("falls back to 'Datute' when title is empty", () => {
    document.title = "";
    render(<DocumentTitleBadge roomUnreadBySlug={{ a: 2 }} />);
    expect(document.title).toBe("(2) Datute");
  });

  it("restores base title on unmount", () => {
    const { unmount } = render(<DocumentTitleBadge roomUnreadBySlug={{ a: 5 }} />);
    expect(document.title).toBe("(5) Datute");
    unmount();
    expect(document.title).toBe("Datute");
  });
});
