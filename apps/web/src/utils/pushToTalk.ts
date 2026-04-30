import { asTrimmedString } from "./stringUtils";
export const DEFAULT_PUSH_TO_TALK_HOTKEY = "Space";

const HOTKEY_LABEL_OVERRIDES: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Tab: "Tab",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/"
};

export const normalizePushToTalkHotkey = (value: string | null | undefined): string => {
  const trimmed = asTrimmedString(value);
  return trimmed || DEFAULT_PUSH_TO_TALK_HOTKEY;
};

export const formatPushToTalkHotkey = (value: string | null | undefined): string => {
  const normalized = normalizePushToTalkHotkey(value);
  if (HOTKEY_LABEL_OVERRIDES[normalized]) {
    return HOTKEY_LABEL_OVERRIDES[normalized];
  }

  if (normalized.startsWith("Key") && normalized.length === 4) {
    return normalized.slice(3);
  }

  if (normalized.startsWith("Digit") && normalized.length === 6) {
    return normalized.slice(5);
  }

  return normalized;
};

export const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return Boolean(target.closest("[contenteditable='true']"));
};