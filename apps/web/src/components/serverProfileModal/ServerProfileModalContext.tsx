import { createContext, useContext, type ReactNode } from "react";
import type { ServerMemberRole } from "../../domain";

type ServerProfileModalContextValue = {
  t: (key: string) => string;
  currentUserId: string;
  currentServerId: string;
  currentServerRole: ServerMemberRole | null;
  canManageUsers: boolean;
  canPromote: boolean;
  canManageServerControlPlane: boolean;
  canViewTelemetry: boolean;
  canManageAudioQuality: boolean;
};

const ServerProfileModalContext = createContext<ServerProfileModalContextValue | null>(null);

export function useServerProfileModalCtx(): ServerProfileModalContextValue {
  const ctx = useContext(ServerProfileModalContext);
  if (!ctx) {
    throw new Error("useServerProfileModalCtx must be used within ServerProfileModalProvider");
  }
  return ctx;
}

export function ServerProfileModalProvider({
  value,
  children
}: {
  value: ServerProfileModalContextValue;
  children: ReactNode;
}) {
  return (
    <ServerProfileModalContext.Provider value={value}>
      {children}
    </ServerProfileModalContext.Provider>
  );
}
