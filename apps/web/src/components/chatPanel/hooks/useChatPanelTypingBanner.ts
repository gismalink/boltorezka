/**
 * useChatPanelTypingBanner.ts — хук баннера «... печатает».
 * Агрегирует typing-презенс участников в читаемую строку для текущего топика.
 */
import { useMemo } from "react";

type UseChatPanelTypingBannerArgs = {
  t: (key: string) => string;
  typingUsers: string[];
};

export function useChatPanelTypingBanner({ t, typingUsers }: UseChatPanelTypingBannerArgs) {
  return useMemo(() => {
    const visibleTypingUsers = typingUsers.slice(0, 2);
    const typingOverflowCount = Math.max(0, typingUsers.length - visibleTypingUsers.length);
    const typingUsersLabel = typingOverflowCount > 0
      ? t("chat.typingUsersOverflow")
        .replace("{users}", visibleTypingUsers.join(", "))
        .replace("{count}", String(typingOverflowCount))
      : visibleTypingUsers.join(", ");

    const typingLabel = typingUsers.length <= 1
      ? t("chat.typingSingle").replace("{users}", typingUsersLabel)
      : t("chat.typingMultiple").replace("{users}", typingUsersLabel);

    return {
      hasTypingUsers: typingUsers.length > 0,
      typingLabel
    };
  }, [t, typingUsers]);
}
