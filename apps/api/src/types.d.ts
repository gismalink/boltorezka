import type { RedisClientType } from "redis";
import type { ServerMemberRole, UserRow } from "./db.types.ts";

type AppRedisClient = ReturnType<typeof import("redis").createClient>;

declare module "fastify" {
	interface FastifyInstance {
		jwtExpiresIn: string;
		redis: AppRedisClient;
	}

	interface FastifyRequest {
		currentUser?: UserRow;
		currentServer?: {
			id: string;
			slug: string;
			name: string;
			role: ServerMemberRole;
		};
	}
}

declare module "@fastify/jwt" {
	interface FastifyJWT {
		payload: {
			sub?: string;
			sid?: string;
			email?: string;
			name?: string;
			role?: string;
			authMode?: string;
		};
		user: {
			sub?: string;
			sid?: string;
			email?: string;
			name?: string;
			role?: string;
			authMode?: string;
		};
	}
}
