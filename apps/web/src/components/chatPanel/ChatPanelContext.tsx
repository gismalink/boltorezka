/**
 * ChatPanelContext.tsx — React-контекст внутри ChatPanel.
 * Прокидывает базовые данные чата (room, user, translate, callbacks) в секции/хуки
 * без prop-drilling.
 */
import { createContext, useContext, type ReactNode } from "react";

type ChatPanelContextValue = {
  t: (key: string) => string;
  locale: string;
  formatMessageTime: (value: string) => string;
  resolveAttachmentImageUrl: (url: string) => string;
  formatAttachmentSize: (bytes: number) => string;
  setPreviewImageUrl: (value: string | null) => void;
};

type ChatMessageActionsContextValue = {
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  insertMentionToComposer: (userName: string) => void;
  insertQuoteToComposer: (userName: string, text: string, selectedText: string) => void;
  markTopicUnreadFromMessage: (messageId: string) => Promise<void>;
  markReadSaving: boolean;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);
const ChatMessageActionsContext = createContext<ChatMessageActionsContextValue | null>(null);

export function useChatPanelCtx(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) {
    throw new Error("useChatPanelCtx must be used within ChatPanelProvider");
  }
  return ctx;
}

export function useChatMessageActions(): ChatMessageActionsContextValue {
  const ctx = useContext(ChatMessageActionsContext);
  if (!ctx) {
    throw new Error("useChatMessageActions must be used within ChatMessageActionsProvider");
  }
  return ctx;
}

export function ChatPanelProvider({
  value,
  children
}: {
  value: ChatPanelContextValue;
  children: ReactNode;
}) {
  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  );
}

export function ChatMessageActionsProvider({
  value,
  children
}: {
  value: ChatMessageActionsContextValue;
  children: ReactNode;
}) {
  return (
    <ChatMessageActionsContext.Provider value={value}>
      {children}
    </ChatMessageActionsContext.Provider>
  );
}
