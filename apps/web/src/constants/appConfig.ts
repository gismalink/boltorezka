export const MAX_CHAT_RETRIES = 3;

export const DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH = 102400;
export const DEFAULT_CHAT_IMAGE_MAX_SIDE = 1200;
export const DEFAULT_CHAT_IMAGE_QUALITY = 0.6;

export const DEFAULT_MIC_VOLUME = 75;
export const DEFAULT_OUTPUT_VOLUME = 70;

export const MESSAGE_EDIT_DELETE_WINDOW_MS = 10 * 60 * 1000;

export const ROOM_SLUG_STORAGE_KEY = "boltorezka_room_slug";
export const VERSION_UPDATE_PENDING_KEY = "boltorezka_update_reload_pending";
export const VERSION_UPDATE_EXPECTED_SHA_KEY = "boltorezka_update_expected_sha";

export const PENDING_ACCESS_AUTO_REFRESH_SEC = 20;

function readPositiveIntFromEnv(name: keyof ImportMetaEnv, fallback: number): number {
	const raw = Number(import.meta.env[name] || "");
	if (!Number.isFinite(raw)) {
		return fallback;
	}

	const normalized = Math.floor(raw);
	return normalized > 0 ? normalized : fallback;
}

function readBooleanFlagFromEnv(name: keyof ImportMetaEnv, fallback: boolean): boolean {
	const raw = String(import.meta.env[name] || "").trim().toLowerCase();
	if (!raw) {
		return fallback;
	}

	return raw === "1" || raw === "true" || raw === "yes";
}

export const ROOM_UNREAD_BACKGROUND_REFRESH_MS = readPositiveIntFromEnv(
	"VITE_ROOM_UNREAD_BACKGROUND_REFRESH_MS",
	45_000
);
export const ROOM_UNREAD_BACKGROUND_MAX_REFRESH_MS = readPositiveIntFromEnv(
	"VITE_ROOM_UNREAD_BACKGROUND_MAX_REFRESH_MS",
	5 * 60_000
);
export const ROOM_UNREAD_BACKGROUND_JITTER_MS = readPositiveIntFromEnv(
	"VITE_ROOM_UNREAD_BACKGROUND_JITTER_MS",
	4_000
);
export const ROOM_UNREAD_MAX_CONCURRENCY = Math.max(
	1,
	readPositiveIntFromEnv("VITE_ROOM_UNREAD_MAX_CONCURRENCY", 4)
);
export const ROOM_UNREAD_CACHE_TTL_MS = readPositiveIntFromEnv("VITE_ROOM_UNREAD_CACHE_TTL_MS", 20_000);
export const ROOM_UNREAD_METRICS_SUMMARY_EVERY = Math.max(
	1,
	readPositiveIntFromEnv("VITE_ROOM_UNREAD_METRICS_SUMMARY_EVERY", 6)
);

export const CHAT_MESSAGES_IN_MEMORY_LIMIT = Math.max(
	200,
	readPositiveIntFromEnv("VITE_CHAT_MESSAGES_IN_MEMORY_LIMIT", 450)
);

export const CHAT_MEMORY_METRICS_ENABLED = readBooleanFlagFromEnv("VITE_CHAT_MEMORY_METRICS_ENABLED", false);
export const CHAT_MEMORY_METRICS_EVERY = Math.max(
	1,
	readPositiveIntFromEnv("VITE_CHAT_MEMORY_METRICS_EVERY", 20)
);
