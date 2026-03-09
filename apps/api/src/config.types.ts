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
  appVersion: string;
  appBuildSha: string;
  apiServeStatic: boolean;
  rtcFeatureInitialStateReplay: boolean;
  rtcMediaTopologyDefault: "p2p" | "sfu" | "livekit";
  rtcMediaTopologySfuRooms: string[];
  rtcMediaTopologySfuUsers: string[];
  rtcMediaTopologyLivekitRooms: string[];
  rtcMediaTopologyLivekitUsers: string[];
  livekitEnabled: boolean;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitTokenTtlSec: number;
};
