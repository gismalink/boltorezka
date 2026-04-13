import { createContext, useContext, type ReactNode } from "react";

type AuthContextValue = {
  authToken: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthCtx(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthCtx must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
