export const CHAT_AGENT_IDS = {
  panel: "chat.panel",
  screenContextStatus: "chat.screen-context.status",

  timeline: "chat.timeline",
  timelineUnreadDivider: "chat.timeline.unread-divider",
  messageBase: "chat.message",
  messageReactionMenu: "chat.message.reaction-menu",
  messageContextMenu: "chat.message.context-menu",
  messageActionReply: "chat.message.action.reply",
  messageActionMention: "chat.message.action.mention",
  messageActionQuote: "chat.message.action.quote",
  messageActionMarkUnread: "chat.message.action.mark-unread",
  messageActionPinToggle: "chat.message.action.pin-toggle",
  messageActionReport: "chat.message.action.report",
  messageActionEdit: "chat.message.action.edit",
  messageActionDelete: "chat.message.action.delete",

  composer: "chat.composer",
  composerStatus: "chat.composer.status",
  composerAttachmentInput: "chat.composer.attachment-input",
  composerAttach: "chat.composer.attach",
  composerInput: "chat.composer.input",
  composerMentionPicker: "chat.composer.mention-picker",
  composerMentionOptionBase: "chat.composer.mention-option",
  composerAttachmentClear: "chat.composer.attachment-clear",
  composerContext: "chat.composer.context",
  composerSubmit: "chat.composer.submit",

  topicNavigation: "chat.topic-navigation",
  topicNavigationControls: "chat.topic-navigation.controls",
  topicNavigationCreate: "chat.topic-navigation.create",
  topicNavigationTablist: "chat.topic-navigation.tablist",
  topicNavigationTab: "chat.topic-navigation.tab",
  topicNavigationPalette: "chat.topic-navigation.palette",
  topicNavigationSearchToggle: "chat.topic-navigation.search-toggle",

  searchPanel: "chat.search.panel",
  searchContainer: "chat.search.container",
  searchStatus: "chat.search.status",
  searchQuery: "chat.search.query",
  searchScope: "chat.search.scope",
  searchClose: "chat.search.close",
  searchFilters: "chat.search.filters",
  searchFilterMentions: "chat.search.filter.mentions",
  searchFilterAttachments: "chat.search.filter.attachments",
  searchFilterImage: "chat.search.filter.image",
  searchFilterLinks: "chat.search.filter.links",
  searchFilterAuthor: "chat.search.filter.author",
  searchFilterDate: "chat.search.filter.date",
  searchResults: "chat.search.results",
  searchResult: "chat.search.result",

  overlayImagePreview: "chat.overlay.image-preview",
  overlayImagePreviewClose: "chat.overlay.image-preview.close",
  overlayTopicPalette: "chat.overlay.topic-palette",
  overlayTopicPaletteCard: "chat.overlay.topic-palette.card",
  overlayTopicPaletteClose: "chat.overlay.topic-palette.close",
  overlayTopicPaletteSearch: "chat.overlay.topic-palette.search",
  overlayTopicPaletteList: "chat.overlay.topic-palette.list",
  overlayTopicPaletteOption: "chat.overlay.topic-palette.option",
  overlayTopicDeleteConfirm: "chat.overlay.topic-delete-confirm",
  overlayTopicDeleteConfirmCancel: "chat.overlay.topic-delete-confirm.cancel",
  overlayTopicDeleteConfirmConfirm: "chat.overlay.topic-delete-confirm.confirm",

  topicContextMenu: "chat.topic-context-menu",
  topicContextMenuStatus: "chat.topic-context-menu.status",
  topicContextMenuActionRead: "chat.topic-context-menu.action.read",
  topicContextMenuRenameInput: "chat.topic-context-menu.rename.input",
  topicContextMenuRenameCancel: "chat.topic-context-menu.rename.cancel",
  topicContextMenuRenameApply: "chat.topic-context-menu.rename.apply",
  topicContextMenuActionArchive: "chat.topic-context-menu.action.archive",
  topicContextMenuMute1h: "chat.topic-context-menu.mute.1h",
  topicContextMenuMute8h: "chat.topic-context-menu.mute.8h",
  topicContextMenuMute24h: "chat.topic-context-menu.mute.24h",
  topicContextMenuMuteForever: "chat.topic-context-menu.mute.forever",
  topicContextMenuActionDelete: "chat.topic-context-menu.action.delete"
} as const;

export const CHAT_AGENT_STATUS_STYLE = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
} as const;

export const CHAT_AGENT_FAILURE_REASONS = {
  unknown: "unknown",
  emptyMessage: "empty-message",
  emptyQuery: "empty-query",
  emptyTitle: "empty-title",
  noActiveRoom: "no-active-room",
  topicArchived: "topic-archived",
  networkError: "network-error",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  validationError: "validation-error",
  timeout: "timeout"
} as const;

export type ChatAgentFailureReason = (typeof CHAT_AGENT_FAILURE_REASONS)[keyof typeof CHAT_AGENT_FAILURE_REASONS];
export type ChatAgentStatusPhase = "requested" | "accepted" | "failed";

export function normalizeChatAgentFailureReason(error: unknown): ChatAgentFailureReason {
  const raw = String((error as { message?: string } | null)?.message || error || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return CHAT_AGENT_FAILURE_REASONS.unknown;
  }

  if (raw.includes("timeout") || raw.includes("timed out")) {
    return CHAT_AGENT_FAILURE_REASONS.timeout;
  }
  if (raw.includes("unauthorized") || raw.includes("401")) {
    return CHAT_AGENT_FAILURE_REASONS.unauthorized;
  }
  if (raw.includes("forbidden") || raw.includes("403")) {
    return CHAT_AGENT_FAILURE_REASONS.forbidden;
  }
  if (raw.includes("validation") || raw.includes("invalid") || raw.includes("bad request") || raw.includes("400")) {
    return CHAT_AGENT_FAILURE_REASONS.validationError;
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("connection") || raw.includes("ecconn")) {
    return CHAT_AGENT_FAILURE_REASONS.networkError;
  }

  return CHAT_AGENT_FAILURE_REASONS.unknown;
}

export function buildChatAgentStatus(
  action: string,
  phase: ChatAgentStatusPhase,
  reason?: ChatAgentFailureReason
): string {
  const actionToken = String(action || "").trim().replace(/\s+/g, "-").toLowerCase() || "action";
  if (phase === "failed") {
    return `${actionToken}:failed:${reason || CHAT_AGENT_FAILURE_REASONS.unknown}`;
  }
  return `${actionToken}:${phase}`;
}

export function chatAgentMessageId(messageId: string): string {
  return `${CHAT_AGENT_IDS.messageBase}.${String(messageId || "").trim()}`;
}

export function chatAgentMentionOptionId(handle: string): string {
  return `${CHAT_AGENT_IDS.composerMentionOptionBase}.${String(handle || "").trim()}`;
}
