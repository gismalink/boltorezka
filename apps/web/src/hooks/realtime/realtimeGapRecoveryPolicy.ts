import { asTrimmedString } from "../../utils/stringUtils";

export type RealtimeGapRecoveryMode = "messages+topics" | "messages-only" | "topics-only";

export type RealtimeGapRecoveryDecision = {
  scope: string;
  shouldReloadMessages: boolean;
  shouldReloadTopics: boolean;
  recoveryMode: RealtimeGapRecoveryMode;
};

type DecideRealtimeGapRecoveryInput = {
  scope: string;
  activeRoomId: string;
  activeTopicId: string | null;
};

function toRecoveryMode(
  shouldReloadMessages: boolean,
  shouldReloadTopics: boolean
): RealtimeGapRecoveryMode {
  if (shouldReloadMessages && shouldReloadTopics) {
    return "messages+topics";
  }
  if (shouldReloadMessages) {
    return "messages-only";
  }
  return "topics-only";
}

export function decideRealtimeGapRecovery({
  scope,
  activeRoomId,
  activeTopicId
}: DecideRealtimeGapRecoveryInput): RealtimeGapRecoveryDecision | null {
  const normalizedScope = asTrimmedString(scope);
  const normalizedActiveRoomId = asTrimmedString(activeRoomId);
  const normalizedActiveTopicId = asTrimmedString(activeTopicId || "");

  const isChatScope = normalizedScope.startsWith("topic:")
    || normalizedScope.startsWith("room:")
    || normalizedScope === "chat:global";
  if (!isChatScope) {
    return null;
  }

  let scopeRoomId = "";
  let scopeTopicId = "";

  if (normalizedScope.startsWith("topic:")) {
    const topicScopeMatch = normalizedScope.match(/^topic:([^:]+):([^:]+)$/);
    if (!topicScopeMatch) {
      return null;
    }

    scopeRoomId = asTrimmedString(topicScopeMatch[1]);
    scopeTopicId = asTrimmedString(topicScopeMatch[2]);
    if (!scopeRoomId || !scopeTopicId) {
      return null;
    }
  } else if (normalizedScope.startsWith("room:")) {
    const roomScopeMatch = normalizedScope.match(/^room:([^:]+)$/);
    if (!roomScopeMatch) {
      return null;
    }

    scopeRoomId = asTrimmedString(roomScopeMatch[1]);
    if (!scopeRoomId) {
      return null;
    }
  }

  if (scopeRoomId && normalizedActiveRoomId && scopeRoomId !== normalizedActiveRoomId) {
    return null;
  }

  const shouldReloadMessages = normalizedScope === "chat:global"
    || normalizedScope.startsWith("room:")
    || (normalizedScope.startsWith("topic:") && (!normalizedActiveTopicId || normalizedActiveTopicId === scopeTopicId));

  const shouldReloadTopics = Boolean(normalizedActiveRoomId)
    && (
      normalizedScope === "chat:global"
      || normalizedScope.startsWith("room:")
      || normalizedScope.startsWith("topic:")
    );

  if (!shouldReloadMessages && !shouldReloadTopics) {
    return null;
  }

  return {
    scope: normalizedScope,
    shouldReloadMessages,
    shouldReloadTopics,
    recoveryMode: toRecoveryMode(shouldReloadMessages, shouldReloadTopics)
  };
}
