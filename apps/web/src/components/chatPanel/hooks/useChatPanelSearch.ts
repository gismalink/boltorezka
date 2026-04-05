import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";

type SearchScope = "all" | "server" | "room";
type SearchAttachmentType = "" | "image";

type SearchResult = {
  id: string;
  roomSlug: string;
  roomTitle: string;
  topicId: string | null;
  topicTitle: string | null;
  userName: string;
  text: string;
  createdAt: string;
  hasAttachments: boolean;
};

type SearchJumpTarget = {
  messageId: string;
  roomSlug: string;
  topicId: string | null;
  includeHistoryLoad?: boolean;
} | null;

type UseChatPanelSearchArgs = {
  t: (key: string) => string;
  authToken: string;
  currentServerId: string;
  roomId: string;
  roomSlug: string;
  activeTopicId: string | null;
  topics: RoomTopic[];
  loadingOlderMessages: boolean;
  messagesHasMore: boolean;
  onOpenRoomChat: (slug: string) => void;
  onSelectTopic: (topicId: string) => void;
  onLoadOlderMessages: () => void;
};

export function useChatPanelSearch({
  t,
  authToken,
  currentServerId,
  roomId,
  roomSlug,
  activeTopicId,
  topics,
  loadingOlderMessages,
  messagesHasMore,
  onOpenRoomChat,
  onSelectTopic,
  onLoadOlderMessages
}: UseChatPanelSearchArgs) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [searchHasMention, setSearchHasMention] = useState(false);
  const [searchHasAttachment, setSearchHasAttachment] = useState(false);
  const [searchAttachmentType, setSearchAttachmentType] = useState<SearchAttachmentType>("");
  const [searchHasLink, setSearchHasLink] = useState(false);
  const [searchAuthorId, setSearchAuthorId] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchResultsHasMore, setSearchResultsHasMore] = useState(false);
  const [searchJumpStatusText, setSearchJumpStatusText] = useState("");
  const [searchJumpTarget, setSearchJumpTarget] = useState<SearchJumpTarget>(null);

  useEffect(() => {
    if (!searchJumpTarget) {
      return;
    }

    const targetRoomSlug = String(searchJumpTarget.roomSlug || "").trim();
    const targetTopicId = String(searchJumpTarget.topicId || "").trim();
    if (!targetRoomSlug) {
      setSearchJumpTarget(null);
      return;
    }

    if (targetRoomSlug !== roomSlug) {
      onOpenRoomChat(targetRoomSlug);
      return;
    }

    if (targetTopicId && activeTopicId !== targetTopicId) {
      const hasTopic = topics.some((topic) => topic.id === targetTopicId);
      if (hasTopic) {
        onSelectTopic(targetTopicId);
      }
    }
  }, [searchJumpTarget, roomSlug, activeTopicId, topics, onOpenRoomChat, onSelectTopic]);

  useEffect(() => {
    if (!searchJumpTarget) {
      return;
    }

    const targetRoomSlug = String(searchJumpTarget.roomSlug || "").trim();
    const targetTopicId = String(searchJumpTarget.topicId || "").trim();
    const shouldLoadHistory = searchJumpTarget.includeHistoryLoad !== false;
    const targetMessageId = String(searchJumpTarget.messageId || "").trim();
    if (!targetRoomSlug || !targetMessageId) {
      setSearchJumpTarget(null);
      return;
    }

    if (targetRoomSlug !== roomSlug) {
      return;
    }

    if (targetTopicId && activeTopicId !== targetTopicId) {
      return;
    }

    const targetNode = document.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`);
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
      targetNode.classList.add("chat-message-jump-target");
      window.setTimeout(() => targetNode.classList.remove("chat-message-jump-target"), 1600);
      setSearchJumpTarget(null);
      setSearchJumpStatusText("");
      return;
    }

    if (!shouldLoadHistory) {
      setSearchJumpTarget(null);
      setSearchJumpStatusText("");
      return;
    }

    if (!loadingOlderMessages && messagesHasMore) {
      onLoadOlderMessages();
      setSearchJumpStatusText(t("chat.searchJumpLoadingContext"));
      return;
    }

    if (!messagesHasMore && !loadingOlderMessages) {
      setSearchJumpTarget(null);
      setSearchJumpStatusText(t("chat.searchJumpNotFound"));
    }
  }, [
    searchJumpTarget,
    roomSlug,
    activeTopicId,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages,
    t
  ]);

  const handleSearchMessages = async () => {
    const q = searchQuery.trim();
    if (!q || searching || !authToken) {
      return;
    }

    setSearching(true);
    setSearchError("");
    try {
      const normalizeDateFilter = (value: string): string | undefined => {
        const normalizedValue = value.trim();
        if (!normalizedValue) {
          return undefined;
        }

        const parsedDate = new Date(normalizedValue);
        return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
      };

      const normalizedScope = searchScope;
      const response = await api.searchMessages(authToken, {
        q,
        scope: normalizedScope,
        serverId: normalizedScope === "server" ? String(currentServerId || "").trim() || undefined : undefined,
        roomId: normalizedScope === "room" ? String(roomId || "").trim() || undefined : undefined,
        hasMention: searchHasMention ? true : undefined,
        hasAttachment: searchHasAttachment ? true : undefined,
        attachmentType: searchAttachmentType || undefined,
        hasLink: searchHasLink ? true : undefined,
        authorId: searchAuthorId.trim() || undefined,
        from: normalizeDateFilter(searchFrom),
        to: normalizeDateFilter(searchTo),
        limit: 25
      });

      setSearchResults(response.messages.map((item) => ({
        id: item.id,
        roomSlug: item.roomSlug,
        roomTitle: item.roomTitle,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        userName: item.userName,
        text: item.text,
        createdAt: item.createdAt,
        hasAttachments: item.hasAttachments
      })));
      setSearchResultsHasMore(Boolean(response.pagination?.hasMore));
    } catch {
      setSearchResults([]);
      setSearchResultsHasMore(false);
      setSearchError(t("chat.searchError"));
    } finally {
      setSearching(false);
    }
  };

  return {
    searching,
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    handleSearchMessages,
    searchHasMention,
    setSearchHasMention,
    searchHasAttachment,
    setSearchHasAttachment,
    searchAttachmentType,
    setSearchAttachmentType,
    searchHasLink,
    setSearchHasLink,
    searchAuthorId,
    setSearchAuthorId,
    searchFrom,
    setSearchFrom,
    searchTo,
    setSearchTo,
    searchJumpStatusText,
    setSearchJumpStatusText,
    searchError,
    searchResults,
    searchResultsHasMore,
    setSearchJumpTarget
  } as {
    searching: boolean;
    searchQuery: string;
    setSearchQuery: Dispatch<SetStateAction<string>>;
    searchScope: SearchScope;
    setSearchScope: Dispatch<SetStateAction<SearchScope>>;
    handleSearchMessages: () => Promise<void>;
    searchHasMention: boolean;
    setSearchHasMention: Dispatch<SetStateAction<boolean>>;
    searchHasAttachment: boolean;
    setSearchHasAttachment: Dispatch<SetStateAction<boolean>>;
    searchAttachmentType: SearchAttachmentType;
    setSearchAttachmentType: Dispatch<SetStateAction<SearchAttachmentType>>;
    searchHasLink: boolean;
    setSearchHasLink: Dispatch<SetStateAction<boolean>>;
    searchAuthorId: string;
    setSearchAuthorId: Dispatch<SetStateAction<string>>;
    searchFrom: string;
    setSearchFrom: Dispatch<SetStateAction<string>>;
    searchTo: string;
    setSearchTo: Dispatch<SetStateAction<string>>;
    searchJumpStatusText: string;
    setSearchJumpStatusText: Dispatch<SetStateAction<string>>;
    searchError: string;
    searchResults: SearchResult[];
    searchResultsHasMore: boolean;
    setSearchJumpTarget: Dispatch<SetStateAction<SearchJumpTarget>>;
  };
}
