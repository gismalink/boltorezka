// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PixelCheckbox } from "./PixelCheckbox";

afterEach(() => cleanup());

describe("PixelCheckbox", () => {
  it("renders label and reflects checked state", () => {
    render(<PixelCheckbox checked label="Sound" onChange={() => {}} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect(screen.getByText("Sound")).toBeInTheDocument();
  });

  it("invokes onChange with the next checked state", () => {
    const onChange = vi.fn();
    render(<PixelCheckbox checked={false} label="x" onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled checkbox sets the disabled attribute", () => {
    render(<PixelCheckbox checked={false} label="x" disabled onChange={() => {}} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("uses ariaLabel on the native input", () => {
    render(<PixelCheckbox checked={false} label="visible" ariaLabel="hidden-label" onChange={() => {}} />);
    expect(screen.getByLabelText("hidden-label")).toBeInTheDocument();
  });
});
