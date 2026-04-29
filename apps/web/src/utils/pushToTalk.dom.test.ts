// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isEditableElement } from "./pushToTalk";

describe("isEditableElement", () => {
  it("returns false for null target", () => {
    expect(isEditableElement(null)).toBe(false);
  });

  it("returns false for non-HTMLElement target (e.g. window)", () => {
    expect(isEditableElement(window as unknown as EventTarget)).toBe(false);
  });

  it("returns true for INPUT/TEXTAREA/SELECT", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElement(textarea)).toBe(true);
    expect(isEditableElement(select)).toBe(true);
  });

  it("returns false for non-editable HTML elements", () => {
    expect(isEditableElement(document.createElement("div"))).toBe(false);
    expect(isEditableElement(document.createElement("button"))).toBe(false);
    expect(isEditableElement(document.createElement("span"))).toBe(false);
  });

  it("returns true when ancestor has contenteditable=true", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);
    expect(isEditableElement(child)).toBe(true);
    wrapper.remove();
  });

  it("returns false when contenteditable is not 'true'", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "false");
    expect(isEditableElement(div)).toBe(false);
  });
});
