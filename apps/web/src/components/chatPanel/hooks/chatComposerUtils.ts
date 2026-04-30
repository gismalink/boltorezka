/**
 * chatComposerUtils.ts — чистые функции-утилиты для композера чата.
 * Форматирует размер вложений и вставляет служебный текст (mentions, quotes) в текстовое поле.
 */
// Утилиты композера чата: форматирование размера вложений и вставка служебного текста.

import { asTrimmedString } from "../../../utils/stringUtils";
export function formatAttachmentSizeValue(bytes: number): string {
  const normalized = Number(bytes || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "0 B";
  }

  if (normalized < 1024) {
    return `${Math.round(normalized)} B`;
  }

  if (normalized < 1024 * 1024) {
    return `${(normalized / 1024).toFixed(1)} KB`;
  }

  return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
}

export function applyMentionToText(chatText: string, userName: string): string {
  const normalizedUserName = asTrimmedString(userName);
  if (!normalizedUserName) {
    return String(chatText || "");
  }

  const current = String(chatText || "");
  const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
  return `${current}${separator}@${normalizedUserName} `;
}

export function applyQuoteToText(chatText: string, text: string): string {
  const normalizedText = String(text || "").replace(/\r/g, "").trim();
  if (!normalizedText) {
    return String(chatText || "");
  }

  const quoteSource = normalizedText.length > 280 ? `${normalizedText.slice(0, 277)}...` : normalizedText;
  const quotedLines = quoteSource
    .split("\n")
    .slice(0, 4)
    .map((line) => `> ${asTrimmedString(line) || "..."}`)
    .join("\n");

  const current = String(chatText || "");
  const separator = current.trim().length > 0 ? "\n\n" : "";
  return `${current}${separator}${quotedLines}\n`;
}
