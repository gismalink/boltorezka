import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

const CHAT_DRAFTS_STORAGE_KEY = "boltorezka_chat_drafts_v1";

type UseChatDraftsByScopeArgs = {
  userId: string | null;
  serverId: string;
  roomSlug: string;
  topicId: string | null;
  chatText: string;
  editingMessageId: string | null;
  setChatText: Dispatch<SetStateAction<string>>;
};

function readDraftsStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === "string") {
        acc[key] = value;
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeDraftsStorage(next: Record<string, string>) {
  try {
    localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota/security errors to keep compose flow non-blocking.
  }
}

function saveDraft(scopeKey: string, text: string) {
  const drafts = readDraftsStorage();
  const normalizedText = String(text || "");

  if (!normalizedText.trim()) {
    if (!(scopeKey in drafts)) {
      return;
    }

    delete drafts[scopeKey];
    writeDraftsStorage(drafts);
    return;
  }

  if (drafts[scopeKey] === normalizedText) {
    return;
  }

  drafts[scopeKey] = normalizedText;
  writeDraftsStorage(drafts);
}

function readDraft(scopeKey: string): string {
  const drafts = readDraftsStorage();
  return drafts[scopeKey] || "";
}

function buildScopeKey(userId: string | null, serverId: string, roomSlug: string, topicId: string | null): string {
  const normalizedUserId = String(userId || "").trim();
  const normalizedServerId = String(serverId || "").trim();
  const normalizedRoomSlug = String(roomSlug || "").trim();
  const normalizedTopicId = String(topicId || "").trim() || "root";

  if (!normalizedUserId || !normalizedServerId || !normalizedRoomSlug) {
    return "";
  }

  return `${normalizedUserId}:${normalizedServerId}:${normalizedRoomSlug}:${normalizedTopicId}`;
}

export function useChatDraftsByScope({
  userId,
  serverId,
  roomSlug,
  topicId,
  chatText,
  editingMessageId,
  setChatText
}: UseChatDraftsByScopeArgs) {
  const activeScopeKeyRef = useRef("");

  useEffect(() => {
    if (editingMessageId) {
      return;
    }

    const nextScopeKey = buildScopeKey(userId, serverId, roomSlug, topicId);
    const previousScopeKey = activeScopeKeyRef.current;

    if (!nextScopeKey) {
      activeScopeKeyRef.current = "";
      return;
    }

    if (!previousScopeKey) {
      activeScopeKeyRef.current = nextScopeKey;
      const restoredDraft = readDraft(nextScopeKey);
      if (restoredDraft !== chatText) {
        setChatText(restoredDraft);
      }
      return;
    }

    if (previousScopeKey !== nextScopeKey) {
      saveDraft(previousScopeKey, chatText);
      activeScopeKeyRef.current = nextScopeKey;
      const restoredDraft = readDraft(nextScopeKey);
      if (restoredDraft !== chatText) {
        setChatText(restoredDraft);
      }
      return;
    }

    saveDraft(nextScopeKey, chatText);
  }, [chatText, editingMessageId, roomSlug, serverId, setChatText, topicId, userId]);
}