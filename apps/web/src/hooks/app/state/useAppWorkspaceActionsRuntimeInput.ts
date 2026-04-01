import { useMemo } from "react";
import { useAppWorkspaceActionsRuntime } from "./useAppWorkspaceActionsRuntime";

type WorkspaceActionsRuntimeInput = Parameters<typeof useAppWorkspaceActionsRuntime>[0];

export function useAppWorkspaceActionsRuntimeInput(params: Record<string, unknown>): WorkspaceActionsRuntimeInput {
  return useMemo(() => {
    const p = params as any;

    return {
      roomChat: {
        roomPresence: {
          roomSlug: p.roomSlug,
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
          pendingChatImageDataUrl: p.pendingChatImageDataUrl,
          setPendingChatImageDataUrl: p.setPendingChatImageDataUrl,
          chatController: p.chatController,
          sendWsEvent: p.sendWsEvent,
          sendChatTypingState: p.sendChatTypingState,
          pushToast: p.pushToast,
          selectChannelPlaceholderMessage: p.selectChannelPlaceholderMessage,
          serverErrorMessage: p.serverErrorMessage,
          maxChatRetries: p.maxChatRetries,
          messageEditDeleteWindowMs: p.messageEditDeleteWindowMs,
          serverChatImagePolicy: p.serverChatImagePolicy,
          chatImageTooLargeMessage: p.chatImageTooLargeMessage
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
        setEditingRoomAudioQualitySetting: p.setEditingRoomAudioQualitySetting,
        setChannelSettingsPopupOpenId: p.setChannelSettingsPopupOpenId,
        setEditingCategoryTitle: p.setEditingCategoryTitle,
        setCategorySettingsPopupOpenId: p.setCategorySettingsPopupOpenId,
        setMessages: p.setMessages,
        setMessagesHasMore: p.setMessagesHasMore,
        setMessagesNextCursor: p.setMessagesNextCursor
      }
    };
  }, [params]);
}