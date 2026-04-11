import type { ReactNode } from "react";
import { createElement } from "react";

export type MentionUser = { label: string; handle: string; userId?: string };

export const renderMessageText = (
  value: string,
  resolveMentionUser: (handle: string) => MentionUser | null,
  onMentionClick: (input: MentionUser) => void
): ReactNode[] => {
  const text = String(value || "");
  const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
  const mentionPattern = /(^|\s)(@[\p{L}\p{N}._-]{2,32})/gu;
  const result: ReactNode[] = [];
  let keyIndex = 0;

  let textCursor = 0;
  let linkMatch: RegExpExecArray | null;
  urlPattern.lastIndex = 0;

  while ((linkMatch = urlPattern.exec(text)) !== null) {
    const raw = linkMatch[0];
    const start = linkMatch.index;
    if (start > textCursor) {
      result.push(text.slice(textCursor, start));
    }

    let linkText = raw;
    let trailing = "";
    while (/[.,!?;:)\]]$/.test(linkText)) {
      trailing = linkText.slice(-1) + trailing;
      linkText = linkText.slice(0, -1);
    }

    if (linkText) {
      const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
      result.push(
        createElement(
          "a",
          {
            key: `link-${keyIndex}-${start}-${linkText}`,
            href,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "chat-link"
          },
          linkText
        )
      );
      keyIndex += 1;
    }

    if (trailing) {
      result.push(trailing);
    }

    textCursor = start + raw.length;
  }

  if (textCursor < text.length) {
    result.push(text.slice(textCursor));
  }

  const withMentions: ReactNode[] = [];
  let mentionKeyIndex = 0;

  const pushSegmentWithMentions = (segment: string) => {
    if (!segment) {
      return;
    }

    let cursor = 0;
    let mentionMatch: RegExpExecArray | null;
    mentionPattern.lastIndex = 0;

    while ((mentionMatch = mentionPattern.exec(segment)) !== null) {
      const leading = mentionMatch[1] || "";
      const mention = mentionMatch[2] || "";
      const absoluteStart = mentionMatch.index + leading.length;

      if (absoluteStart > cursor) {
        withMentions.push(segment.slice(cursor, absoluteStart));
      }

      withMentions.push(
        (() => {
          const normalizedHandle = mention.slice(1).toLowerCase();
          const mentionUser = resolveMentionUser(normalizedHandle);
          if (mentionUser) {
            return createElement(
              "button",
              {
                key: `mention-${mentionKeyIndex}-${absoluteStart}`,
                type: "button",
                className: "chat-mention chat-mention-btn",
                onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onMentionClick(mentionUser);
                }
              },
              mention
            );
          }

          return createElement(
            "span",
            {
              key: `mention-${mentionKeyIndex}-${absoluteStart}`,
              className: "chat-mention"
            },
            mention
          );
        })()
      );
      mentionKeyIndex += 1;
      cursor = absoluteStart + mention.length;
    }

    if (cursor < segment.length) {
      withMentions.push(segment.slice(cursor));
    }
  };

  (result.length > 0 ? result : [text]).forEach((chunk) => {
    if (typeof chunk === "string") {
      pushSegmentWithMentions(chunk);
      return;
    }

    withMentions.push(chunk);
  });

  const withFormatting: ReactNode[] = [];
  let formatKeyIndex = 0;
  const formattingPattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\|\|[^|\n]+\|\|)/g;

  const pushSegmentWithFormatting = (segment: string) => {
    if (!segment) {
      return;
    }

    let cursor = 0;
    formattingPattern.lastIndex = 0;
    let formatMatch: RegExpExecArray | null;

    while ((formatMatch = formattingPattern.exec(segment)) !== null) {
      const token = formatMatch[0] || "";
      const start = formatMatch.index;
      if (start > cursor) {
        withFormatting.push(segment.slice(cursor, start));
      }

      if (token.startsWith("**") && token.endsWith("**")) {
        withFormatting.push(
          createElement(
            "strong",
            { key: `fmt-bold-${formatKeyIndex}-${start}`, className: "chat-format-bold" },
            token.slice(2, -2)
          )
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        withFormatting.push(
          createElement(
            "em",
            { key: `fmt-italic-${formatKeyIndex}-${start}`, className: "chat-format-italic" },
            token.slice(1, -1)
          )
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        withFormatting.push(
          createElement(
            "code",
            { key: `fmt-code-${formatKeyIndex}-${start}`, className: "chat-format-code" },
            token.slice(1, -1)
          )
        );
      } else if (token.startsWith("||") && token.endsWith("||")) {
        withFormatting.push(
          createElement(
            "span",
            { key: `fmt-spoiler-${formatKeyIndex}-${start}`, className: "chat-format-spoiler" },
            token.slice(2, -2)
          )
        );
      } else {
        withFormatting.push(token);
      }

      formatKeyIndex += 1;
      cursor = start + token.length;
    }

    if (cursor < segment.length) {
      withFormatting.push(segment.slice(cursor));
    }
  };

  (withMentions.length > 0 ? withMentions : [text]).forEach((chunk) => {
    if (typeof chunk === "string") {
      pushSegmentWithFormatting(chunk);
      return;
    }

    withFormatting.push(chunk);
  });

  return withFormatting.length > 0 ? withFormatting : [text];
};

export const extractFirstLinkPreview = (value: string): { href: string; host: string; path: string } | null => {
  const text = String(value || "");
  const match = text.match(/((https?:\/\/|www\.)[^\s<]+)/i);
  if (!match || !match[0]) {
    return null;
  }

  let raw = match[0];
  while (/[.,!?;:)\]]$/.test(raw)) {
    raw = raw.slice(0, -1);
  }
  if (!raw) {
    return null;
  }

  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(href);
    const normalizedPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    return {
      href,
      host: parsed.host,
      path: normalizedPath.length > 72 ? `${normalizedPath.slice(0, 69)}...` : normalizedPath
    };
  } catch {
    return null;
  }
};
