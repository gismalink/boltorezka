import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { AuthModeResponse } from "../api-contract.types.ts";

export function registerAuthCoreRoutes(fastify: FastifyInstance) {
  fastify.get("/v1/auth/mode", async () => {
    const response: AuthModeResponse = {
      mode: config.authMode,
      ssoBaseUrl: config.authSsoBaseUrl
    };
    return response;
  });

  fastify.post("/v1/auth/register", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local registration is disabled. Use SSO login."
    });
  });

  fastify.post("/v1/auth/login", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local login is disabled. Use SSO login."
    });
  });
}
