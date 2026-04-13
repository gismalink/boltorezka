import { useState } from "react";
import type { User } from "../../../domain";
import { readPersistedBearerToken } from "../../../utils/authStorage";

export function useAuthState() {
  const [token, setToken] = useState(() => readPersistedBearerToken());
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");

  return { token, setToken, user, setUser, authMode, setAuthMode };
}
