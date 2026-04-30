import { useAppWorkspaceActionsRuntime } from "./useAppWorkspaceActionsRuntime";
import { asTrimmedString } from "../../../utils/stringUtils";

type WorkspaceActionsRuntimeInput = Parameters<typeof useAppWorkspaceActionsRuntime>[0];

function toMentionHandle(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_\.\-]+|[_\.\-]+$/g, "")
    .slice(0, 32);
}

function buildMentionCandidatesFromServerMembers(serverMembers: unknown[]): Array<{
  key: string;
  kind: "user" | "tag" | "all";
  handle: string;
  label: string;
  userId?: string;
  userIds?: string[];
}> {
  const members = Array.isArray(serverMembers) ? serverMembers : [];
  const userCandidates: Array<{
    key: string;
    kind: "user";
    handle: string;
    label: string;
    userId: string;
  }> = [];
  const roleMap = new Map<string, { handle: string; label: string; userIds: Set<string> }>();

  members.forEach((member) => {
    const userId = asTrimmedString((member as { userId?: string } | null)?.userId);
    const userName = asTrimmedString((member as { name?: string } | null)?.name);
    const userHandle = toMentionHandle(userName);
    if (userId && userName && userHandle) {
      userCandidates.push({
        key: `user:${userId}`,
        kind: "user",
        handle: userHandle,
        label: userName,
        userId
      });
    }

    const customRoles = Array.isArray((member as { customRoles?: unknown[] } | null)?.customRoles)
      ? ((member as { customRoles?: unknown[] }).customRoles || [])
      : [];

    customRoles.forEach((role) => {
      const roleLabel = asTrimmedString((role as { name?: string } | null)?.name);
      const roleHandle = toMentionHandle(roleLabel);
      if (!roleLabel || !roleHandle || !userId) {
        return;
      }

      const roleKey = `tag:${roleHandle}`;
      const existing = roleMap.get(roleKey) || {
        handle: roleHandle,
        label: roleLabel,
        userIds: new Set<string>()
      };
      existing.userIds.add(userId);
      roleMap.set(roleKey, existing);
    });
  });

  const tagCandidates = Array.from(roleMap.entries())
    .map(([key, value]) => ({
      key,
      kind: "tag" as const,
      handle: value.handle,
      label: `@${value.handle}`,
      userIds: Array.from(value.userIds)
    }))
    .filter((item) => item.userIds.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));

  return [
    {
      key: "all",
      kind: "all",
      handle: "all",
      label: "@all"
    },
    ...tagCandidates,
    ...userCandidates
  ];
}

export function useAppWorkspaceActionsRuntimeInput(params: Record<string, unknown>): WorkspaceActionsRuntimeInput {
  const p = params as any;

  return {
      roomChat: {
        roomPresence: {
          roomSlug: p.roomSlug,
          chatRoomSlug: p.chatRoomSlug,
          canCreateRooms: p.canCreateRooms,
          roomAdminController: p.roomAdminController,
          disconnectRoom: p.disconnectRoom,
          sendWsEvent: p.sendWsEvent,
          pushToast: p.pushToast,
          pushLog: p.pushLog,
          t: p.t,
          setAgeGateBlockedRoomSlug: p.setAgeGateBlockedRoomSlug,
          setRoomSlug: p.setRoomSlug,
          setChatRoomSlug: p.setChatRoomSlug
        },
        chatComposer: {
          chatRoomSlug: p.chatRoomSlug,
          activeTopicId: p.activeChatTopicId,
          setChatRoomSlug: p.setChatRoomSlug,
          messages: p.messages,
          setMessages: p.setMessages,
          setMessagesHasMore: p.setMessagesHasMore,
          setMessagesNextCursor: p.setMessagesNextCursor,
          user: p.user,
          authToken: p.token,
          chatText: p.chatText,
          setChatText: p.setChatText,
          editingMessageId: p.editingMessageId,
          setEditingMessageId: p.setEditingMessageId,
          replyingToMessageId: p.replyingToMessageId,
          setReplyingToMessageId: p.setReplyingToMessageId,
          pendingChatImageDataUrl: p.pendingChatImageDataUrl,
          setPendingChatImageDataUrl: p.setPendingChatImageDataUrl,
          chatController: p.chatController,
          sendWsEvent: p.sendWsEvent,
          sendWsEventAwaitAck: p.sendWsEventAwaitAck,
          sendChatTypingState: p.sendChatTypingState,
          pushToast: p.pushToast,
          selectChannelPlaceholderMessage: p.selectChannelPlaceholderMessage,
          serverErrorMessage: p.serverErrorMessage,
          maxChatRetries: p.maxChatRetries,
          messageEditDeleteWindowMs: p.messageEditDeleteWindowMs,
          serverChatImagePolicy: p.serverChatImagePolicy,
          chatImageTooLargeMessage: p.chatImageTooLargeMessage,
          topicImageUploadUnsupportedMessage: p.t("chat.topicImageUploadUnsupported"),
          topicOnlyActionMessage: p.t("chat.topicOnlyAction"),
          reportMessageSentMessage: p.t("chat.reportMessageSent"),
          reportMessageExistsMessage: p.t("chat.reportMessageExists"),
          attachmentTooLargeMessage: p.t("chat.attachmentTooLarge"),
          attachmentUnsupportedTypeMessage: p.t("chat.attachmentUnsupportedType"),
          mentionCandidates: buildMentionCandidatesFromServerMembers(Array.isArray(p.serverMembers) ? p.serverMembers : [])
        }
      },
      moderation: {
        memberPreferences: {
          token: p.token,
          currentUserId: p.currentUserId,
          roomsPresenceDetailsBySlug: p.roomsPresenceDetailsBySlug,
          setMemberPreferencesByUserId: p.setMemberPreferencesByUserId,
          pushLog: p.pushLog,
          pushToast: p.pushToast,
          t: p.t
        },
        serverModeration: {
          token: p.token,
          canManageUsers: p.canManageUsers,
          canPromote: p.canPromote,
          canManageAudioQuality: p.canManageAudioQuality,
          roomAdminController: p.roomAdminController,
          pushLog: p.pushLog,
          setServerAudioQuality: p.setServerAudioQuality,
          setServerAudioQualitySaving: p.setServerAudioQualitySaving
        }
      },
      serverAdmin: {
        serverProfile: {
          token: p.token,
          currentServerId: p.currentServerId,
          creatingInvite: p.creatingInvite,
          serverAgeConfirming: p.serverAgeConfirming,
          serverAgeConfirmedAt: p.serverAgeConfirmedAt,
          lastInviteUrl: p.lastInviteUrl,
          setCreatingServer: p.setCreatingServer,
          setServers: p.setServers,
          setCurrentServerId: p.setCurrentServerId,
          setCreatingInvite: p.setCreatingInvite,
          setLastInviteUrl: p.setLastInviteUrl,
          setServerAgeConfirming: p.setServerAgeConfirming,
          setServerAgeConfirmedAt: p.setServerAgeConfirmedAt,
          setServerMembers: p.setServerMembers,
          pushToast: p.pushToast,
          t: p.t
        },
        adminServer: {
          token: p.token,
          setAdminServers: p.setAdminServers,
          setServers: p.setServers,
          setSelectedAdminServerId: p.setSelectedAdminServerId,
          setCurrentServerId: p.setCurrentServerId,
          pushToast: p.pushToast,
          t: p.t
        }
      },
      roomAdmin: {
        token: p.token,
        canCreateRooms: p.canCreateRooms,
        canManageAudioQuality: p.canManageAudioQuality,
        roomSlug: p.roomSlug,
        allRooms: p.allRooms,
        archivedRooms: p.archivedRooms,
        roomAdminController: p.roomAdminController,
        newRoomTitle: p.newRoomTitle,
        newRoomKind: p.newRoomKind,
        newRoomCategoryId: p.newRoomCategoryId,
        newCategoryTitle: p.newCategoryTitle,
        editingCategoryTitle: p.editingCategoryTitle,
        categorySettingsPopupOpenId: p.categorySettingsPopupOpenId,
        editingRoomTitle: p.editingRoomTitle,
        editingRoomKind: p.editingRoomKind,
        editingRoomCategoryId: p.editingRoomCategoryId,
        editingRoomNsfw: p.editingRoomNsfw,
        editingRoomHidden: p.editingRoomHidden,
        editingRoomAudioQualitySetting: p.editingRoomAudioQualitySetting,
        channelSettingsPopupOpenId: p.channelSettingsPopupOpenId,
        setNewRoomTitle: p.setNewRoomTitle,
        setChannelPopupOpen: p.setChannelPopupOpen,
        setNewCategoryTitle: p.setNewCategoryTitle,
        setCategoryPopupOpen: p.setCategoryPopupOpen,
        setNewRoomCategoryId: p.setNewRoomCategoryId,
        setEditingRoomTitle: p.setEditingRoomTitle,
        setEditingRoomKind: p.setEditingRoomKind,
        setEditingRoomCategoryId: p.setEditingRoomCategoryId,
        setEditingRoomNsfw: p.setEditingRoomNsfw,
        setEditingRoomHidden: p.setEditingRoomHidden,
        setEditingRoomAudioQualitySetting: p.setEditingRoomAudioQualitySetting,
        setChannelSettingsPopupOpenId: p.setChannelSettingsPopupOpenId,
        setEditingCategoryTitle: p.setEditingCategoryTitle,
        setCategorySettingsPopupOpenId: p.setCategorySettingsPopupOpenId,
        setMessages: p.setMessages,
        setMessagesHasMore: p.setMessagesHasMore,
        setMessagesNextCursor: p.setMessagesNextCursor
      }
  };
}