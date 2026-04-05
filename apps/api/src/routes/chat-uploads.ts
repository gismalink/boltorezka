import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { loadCurrentUser, requireAuth, requireRole, requireServiceAccess } from "../middleware/auth.js";
import { buildChatMessageEnvelope } from "../ws-protocol.js";
import {
  ChatObjectStorageNotFoundError,
  createChatObjectStorage
} from "../storage/chat-object-storage.js";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";
import { resolveActiveServerMute } from "../services/server-mute-service.js";
import type {
  ChatUploadFinalizeResponse,
  ChatUploadInitResponse
} from "../api-contract.types.ts";
import type {
  MessageAttachmentRow,
  RoomMessageRow,
  RoomTopicRow,
  RoomRow,
  UserRow
} from "../db.types.ts";

type UploadReservation = {
  uploadId: string;
  uploadSig: string;
  userId: string;
  roomId: string;
  roomSlug: string;
  topicId: string | null;
  topicSlug: string | null;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
};

type UploadedObjectRecord = {
  uploadId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  uploadedAt: string;
};

type UploadRateLimitPolicy = {
  namespace: string;
  max: number;
  windowSec: number;
};

const initUploadSchema = z.object({
  roomSlug: z.string().trim().min(1).max(128),
  topicId: z.string().trim().uuid().optional(),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024)
});

const finalizeUploadSchema = z.object({
  uploadId: z.string().trim().uuid(),
  roomSlug: z.string().trim().min(1).max(128),
  topicId: z.string().trim().uuid().optional(),
  storageKey: z.string().trim().min(4).max(512),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  text: z.string().trim().max(20000).optional().default(""),
  downloadUrl: z.string().trim().url().max(2048).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  checksum: z.string().trim().max(512).optional()
});

const orphanCleanupSchema = z.object({
  prefix: z.string().trim().min(1).max(512).default("chat/"),
  olderThanSec: z.number().int().min(0).max(60 * 60 * 24 * 30).default(3600),
  dryRun: z.boolean().default(true),
  maxScan: z.number().int().min(1).max(10000).default(1000),
  maxDelete: z.number().int().min(1).max(1000).default(200)
});

function normalizeMimeType(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function resolveAttachmentTypeFromMime(mimeType: string): "image" | "document" | "audio" {
  const normalized = normalizeMimeType(mimeType).split(";")[0];
  if (normalized.startsWith("image/")) {
    return "image";
  }

  if (normalized.startsWith("audio/")) {
    return "audio";
  }

  return "document";
}

function buildStorageKey(roomSlug: string, userId: string, mimeType: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const normalizedMime = normalizeMimeType(mimeType).split(";")[0];
  const ext = normalizedMime.includes("png")
    ? "png"
    : normalizedMime.includes("gif")
      ? "gif"
      : normalizedMime.includes("webp")
        ? "webp"
        : normalizedMime.includes("jpeg") || normalizedMime.includes("jpg")
          ? "jpg"
          : normalizedMime.includes("pdf")
            ? "pdf"
            : normalizedMime.includes("zip")
              ? "zip"
              : normalizedMime.includes("json")
                ? "json"
                : normalizedMime.includes("csv")
                  ? "csv"
                  : normalizedMime.includes("plain")
                    ? "txt"
                    : normalizedMime.includes("mpeg") || normalizedMime.includes("mp3")
                      ? "mp3"
                      : normalizedMime.includes("wav")
                        ? "wav"
                        : normalizedMime.includes("ogg")
                          ? "ogg"
                          : normalizedMime.includes("mp4") || normalizedMime.includes("m4a")
                            ? "m4a"
                            : "bin";

  return `chat/${yyyy}/${mm}/${dd}/${roomSlug}/${userId}/${randomUUID()}.${ext}`;
}

function buildUploadUrl(uploadId: string, uploadSig: string): string {
  return `/v1/chat/uploads/${encodeURIComponent(uploadId)}?sig=${encodeURIComponent(uploadSig)}`;
}

function buildDownloadUrl(storageKey: string, explicitDownloadUrl: string | undefined): string | null {
  if (explicitDownloadUrl) {
    return explicitDownloadUrl;
  }

  const encodedStorageKey = encodeURIComponent(storageKey);
  const relativeUrl = `/v1/chat/uploads/object?key=${encodedStorageKey}`;

  if (!config.chatObjectStoragePublicBaseUrl) {
    return relativeUrl;
  }

  return `${config.chatObjectStoragePublicBaseUrl}${relativeUrl}`;
}

function buildUploadAuditContext(request: FastifyRequest, extra: Record<string, unknown> = {}) {
  const requestId = String(request.id || "").trim() || null;
  const userId = String(request.user?.sub || "").trim() || null;
  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim() || null;
  const userAgent = String(request.headers["user-agent"] || "").trim() || null;

  return {
    requestId,
    userId,
    ip,
    userAgent,
    ...extra
  };
}

function resolveUploadRateLimitSubject(request: FastifyRequest): string {
  const userId = String(request.user?.sub || "").trim();
  if (userId) {
    return `u:${userId}`;
  }

  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
  return `ip:${ip || "unknown"}`;
}

async function canBypassRoomSendPolicy(userId: string, serverId: string | null): Promise<boolean> {
  const globalRoleResult = await db.query<{ role: string }>(
    `SELECT role
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [userId]
  );

  const globalRole = String(globalRoleResult.rows[0]?.role || "").trim();
  if (globalRole === "admin" || globalRole === "super_admin") {
    return true;
  }

  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) {
    return false;
  }

  const membership = await db.query<{ role: string }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [normalizedServerId, userId]
  );

  const serverRole = String(membership.rows[0]?.role || "").trim();
  return serverRole === "owner" || serverRole === "admin";
}

export async function chatUploadsRoutes(fastify: FastifyInstance) {
  const chatObjectStorage = createChatObjectStorage(config);
  const UPLOAD_RATE_LIMIT_PREFIX = "chat:upload:rl:";

  const incrementStorageMetricBy = async (name: string, value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const delta = Math.trunc(value);
    if (delta === 0) {
      return;
    }

    const day = new Date().toISOString().slice(0, 10);
    try {
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, delta);
    } catch {
      // Metrics are best-effort and must not affect upload flow.
    }
  };

  const incrementStorageMetric = async (name: string) => {
    await incrementStorageMetricBy(name, 1);
  };

  const makeUploadRateLimiter = (policy: UploadRateLimitPolicy) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const nowWindow = Math.floor(Date.now() / 1000 / policy.windowSec);
      const key = `${UPLOAD_RATE_LIMIT_PREFIX}${policy.namespace}:${resolveUploadRateLimitSubject(request)}:${nowWindow}`;

      const current = await fastify.redis.incr(key);
      if (current === 1) {
        await fastify.redis.expire(key, policy.windowSec);
      }

      if (current > policy.max) {
        request.log.warn(
          buildUploadAuditContext(request, {
            event: "chat.upload.rate_limit.exceeded",
            namespace: policy.namespace,
            limit: policy.max,
            windowSec: policy.windowSec,
            current
          }),
          "chat upload rate limit exceeded"
        );
        reply.header("Retry-After", String(policy.windowSec));
        return reply.code(429).send({
          error: "RateLimitExceeded",
          message: `Too many requests for ${policy.namespace}`
        });
      }

      return undefined;
    };
  };

  const limitUploadInit = makeUploadRateLimiter({
    namespace: "init",
    max: 60,
    windowSec: 60
  });
  const limitUploadFinalize = makeUploadRateLimiter({
    namespace: "finalize",
    max: 60,
    windowSec: 60
  });

  const checkRoomSendPolicy = async (room: Pick<RoomRow, "id" | "server_id" | "is_readonly" | "slowmode_seconds">, userId: string) => {
    const canBypass = await canBypassRoomSendPolicy(userId, room.server_id || null);
    if (!canBypass && room.server_id) {
      const muteState = await resolveActiveServerMute(room.server_id, userId);
      if (muteState.isMuted) {
        return {
          allowed: false as const,
          statusCode: 403,
          payload: {
            error: "ServerMemberMuted",
            message: "You are muted in this server",
            mutedUntil: muteState.expiresAt,
            retryAfterSec: muteState.retryAfterSec
          }
        };
      }
    }

    if (room.is_readonly && !canBypass) {
      return {
        allowed: false as const,
        statusCode: 403,
        payload: {
          error: "RoomReadOnly",
          message: "Room is read-only"
        }
      };
    }

    const slowmodeSeconds = Number(room.slowmode_seconds || 0);
    if (slowmodeSeconds > 0 && !canBypass) {
      const slowmodeKey = `room:slowmode:${room.id}:${userId}`;
      const cooldownRaw = await fastify.redis.get(slowmodeKey);
      if (cooldownRaw) {
        const retryAfterSec = Math.max(1, Number.parseInt(cooldownRaw, 10) || slowmodeSeconds);
        return {
          allowed: false as const,
          statusCode: 429,
          payload: {
            error: "SlowmodeActive",
            message: "Slowmode is active",
            retryAfterSec
          }
        };
      }
    }

    return {
      allowed: true as const,
      canBypass,
      slowmodeSeconds
    };
  };

  fastify.get<{
    Querystring: { key?: string };
  }>(
    "/v1/chat/uploads/object",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request, reply) => {
      const encodedKey = String(request.query?.key || "").trim();
      if (!encodedKey) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "key query parameter is required"
        });
      }

      let storageKey = "";
      try {
        storageKey = decodeURIComponent(encodedKey);
      } catch {
        return reply.code(400).send({
          error: "ValidationError",
          message: "key query parameter is invalid"
        });
      }

      const attachmentResult = await db.query<{
        id: string;
        mime_type: string;
      }>(
        `SELECT id, mime_type
         FROM message_attachments
         WHERE storage_key = $1
         LIMIT 1`,
        [storageKey]
      );

      if ((attachmentResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "AttachmentNotFound",
          message: "Attachment does not exist"
        });
      }

      try {
        const object = await chatObjectStorage.getObject(storageKey);
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        reply.header("Content-Type", object.mimeType || attachmentResult.rows[0].mime_type || "application/octet-stream");
        return reply.send(object.buffer);
      } catch (error) {
        if (!(error instanceof ChatObjectStorageNotFoundError)) {
          request.log.error({ err: error, storageKey }, "chat upload object read failed");
        }

        return reply.code(404).send({
          error: "AttachmentObjectMissing",
          message: "Attachment object is missing"
        });
      }
    }
  );

  fastify.addContentTypeParser(/^(image|audio)\//i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
  fastify.addContentTypeParser(/^application\/(pdf|zip|x-zip-compressed|msword|vnd\.|octet-stream|rtf|xml|x-rar-compressed)/i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
  fastify.addContentTypeParser(/^text\/(plain|csv)/i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  fastify.put<{
    Params: { uploadId: string };
    Querystring: { sig?: string };
    Body: Buffer;
  }>(
    "/v1/chat/uploads/:uploadId",
    {
      bodyLimit: config.chatUploadMaxSizeBytes
    },
    async (request, reply) => {
      const uploadId = String(request.params.uploadId || "").trim();
      const sig = String(request.query?.sig || "").trim();
      if (!uploadId || !sig) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "uploadId and signature are required"
        });
      }

      const reservationKey = `chat:upload:init:${uploadId}`;
      const rawReservation = await fastify.redis.get(reservationKey);
      if (!rawReservation) {
        return reply.code(404).send({
          error: "UploadReservationNotFound",
          message: "Upload reservation is missing or expired"
        });
      }

      let reservation: UploadReservation | null = null;
      try {
        reservation = JSON.parse(rawReservation) as UploadReservation;
      } catch {
        await fastify.redis.del(reservationKey);
        return reply.code(400).send({
          error: "UploadReservationInvalid",
          message: "Upload reservation is invalid"
        });
      }

      if (!reservation || reservation.uploadSig !== sig) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Upload signature is invalid"
        });
      }

      const incomingMimeType = normalizeMimeType(request.headers["content-type"] || "");
      const mimeType = incomingMimeType.split(";")[0] || incomingMimeType;
      if (!mimeType || mimeType !== reservation.mimeType) {
        return reply.code(400).send({
          error: "UploadMimeMismatch",
          message: "Upload mime type does not match reservation"
        });
      }

      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
      if (body.length <= 0) {
        return reply.code(400).send({
          error: "UploadBodyEmpty",
          message: "Upload body is empty"
        });
      }

      if (body.length !== reservation.sizeBytes) {
        return reply.code(400).send({
          error: "UploadSizeMismatch",
          message: "Upload size does not match reservation"
        });
      }

      try {
        await chatObjectStorage.putObject(reservation.storageKey, body, reservation.mimeType);
        void incrementStorageMetric("chat_storage_put_ok");
        request.log.info(
          buildUploadAuditContext(request, {
            event: "chat.upload.put",
            status: "ok",
            provider: config.chatStorageProvider,
            uploadId,
            roomSlug: reservation.roomSlug,
            storageKey: reservation.storageKey,
            sizeBytes: body.length,
            mimeType: reservation.mimeType
          }),
          "chat upload object stored"
        );
      } catch (error) {
        void incrementStorageMetric("chat_storage_put_fail");
        request.log.error({ err: error, storageKey: reservation.storageKey }, "chat upload object write failed");
        request.log.warn(
          buildUploadAuditContext(request, {
            event: "chat.upload.put",
            status: "fail",
            provider: config.chatStorageProvider,
            uploadId,
            roomSlug: reservation.roomSlug,
            storageKey: reservation.storageKey,
            sizeBytes: body.length,
            mimeType: reservation.mimeType
          }),
          "chat upload object store failed"
        );
        return reply.code(500).send({
          error: "UploadStoreFailed",
          message: "Failed to store uploaded object"
        });
      }

      const uploadedObject: UploadedObjectRecord = {
        uploadId,
        storageKey: reservation.storageKey,
        mimeType: reservation.mimeType,
        sizeBytes: body.length,
        checksum: createHash("sha256").update(body).digest("hex"),
        uploadedAt: new Date().toISOString()
      };

      await fastify.redis.setEx(
        `chat:upload:stored:${uploadId}`,
        config.chatUploadInitTtlSec,
        JSON.stringify(uploadedObject)
      );

      return reply.code(204).send();
    }
  );

  fastify.post<{ Body: unknown }>(
    "/v1/admin/chat/uploads/orphan-cleanup",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const parsed = orphanCleanupSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const now = Date.now();
      const olderThanMs = parsed.data.olderThanSec * 1000;
      const listedObjects = await chatObjectStorage.listObjectsByPrefix(parsed.data.prefix, parsed.data.maxScan);

      const eligibleObjects = listedObjects.filter((item) => {
        if (!item.lastModifiedAt) {
          return true;
        }

        const lastModifiedMs = Date.parse(item.lastModifiedAt);
        if (!Number.isFinite(lastModifiedMs)) {
          return true;
        }

        return now - lastModifiedMs >= olderThanMs;
      });

      const storageKeys = eligibleObjects.map((item) => item.storageKey);
      let referencedKeys = new Set<string>();
      if (storageKeys.length > 0) {
        const referencedResult = await db.query<{ storage_key: string }>(
          `SELECT storage_key
             FROM message_attachments
            WHERE storage_key = ANY($1::text[])`,
          [storageKeys]
        );

        referencedKeys = new Set(
          referencedResult.rows
            .map((row) => String(row.storage_key || "").trim())
            .filter(Boolean)
        );
      }

      const orphanKeys = storageKeys.filter((key) => !referencedKeys.has(key));
      const candidateDeleteKeys = orphanKeys.slice(0, parsed.data.maxDelete);

      const deletedKeys: string[] = [];
      const failedDeleteKeys: string[] = [];

      if (!parsed.data.dryRun) {
        for (const storageKey of candidateDeleteKeys) {
          try {
            await chatObjectStorage.deleteObject(storageKey);
            deletedKeys.push(storageKey);
          } catch (error) {
            failedDeleteKeys.push(storageKey);
            request.log.error({ err: error, storageKey }, "chat orphan cleanup delete failed");
          }
        }

        if (deletedKeys.length > 0) {
          void incrementStorageMetricBy("chat_storage_orphan_deleted", deletedKeys.length);
        }
        if (failedDeleteKeys.length > 0) {
          void incrementStorageMetricBy("chat_storage_orphan_delete_fail", failedDeleteKeys.length);
        }
      }

      return reply.send({
        provider: config.chatStorageProvider,
        dryRun: parsed.data.dryRun,
        prefix: parsed.data.prefix,
        olderThanSec: parsed.data.olderThanSec,
        scannedCount: listedObjects.length,
        eligibleCount: eligibleObjects.length,
        referencedCount: referencedKeys.size,
        orphanCount: orphanKeys.length,
        deleteLimit: parsed.data.maxDelete,
        deletedCount: deletedKeys.length,
        failedDeleteCount: failedDeleteKeys.length,
        deletedKeys: deletedKeys.slice(0, 20),
        failedDeleteKeys: failedDeleteKeys.slice(0, 20),
        sampleOrphanKeys: orphanKeys.slice(0, 20)
      });
    }
  );

  fastify.post<{ Body: unknown }>(
    "/v1/chat/uploads/init",
    {
      preHandler: [requireAuth, requireServiceAccess, limitUploadInit]
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const parsed = initUploadSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid auth session is required"
        });
      }

      const roomSlug = String(parsed.data.roomSlug || "").trim();
      const topicId = typeof parsed.data.topicId === "string" ? parsed.data.topicId.trim() : "";
      const mimeType = normalizeMimeType(parsed.data.mimeType);
      const sizeBytes = parsed.data.sizeBytes;

      if (!config.chatUploadAllowedMimeTypes.includes(mimeType)) {
        return reply.code(400).send({
          error: "UnsupportedMimeType",
          message: "Unsupported attachment mime type"
        });
      }

      if (sizeBytes > config.chatUploadMaxSizeBytes) {
        return reply.code(400).send({
          error: "AttachmentTooLarge",
          message: "Attachment size exceeds server limit"
        });
      }

      const roomResult = await db.query<RoomRow>(
        `SELECT r.id, r.slug, r.title, r.kind, r.audio_quality_override, r.is_readonly, r.slowmode_seconds, r.category_id, r.position, r.is_public, r.is_hidden, r.server_id, r.nsfw
         FROM rooms r
         LEFT JOIN servers s ON s.id = r.server_id
         WHERE r.slug = $1
           AND r.is_archived = FALSE
           AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))
         LIMIT 1`,
        [roomSlug]
      );

      if ((roomResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];

      let topic: Pick<RoomTopicRow, "id" | "slug" | "room_id" | "archived_at"> | null = null;
      if (topicId) {
        const topicResult = await db.query<Pick<RoomTopicRow, "id" | "slug" | "room_id" | "archived_at">>(
          `SELECT id, slug, room_id, archived_at
           FROM room_topics
           WHERE id = $1
           LIMIT 1`,
          [topicId]
        );

        if ((topicResult.rowCount || 0) === 0) {
          return reply.code(404).send({
            error: "TopicNotFound",
            message: "Topic does not exist"
          });
        }

        topic = topicResult.rows[0];
        if (topic.room_id !== room.id || topic.archived_at) {
          return reply.code(400).send({
            error: "TopicInvalid",
            message: "Topic is archived or does not belong to room"
          });
        }
      }

      if (room.nsfw === true) {
        const serverId = String(room.server_id || "").trim();
        const confirmed = serverId ? await isServerAgeConfirmed(serverId, userId) : false;
        if (!confirmed) {
          return reply.code(403).send({
            error: "AgeVerificationRequired",
            message: "Age verification is required for NSFW access"
          });
        }
      }

      if (room.is_hidden) {
        const visibilityGrant = await db.query(
          `SELECT 1
           WHERE EXISTS (
             SELECT 1 FROM room_visibility_grants
             WHERE room_id = $1 AND user_id = $2
           )
           OR EXISTS (
             SELECT 1 FROM room_members
             WHERE room_id = $1 AND user_id = $2
           )
           LIMIT 1`,
          [room.id, userId]
        );

        if ((visibilityGrant.rowCount || 0) === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

      if (!room.is_public) {
        const membership = await db.query(
          `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 LIMIT 1`,
          [room.id, userId]
        );
        if ((membership.rowCount || 0) === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

      const sendPolicy = await checkRoomSendPolicy(room, userId);
      if (!sendPolicy.allowed) {
        return reply.code(sendPolicy.statusCode).send(sendPolicy.payload);
      }

      const uploadId = randomUUID();
      const uploadSig = randomBytes(16).toString("hex");
      const storageKey = buildStorageKey(roomSlug, userId, mimeType);
      const reservation: UploadReservation = {
        uploadId,
        uploadSig,
        userId,
        roomId: room.id,
        roomSlug,
        topicId: topic ? topic.id : null,
        topicSlug: topic ? topic.slug : null,
        mimeType,
        sizeBytes,
        storageKey,
        createdAt: new Date().toISOString()
      };

      await fastify.redis.setEx(
        `chat:upload:init:${uploadId}`,
        config.chatUploadInitTtlSec,
        JSON.stringify(reservation)
      );

      const response: ChatUploadInitResponse = {
        uploadId,
        storageKey,
        uploadUrl: buildUploadUrl(uploadId, uploadSig),
        method: "PUT",
        expiresInSec: config.chatUploadInitTtlSec,
        requiredHeaders: {
          "content-type": mimeType
        }
      };

      request.log.info(
        buildUploadAuditContext(request, {
          event: "chat.upload.init",
          status: "ok",
          provider: config.chatStorageProvider,
          uploadId,
          roomSlug,
          storageKey,
          sizeBytes,
          mimeType
        }),
        "chat upload initialized"
      );

      return response;
    }
  );

  fastify.post<{ Body: unknown }>(
    "/v1/chat/uploads/finalize",
    {
      preHandler: [requireAuth, requireServiceAccess, limitUploadFinalize]
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const parsed = finalizeUploadSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid auth session is required"
        });
      }

      const uploadId = parsed.data.uploadId;
      const uploadKey = `chat:upload:init:${uploadId}`;
      const uploadedObjectKey = `chat:upload:stored:${uploadId}`;
      const rawReservation = await fastify.redis.get(uploadKey);
      if (!rawReservation) {
        return reply.code(404).send({
          error: "UploadReservationNotFound",
          message: "Upload reservation is missing or expired"
        });
      }

      const rawUploadedObject = await fastify.redis.get(uploadedObjectKey);
      if (!rawUploadedObject) {
        return reply.code(400).send({
          error: "UploadObjectNotFound",
          message: "Upload object is missing; upload step must complete before finalize"
        });
      }

      let reservation: UploadReservation | null = null;
      try {
        reservation = JSON.parse(rawReservation) as UploadReservation;
      } catch {
        await fastify.redis.del(uploadKey);
        return reply.code(400).send({
          error: "UploadReservationInvalid",
          message: "Upload reservation is invalid"
        });
      }

      if (!reservation || reservation.userId !== userId) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Upload reservation belongs to another user"
        });
      }

      let uploadedObject: UploadedObjectRecord | null = null;
      try {
        uploadedObject = JSON.parse(rawUploadedObject) as UploadedObjectRecord;
      } catch {
        await fastify.redis.del(uploadedObjectKey);
        return reply.code(400).send({
          error: "UploadObjectInvalid",
          message: "Upload object metadata is invalid"
        });
      }

      if (
        !uploadedObject
        || uploadedObject.storageKey !== reservation.storageKey
        || uploadedObject.mimeType !== reservation.mimeType
        || uploadedObject.sizeBytes !== reservation.sizeBytes
      ) {
        return reply.code(400).send({
          error: "UploadObjectMismatch",
          message: "Uploaded object does not match reservation"
        });
      }

      const requestRoomSlug = String(parsed.data.roomSlug || "").trim();
      const requestTopicId = typeof parsed.data.topicId === "string" ? parsed.data.topicId.trim() : null;
      const requestMimeType = normalizeMimeType(parsed.data.mimeType);
      const requestStorageKey = String(parsed.data.storageKey || "").trim();

      if (
        requestRoomSlug !== reservation.roomSlug
        || requestTopicId !== reservation.topicId
        || requestMimeType !== reservation.mimeType
        || parsed.data.sizeBytes !== reservation.sizeBytes
        || requestStorageKey !== reservation.storageKey
      ) {
        return reply.code(400).send({
          error: "UploadFinalizeMismatch",
          message: "Finalize payload does not match upload reservation"
        });
      }

      const currentUserResult = await db.query<UserRow>(
        `SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      if ((currentUserResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "User does not exist"
        });
      }

      const currentUser = currentUserResult.rows[0];
      const text = String(parsed.data.text || "").trim();
      const downloadUrl = buildDownloadUrl(reservation.storageKey, parsed.data.downloadUrl);
      const attachmentType = resolveAttachmentTypeFromMime(reservation.mimeType);
      const width = attachmentType === "image" && typeof parsed.data.width === "number" ? parsed.data.width : null;
      const height = attachmentType === "image" && typeof parsed.data.height === "number" ? parsed.data.height : null;

      const roomPolicyResult = await db.query<Pick<RoomRow, "id" | "server_id" | "is_readonly" | "slowmode_seconds">>(
        `SELECT id, server_id, is_readonly, slowmode_seconds
         FROM rooms
         WHERE id = $1
           AND is_archived = FALSE
         LIMIT 1`,
        [reservation.roomId]
      );
      if ((roomPolicyResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const roomPolicy = roomPolicyResult.rows[0];
      const sendPolicy = await checkRoomSendPolicy(roomPolicy, userId);
      if (!sendPolicy.allowed) {
        return reply.code(sendPolicy.statusCode).send(sendPolicy.payload);
      }

      try {
        const objectStat = await chatObjectStorage.statObject(reservation.storageKey);
        if (objectStat.sizeBytes !== reservation.sizeBytes) {
          throw new Error("size_mismatch");
        }

        if (objectStat.mimeType) {
          const objectMimeType = normalizeMimeType(objectStat.mimeType).split(";")[0];
          if (objectMimeType && objectMimeType !== reservation.mimeType) {
            throw new Error("mime_mismatch");
          }
        }
      } catch (error) {
        if (!(error instanceof ChatObjectStorageNotFoundError)) {
          request.log.error({ err: error, storageKey: reservation.storageKey }, "chat upload object stat failed");
        }

        return reply.code(400).send({
          error: "UploadObjectMissing",
          message: "Uploaded object is missing or corrupted"
        });
      }

      if (parsed.data.checksum && parsed.data.checksum !== uploadedObject.checksum) {
        return reply.code(400).send({
          error: "UploadChecksumMismatch",
          message: "Attachment checksum mismatch"
        });
      }

      const insertedMessage = await db.query<{
        id: string;
        room_id: string;
        topic_id: string | null;
        user_id: string;
        body: string;
        created_at: string;
      }>(
        `INSERT INTO messages (room_id, topic_id, user_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, room_id, topic_id, user_id, body, created_at`,
        [reservation.roomId, reservation.topicId, userId, text]
      );

      const message = insertedMessage.rows[0];

      const insertedAttachment = await db.query<MessageAttachmentRow>(
        `INSERT INTO message_attachments (
           message_id,
           type,
           storage_key,
           download_url,
           mime_type,
           size_bytes,
           width,
           height,
           checksum
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, message_id, type, storage_key, download_url, mime_type, size_bytes, width, height, checksum, created_at`,
        [
          message.id,
          attachmentType,
          reservation.storageKey,
          downloadUrl,
          reservation.mimeType,
          reservation.sizeBytes,
          width,
          height,
          parsed.data.checksum || uploadedObject.checksum || null
        ]
      );

      await fastify.redis.del(uploadKey);
      await fastify.redis.del(uploadedObjectKey);

      if (sendPolicy.slowmodeSeconds > 0 && !sendPolicy.canBypass) {
        await fastify.redis.setEx(
          `room:slowmode:${reservation.roomId}:${userId}`,
          sendPolicy.slowmodeSeconds,
          String(sendPolicy.slowmodeSeconds)
        );
      }

      const attachment = insertedAttachment.rows[0];
      const responseMessage: RoomMessageRow = {
        id: message.id,
        room_id: message.room_id,
        topic_id: message.topic_id,
        user_id: message.user_id,
        text: message.body,
        created_at: message.created_at,
        edited_at: null,
        user_name: currentUser.name,
        attachments: [attachment]
      };

      const wsPayload = {
        id: message.id,
        roomId: message.room_id,
        roomSlug: reservation.roomSlug,
        topicId: reservation.topicId,
        topicSlug: reservation.topicSlug,
        userId: message.user_id,
        userName: currentUser.name,
        text: message.body,
        createdAt: message.created_at,
        senderRequestId: null,
        attachments: [
          {
            id: attachment.id,
            type: attachment.type,
            storageKey: attachment.storage_key,
            downloadUrl: attachment.download_url,
            mimeType: attachment.mime_type,
            sizeBytes: attachment.size_bytes,
            width: attachment.width,
            height: attachment.height,
            checksum: attachment.checksum
          }
        ]
      };

      broadcastRealtimeEnvelope(buildChatMessageEnvelope(wsPayload));

      const response: ChatUploadFinalizeResponse = {
        message: responseMessage,
        attachment
      };

      request.log.info(
        buildUploadAuditContext(request, {
          event: "chat.upload.finalize",
          status: "ok",
          provider: config.chatStorageProvider,
          uploadId,
          roomSlug: reservation.roomSlug,
          storageKey: reservation.storageKey,
          sizeBytes: reservation.sizeBytes,
          mimeType: reservation.mimeType,
          messageId: message.id
        }),
        "chat upload finalized"
      );

      return response;
    }
  );
}
