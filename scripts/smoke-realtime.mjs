import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearerToken = process.env.SMOKE_BEARER_TOKEN ?? "";
const preissuedTicket = process.env.SMOKE_WS_TICKET ?? "";
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000);

const isHttp = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
if (!isHttp) {
  console.error(`[smoke:realtime] invalid SMOKE_API_URL: ${baseUrl}`);
  process.exit(1);
}

if (!preissuedTicket && !bearerToken) {
  console.error("[smoke:realtime] set SMOKE_BEARER_TOKEN or SMOKE_WS_TICKET");
  process.exit(1);
}

function toWsUrl(httpUrl) {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
}

async function resolveTicket() {
  if (preissuedTicket) {
    return preissuedTicket;
  }

  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`[smoke:realtime] /v1/auth/ws-ticket failed: ${response.status}`);
  }

  return payload.ticket;
}

function waitForEvent(events, predicate, label) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const hit = events.find(predicate);
      if (hit) {
        clearInterval(timer);
        resolve(hit);
        return;
      }

      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`[smoke:realtime] timeout: ${label}`));
      }
    }, 50);
  });
}

(async () => {
  const ticket = await resolveTicket();
  const wsUrl = toWsUrl(baseUrl);
  wsUrl.pathname = "/v1/realtime/ws";
  wsUrl.search = "";
  wsUrl.searchParams.set("ticket", ticket);

  const ws = new WS(wsUrl.toString());
  const events = [];

  ws.on("message", (raw) => {
    try {
      const value = typeof raw === "string" ? raw : raw.toString("utf8");
      events.push(JSON.parse(value));
    } catch {
      return;
    }
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("[smoke:realtime] websocket open timeout")), timeoutMs);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const requestNack = `nack-${Date.now()}`;
  ws.send(JSON.stringify({ type: "chat.send", requestId: requestNack, payload: { text: "smoke pre-join nack" } }));

  const nack = await waitForEvent(
    events,
    (item) => item?.type === "nack" && item?.payload?.requestId === requestNack,
    "nack before room.join"
  );

  const requestJoin = `join-${Date.now()}`;
  ws.send(JSON.stringify({ type: "room.join", requestId: requestJoin, payload: { roomSlug } }));

  await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestJoin,
    "ack for room.join"
  );

  const idempotencyKey = `idem-${Date.now()}`;
  const requestChat1 = `chat1-${Date.now()}`;

  ws.send(
    JSON.stringify({
      type: "chat.send",
      requestId: requestChat1,
      idempotencyKey,
      payload: { text: `smoke ${new Date().toISOString()}` }
    })
  );

  const firstAck = await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestChat1,
    "ack for first chat.send"
  );

  await waitForEvent(
    events,
    (item) => item?.type === "chat.message" && item?.payload?.senderRequestId === requestChat1,
    "chat.message for first chat.send"
  );

  const requestChat2 = `chat2-${Date.now()}`;
  ws.send(
    JSON.stringify({
      type: "chat.send",
      requestId: requestChat2,
      idempotencyKey,
      payload: { text: "smoke duplicate" }
    })
  );

  const duplicateAck = await waitForEvent(
    events,
    (item) => item?.type === "ack" && item?.payload?.requestId === requestChat2,
    "ack for duplicate chat.send"
  );

  if (duplicateAck?.payload?.duplicate !== true) {
    throw new Error("[smoke:realtime] expected duplicate=true in duplicate ack");
  }

  ws.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        roomSlug,
        nackCode: nack?.payload?.code ?? null,
        firstMessageId: firstAck?.payload?.messageId ?? null,
        duplicateIdempotencyKey: duplicateAck?.payload?.idempotencyKey ?? null
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
