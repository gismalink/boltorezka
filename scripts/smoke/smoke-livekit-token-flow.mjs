// Purpose: Validate LiveKit token minting flow for join/reconnect/late-join semantics.

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG ?? "test-room").trim();
const bearer1 = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();
const bearer2 = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND ?? "").trim();
const bearer3 = String(process.env.SMOKE_TEST_BEARER_TOKEN_THIRD ?? "").trim();

if (!bearer1 || !bearer2 || !bearer3) {
  console.error("[smoke:livekit-token-flow] requires SMOKE_TEST_BEARER_TOKEN, _SECOND, _THIRD");
  process.exit(1);
}

if (!roomSlug) {
  console.error("[smoke:livekit-token-flow] SMOKE_ROOM_SLUG is required");
  process.exit(1);
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) {
    throw new Error("invalid JWT format");
  }

  const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4 || 4)) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}

async function mintLivekitToken(bearerToken, label) {
  const response = await fetch(`${baseUrl}/v1/auth/livekit-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ roomSlug })
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(`[smoke:livekit-token-flow] ${label} /v1/auth/livekit-token failed: ${response.status}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(`[smoke:livekit-token-flow] ${label} invalid response payload`);
  }

  const token = String(payload.token || "").trim();
  const url = String(payload.url || "").trim();
  const responseRoom = String(payload.room || "").trim();
  const identity = String(payload.identity || "").trim();
  const expiresInSec = Number(payload.expiresInSec || 0);

  if (!token || !url || !responseRoom || !identity || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
    throw new Error(`[smoke:livekit-token-flow] ${label} response fields are incomplete`);
  }

  if (responseRoom !== roomSlug) {
    throw new Error(`[smoke:livekit-token-flow] ${label} room mismatch responseRoom=${responseRoom} expected=${roomSlug}`);
  }

  const jwtPayload = decodeJwtPayload(token);
  const jwtIdentity = String(jwtPayload?.sub || "").trim();
  const grants = jwtPayload?.video || {};
  const grantRoom = String(grants?.room || "").trim();
  const canJoin = grants?.roomJoin === true;

  if (!jwtIdentity || jwtIdentity !== identity) {
    throw new Error(`[smoke:livekit-token-flow] ${label} identity mismatch jwt=${jwtIdentity || "missing"} response=${identity}`);
  }

  if (!canJoin || grantRoom !== roomSlug) {
    throw new Error(`[smoke:livekit-token-flow] ${label} invalid roomJoin grant`);
  }

  return {
    label,
    token,
    url,
    room: responseRoom,
    identity,
    expiresInSec,
    grantRoom,
    roomJoin: canJoin,
    iat: Number(jwtPayload?.iat || 0),
    exp: Number(jwtPayload?.exp || 0)
  };
}

(async () => {
  const first = await mintLivekitToken(bearer1, "first-join");
  const second = await mintLivekitToken(bearer2, "second-join");

  if (first.identity === second.identity) {
    throw new Error("[smoke:livekit-token-flow] first and second identities must differ");
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const reconnect = await mintLivekitToken(bearer1, "first-reconnect");

  if (reconnect.identity !== first.identity) {
    throw new Error("[smoke:livekit-token-flow] reconnect identity must match first identity");
  }

  if (reconnect.token === first.token) {
    throw new Error("[smoke:livekit-token-flow] reconnect token must be newly minted");
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const lateJoin = await mintLivekitToken(bearer3, "late-join");

  const uniqueIdentities = new Set([first.identity, second.identity, lateJoin.identity]);
  if (uniqueIdentities.size !== 3) {
    throw new Error("[smoke:livekit-token-flow] expected three unique identities for join+late-join");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        roomSlug,
        joinIdentity: first.identity,
        secondIdentity: second.identity,
        reconnectIdentity: reconnect.identity,
        lateJoinIdentity: lateJoin.identity,
        reconnectTokenRotated: reconnect.token !== first.token,
        sameRoomAcrossTokens: [first.room, second.room, reconnect.room, lateJoin.room].every((v) => v === roomSlug),
        oneWayIncidents: null,
        note: "token-flow gate validates join/reconnect/late-join grants; media one-way requires dedicated LiveKit client E2E"
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
