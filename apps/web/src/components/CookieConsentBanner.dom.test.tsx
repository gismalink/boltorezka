// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CookieConsentBanner } from "./CookieConsentBanner";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CookieConsentBanner", () => {
  it("renders nothing when visible=false", () => {
    const { container } = render(<CookieConsentBanner visible={false} onAccept={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Russian copy by default", () => {
    render(<CookieConsentBanner visible onAccept={() => {}} />);
    expect(screen.getByText(/Мы используем cookie/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Политике cookie/ })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("button", { name: /Ок/ })).toBeInTheDocument();
  });

  it("renders English copy when lang='en'", () => {
    render(<CookieConsentBanner visible onAccept={() => {}} lang="en" />);
    expect(screen.getByText(/We use cookies/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cookie Policy/ })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("button", { name: /OK/ })).toBeInTheDocument();
  });

  it("invokes onAccept when the button is clicked", () => {
    const onAccept = vi.fn();
    render(<CookieConsentBanner visible onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /Ок/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
