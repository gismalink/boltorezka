import { useChatComposerActions } from "../../realtime/useChatComposerActions";
import { useRoomPresenceActions } from "../../rooms/useRoomPresenceActions";

type RoomPresenceInput = Parameters<typeof useRoomPresenceActions>[0];
type ChatComposerInput = Parameters<typeof useChatComposerActions>[0];

type UseAppRoomChatActionsInput = {
  roomPresence: Omit<RoomPresenceInput, "onAgeVerificationRequired"> & {
    setAgeGateBlockedRoomSlug: (slug: string) => void;
  };
  chatComposer: ChatComposerInput;
};

export function useAppRoomChatActions({ roomPresence, chatComposer }: UseAppRoomChatActionsInput) {
  const {
    setAgeGateBlockedRoomSlug,
    ...roomPresenceInput
  } = roomPresence;

  const {
    joinRoom,
    leaveRoom,
    kickRoomMember,
    moveRoomMember
  } = useRoomPresenceActions({
    ...roomPresenceInput,
    onAgeVerificationRequired: setAgeGateBlockedRoomSlug
  });

  const {
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    deleteOwnMessage,
    openRoomChat
  } = useChatComposerActions(chatComposer);

  return {
    joinRoom,
    leaveRoom,
    kickRoomMember,
    moveRoomMember,
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    deleteOwnMessage,
    openRoomChat
  };
}