import type { FastifyInstance } from "fastify";

export function createRealtimeAuditLogger(fastify: FastifyInstance) {
  const wsCallDebugEnabled = process.env.WS_CALL_DEBUG === "1";

  const logCallDebug = (message: string, meta: Record<string, unknown> = {}) => {
    if (!wsCallDebugEnabled) {
      return;
    }

    fastify.log.info(
      {
        scope: "ws-call",
        ...meta
      },
      message
    );
  };

  const logWsConnectionFailed = (error: unknown) => {
    fastify.log.error(error, "ws connection failed");
  };

  const logWsMessageHandlingFailed = (error: unknown) => {
    fastify.log.error(error, "ws message handling failed");
  };

  return {
    logCallDebug,
    logWsConnectionFailed,
    logWsMessageHandlingFailed
  };
}
