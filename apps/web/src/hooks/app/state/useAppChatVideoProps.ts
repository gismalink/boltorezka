import type { Message, User } from "../../../domain";
import { useWorkspaceChatVideoProps } from "./useWorkspaceChatVideoProps";

type UseWorkspaceChatVideoPropsInput = Parameters<typeof useWorkspaceChatVideoProps>[0];

type UseAppChatVideoPropsInput = Omit<
  UseWorkspaceChatVideoPropsInput,
  "authToken" | "activeChatRoomId" | "activeChatRoomTitle" | "currentUserId" | "setChatText" | "userName"
> & {
  serviceToken: string;
  user: User | null;
  activeChatRoom: { id?: string; title?: string } | null;
  handleSetChatText: (value: string) => void;
};

export function useAppChatVideoProps({
  serviceToken,
  user,
  activeChatRoom,
  handleSetChatText,
  ...rest
}: UseAppChatVideoPropsInput) {
  return useWorkspaceChatVideoProps({
    ...rest,
    authToken: serviceToken,
    activeChatRoomId: String(activeChatRoom?.id || ""),
    activeChatRoomTitle: activeChatRoom?.title || "",
    currentUserId: user?.id || null,
    setChatText: handleSetChatText,
    userName: user?.name || ""
  });
}