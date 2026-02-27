export type AuthMode = "sso" | "local";

export type AppConfig = {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  authMode: AuthMode;
  authSsoBaseUrl: string;
  allowedReturnHosts: string[];
  superAdminEmail: string;
};
