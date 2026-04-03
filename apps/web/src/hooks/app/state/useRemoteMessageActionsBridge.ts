import { useCallback, useEffect, useRef } from "react";

type RemotePinHandler = (messageId: string, pinned: boolean) => void;
type RemoteThumbsUpHandler = (messageId: string, active: boolean) => void;

export function useRemoteMessageActionsBridge() {
  const pinHandlerRef = useRef<RemotePinHandler>(() => {});
  const thumbsUpHandlerRef = useRef<RemoteThumbsUpHandler>(() => {});

  const applyRemotePinState = useCallback((messageId: string, pinned: boolean) => {
    pinHandlerRef.current(messageId, pinned);
  }, []);

  const applyRemoteThumbsUpReactionState = useCallback((messageId: string, active: boolean) => {
    thumbsUpHandlerRef.current(messageId, active);
  }, []);

  const bindRemotePinHandler = useCallback((handler: RemotePinHandler) => {
    pinHandlerRef.current = handler;
  }, []);

  const bindRemoteThumbsUpHandler = useCallback((handler: RemoteThumbsUpHandler) => {
    thumbsUpHandlerRef.current = handler;
  }, []);

  return {
    applyRemotePinState,
    applyRemoteThumbsUpReactionState,
    bindRemotePinHandler,
    bindRemoteThumbsUpHandler
  };
}

type UseBindRemoteMessageActionsBridgeInput = {
  bindRemotePinHandler: (handler: RemotePinHandler) => void;
  bindRemoteThumbsUpHandler: (handler: RemoteThumbsUpHandler) => void;
  applyRemotePinStateFromActions: RemotePinHandler;
  applyRemoteThumbsUpReactionStateFromActions: RemoteThumbsUpHandler;
};

export function useBindRemoteMessageActionsBridge({
  bindRemotePinHandler,
  bindRemoteThumbsUpHandler,
  applyRemotePinStateFromActions,
  applyRemoteThumbsUpReactionStateFromActions
}: UseBindRemoteMessageActionsBridgeInput) {
  useEffect(() => {
    bindRemotePinHandler(applyRemotePinStateFromActions);
    bindRemoteThumbsUpHandler(applyRemoteThumbsUpReactionStateFromActions);
  }, [
    applyRemotePinStateFromActions,
    applyRemoteThumbsUpReactionStateFromActions,
    bindRemotePinHandler,
    bindRemoteThumbsUpHandler
  ]);
}