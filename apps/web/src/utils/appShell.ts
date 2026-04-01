import type { UiTheme } from "../domain";

export const DEFAULT_UI_THEME: UiTheme = "8-neon-bit";

export function formatBuildDateLabel(version: string, buildDate: string): string {
  const normalizedVersion = String(version || "").trim();
  const match = normalizedVersion.match(/(\d{8})\.(\d{4,6})$/);
  if (match) {
    const datePart = match[1];
    const timePart = match[2];
    const yy = datePart.slice(2, 4);
    const mm = datePart.slice(4, 6);
    const dd = datePart.slice(6, 8);
    const hh = timePart.slice(0, 2);
    const min = timePart.slice(2, 4);
    const sec = timePart.length >= 6 ? timePart.slice(4, 6) : "";
    return sec ? `v.${yy}.${mm}.${dd}.${hh}.${min}.${sec}` : `v.${yy}.${mm}.${dd}.${hh}.${min}`;
  }

  const normalizedDate = String(buildDate || "").trim();
  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return `v.${dateMatch[1].slice(2, 4)}.${dateMatch[2]}.${dateMatch[3]}`;
  }

  return normalizedDate ? `v.${normalizedDate}` : "";
}

export function readNonZeroDefaultVolume(storageKey: string, fallback: number): number {
  const raw = localStorage.getItem(storageKey);
  if (raw === null || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(0, Math.min(100, Math.round(parsed)));
  return normalized === 0 ? fallback : normalized;
}

export function normalizeUiTheme(value: unknown): UiTheme {
  return value === "material-classic" || value === "aka-dis" || value === "alpha-strike" ? value : DEFAULT_UI_THEME;
}
