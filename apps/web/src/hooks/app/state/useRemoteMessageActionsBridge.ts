import { useCallback, useEffect, useRef } from "react";

type RemotePinHandler = (messageId: string, pinned: boolean) => void;
type RemoteReactionHandler = (messageId: string, emoji: string, active: boolean, actorUserId?: string) => void;

export function useRemoteMessageActionsBridge() {
  const pinHandlerRef = useRef<RemotePinHandler>(() => {});
  const reactionHandlerRef = useRef<RemoteReactionHandler>(() => {});

  const applyRemotePinState = useCallback((messageId: string, pinned: boolean) => {
    pinHandlerRef.current(messageId, pinned);
  }, []);

  const applyRemoteMessageReactionState = useCallback((messageId: string, emoji: string, active: boolean, actorUserId?: string) => {
    reactionHandlerRef.current(messageId, emoji, active, actorUserId);
  }, []);

  const bindRemotePinHandler = useCallback((handler: RemotePinHandler) => {
    pinHandlerRef.current = handler;
  }, []);

  const bindRemoteMessageReactionHandler = useCallback((handler: RemoteReactionHandler) => {
    reactionHandlerRef.current = handler;
  }, []);

  return {
    applyRemotePinState,
    applyRemoteMessageReactionState,
    bindRemotePinHandler,
    bindRemoteMessageReactionHandler
  };
}

type UseBindRemoteMessageActionsBridgeInput = {
  bindRemotePinHandler: (handler: RemotePinHandler) => void;
  bindRemoteMessageReactionHandler: (handler: RemoteReactionHandler) => void;
  applyRemotePinStateFromActions: RemotePinHandler;
  applyRemoteMessageReactionStateFromActions: RemoteReactionHandler;
};

export function useBindRemoteMessageActionsBridge({
  bindRemotePinHandler,
  bindRemoteMessageReactionHandler,
  applyRemotePinStateFromActions,
  applyRemoteMessageReactionStateFromActions
}: UseBindRemoteMessageActionsBridgeInput) {
  useEffect(() => {
    bindRemotePinHandler(applyRemotePinStateFromActions);
    bindRemoteMessageReactionHandler(applyRemoteMessageReactionStateFromActions);
  }, [
    applyRemotePinStateFromActions,
    applyRemoteMessageReactionStateFromActions,
    bindRemotePinHandler,
    bindRemoteMessageReactionHandler
  ]);
}