import { useCallback, useEffect, useRef } from "react";

type RemotePinHandler = (messageId: string, pinned: boolean) => void;
type RemoteReactionHandler = (messageId: string, emoji: string, active: boolean, actorUserId?: string) => void;
type RemoteThumbsUpHandler = (messageId: string, active: boolean) => void;

export function useRemoteMessageActionsBridge() {
  const pinHandlerRef = useRef<RemotePinHandler>(() => {});
  const reactionHandlerRef = useRef<RemoteReactionHandler>(() => {});
  const thumbsUpHandlerRef = useRef<RemoteThumbsUpHandler>(() => {});

  const applyRemotePinState = useCallback((messageId: string, pinned: boolean) => {
    pinHandlerRef.current(messageId, pinned);
  }, []);

  const applyRemoteMessageReactionState = useCallback((messageId: string, emoji: string, active: boolean, actorUserId?: string) => {
    reactionHandlerRef.current(messageId, emoji, active, actorUserId);
  }, []);

  const applyRemoteThumbsUpReactionState = useCallback((messageId: string, active: boolean) => {
    thumbsUpHandlerRef.current(messageId, active);
  }, []);

  const bindRemotePinHandler = useCallback((handler: RemotePinHandler) => {
    pinHandlerRef.current = handler;
  }, []);

  const bindRemoteMessageReactionHandler = useCallback((handler: RemoteReactionHandler) => {
    reactionHandlerRef.current = handler;
  }, []);

  const bindRemoteThumbsUpHandler = useCallback((handler: RemoteThumbsUpHandler) => {
    thumbsUpHandlerRef.current = handler;
  }, []);

  return {
    applyRemotePinState,
    applyRemoteMessageReactionState,
    applyRemoteThumbsUpReactionState,
    bindRemotePinHandler,
    bindRemoteMessageReactionHandler,
    bindRemoteThumbsUpHandler
  };
}

type UseBindRemoteMessageActionsBridgeInput = {
  bindRemotePinHandler: (handler: RemotePinHandler) => void;
  bindRemoteMessageReactionHandler: (handler: RemoteReactionHandler) => void;
  bindRemoteThumbsUpHandler: (handler: RemoteThumbsUpHandler) => void;
  applyRemotePinStateFromActions: RemotePinHandler;
  applyRemoteMessageReactionStateFromActions: RemoteReactionHandler;
  applyRemoteThumbsUpReactionStateFromActions: RemoteThumbsUpHandler;
};

export function useBindRemoteMessageActionsBridge({
  bindRemotePinHandler,
  bindRemoteMessageReactionHandler,
  bindRemoteThumbsUpHandler,
  applyRemotePinStateFromActions,
  applyRemoteMessageReactionStateFromActions,
  applyRemoteThumbsUpReactionStateFromActions
}: UseBindRemoteMessageActionsBridgeInput) {
  useEffect(() => {
    bindRemotePinHandler(applyRemotePinStateFromActions);
    bindRemoteMessageReactionHandler(applyRemoteMessageReactionStateFromActions);
    bindRemoteThumbsUpHandler(applyRemoteThumbsUpReactionStateFromActions);
  }, [
    applyRemotePinStateFromActions,
    applyRemoteMessageReactionStateFromActions,
    applyRemoteThumbsUpReactionStateFromActions,
    bindRemotePinHandler,
    bindRemoteMessageReactionHandler,
    bindRemoteThumbsUpHandler
  ]);
}