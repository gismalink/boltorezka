// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

afterEach(() => cleanup());

describe("Button", () => {
  it("renders children inside a <button>", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("merges className with 'ui-btn'", () => {
    render(<Button className="primary">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("ui-btn", "primary");
  });

  it("forwards onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>x</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>x</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders disabled tooltip wrapper when both disabled and disabledReason are set", () => {
    const { container } = render(
      <Button disabled disabledReason="Wait first">x</Button>
    );
    const wrapper = container.querySelector("[data-tooltip]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-tooltip")).toBe("Wait first");
  });

  it("does not render tooltip wrapper when not disabled, even with disabledReason", () => {
    const { container } = render(<Button disabledReason="Whatever">x</Button>);
    expect(container.querySelector("[data-tooltip]")).toBeNull();
  });
});
