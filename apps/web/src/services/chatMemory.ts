import { CHAT_MESSAGES_IN_MEMORY_LIMIT } from "../constants/appConfig";
import type { Message } from "../domain";

export function trimMessagesInMemory(messages: Message[]): Message[] {
  if (messages.length <= CHAT_MESSAGES_IN_MEMORY_LIMIT) {
    return messages;
  }

  return messages.slice(messages.length - CHAT_MESSAGES_IN_MEMORY_LIMIT);
}
