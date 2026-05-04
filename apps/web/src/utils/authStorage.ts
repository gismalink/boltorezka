const AUTH_TOKEN_STORAGE_KEY = "datowave_token";

export const AUTH_COOKIE_MODE = import.meta.env.VITE_AUTH_COOKIE_MODE === "1";

const configuredBearerStorage = String(import.meta.env.VITE_AUTH_BEARER_STORAGE || "memory")
  .trim()
  .toLowerCase();

export const AUTH_PERSIST_BEARER_IN_LOCAL_STORAGE = !AUTH_COOKIE_MODE
  && configuredBearerStorage === "localstorage";

export function readPersistedBearerToken(): string {
  if (!AUTH_PERSIST_BEARER_IN_LOCAL_STORAGE || typeof window === "undefined") {
    return "";
  }

  return String(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "");
}

export function persistBearerToken(token: string): void {
  if (!AUTH_PERSIST_BEARER_IN_LOCAL_STORAGE || typeof window === "undefined") {
    return;
  }

  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearPersistedBearerToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}
