// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RangeSlider } from "./RangeSlider";

afterEach(() => cleanup());

describe("RangeSlider", () => {
  it("renders an input[type=range] with provided value", () => {
    render(<RangeSlider value={42} onChange={() => {}} />);
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.value).toBe("42");
  });

  it("invokes onChange with numeric value when user drags", () => {
    const onChange = vi.fn();
    render(<RangeSlider value={10} onChange={onChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    expect(onChange).toHaveBeenCalledWith(55);
  });

  it("renders thumb value with suffix by default", () => {
    render(<RangeSlider value={70} onChange={() => {}} valueSuffix="%" />);
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("uses formatValue when provided", () => {
    render(<RangeSlider value={70} onChange={() => {}} formatValue={(v) => `vol-${v}`} />);
    expect(screen.getByText("vol-70")).toBeInTheDocument();
  });

  it("clamps css custom property to 0..100 percent", () => {
    const { container } = render(<RangeSlider min={0} max={200} value={400} onChange={() => {}} />);
    const wrap = container.querySelector(".range-slider-wrap") as HTMLElement;
    expect(wrap.style.getPropertyValue("--range-progress")).toBe("100%");
  });

  it("returns 0% progress when min>=max (degenerate)", () => {
    const { container } = render(<RangeSlider min={5} max={5} value={5} onChange={() => {}} />);
    const wrap = container.querySelector(".range-slider-wrap") as HTMLElement;
    expect(wrap.style.getPropertyValue("--range-progress")).toBe("0%");
  });
});
