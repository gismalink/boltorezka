import { useCallback } from "react";

type UseChatPanelComposerHelpersArgs = {
  locale: string;
  chatText: string;
  onSetChatText: (value: string) => void;
};

export function useChatPanelComposerHelpers({
  locale,
  chatText,
  onSetChatText
}: UseChatPanelComposerHelpersArgs) {
  const formatMessageTime = useCallback((value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit"
    });
  }, [locale]);

  const formatAttachmentSize = useCallback((bytes: number): string => {
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
  }, []);

  const insertMentionToComposer = useCallback((userName: string) => {
    const normalizedUserName = String(userName || "").trim();
    if (!normalizedUserName) {
      return;
    }

    const current = String(chatText || "");
    const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
    onSetChatText(`${current}${separator}@${normalizedUserName} `);
  }, [chatText, onSetChatText]);

  const insertQuoteToComposer = useCallback((_userName: string, text: string) => {
    const normalizedText = String(text || "").replace(/\r/g, "").trim();
    if (!normalizedText) {
      return;
    }

    const quoteSource = normalizedText.length > 280 ? `${normalizedText.slice(0, 277)}...` : normalizedText;
    const quotedLines = quoteSource
      .split("\n")
      .slice(0, 4)
      .map((line) => `> ${String(line || "").trim() || "..."}`)
      .join("\n");

    const current = String(chatText || "");
    const separator = current.trim().length > 0 ? "\n\n" : "";
    onSetChatText(`${current}${separator}${quotedLines}\n`);
  }, [chatText, onSetChatText]);

  return {
    formatMessageTime,
    formatAttachmentSize,
    insertMentionToComposer,
    insertQuoteToComposer
  };
}
