import webpush from "web-push";
import { db } from "../db.js";
import { config } from "../config.js";

type PushRuntime = "web" | "desktop";

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: string | null;
  runtime: PushRuntime;
};

type PushSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime?: string | null;
  runtime?: PushRuntime;
  userAgent?: string | null;
};

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured || !config.webPushEnabled) {
    return;
  }

  webpush.setVapidDetails(
    config.webPushSubject,
    config.webPushPublicKey,
    config.webPushPrivateKey
  );
  vapidConfigured = true;
}

export function getWebPushPublicConfig() {
  return {
    enabled: config.webPushEnabled,
    publicKey: config.webPushEnabled ? config.webPushPublicKey : null
  };
}

export async function registerNotificationPushSubscription(input: PushSubscriptionInput): Promise<void> {
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.p256dh || "").trim();
  const auth = String(input.auth || "").trim();
  const runtime: PushRuntime = input.runtime === "desktop" ? "desktop" : "web";

  if (!endpoint || !p256dh || !auth) {
    throw new Error("validation_error");
  }

  await db.query(
    `INSERT INTO notification_push_subscriptions (
       user_id, endpoint, p256dh, auth, expiration_time, runtime, user_agent, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       expiration_time = EXCLUDED.expiration_time,
       runtime = EXCLUDED.runtime,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW(),
       last_error = NULL`,
    [
      input.userId,
      endpoint,
      p256dh,
      auth,
      input.expirationTime || null,
      runtime,
      input.userAgent || null
    ]
  );
}

export async function removeNotificationPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const normalizedEndpoint = String(endpoint || "").trim();
  if (!normalizedEndpoint) {
    throw new Error("validation_error");
  }

  const deleted = await db.query(
    `DELETE FROM notification_push_subscriptions
     WHERE user_id = $1
       AND endpoint = $2`,
    [userId, normalizedEndpoint]
  );

  return (deleted.rowCount || 0) > 0;
}

async function loadUserPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const result = await db.query<PushSubscriptionRow>(
    `SELECT id, user_id, endpoint, p256dh, auth, expiration_time, runtime
     FROM notification_push_subscriptions
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows;
}

async function markPushDeliverySuccess(subscriptionId: string): Promise<void> {
  await db.query(
    `UPDATE notification_push_subscriptions
     SET last_success_at = NOW(),
         last_error_at = NULL,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId]
  );
}

async function markPushDeliveryError(subscriptionId: string, errorMessage: string): Promise<void> {
  await db.query(
    `UPDATE notification_push_subscriptions
     SET last_error_at = NOW(),
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId, String(errorMessage || "unknown_error").slice(0, 800)]
  );
}

async function removePushSubscriptionById(subscriptionId: string): Promise<void> {
  await db.query(
    `DELETE FROM notification_push_subscriptions WHERE id = $1`,
    [subscriptionId]
  );
}

export async function sendInboxPushEvent(input: {
  userId: string;
  eventId: string;
  title: string;
  body: string;
  priority: "normal" | "critical";
  roomSlug?: string | null;
  topicId?: string | null;
  messageId?: string | null;
}): Promise<void> {
  if (!config.webPushEnabled) {
    return;
  }

  ensureVapidConfigured();
  const subscriptions = await loadUserPushSubscriptions(input.userId);
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    eventId: input.eventId,
    title: input.title,
    body: input.body,
    priority: input.priority,
    roomSlug: input.roomSlug || null,
    topicId: input.topicId || null,
    messageId: input.messageId || null,
    ts: new Date().toISOString()
  });

  const urgency = input.priority === "critical" ? "high" : "normal";

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expiration_time ? new Date(subscription.expiration_time).getTime() : null,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        payload,
        {
          TTL: 60,
          urgency
        }
      );

      await markPushDeliverySuccess(subscription.id);
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: unknown })?.statusCode || 0);
      const errorMessage = error instanceof Error ? error.message : String(error || "push_send_failed");

      if (statusCode === 404 || statusCode === 410) {
        await removePushSubscriptionById(subscription.id);
        continue;
      }

      await markPushDeliveryError(subscription.id, errorMessage);
    }
  }
}
