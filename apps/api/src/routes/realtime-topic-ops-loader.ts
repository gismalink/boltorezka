import type { NotificationInboxOps, TopicMessageOps } from "../types/chat-handler.types.ts";

let topicMessageOpsPromise: Promise<TopicMessageOps> | null = null;
let topicMessageOpsLoaderForTests: (() => Promise<TopicMessageOps>) | null = null;
let notificationInboxOpsPromise: Promise<NotificationInboxOps> | null = null;
let notificationInboxOpsLoaderForTests: (() => Promise<NotificationInboxOps>) | null = null;

export function setTopicMessageOpsLoaderForTests(loader: (() => Promise<TopicMessageOps>) | null): void {
  topicMessageOpsLoaderForTests = loader;
  topicMessageOpsPromise = null;
}

export function setNotificationInboxOpsLoaderForTests(loader: (() => Promise<NotificationInboxOps>) | null): void {
  notificationInboxOpsLoaderForTests = loader;
  notificationInboxOpsPromise = null;
}

export async function getTopicMessageOps(): Promise<TopicMessageOps> {
  if (topicMessageOpsLoaderForTests) {
    if (!topicMessageOpsPromise) {
      topicMessageOpsPromise = topicMessageOpsLoaderForTests();
    }
    return topicMessageOpsPromise;
  }

  if (!topicMessageOpsPromise) {
    topicMessageOpsPromise = import("../services/room-topic-messages-service.js").then((module) => ({
      createTopicMessage: module.createTopicMessage,
      replyTopicMessage: module.replyTopicMessage,
      setTopicMessagePinned: module.setTopicMessagePinned,
      setTopicMessageReaction: module.setTopicMessageReaction,
      createTopicMessageReport: module.createTopicMessageReport,
      markTopicRead: module.markTopicRead
    }));
  }
  return topicMessageOpsPromise;
}

export async function getNotificationInboxOps(): Promise<NotificationInboxOps> {
  if (notificationInboxOpsLoaderForTests) {
    if (!notificationInboxOpsPromise) {
      notificationInboxOpsPromise = notificationInboxOpsLoaderForTests();
    }
    return notificationInboxOpsPromise;
  }

  if (!notificationInboxOpsPromise) {
    notificationInboxOpsPromise = import("../services/notification-inbox-service.js").then((module) => ({
      emitMentionInboxEvents: module.emitMentionInboxEvents,
      emitReplyInboxEvent: module.emitReplyInboxEvent
    }));
  }

  return notificationInboxOpsPromise;
}
