import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { requireAuth, requireServiceAccess } from "../middleware/auth.js";
import { buildChatMessageEnvelope } from "../ws-protocol.js";
import type {
  ChatUploadFinalizeResponse,
  ChatUploadInitResponse
} from "../api-contract.types.ts";
import type {
  MessageAttachmentRow,
  RoomMessageRow,
  RoomRow,
  UserRow
} from "../db.types.ts";

type UploadReservation = {
  uploadId: string;
  uploadSig: string;
  userId: string;
  roomId: string;
  roomSlug: string;
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

const initUploadSchema = z.object({
  roomSlug: z.string().trim().min(1).max(128),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024)
});

const finalizeUploadSchema = z.object({
  uploadId: z.string().trim().uuid(),
  roomSlug: z.string().trim().min(1).max(128),
  storageKey: z.string().trim().min(4).max(512),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  text: z.string().trim().max(20000).optional().default(""),
  downloadUrl: z.string().trim().url().max(2048).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  checksum: z.string().trim().max(512).optional()
});

function normalizeMimeType(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function buildStorageKey(roomSlug: string, userId: string, mimeType: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("gif")
      ? "gif"
      : mimeType.includes("webp")
        ? "webp"
        : "jpg";

  return `chat/${yyyy}/${mm}/${dd}/${roomSlug}/${userId}/${randomUUID()}.${ext}`;
}

function buildUploadUrl(uploadId: string, uploadSig: string): string {
  return `/v1/chat/uploads/${encodeURIComponent(uploadId)}?sig=${encodeURIComponent(uploadSig)}`;
}

function localObjectPath(storageKey: string): string {
  const normalizedKey = String(storageKey || "").replace(/^\/+/, "").replace(/\.\./g, "");
  return path.resolve(process.cwd(), "public", "uploads", normalizedKey);
}

function buildDownloadUrl(storageKey: string, explicitDownloadUrl: string | undefined): string | null {
  if (explicitDownloadUrl) {
    return explicitDownloadUrl;
  }

  if (!config.chatObjectStoragePublicBaseUrl) {
    return null;
  }

  const encodedKey = storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${config.chatObjectStoragePublicBaseUrl}/${encodedKey}`;
}

export async function chatUploadsRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser(/^image\//i, { parseAs: "buffer" }, (_request, body, done) => {
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

      const absolutePath = localObjectPath(reservation.storageKey);
      const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
      if (!absolutePath.startsWith(uploadsRoot)) {
        return reply.code(400).send({
          error: "UploadPathInvalid",
          message: "Upload path is invalid"
        });
      }

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, body);

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
    "/v1/chat/uploads/init",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request, reply) => {
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
        `SELECT id, slug, title, kind, audio_quality_override, category_id, position, is_public
         FROM rooms
         WHERE slug = $1 AND is_archived = FALSE
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

      const uploadId = randomUUID();
      const uploadSig = randomBytes(16).toString("hex");
      const storageKey = buildStorageKey(roomSlug, userId, mimeType);
      const reservation: UploadReservation = {
        uploadId,
        uploadSig,
        userId,
        roomId: room.id,
        roomSlug,
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

      return response;
    }
  );

  fastify.post<{ Body: unknown }>(
    "/v1/chat/uploads/finalize",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request, reply) => {
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
      const requestMimeType = normalizeMimeType(parsed.data.mimeType);
      const requestStorageKey = String(parsed.data.storageKey || "").trim();

      if (
        requestRoomSlug !== reservation.roomSlug
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

      if (parsed.data.checksum && parsed.data.checksum !== uploadedObject.checksum) {
        return reply.code(400).send({
          error: "UploadChecksumMismatch",
          message: "Attachment checksum mismatch"
        });
      }

      const insertedMessage = await db.query<{
        id: string;
        room_id: string;
        user_id: string;
        body: string;
        created_at: string;
      }>(
        `INSERT INTO messages (room_id, user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, room_id, user_id, body, created_at`,
        [reservation.roomId, userId, text]
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
         VALUES ($1, 'image', $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, message_id, type, storage_key, download_url, mime_type, size_bytes, width, height, checksum, created_at`,
        [
          message.id,
          reservation.storageKey,
          downloadUrl,
          reservation.mimeType,
          reservation.sizeBytes,
          typeof parsed.data.width === "number" ? parsed.data.width : null,
          typeof parsed.data.height === "number" ? parsed.data.height : null,
          parsed.data.checksum || uploadedObject.checksum || null
        ]
      );

      await fastify.redis.del(uploadKey);
      await fastify.redis.del(uploadedObjectKey);

      const attachment = insertedAttachment.rows[0];
      const responseMessage: RoomMessageRow = {
        id: message.id,
        room_id: message.room_id,
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

      return response;
    }
  );
}
