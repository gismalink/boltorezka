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
import {
  deriveAttachmentMetadata,
  enrichMessageAttachmentRow
} from "../chat-attachment-metadata.js";
import { normalizeBoundedString, normalizeOptionalString } from "../validators.js";
import { canBypassRoomSendPolicy } from "../services/room-access-service.js";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";
import { resolveActiveServerMute } from "../services/server-mute-service.js";
import type {
  ChatUploadFinalizeBatchResponse,
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
  sizeBytes: z.number().int().positive()
});

const finalizeUploadSchema = z.object({
  uploadId: z.string().trim().uuid(),
  roomSlug: z.string().trim().min(1).max(128),
  topicId: z.string().trim().uuid().optional(),
  storageKey: z.string().trim().min(4).max(512),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
  text: z.string().trim().max(20000).optional().default(""),
  downloadUrl: z.string().trim().url().max(2048).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  checksum: z.string().trim().max(512).optional()
});

const finalizeBatchUploadSchema = z.object({
  roomSlug: z.string().trim().min(1).max(128),
  topicId: z.string().trim().uuid().optional(),
  text: z.string().trim().max(20000).optional().default(""),
  mentionUserIds: z.array(z.string().trim().uuid()).max(200).optional().default([]),
  uploads: z.array(z.object({
    uploadId: z.string().trim().uuid(),
    storageKey: z.string().trim().min(4).max(512),
    mimeType: z.string().trim().min(1).max(128),
    sizeBytes: z.number().int().positive(),
    downloadUrl: z.string().trim().url().max(2048).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    checksum: z.string().trim().max(512).optional()
  })).min(1).max(12)
});

const orphanCleanupSchema = z.object({
  prefix: z.string().trim().min(1).max(512).default("chat/"),
  olderThanSec: z.number().int().min(0).max(60 * 60 * 24 * 30).default(3600),
  dryRun: z.boolean().default(true),
  maxScan: z.number().int().min(1).max(10000).default(1000),
  maxDelete: z.number().int().min(1).max(1000).default(200)
});

const largeRetentionCleanupSchema = z.object({
  dryRun: z.boolean().default(true),
  thresholdBytes: z.number().int().positive().default(config.chatLargeFileThresholdBytes),
  retentionDays: z.number().int().min(1).max(365).default(config.chatLargeFileRetentionDays),
  maxDelete: z.number().int().min(1).max(1000).default(200)
});

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase();
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
  const requestId = normalizeOptionalString(request.id);
  const userId = normalizeBoundedString(request.user?.sub, 128);
  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim() || null;
  const userAgent = normalizeBoundedString(request.headers["user-agent"], 1024);

  return {
    requestId,
    userId,
    ip,
    userAgent,
    ...extra
  };
}

function buildFinalizeBatchIdempotencyKey(input: {
  userId: string;
  roomSlug: string;
  topicId: string | null;
  text: string;
  mentionUserIds: string[];
  uploads: Array<{
    uploadId: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    checksum?: string;
  }>;
}): string {
  const uploadsSignature = [...input.uploads]
    .map((item) => {
      return [
        String(item.uploadId || "").trim(),
        String(item.storageKey || "").trim(),
        normalizeMimeType(String(item.mimeType || "")),
        String(Number(item.sizeBytes || 0)),
        String(item.checksum || "").trim()
      ].join(":");
    })
    .sort()
    .join("|");

  const mentionsSignature = [...input.mentionUserIds].sort().join("|");
  const source = [
    input.userId,
    input.roomSlug,
    input.topicId || "",
    input.text,
    mentionsSignature,
    uploadsSignature
  ].join("\n");

  return createHash("sha256").update(source).digest("hex");
}

function resolveUploadRateLimitSubject(request: FastifyRequest): string {
  const userId = normalizeBoundedString(request.user?.sub, 128) || "";
  if (userId) {
    return `u:${userId}`;
  }

  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
  return `ip:${ip || "unknown"}`;
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
    const canBypass = await canBypassRoomSendPolicy(db.query.bind(db), userId, room.server_id || null);
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
      const encodedKey = normalizeBoundedString(request.query?.key, 512) || "";
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

      let resolvedMimeType = attachmentResult.rows[0]?.mime_type || "";

      if ((attachmentResult.rowCount || 0) === 0) {
        // Fallback: check DM message attachments (stored in JSONB)
        const dmResult = await db.query<{ id: string; mime_type: string }>(
          `SELECT m.id, elem->>'mime_type' AS mime_type
           FROM dm_messages m, jsonb_array_elements(m.attachments_json) elem
           WHERE elem->>'storage_key' = $1 AND m.deleted_at IS NULL
           LIMIT 1`,
          [storageKey]
        );

        if ((dmResult.rowCount || 0) === 0) {
          return reply.code(404).send({
            error: "AttachmentNotFound",
            message: "Attachment does not exist"
          });
        }

        resolvedMimeType = dmResult.rows[0]?.mime_type || "";
      }

      try {
        const object = await chatObjectStorage.getObject(storageKey);
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        reply.header("Content-Type", object.mimeType || resolvedMimeType || "application/octet-stream");
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
  fastify.addContentTypeParser(/^application\/(pdf|zip|x-zip-compressed|x-7z-compressed|x-rar-compressed|vnd\.rar|gzip|x-gzip|x-tar|msword|vnd\.|octet-stream|rtf|xml|x-msdownload|x-apple-diskimage)/i, { parseAs: "buffer" }, (_request, body, done) => {
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
      const uploadId = normalizeBoundedString(request.params.uploadId, 128) || "";
      const sig = normalizeBoundedString(request.query?.sig, 256) || "";
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
            .map((row) => normalizeBoundedString(row.storage_key, 512) || "")
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
    "/v1/admin/chat/uploads/large-retention-cleanup",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const parsed = largeRetentionCleanupSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const cutoffIso = new Date(Date.now() - parsed.data.retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const candidateResult = await db.query<{
        id: string;
        storage_key: string;
        size_bytes: number;
        size_class: string;
        expires_at: string | null;
        created_at: string;
      }>(
        `SELECT id, storage_key, size_bytes, size_class, expires_at, created_at
           FROM message_attachments
          WHERE (
            (size_class = 'large' AND expires_at IS NOT NULL AND expires_at <= NOW())
            OR (expires_at IS NULL AND size_bytes > $1 AND created_at <= $2::timestamptz)
          )
          ORDER BY COALESCE(expires_at, created_at) ASC
          LIMIT $3`,
        [parsed.data.thresholdBytes, cutoffIso, parsed.data.maxDelete]
      );

      const candidates = candidateResult.rows;
      const deletedObjectKeys: string[] = [];
      const deletedAttachmentIds: string[] = [];
      const failedObjectDeleteKeys: string[] = [];
      const failedDbDeleteIds: string[] = [];

      if (!parsed.data.dryRun) {
        for (const candidate of candidates) {
          const storageKey = normalizeBoundedString(candidate.storage_key, 512) || "";
          if (!storageKey) {
            failedObjectDeleteKeys.push("<invalid-storage-key>");
            continue;
          }

          try {
            await chatObjectStorage.deleteObject(storageKey);
            deletedObjectKeys.push(storageKey);
          } catch (error) {
            failedObjectDeleteKeys.push(storageKey);
            request.log.error({ err: error, storageKey }, "chat large retention object delete failed");
            continue;
          }

          try {
            await db.query(
              `DELETE FROM message_attachments
                WHERE id = $1`,
              [candidate.id]
            );
            deletedAttachmentIds.push(candidate.id);
          } catch (error) {
            failedDbDeleteIds.push(candidate.id);
            request.log.error({ err: error, attachmentId: candidate.id }, "chat large retention attachment delete failed");
          }
        }

        if (deletedObjectKeys.length > 0) {
          void incrementStorageMetricBy("chat_storage_large_retention_object_deleted", deletedObjectKeys.length);
        }
        if (deletedAttachmentIds.length > 0) {
          void incrementStorageMetricBy("chat_storage_large_retention_db_deleted", deletedAttachmentIds.length);
        }
        if (failedObjectDeleteKeys.length > 0) {
          void incrementStorageMetricBy("chat_storage_large_retention_object_delete_fail", failedObjectDeleteKeys.length);
        }
        if (failedDbDeleteIds.length > 0) {
          void incrementStorageMetricBy("chat_storage_large_retention_db_delete_fail", failedDbDeleteIds.length);
        }
      }

      return reply.send({
        provider: config.chatStorageProvider,
        dryRun: parsed.data.dryRun,
        thresholdBytes: parsed.data.thresholdBytes,
        retentionDays: parsed.data.retentionDays,
        cutoffIso,
        scannedCount: candidates.length,
        deleteLimit: parsed.data.maxDelete,
        deletedObjectCount: deletedObjectKeys.length,
        deletedAttachmentCount: deletedAttachmentIds.length,
        failedObjectDeleteCount: failedObjectDeleteKeys.length,
        failedDbDeleteCount: failedDbDeleteIds.length,
        sampleCandidates: candidates.slice(0, 20).map((candidate) => ({
          id: candidate.id,
          storageKey: candidate.storage_key,
          sizeBytes: Number(candidate.size_bytes || 0),
          sizeClass: candidate.size_class,
          expiresAt: candidate.expires_at,
          createdAt: candidate.created_at
        })),
        failedObjectDeleteKeys: failedObjectDeleteKeys.slice(0, 20),
        failedDbDeleteIds: failedDbDeleteIds.slice(0, 20)
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

      const userId = normalizeBoundedString(request.user?.sub, 128) || "";
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid auth session is required"
        });
      }

      const roomSlug = normalizeBoundedString(parsed.data.roomSlug, 128) || "";
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
        request.log.warn(
          buildUploadAuditContext(request, {
            event: "chat.upload.init",
            status: "rejected_too_large",
            roomSlug,
            mimeType,
            sizeBytes,
            maxSizeBytes: config.chatUploadMaxSizeBytes
          }),
          "chat upload rejected by size limit"
        );
        return reply.code(400).send({
          error: "AttachmentTooLarge",
          message: "Attachment size exceeds server limit",
          sizeBytes,
          maxSizeBytes: config.chatUploadMaxSizeBytes
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
        const serverId = normalizeBoundedString(room.server_id, 128) || "";
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

      const userId = normalizeBoundedString(request.user?.sub, 128) || "";
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

      const requestRoomSlug = normalizeBoundedString(parsed.data.roomSlug, 128) || "";
      const requestTopicId = typeof parsed.data.topicId === "string" ? parsed.data.topicId.trim() : null;
      const requestMimeType = normalizeMimeType(parsed.data.mimeType);
      const requestStorageKey = normalizeBoundedString(parsed.data.storageKey, 512) || "";

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
      const text = normalizeBoundedString(parsed.data.text, 20000) || "";
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
      const attachmentMetadata = deriveAttachmentMetadata(reservation.sizeBytes, message.created_at);

      const insertedAttachment = await db.query<MessageAttachmentRow>(
        `INSERT INTO message_attachments (
           message_id,
           type,
           storage_key,
           download_url,
           mime_type,
           size_bytes,
           size_class,
           expires_at,
           width,
           height,
           checksum
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, message_id, type, storage_key, download_url, mime_type, size_bytes, size_class, expires_at, width, height, checksum, created_at`,
        [
          message.id,
          attachmentType,
          reservation.storageKey,
          downloadUrl,
          reservation.mimeType,
          reservation.sizeBytes,
          attachmentMetadata.sizeClass,
          attachmentMetadata.expiresAt,
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

      const attachment = enrichMessageAttachmentRow(insertedAttachment.rows[0]);
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
            sizeClass: attachment.size_class,
            expiresAt: attachment.expires_at,
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

  fastify.post<{ Body: unknown }>(
    "/v1/chat/uploads/finalize-batch",
    {
      preHandler: [requireAuth, requireServiceAccess, limitUploadFinalize]
    },
    async (request, reply) => {
      if (reply.sent) {
        return;
      }

      const parsed = finalizeBatchUploadSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = normalizeBoundedString(request.user?.sub, 128) || "";
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid auth session is required"
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
      const requestRoomSlug = normalizeBoundedString(parsed.data.roomSlug, 128) || "";
      const requestTopicId = typeof parsed.data.topicId === "string" ? parsed.data.topicId.trim() : null;
      const text = normalizeBoundedString(parsed.data.text, 20000) || "";
      const mentionUserIds = Array.isArray(parsed.data.mentionUserIds)
        ? parsed.data.mentionUserIds.map((item) => normalizeBoundedString(item, 128) || "").filter((item) => item.length > 0)
        : [];

      const idempotencyKey = buildFinalizeBatchIdempotencyKey({
        userId,
        roomSlug: requestRoomSlug,
        topicId: requestTopicId,
        text,
        mentionUserIds,
        uploads: parsed.data.uploads
      });
      const idemCacheKey = `chat:upload:finalize-batch:idem:${userId}:${idempotencyKey}`;
      const idemLockKey = `${idemCacheKey}:lock`;
      const idemLockToken = randomUUID();

      const cachedResponseRaw = await fastify.redis.get(idemCacheKey);
      if (cachedResponseRaw) {
        try {
          const cachedResponse = JSON.parse(cachedResponseRaw) as ChatUploadFinalizeBatchResponse;
          request.log.info(
            buildUploadAuditContext(request, {
              event: "chat.upload.finalize_batch",
              status: "idempotency_replay",
              roomSlug: requestRoomSlug,
              topicId: requestTopicId,
              idempotencyKey
            }),
            "chat upload batch finalize replayed"
          );
          return cachedResponse;
        } catch {
          await fastify.redis.del(idemCacheKey);
        }
      }

      const lockAcquired = await fastify.redis.set(idemLockKey, idemLockToken, {
        NX: true,
        EX: 30
      });
      if (lockAcquired !== "OK") {
        reply.header("Retry-After", "1");
        return reply.code(409).send({
          error: "FinalizeInProgress",
          message: "Finalize request is already being processed"
        });
      }

      type PreparedAttachment = {
        uploadId: string;
        reservation: UploadReservation;
        uploadedObject: UploadedObjectRecord;
        attachmentType: "image" | "document" | "audio";
        downloadUrl: string | null;
        width: number | null;
        height: number | null;
        checksum: string | null;
      };

      const prepared: PreparedAttachment[] = [];

      try {

      for (const upload of parsed.data.uploads) {
        const uploadId = upload.uploadId;
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

        const requestMimeType = normalizeMimeType(upload.mimeType);
        const requestStorageKey = normalizeBoundedString(upload.storageKey, 512) || "";
        if (
          requestRoomSlug !== reservation.roomSlug
          || requestTopicId !== reservation.topicId
          || requestMimeType !== reservation.mimeType
          || upload.sizeBytes !== reservation.sizeBytes
          || requestStorageKey !== reservation.storageKey
        ) {
          return reply.code(400).send({
            error: "UploadFinalizeMismatch",
            message: "Finalize payload does not match upload reservation"
          });
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

        if (upload.checksum && upload.checksum !== uploadedObject.checksum) {
          return reply.code(400).send({
            error: "UploadChecksumMismatch",
            message: "Attachment checksum mismatch"
          });
        }

        const attachmentType = resolveAttachmentTypeFromMime(reservation.mimeType);
        prepared.push({
          uploadId,
          reservation,
          uploadedObject,
          attachmentType,
          downloadUrl: buildDownloadUrl(reservation.storageKey, upload.downloadUrl),
          width: attachmentType === "image" && typeof upload.width === "number" ? upload.width : null,
          height: attachmentType === "image" && typeof upload.height === "number" ? upload.height : null,
          checksum: upload.checksum || uploadedObject.checksum || null
        });
      }

      const firstReservation = prepared[0]?.reservation;
      if (!firstReservation) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "At least one upload is required"
        });
      }

      const roomPolicyResult = await db.query<Pick<RoomRow, "id" | "server_id" | "is_readonly" | "slowmode_seconds">>(
        `SELECT id, server_id, is_readonly, slowmode_seconds
         FROM rooms
         WHERE id = $1
           AND is_archived = FALSE
         LIMIT 1`,
        [firstReservation.roomId]
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

      let message: {
        id: string;
        room_id: string;
        topic_id: string | null;
        user_id: string;
        body: string;
        created_at: string;
      } | null = null;
      const insertedAttachments: MessageAttachmentRow[] = [];

      await db.query("BEGIN");
      try {
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
          [firstReservation.roomId, firstReservation.topicId, userId, text]
        );

        message = insertedMessage.rows[0];

        for (const item of prepared) {
          const attachmentMetadata = deriveAttachmentMetadata(item.reservation.sizeBytes, message.created_at);
          const insertedAttachment = await db.query<MessageAttachmentRow>(
            `INSERT INTO message_attachments (
               message_id,
               type,
               storage_key,
               download_url,
               mime_type,
               size_bytes,
               size_class,
               expires_at,
               width,
               height,
               checksum
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, message_id, type, storage_key, download_url, mime_type, size_bytes, size_class, expires_at, width, height, checksum, created_at`,
            [
              message.id,
              item.attachmentType,
              item.reservation.storageKey,
              item.downloadUrl,
              item.reservation.mimeType,
              item.reservation.sizeBytes,
              attachmentMetadata.sizeClass,
              attachmentMetadata.expiresAt,
              item.width,
              item.height,
              item.checksum
            ]
          );
          insertedAttachments.push(enrichMessageAttachmentRow(insertedAttachment.rows[0]));
        }

        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      for (const item of prepared) {
        await fastify.redis.del(`chat:upload:init:${item.uploadId}`);
        await fastify.redis.del(`chat:upload:stored:${item.uploadId}`);
      }

      if (sendPolicy.slowmodeSeconds > 0 && !sendPolicy.canBypass) {
        await fastify.redis.setEx(
          `room:slowmode:${firstReservation.roomId}:${userId}`,
          sendPolicy.slowmodeSeconds,
          String(sendPolicy.slowmodeSeconds)
        );
      }

      const responseMessage: RoomMessageRow = {
        id: String(message?.id || ""),
        room_id: String(message?.room_id || ""),
        topic_id: message?.topic_id || null,
        user_id: String(message?.user_id || ""),
        text: String(message?.body || ""),
        created_at: String(message?.created_at || new Date().toISOString()),
        edited_at: null,
        user_name: currentUser.name,
        attachments: insertedAttachments
      };

      const wsPayload = {
        id: responseMessage.id,
        roomId: responseMessage.room_id,
        roomSlug: firstReservation.roomSlug,
        topicId: firstReservation.topicId,
        topicSlug: firstReservation.topicSlug,
        userId: responseMessage.user_id,
        userName: currentUser.name,
        text: responseMessage.text,
        createdAt: responseMessage.created_at,
        senderRequestId: null,
        attachments: insertedAttachments.map((attachment) => ({
          id: attachment.id,
          type: attachment.type,
          storageKey: attachment.storage_key,
          downloadUrl: attachment.download_url,
          mimeType: attachment.mime_type,
          sizeBytes: attachment.size_bytes,
          sizeClass: attachment.size_class,
          expiresAt: attachment.expires_at,
          width: attachment.width,
          height: attachment.height,
          checksum: attachment.checksum
        })),
        mentionUserIds
      };

      broadcastRealtimeEnvelope(buildChatMessageEnvelope(wsPayload));

      const response: ChatUploadFinalizeBatchResponse = {
        message: responseMessage,
        attachments: insertedAttachments
      };

      request.log.info(
        buildUploadAuditContext(request, {
          event: "chat.upload.finalize_batch",
          status: "ok",
          provider: config.chatStorageProvider,
          roomSlug: firstReservation.roomSlug,
          topicId: firstReservation.topicId,
          uploadCount: insertedAttachments.length,
          messageId: responseMessage.id,
          idempotencyKey
        }),
        "chat upload batch finalized"
      );

      await fastify.redis.setEx(idemCacheKey, config.chatUploadInitTtlSec, JSON.stringify(response));

      return response;
      } finally {
        const activeLockToken = await fastify.redis.get(idemLockKey);
        if (activeLockToken === idemLockToken) {
          await fastify.redis.del(idemLockKey);
        }
      }
    }
  );
}
