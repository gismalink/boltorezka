// Хук вспомогательных операций композера: форматирование и вставка шаблонного текста.
import { useCallback } from "react";
import { applyMentionToText, applyQuoteToText, formatAttachmentSizeValue } from "./chatComposerUtils";

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
    return formatAttachmentSizeValue(bytes);
  }, []);

  const insertMentionToComposer = useCallback((userName: string) => {
    const normalizedUserName = String(userName || "").trim();
    if (!normalizedUserName) {
      return;
    }

    onSetChatText(applyMentionToText(chatText, normalizedUserName));
  }, [chatText, onSetChatText]);

  const insertQuoteToComposer = useCallback((_userName: string, text: string) => {
    onSetChatText(applyQuoteToText(chatText, text));
  }, [chatText, onSetChatText]);

  return {
    formatMessageTime,
    formatAttachmentSize,
    insertMentionToComposer,
    insertQuoteToComposer
  };
}
