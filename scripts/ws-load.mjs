import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const bearerToken = String(process.env.SMOKE_BEARER_TOKEN ?? "").trim();
const bearerTokens = String(process.env.SMOKE_BEARER_TOKENS ?? "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const clientsCount = Math.max(1, Number(process.env.WS_LOAD_CLIENTS ?? 100));
const durationSec = Math.max(10, Number(process.env.WS_LOAD_DURATION_SEC ?? 600));
const messageIntervalSec = Math.max(5, Number(process.env.WS_LOAD_MESSAGE_INTERVAL_SEC ?? 15));
const openTimeoutMs = Math.max(3000, Number(process.env.WS_LOAD_OPEN_TIMEOUT_MS ?? 12000));

if (!/^https?:\/\//.test(baseUrl)) {
  console.error(`[ws-load] invalid SMOKE_API_URL: ${baseUrl}`);
  process.exit(1);
}

if (!bearerToken && bearerTokens.length === 0) {
  console.error("[ws-load] set SMOKE_BEARER_TOKEN or SMOKE_BEARER_TOKENS");
  process.exit(1);
}

const toWsUrl = (httpUrl, ticket) => {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/v1/realtime/ws";
  parsed.search = "";
  parsed.searchParams.set("ticket", ticket);
  return parsed.toString();
};

const fetchJson = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const payload = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })() : null;
  return { response, payload };
};

const resolveTicket = async (token) => {
  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok || !payload?.ticket) {
    throw new Error(`/v1/auth/ws-ticket failed: ${response.status}`);
  }

  return String(payload.ticket);
};

const connectClient = async (index, counters) => {
  const token = bearerTokens.length > 0
    ? bearerTokens[(index - 1) % bearerTokens.length]
    : bearerToken;
  const ticket = await resolveTicket(token);
  const ws = new WS(toWsUrl(baseUrl, ticket));

  const openPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`open timeout c${index}`)), openTimeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    } catch {
      counters.parseErrors += 1;
      return;
    }

    if (message?.type === "ack") counters.acks += 1;
    else if (message?.type === "nack") {
      counters.nacks += 1;
      const nackCode = String(message?.code ?? message?.payload?.code ?? "UNKNOWN_NACK");
      counters.nackCodes[nackCode] = (counters.nackCodes[nackCode] ?? 0) + 1;
    }
    else if (message?.type === "error") {
      counters.errors += 1;
      const errorCode = String(message?.code ?? message?.payload?.code ?? "UNKNOWN_ERROR");
      counters.errorCodes[errorCode] = (counters.errorCodes[errorCode] ?? 0) + 1;
    }
    else if (message?.type === "chat.message") counters.chatMessages += 1;
  });

  ws.on("close", () => {
    counters.closed += 1;
  });

  await openPromise;

  counters.opened += 1;

  const joinRequestId = `join-${index}-${Date.now()}`;
  ws.send(JSON.stringify({
    type: "room.join",
    requestId: joinRequestId,
    payload: { roomSlug }
  }));

  const timer = setInterval(() => {
    if (ws.readyState !== WS.OPEN) {
      return;
    }

    const requestId = `chat-${index}-${Date.now()}`;
    ws.send(JSON.stringify({
      type: "chat.send",
      requestId,
      idempotencyKey: requestId,
      payload: { text: `ws-load c${index} ${new Date().toISOString()}` }
    }));
    counters.sent += 1;

    ws.send(JSON.stringify({
      type: "ping",
      requestId: `ping-${index}-${Date.now()}`,
      payload: {}
    }));
    counters.sent += 1;
  }, messageIntervalSec * 1000);

  return {
    ws,
    stop: () => {
      clearInterval(timer);
      if (ws.readyState === WS.OPEN || ws.readyState === WS.CONNECTING) {
        ws.close();
      }
    }
  };
};

(async () => {
  const counters = {
    opened: 0,
    closed: 0,
    sent: 0,
    acks: 0,
    nacks: 0,
    errors: 0,
    chatMessages: 0,
    parseErrors: 0,
    connectFailures: 0,
    nackCodes: {},
    errorCodes: {}
  };

  const clients = [];
  const startedAt = Date.now();

  for (let i = 0; i < clientsCount; i += 1) {
    try {
      const client = await connectClient(i + 1, counters);
      clients.push(client);
    } catch (error) {
      counters.connectFailures += 1;
      console.error(`[ws-load] client ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
    }

    if ((i + 1) % 10 === 0) {
      console.log(`[ws-load] connected ${i + 1}/${clientsCount}`);
    }
  }

  console.log(`[ws-load] connected=${clients.length} failed=${counters.connectFailures}`);
  await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));

  clients.forEach((client) => client.stop());
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const report = {
    ok: true,
    baseUrl,
    roomSlug,
    clientsTarget: clientsCount,
    clientsConnected: clients.length,
    durationSec,
    elapsedSec,
    counters
  };

  console.log(JSON.stringify(report, null, 2));
})();
