import type { RedisClientType } from "redis";
import type { UserRow } from "./db.types.ts";

type AppRedisClient = ReturnType<typeof import("redis").createClient>;

declare module "fastify" {
	interface FastifyInstance {
		jwtExpiresIn: string;
		redis: AppRedisClient;
	}

	interface FastifyRequest {
		currentUser?: UserRow;
	}
}

declare module "@fastify/jwt" {
	interface FastifyJWT {
		payload: {
			sub?: string;
			email?: string;
			name?: string;
			role?: string;
			authMode?: string;
		};
		user: {
			sub?: string;
			email?: string;
			name?: string;
			role?: string;
			authMode?: string;
		};
	}
}
