/**
 * useChatPanelAttachmentImages.ts — хук предпросмотров изображений в вложениях чата.
 * Строит индекс image-вложений в таймлайне и из по индексу lightbox-галерея выбирает текущее фото.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type UseChatPanelAttachmentImagesArgs = {
  messages: Message[];
  authToken: string;
};

function isProtectedAttachmentObjectUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value.startsWith("/v1/chat/uploads/object")) {
    return true;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname === "/v1/chat/uploads/object";
  } catch {
    return false;
  }
}

export function useChatPanelAttachmentImages({ messages, authToken }: UseChatPanelAttachmentImagesArgs) {
  const [resolvedAttachmentImageUrls, setResolvedAttachmentImageUrls] = useState<Record<string, string>>({});
  const resolvedAttachmentImageUrlsRef = useRef<Record<string, string>>({});

  const protectedAttachmentUrls = useMemo(() => {
    const unique = new Set<string>();

    messages.forEach((message) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      attachments
        .filter((item) => String(item.type || "") === "image")
        .map((item) => String(item.download_url || "").trim())
        .filter((url) => url.length > 0)
        .forEach((url) => {
          if (isProtectedAttachmentObjectUrl(url)) {
            unique.add(url);
          }
        });
    });

    return Array.from(unique);
  }, [messages]);

  useEffect(() => {
    resolvedAttachmentImageUrlsRef.current = resolvedAttachmentImageUrls;
  }, [resolvedAttachmentImageUrls]);

  useEffect(
    () => () => {
      Object.values(resolvedAttachmentImageUrlsRef.current).forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
    },
    []
  );

  useEffect(() => {
    const nextProtected = new Set(protectedAttachmentUrls);

    setResolvedAttachmentImageUrls((prev) => {
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(prev).forEach(([url, blobUrl]) => {
        if (nextProtected.has(url)) {
          next[url] = blobUrl;
          return;
        }

        changed = true;
        URL.revokeObjectURL(blobUrl);
      });

      return changed ? next : prev;
    });

    if (nextProtected.size === 0) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    const load = async (url: string) => {
      if (resolvedAttachmentImageUrlsRef.current[url]) {
        return;
      }

      const headers: Record<string, string> = {};
      if (authToken) {
        headers.authorization = `Bearer ${authToken}`;
      }

      try {
        const response = await fetch(url, {
          credentials: "include",
          headers,
          signal: abortController.signal
        });

        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        setResolvedAttachmentImageUrls((prev) => {
          if (prev[url] === blobUrl) {
            return prev;
          }

          if (prev[url]) {
            URL.revokeObjectURL(prev[url]);
          }

          return {
            ...prev,
            [url]: blobUrl
          };
        });
      } catch {
        // Keep original URL fallback if fetch fails.
      }
    };

    void Promise.all(Array.from(nextProtected).map((url) => load(url)));

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [authToken, protectedAttachmentUrls]);

  const resolveAttachmentImageUrl = (url: string): string => {
    return resolvedAttachmentImageUrls[url] || url;
  };

  return {
    resolveAttachmentImageUrl
  };
}
