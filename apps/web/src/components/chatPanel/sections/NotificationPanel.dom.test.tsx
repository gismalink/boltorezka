// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationPanel } from "./NotificationPanel";

afterEach(() => cleanup());

const t = (key: string) => key;

const baseProps = () => ({
  t,
  notificationScope: "server" as const,
  setNotificationScope: vi.fn(),
  notificationMode: "all" as const,
  setNotificationMode: vi.fn(),
  notificationSaving: false,
  updateNotificationSettings: vi.fn().mockResolvedValue(undefined),
  inboxLoading: false,
  inboxItems: [] as Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
    messageId: string | null;
    topicId: string | null;
    roomSlug: string;
    priority: "normal" | "critical";
  }>,
  loadInbox: vi.fn().mockResolvedValue(undefined),
  markInboxAllRead: vi.fn().mockResolvedValue(undefined),
  openInboxItem: vi.fn().mockResolvedValue(undefined),
  markInboxItemRead: vi.fn().mockResolvedValue(undefined),
  formatMessageTime: (v: string) => `t:${v}`,
  notificationStatusText: ""
});

const item = (overrides: Partial<ReturnType<typeof baseProps>["inboxItems"][number]> = {}) => ({
  id: "i1",
  title: "Mention",
  body: "Hi",
  createdAt: "2026-04-01T00:00:00.000Z",
  readAt: null,
  messageId: "m1",
  topicId: "t1",
  roomSlug: "general",
  priority: "normal" as const,
  ...overrides
});

describe("NotificationPanel — settings row", () => {
  it("renders scope and mode selects with current values", () => {
    render(<NotificationPanel {...baseProps()} />);
    expect((screen.getByLabelText("chat.notificationScopeAria") as HTMLSelectElement).value).toBe("server");
    expect((screen.getByLabelText("chat.notificationModeAria") as HTMLSelectElement).value).toBe("all");
  });

  it("calls setNotificationScope on change", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} />);
    fireEvent.change(screen.getByLabelText("chat.notificationScopeAria"), { target: { value: "topic" } });
    expect(props.setNotificationScope).toHaveBeenCalledWith("topic");
  });

  it("calls setNotificationMode on change", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} />);
    fireEvent.change(screen.getByLabelText("chat.notificationModeAria"), { target: { value: "mentions" } });
    expect(props.setNotificationMode).toHaveBeenCalledWith("mentions");
  });

  it("disables controls while saving and shows loading label on save button", () => {
    render(<NotificationPanel {...baseProps()} notificationSaving />);
    expect((screen.getByLabelText("chat.notificationScopeAria") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("chat.notificationModeAria") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("chat.loading")).toBeInTheDocument();
  });

  it("save button calls updateNotificationSettings(null)", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} />);
    fireEvent.click(screen.getByText("chat.notificationSave"));
    expect(props.updateNotificationSettings).toHaveBeenCalledWith(null);
  });
});

describe("NotificationPanel — inbox actions", () => {
  it("shows empty state when no items", () => {
    render(<NotificationPanel {...baseProps()} />);
    expect(screen.getByText("chat.inboxEmpty")).toBeInTheDocument();
  });

  it("refresh button calls loadInbox()", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} />);
    fireEvent.click(screen.getByText("chat.inboxRefresh"));
    expect(props.loadInbox).toHaveBeenCalledTimes(1);
  });

  it("disables markAllRead when inbox is empty", () => {
    render(<NotificationPanel {...baseProps()} />);
    const btn = screen.getByText("chat.inboxMarkAllRead").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables markAllRead when there are items", () => {
    render(<NotificationPanel {...baseProps()} inboxItems={[item()]} />);
    const btn = screen.getByText("chat.inboxMarkAllRead").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("loading state replaces refresh label and disables button", () => {
    render(<NotificationPanel {...baseProps()} inboxLoading />);
    const labels = screen.getAllByText("chat.loading");
    expect(labels.length).toBeGreaterThan(0);
    const refreshBtn = labels[0].closest("button") as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);
  });
});

describe("NotificationPanel — inbox items rendering", () => {
  it("marks unread items with chat-inbox-item-unread class", () => {
    const { container } = render(<NotificationPanel {...baseProps()} inboxItems={[item({ readAt: null })]} />);
    expect(container.querySelector(".chat-inbox-item-unread")).not.toBeNull();
  });

  it("does not mark read items as unread", () => {
    const { container } = render(
      <NotificationPanel {...baseProps()} inboxItems={[item({ readAt: "2026-04-01T01:00:00.000Z" })]} />
    );
    expect(container.querySelector(".chat-inbox-item-unread")).toBeNull();
  });

  it("renders critical badge only for critical priority", () => {
    const { rerender } = render(
      <NotificationPanel {...baseProps()} inboxItems={[item({ priority: "normal" })]} />
    );
    expect(screen.queryByText("chat.inboxCritical")).toBeNull();
    rerender(<NotificationPanel {...baseProps()} inboxItems={[item({ priority: "critical" })]} />);
    expect(screen.getByText("chat.inboxCritical")).toBeInTheDocument();
  });

  it("hides 'mark read' button for already-read items", () => {
    render(
      <NotificationPanel
        {...baseProps()}
        inboxItems={[item({ readAt: "2026-04-01T01:00:00.000Z" })]}
      />
    );
    expect(screen.queryByText("chat.inboxMarkRead")).toBeNull();
  });

  it("'open' button calls openInboxItem with item id", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} inboxItems={[item({ id: "x1" })]} />);
    fireEvent.click(screen.getByText("chat.inboxOpen"));
    expect(props.openInboxItem).toHaveBeenCalledWith("x1");
  });

  it("'mark read' button calls markInboxItemRead with item id", () => {
    const props = baseProps();
    render(<NotificationPanel {...props} inboxItems={[item({ id: "x1", readAt: null })]} />);
    fireEvent.click(screen.getByText("chat.inboxMarkRead"));
    expect(props.markInboxItemRead).toHaveBeenCalledWith("x1");
  });

  it("formats createdAt via formatMessageTime", () => {
    render(
      <NotificationPanel
        {...baseProps()}
        inboxItems={[item({ createdAt: "2026-04-30T12:34:56.000Z" })]}
      />
    );
    expect(screen.getByText("t:2026-04-30T12:34:56.000Z")).toBeInTheDocument();
  });
});

describe("NotificationPanel — status text", () => {
  it("renders status with role=status when text is non-empty", () => {
    render(<NotificationPanel {...baseProps()} notificationStatusText="saved!" />);
    expect(screen.getByRole("status").textContent).toBe("saved!");
  });

  it("does not render status when text is empty", () => {
    render(<NotificationPanel {...baseProps()} notificationStatusText="" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
