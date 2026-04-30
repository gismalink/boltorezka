/**
 * useChatPanelSearch.ts — хук поиска по сообщениям внутри топика.
 * Делает запросы к `api`, хранит результаты/выделенный hit и реагирует на смену топика.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

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

const SEARCH_JUMP_AROUND_WINDOW_BEFORE = 24;
const SEARCH_JUMP_AROUND_WINDOW_AFTER = 24;

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
  onLoadMessagesAroundAnchor: (
    topicId: string,
    anchorMessageId: string,
    options?: {
      aroundWindowBefore?: number;
      aroundWindowAfter?: number;
    }
  ) => Promise<boolean>;
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
  onLoadOlderMessages,
  onLoadMessagesAroundAnchor
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
  const searchRequestSeqRef = useRef(0);
  const searchJumpAnchorLoadAttemptKeyRef = useRef("");

  useEffect(() => {
    if (!searchJumpTarget) {
      return;
    }

    const targetRoomSlug = asTrimmedString(searchJumpTarget.roomSlug);
    const targetTopicId = asTrimmedString(searchJumpTarget.topicId);
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

    const targetRoomSlug = asTrimmedString(searchJumpTarget.roomSlug);
    const targetTopicId = asTrimmedString(searchJumpTarget.topicId);
    const shouldLoadHistory = searchJumpTarget.includeHistoryLoad !== false;
    const targetMessageId = asTrimmedString(searchJumpTarget.messageId);
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
      if (searchHasMention) {
        targetNode.classList.add("chat-message-jump-target-mention");
      }
      window.setTimeout(() => {
        targetNode.classList.remove("chat-message-jump-target");
        targetNode.classList.remove("chat-message-jump-target-mention");
      }, searchHasMention ? 3000 : 2200);
      setSearchJumpTarget(null);
      setSearchJumpStatusText("");
      searchJumpAnchorLoadAttemptKeyRef.current = "";
      return;
    }

    if (targetTopicId) {
      const anchorAttemptKey = `${targetTopicId}:${targetMessageId}`;
      if (searchJumpAnchorLoadAttemptKeyRef.current !== anchorAttemptKey && !loadingOlderMessages) {
        searchJumpAnchorLoadAttemptKeyRef.current = anchorAttemptKey;
        setSearchJumpStatusText(t("chat.searchJumpLoadingContext"));
        void onLoadMessagesAroundAnchor(targetTopicId, targetMessageId, {
          aroundWindowBefore: SEARCH_JUMP_AROUND_WINDOW_BEFORE,
          aroundWindowAfter: SEARCH_JUMP_AROUND_WINDOW_AFTER
        })
          .then((loaded) => {
            if (!loaded && searchJumpAnchorLoadAttemptKeyRef.current === anchorAttemptKey) {
              searchJumpAnchorLoadAttemptKeyRef.current = "";
            }
          })
          .catch(() => {
            if (searchJumpAnchorLoadAttemptKeyRef.current === anchorAttemptKey) {
              searchJumpAnchorLoadAttemptKeyRef.current = "";
            }
          });
        return;
      }

      if (searchJumpAnchorLoadAttemptKeyRef.current === anchorAttemptKey && !loadingOlderMessages) {
        setSearchJumpTarget(null);
        setSearchJumpStatusText(t("chat.searchJumpNotFound"));
        searchJumpAnchorLoadAttemptKeyRef.current = "";
        return;
      }
    }

    if (!shouldLoadHistory) {
      setSearchJumpTarget(null);
      setSearchJumpStatusText("");
      searchJumpAnchorLoadAttemptKeyRef.current = "";
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
      searchJumpAnchorLoadAttemptKeyRef.current = "";
    }
  }, [
    searchJumpTarget,
    roomSlug,
    activeTopicId,
    loadingOlderMessages,
    messagesHasMore,
    searchHasMention,
    onLoadMessagesAroundAnchor,
    onLoadOlderMessages,
    t
  ]);

  const handleSearchMessages = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q || !authToken) {
      return;
    }

    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
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
        serverId: normalizedScope === "server" ? asTrimmedString(currentServerId) || undefined : undefined,
        roomId: normalizedScope === "room" ? asTrimmedString(roomId) || undefined : undefined,
        hasMention: searchHasMention ? true : undefined,
        hasAttachment: searchHasAttachment ? true : undefined,
        attachmentType: searchAttachmentType || undefined,
        hasLink: searchHasLink ? true : undefined,
        authorId: searchAuthorId.trim() || undefined,
        from: normalizeDateFilter(searchFrom),
        to: normalizeDateFilter(searchTo),
        limit: 25
      });

      if (requestSeq !== searchRequestSeqRef.current) {
        return;
      }

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
      if (requestSeq !== searchRequestSeqRef.current) {
        return;
      }

      setSearchResults([]);
      setSearchResultsHasMore(false);
      setSearchError(t("chat.searchError"));
    } finally {
      if (requestSeq === searchRequestSeqRef.current) {
        setSearching(false);
      }
    }
  }, [
    activeTopicId,
    authToken,
    currentServerId,
    roomId,
    searchAttachmentType,
    searchAuthorId,
    searchFrom,
    searchHasAttachment,
    searchHasLink,
    searchHasMention,
    searchQuery,
    searchScope,
    searchTo,
    t
  ]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchResultsHasMore(false);
      setSearchError("");
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSearchMessages();
    }, 260);

    return () => window.clearTimeout(timer);
  }, [
    authToken,
    handleSearchMessages,
    searchAttachmentType,
    searchAuthorId,
    searchFrom,
    searchHasAttachment,
    searchHasLink,
    searchHasMention,
    searchQuery,
    searchScope,
    searchTo
  ]);

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
