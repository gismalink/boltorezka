import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserRow } from "../db.types.ts";
import type { LivekitTokenResponse } from "../api-contract.types.ts";
import { enforceServiceAccess } from "./auth-access.js";
import { resolveLivekitClientUrl } from "./auth-livekit.js";

const livekitTokenSchema = z.object({
  roomSlug: z.string().trim().min(1).max(80),
  canPublish: z.boolean().optional().default(true),
  canSubscribe: z.boolean().optional().default(true),
  canPublishData: z.boolean().optional().default(true)
});

export function registerAuthLivekitRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/v1/auth/livekit-token",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.livekitEnabled) {
        return reply.code(503).send({
          error: "LiveKitDisabled",
          message: "LiveKit token minting is disabled for this environment"
        });
      }

      if (!config.livekitApiKey || !config.livekitApiSecret || !config.livekitUrl) {
        return reply.code(503).send({
          error: "LiveKitConfigError",
          message: "LiveKit is not fully configured"
        });
      }

      const parsed = livekitTokenSchema.safeParse(request.body || {});
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
          message: "Valid bearer token is required"
        });
      }

      const currentUser = request.currentUser;
      if (currentUser && !enforceServiceAccess(reply, currentUser)) {
        return;
      }

      const roomResult = await db.query<Pick<UserRow, never> & {
        id: string;
        slug: string;
        title: string;
        is_public: boolean;
      }>(
        `SELECT id, slug, title, is_public
         FROM rooms
         WHERE slug = $1 AND is_archived = FALSE
         LIMIT 1`,
        [parsed.data.roomSlug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];
      if (!room.is_public) {
        const memberResult = await db.query<{ is_member: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM room_members
             WHERE room_id = $1 AND user_id = $2
           ) AS is_member`,
          [room.id, userId]
        );

        if (!memberResult.rows[0]?.is_member) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "Room membership is required"
          });
        }
      }

      const identity = userId;
      const participantName = String(currentUser?.name || currentUser?.email || identity).trim();
      const issuedAt = new Date().toISOString();
      const traceId = randomUUID();

      const accessToken = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity,
        name: participantName,
        ttl: `${config.livekitTokenTtlSec}s`,
        metadata: JSON.stringify({
          userId: identity,
          roomSlug: room.slug,
          issuedAt
        })
      });

      accessToken.addGrant({
        roomJoin: true,
        room: room.slug,
        canPublish: parsed.data.canPublish,
        canSubscribe: parsed.data.canSubscribe,
        canPublishData: parsed.data.canPublishData
      });

      const token = await accessToken.toJwt();
      const response: LivekitTokenResponse = {
        token,
        url: resolveLivekitClientUrl(request),
        room: room.slug,
        roomId: room.id,
        identity,
        expiresInSec: config.livekitTokenTtlSec,
        issuedAt,
        mediaTopology: "livekit",
        traceId
      };

      fastify.log.info(
        {
          userId: identity,
          roomId: room.id,
          roomSlug: room.slug,
          traceId,
          expiresInSec: config.livekitTokenTtlSec,
          canPublish: parsed.data.canPublish,
          canSubscribe: parsed.data.canSubscribe,
          canPublishData: parsed.data.canPublishData
        },
        "livekit token minted"
      );

      return response;
    }
  );
}
