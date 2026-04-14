// Purpose: Глубокий stress-тест unread-счётчиков и уведомлений для room chat и DM.
// Использует 3 бот-пользователей (A=primary, B=second, C=third).
// Проверяет: массовые сообщения, partial read, mentions, DM partial read, concurrent, WS realtime.
// Room + DM: unread cursor по created_at прочитанного сообщения → поддерживает partial read.
import WS from "ws";

const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const tokenA = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const tokenB = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const tokenC = String(process.env.SMOKE_TEST_BEARER_TOKEN_THIRD || "").trim();
const roomSlug = process.env.SMOKE_ROOM_SLUG ?? "general";
const ROOM_MSG_COUNT = Number(process.env.SMOKE_UNREAD_ROOM_MSG_COUNT ?? 50);
const DM_MSG_COUNT = Number(process.env.SMOKE_UNREAD_DM_MSG_COUNT ?? 50);
const MENTION_COUNT = Number(process.env.SMOKE_UNREAD_MENTION_COUNT ?? 10);
const WS_EVENT_TIMEOUT_MS = Number(process.env.SMOKE_UNREAD_WS_TIMEOUT_MS ?? 15000);
const CONCURRENCY_BATCH = Number(process.env.SMOKE_UNREAD_CONCURRENCY ?? 5);

const PREFIX = "[smoke:unread-stress]";

// ──── HTTP helpers ────────────────────────────────────

async function fetchJson(path, { method = "GET", token = "", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload };
}

function ok(response, payload, label) {
  if (!response.ok) {
    throw new Error(`${PREFIX} ${label} failed: status=${response.status} body=${String(JSON.stringify(payload || {})).slice(0, 300)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`${PREFIX} assertion failed: ${message}`);
}

// ──── WS helpers ──────────────────────────────────────

function toWsUrl(httpUrl) {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getWsTicket(token) {
  const { response, payload } = await fetchJson("/v1/auth/ws-ticket", { token });
  ok(response, payload, "ws-ticket");
  return payload.ticket;
}

async function openRealtimeSocket(ticket, label) {
  const wsUrl = toWsUrl(baseUrl);
  wsUrl.pathname = "/v1/realtime/ws";
  wsUrl.searchParams.set("ticket", ticket);
  const ws = new WS(wsUrl.toString());
  const events = [];
  ws.on("message", (raw) => {
    try { events.push(JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"))); } catch {}
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${PREFIX} ${label} ws open timeout`)), 10000);
    ws.once("open", () => { clearTimeout(timer); resolve(); });
    ws.once("error", (e) => { clearTimeout(timer); reject(e); });
  });
  // wait server.ready
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (events.some((e) => e?.type === "server.ready")) break;
    await sleep(50);
  }
  const ready = events.find((e) => e?.type === "server.ready");
  assert(ready, `${label}: server.ready not received`);
  return { ws, events, userId: ready.payload?.userId };
}

function closeWs(ws) {
  try { ws.close(); } catch {}
}

// ──── batched sends (avoid overwhelming) ─────────────

async function sendMessagesBatched(topicId, token, count, textPrefix, mentionUserIds) {
  const ids = [];
  for (let i = 0; i < count; i += CONCURRENCY_BATCH) {
    const batch = [];
    const end = Math.min(i + CONCURRENCY_BATCH, count);
    for (let j = i; j < end; j++) {
      const body = { text: `${textPrefix}-${j + 1}` };
      if (mentionUserIds) body.mentionUserIds = mentionUserIds;
      batch.push(
        fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/messages`, { method: "POST", token, body })
          .then(({ response, payload }) => {
            ok(response, payload, `send ${textPrefix}-${j + 1}`);
            return String(payload?.message?.id || "").trim();
          })
      );
    }
    const batchIds = await Promise.all(batch);
    ids.push(...batchIds);
  }
  return ids;
}

async function sendDmMessagesBatched(threadId, token, count, textPrefix) {
  const ids = [];
  for (let i = 0; i < count; i += CONCURRENCY_BATCH) {
    const batch = [];
    const end = Math.min(i + CONCURRENCY_BATCH, count);
    for (let j = i; j < end; j++) {
      batch.push(
        fetchJson(`/v1/dm/threads/${encodeURIComponent(threadId)}/messages`, {
          method: "POST", token, body: { body: `${textPrefix}-${j + 1}` },
        }).then(({ response, payload }) => {
          ok(response, payload, `dm send ${textPrefix}-${j + 1}`);
          return String(payload?.message?.id || "").trim();
        })
      );
    }
    const batchIds = await Promise.all(batch);
    ids.push(...batchIds);
  }
  return ids;
}

// ──── unread query helpers ────────────────────────────

async function getTopicUnread(token, roomId, topicId) {
  const { response, payload } = await fetchJson(`/v1/rooms/${encodeURIComponent(roomId)}/topics`, { token });
  ok(response, payload, "get topic unread");
  const topics = Array.isArray(payload?.topics) ? payload.topics : [];
  const topic = topics.find((t) => String(t?.id || "") === topicId);
  assert(topic, `topic ${topicId} not found in room topics`);
  return {
    unreadCount: Number(topic?.unreadCount ?? topic?.unread_count ?? 0),
    mentionUnreadCount: Number(topic?.mentionUnreadCount ?? topic?.mention_unread_count ?? 0),
  };
}

async function markTopicRead(token, topicId, lastReadMessageId) {
  const { response, payload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/read`, {
    method: "POST", token, body: { lastReadMessageId },
  });
  ok(response, payload, `mark topic read`);
  return payload;
}

async function clearMentions(token, topicId) {
  const { response, payload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/unread-mentions/read-all`, {
    method: "POST", token,
  });
  ok(response, payload, "clear mentions");
}

async function getDmThreads(token) {
  const { response, payload } = await fetchJson("/v1/dm/threads", { token });
  ok(response, payload, "get dm threads");
  return Array.isArray(payload?.threads) ? payload.threads : [];
}

async function createDmThread(token, peerUserId) {
  const { response, payload } = await fetchJson("/v1/dm/threads", {
    method: "POST", token, body: { peerUserId },
  });
  ok(response, payload, `create dm thread with ${peerUserId}`);
  return payload.thread;
}

async function markDmThreadRead(token, threadId, lastReadMessageId) {
  const { response, payload } = await fetchJson(`/v1/dm/threads/${encodeURIComponent(threadId)}/read`, {
    method: "POST", token, body: { lastReadMessageId },
  });
  ok(response, payload, `mark dm thread read`);
}

async function getDmMessages(token, threadId, limit = 100) {
  const { response, payload } = await fetchJson(
    `/v1/dm/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}`, { token }
  );
  ok(response, payload, "get dm messages");
  return Array.isArray(payload?.messages) ? payload.messages : [];
}

async function resolveUserId(token, label) {
  const { response, payload } = await fetchJson("/v1/auth/me", { token });
  ok(response, payload, `${label} /v1/auth/me`);
  return String(payload?.user?.id || "").trim();
}

async function resolveRoomId(token) {
  const { response, payload } = await fetchJson("/v1/rooms", { token });
  ok(response, payload, "list rooms");
  const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];
  const room = rooms.find((r) => String(r?.slug || "") === roomSlug)
    || rooms.find((r) => String(r?.kind || "") === "text")
    || rooms[0];
  assert(room, "cannot resolve room");
  return String(room.id);
}

// ──── main ────────────────────────────────────────────

(async () => {
  if (!tokenA || !tokenB || !tokenC) {
    console.error(`${PREFIX} requires SMOKE_TEST_BEARER_TOKEN, _SECOND, _THIRD`);
    process.exit(1);
  }

  console.log(`${PREFIX} start (roomMsgCount=${ROOM_MSG_COUNT} dmMsgCount=${DM_MSG_COUNT} mentionCount=${MENTION_COUNT})`);
  const t0 = Date.now();

  // ── resolve user IDs ──
  const [userIdA, userIdB, userIdC] = await Promise.all([
    resolveUserId(tokenA, "userA"),
    resolveUserId(tokenB, "userB"),
    resolveUserId(tokenC, "userC"),
  ]);
  assert(userIdA && userIdB && userIdC, "failed to resolve user ids");
  assert(new Set([userIdA, userIdB, userIdC]).size === 3, "all 3 users must be distinct");
  console.log(`${PREFIX} users resolved: A=${userIdA.slice(0, 8)}.. B=${userIdB.slice(0, 8)}.. C=${userIdC.slice(0, 8)}..`);

  const roomId = await resolveRoomId(tokenA);

  // ══════════════════════════════════════════════════
  // PHASE 1: Room chat unread stress
  // ══════════════════════════════════════════════════
  console.log(`${PREFIX} phase 1: room chat unread stress`);
  const topicTitle = `Smoke Unread Stress ${Date.now().toString(36)}`;
  const { response: tcr, payload: tcp } = await fetchJson(`/v1/rooms/${encodeURIComponent(roomId)}/topics`, {
    method: "POST", token: tokenA, body: { title: topicTitle },
  });
  ok(tcr, tcp, "create topic");
  const topicId = String(tcp?.topic?.id || "");
  assert(topicId, "topic id missing");

  try {
    // seed + mark read baseline for user A
    const { response: sr, payload: sp } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/messages`, {
      method: "POST", token: tokenA, body: { text: "seed-baseline" },
    });
    ok(sr, sp, "seed message");
    const seedId = String(sp?.message?.id || "");
    await markTopicRead(tokenA, topicId, seedId);
    await clearMentions(tokenA, topicId);

    // B and C each send ROOM_MSG_COUNT messages
    console.log(`${PREFIX}   B sends ${ROOM_MSG_COUNT} messages...`);
    const bMsgIds = await sendMessagesBatched(topicId, tokenB, ROOM_MSG_COUNT, "b-msg");
    console.log(`${PREFIX}   C sends ${ROOM_MSG_COUNT} messages...`);
    const cMsgIds = await sendMessagesBatched(topicId, tokenC, ROOM_MSG_COUNT, "c-msg");

    const totalRoomMsgs = ROOM_MSG_COUNT * 2;

    // check unread for A = all messages from B + C
    const snap1 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap1.unreadCount === totalRoomMsgs,
      `expected unread=${totalRoomMsgs}, got=${snap1.unreadCount}`);
    console.log(`${PREFIX}   ✓ A unread=${snap1.unreadCount} (expected ${totalRoomMsgs})`);

    // Partial read: A reads B's last message → only C's messages stay unread
    // Fetch actual ordered messages to get the real halfway point
    // API limit is 100, pages via beforeCreatedAt+beforeId pair
    let allMsgs = [];
    let pageParams = "";
    while (true) {
      const qs = `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=100${pageParams}`;
      const { response: msgsR, payload: msgsP } = await fetchJson(qs, { token: tokenA });
      ok(msgsR, msgsP, "fetch topic messages for partial read");
      const batch = Array.isArray(msgsP?.messages) ? msgsP.messages : [];
      if (batch.length === 0) break;
      allMsgs.push(...batch);
      const pag = msgsP?.pagination;
      if (!pag?.hasMore || !pag?.nextCursor) break;
      pageParams = `&beforeCreatedAt=${encodeURIComponent(pag.nextCursor.beforeCreatedAt)}&beforeId=${encodeURIComponent(pag.nextCursor.beforeId)}`;
    }
    // API returns messages oldest-first (ASC). Multi-page: each subsequent page
    // has OLDER messages, so we prepend. Safest: sort explicitly by (createdAt, id).
    const otherMsgsChron = allMsgs
      .filter((m) => String(m.userId || m.user_id || "") !== userIdA)
      .sort((a, b) => {
        const tA = a.createdAt || a.created_at || "";
        const tB = b.createdAt || b.created_at || "";
        if (tA < tB) return -1;
        if (tA > tB) return 1;
        return (a.id || "") < (b.id || "") ? -1 : (a.id || "") > (b.id || "") ? 1 : 0;
      });
    assert(otherMsgsChron.length === totalRoomMsgs,
      `expected ${totalRoomMsgs} other messages, got=${otherMsgsChron.length}`);
    // read up to halfway (= ROOM_MSG_COUNT messages)
    const halfIdx = ROOM_MSG_COUNT - 1;
    const halfwayMsg = otherMsgsChron[halfIdx];
    const expectedAfter = otherMsgsChron.length - halfIdx - 1;
    await markTopicRead(tokenA, topicId, String(halfwayMsg.id));
    const snap2 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap2.unreadCount === expectedAfter,
      `expected unread=${expectedAfter} after partial read, got=${snap2.unreadCount}`);
    console.log(`${PREFIX}   ✓ partial read: unread=${snap2.unreadCount} (expected ${expectedAfter})`);

    // Full read: A reads last message → unread=0
    const lastMsg = otherMsgsChron[otherMsgsChron.length - 1];
    await markTopicRead(tokenA, topicId, String(lastMsg.id));
    const snap3 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap3.unreadCount === 0,
      `expected unread=0 after full read, got=${snap3.unreadCount}`);
    console.log(`${PREFIX}   ✓ full read: unread=0`);

    // ══════════════════════════════════════════════════
    // PHASE 2: Mentions stress
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 2: mention unread stress`);

    // Reset read pointer for A
    const lastCMsg = cMsgIds[cMsgIds.length - 1];
    await markTopicRead(tokenA, topicId, lastCMsg);
    await clearMentions(tokenA, topicId);

    // B and C each send MENTION_COUNT messages mentioning A
    console.log(`${PREFIX}   B sends ${MENTION_COUNT} mentions...`);
    const bMentionIds = await sendMessagesBatched(topicId, tokenB, MENTION_COUNT, "b-mention", [userIdA]);
    console.log(`${PREFIX}   C sends ${MENTION_COUNT} mentions...`);
    const cMentionIds = await sendMessagesBatched(topicId, tokenC, MENTION_COUNT, "c-mention", [userIdA]);

    const totalMentions = MENTION_COUNT * 2;
    const totalMentionMsgs = totalMentions; // each message has exactly 1 mention

    // check unread + mention unread for A
    const snap4 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap4.unreadCount === totalMentionMsgs,
      `expected unread=${totalMentionMsgs} (mentions phase), got=${snap4.unreadCount}`);
    assert(snap4.mentionUnreadCount === totalMentions,
      `expected mentionUnread=${totalMentions}, got=${snap4.mentionUnreadCount}`);
    console.log(`${PREFIX}   ✓ A unread=${snap4.unreadCount} mentionUnread=${snap4.mentionUnreadCount}`);

    // topic read clears unread but NOT mentions
    await markTopicRead(tokenA, topicId, cMentionIds[cMentionIds.length - 1]);
    const snap5 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap5.unreadCount === 0,
      `expected unread=0 after topic read, got=${snap5.unreadCount}`);
    assert(snap5.mentionUnreadCount === totalMentions,
      `expected mentionUnread=${totalMentions} after topic read (not cleared), got=${snap5.mentionUnreadCount}`);
    console.log(`${PREFIX}   ✓ after topic read: unread=0 mentionUnread=${snap5.mentionUnreadCount} (unchanged)`);

    // clear mentions explicitly
    await clearMentions(tokenA, topicId);
    const snap6 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap6.mentionUnreadCount === 0,
      `expected mentionUnread=0 after clear, got=${snap6.mentionUnreadCount}`);
    console.log(`${PREFIX}   ✓ after mention clear: mentionUnread=0`);

    // ══════════════════════════════════════════════════
    // PHASE 3: DM unread stress
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 3: DM unread stress`);

    // Create DM threads: B→A, C→A
    const threadAB = await createDmThread(tokenA, userIdB);
    const threadAC = await createDmThread(tokenA, userIdC);
    assert(threadAB?.id, "DM thread A↔B id missing");
    assert(threadAC?.id, "DM thread A↔C id missing");
    console.log(`${PREFIX}   threads: A↔B=${threadAB.id.slice(0, 8)}.. A↔C=${threadAC.id.slice(0, 8)}..`);

    // Clear any leftover unreads from previous runs (threads are reused)
    {
      const abLatest = await getDmMessages(tokenA, threadAB.id, 1);
      const acLatest = await getDmMessages(tokenA, threadAC.id, 1);
      if (abLatest.length) await markDmThreadRead(tokenA, threadAB.id, String(abLatest[0].id));
      if (acLatest.length) await markDmThreadRead(tokenA, threadAC.id, String(acLatest[0].id));
    }

    // B sends DM_MSG_COUNT to A
    console.log(`${PREFIX}   B sends ${DM_MSG_COUNT} DMs...`);
    const bDmIds = await sendDmMessagesBatched(threadAB.id, tokenB, DM_MSG_COUNT, "b-dm");

    // C sends DM_MSG_COUNT to A
    console.log(`${PREFIX}   C sends ${DM_MSG_COUNT} DMs...`);
    const cDmIds = await sendDmMessagesBatched(threadAC.id, tokenC, DM_MSG_COUNT, "c-dm");

    // Check A's DM threads unread
    const dmThreads1 = await getDmThreads(tokenA);
    const abThread1 = dmThreads1.find((t) => t.id === threadAB.id);
    const acThread1 = dmThreads1.find((t) => t.id === threadAC.id);
    assert(abThread1, "A↔B thread not found in list");
    assert(acThread1, "A↔C thread not found in list");
    assert(abThread1.unreadCount === DM_MSG_COUNT,
      `A↔B expected unread=${DM_MSG_COUNT}, got=${abThread1.unreadCount}`);
    assert(acThread1.unreadCount === DM_MSG_COUNT,
      `A↔C expected unread=${DM_MSG_COUNT}, got=${acThread1.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔B unread=${abThread1.unreadCount} A↔C unread=${acThread1.unreadCount}`);

    // Partial DM read: fetch actual message order (concurrent sends may reorder created_at)
    // Filter to only freshly-sent IDs (thread may contain old messages from previous runs)
    const bDmIdSet = new Set(bDmIds);
    const abMsgsOrdered = await getDmMessages(tokenA, threadAB.id, DM_MSG_COUNT + 50);
    // messages come newest-first, reverse to get chronological order
    const abMsgsChron = [...abMsgsOrdered].reverse();
    // only our freshly-sent B messages
    const bMsgsChron = abMsgsChron.filter((m) => bDmIdSet.has(String(m.id)));
    assert(bMsgsChron.length === DM_MSG_COUNT,
      `expected ${DM_MSG_COUNT} B messages in thread, got=${bMsgsChron.length}`);
    const halfwayIdx = Math.floor(DM_MSG_COUNT / 2) - 1;
    const halfwayMsgId = String(bMsgsChron[halfwayIdx].id);
    await markDmThreadRead(tokenA, threadAB.id, halfwayMsgId);
    const dmThreads2 = await getDmThreads(tokenA);
    const abThread2 = dmThreads2.find((t) => t.id === threadAB.id);
    const expectedPartial = DM_MSG_COUNT - (halfwayIdx + 1);
    assert(abThread2.unreadCount === expectedPartial,
      `A↔B partial read expected=${expectedPartial}, got=${abThread2.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔B after partial read: unread=${abThread2.unreadCount} (expected ${expectedPartial})`);

    // Full DM read: A reads B thread to end (last message by created_at)
    const lastBMsgId = String(bMsgsChron[bMsgsChron.length - 1].id);
    await markDmThreadRead(tokenA, threadAB.id, lastBMsgId);
    const dmThreads3 = await getDmThreads(tokenA);
    const abThread3 = dmThreads3.find((t) => t.id === threadAB.id);
    assert(abThread3.unreadCount === 0,
      `A↔B full read expected=0, got=${abThread3.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔B after full read: unread=0`);

    // Full DM read: A reads C thread to end (fetch actual last message, filter by sent IDs)
    const cDmIdSet = new Set(cDmIds);
    const acMsgsOrdered = await getDmMessages(tokenA, threadAC.id, DM_MSG_COUNT + 50);
    const acMsgsChron = [...acMsgsOrdered].reverse();
    const cMsgsChron = acMsgsChron.filter((m) => cDmIdSet.has(String(m.id)));
    const lastCDmId = String(cMsgsChron[cMsgsChron.length - 1].id);
    await markDmThreadRead(tokenA, threadAC.id, lastCDmId);
    const dmThreads4 = await getDmThreads(tokenA);
    const acThread4 = dmThreads4.find((t) => t.id === threadAC.id);
    assert(acThread4.unreadCount === 0,
      `A↔C full read expected=0, got=${acThread4.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔C after full read: unread=0`);

    // ══════════════════════════════════════════════════
    // PHASE 4: Concurrent room + DM messages
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 4: concurrent room + DM`);

    // Reset room read pointer (fetch latest message to avoid ordering issues)
    {
      const { response: lr, payload: lp } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=1`, { token: tokenA }
      );
      ok(lr, lp, "fetch latest for phase 4 reset");
      const msgs = Array.isArray(lp?.messages) ? lp.messages : [];
      if (msgs.length) await markTopicRead(tokenA, topicId, String(msgs[0].id));
    }
    await clearMentions(tokenA, topicId);

    const CONCURRENT_COUNT = 20;

    // B and C each send room messages AND DMs simultaneously
    const concurrentResults = await Promise.all([
      sendMessagesBatched(topicId, tokenB, CONCURRENT_COUNT, "b-concurrent"),
      sendMessagesBatched(topicId, tokenC, CONCURRENT_COUNT, "c-concurrent"),
      sendDmMessagesBatched(threadAB.id, tokenB, CONCURRENT_COUNT, "b-dm-concurrent"),
      sendDmMessagesBatched(threadAC.id, tokenC, CONCURRENT_COUNT, "c-dm-concurrent"),
    ]);
    const [bConcRoomIds, cConcRoomIds, bConcDmIds, cConcDmIds] = concurrentResults;

    // Check room unread = 40
    const snap7 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap7.unreadCount === CONCURRENT_COUNT * 2,
      `concurrent room expected=${CONCURRENT_COUNT * 2}, got=${snap7.unreadCount}`);
    console.log(`${PREFIX}   ✓ concurrent room unread=${snap7.unreadCount}`);

    // Check DM unread
    const dmThreads5 = await getDmThreads(tokenA);
    const abThread5 = dmThreads5.find((t) => t.id === threadAB.id);
    const acThread5 = dmThreads5.find((t) => t.id === threadAC.id);
    assert(abThread5.unreadCount === CONCURRENT_COUNT,
      `concurrent A↔B expected=${CONCURRENT_COUNT}, got=${abThread5.unreadCount}`);
    assert(acThread5.unreadCount === CONCURRENT_COUNT,
      `concurrent A↔C expected=${CONCURRENT_COUNT}, got=${acThread5.unreadCount}`);
    console.log(`${PREFIX}   ✓ concurrent DM: A↔B unread=${abThread5.unreadCount} A↔C unread=${acThread5.unreadCount}`);

    // Read everything (fetch actual last messages to avoid ordering issues)
    {
      const { response: lr, payload: lp } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=1`, { token: tokenA }
      );
      ok(lr, lp, "fetch latest for phase 4 cleanup");
      const msgs = Array.isArray(lp?.messages) ? lp.messages : [];
      if (msgs.length) await markTopicRead(tokenA, topicId, String(msgs[0].id));
    }
    const abMsgsConcOrdered = await getDmMessages(tokenA, threadAB.id, 1);
    const acMsgsConcOrdered = await getDmMessages(tokenA, threadAC.id, 1);
    await markDmThreadRead(tokenA, threadAB.id, String(abMsgsConcOrdered[0].id));
    await markDmThreadRead(tokenA, threadAC.id, String(acMsgsConcOrdered[0].id));

    const snap8 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap8.unreadCount === 0, `concurrent room full read expected=0, got=${snap8.unreadCount}`);
    const dmThreads6 = await getDmThreads(tokenA);
    assert(dmThreads6.find((t) => t.id === threadAB.id)?.unreadCount === 0, "A↔B concurrent cleanup failed");
    assert(dmThreads6.find((t) => t.id === threadAC.id)?.unreadCount === 0, "A↔C concurrent cleanup failed");
    console.log(`${PREFIX}   ✓ all concurrent unreads cleared`);

    // ══════════════════════════════════════════════════
    // PHASE 5: WS realtime delivery verification
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 5: WS realtime delivery`);

    const ticketA = await getWsTicket(tokenA);
    const { ws: wsA, events: eventsA } = await openRealtimeSocket(ticketA, "userA");

    try {
      // join room
      const joinRequestId = `join-${Date.now()}`;
      wsA.send(JSON.stringify({
        type: "room.join",
        requestId: joinRequestId,
        payload: { roomSlug },
      }));

      // wait for room.joined
      const joinStart = Date.now();
      while (Date.now() - joinStart < 10000) {
        if (eventsA.some((e) => e?.type === "room.joined")) break;
        await sleep(50);
      }

      // B sends WS_VERIFY_COUNT room messages and DMs, A receives realtime
      const WS_VERIFY_COUNT = 10;

      // Reset read pointer first
      {
        const { response: lr, payload: lp } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=1`, { token: tokenA }
        );
        ok(lr, lp, "fetch latest for phase 5 reset");
        const msgs = Array.isArray(lp?.messages) ? lp.messages : [];
        if (msgs.length) await markTopicRead(tokenA, topicId, String(msgs[0].id));
      }
      const abLatest5 = await getDmMessages(tokenA, threadAB.id, 1);
      await markDmThreadRead(tokenA, threadAB.id, String(abLatest5[0].id));

      const eventsBeforeRoom = eventsA.filter((e) => e?.type === "chat.message.created").length;
      const eventsBeforeDm = eventsA.filter((e) => e?.type === "dm.message.created").length;

      // B sends room messages
      const wsRoomMsgIds = await sendMessagesBatched(topicId, tokenB, WS_VERIFY_COUNT, "b-ws-room");
      // B sends DMs
      const wsDmMsgIds = await sendDmMessagesBatched(threadAB.id, tokenB, WS_VERIFY_COUNT, "b-ws-dm");

      // Wait for WS events to arrive
      const wsWaitStart = Date.now();
      while (Date.now() - wsWaitStart < WS_EVENT_TIMEOUT_MS) {
        const roomEvents = eventsA.filter((e) => e?.type === "chat.message.created").length - eventsBeforeRoom;
        const dmEvents = eventsA.filter((e) => e?.type === "dm.message.created").length - eventsBeforeDm;
        if (roomEvents >= WS_VERIFY_COUNT && dmEvents >= WS_VERIFY_COUNT) break;
        await sleep(100);
      }

      const roomEventsReceived = eventsA.filter((e) => e?.type === "chat.message.created").length - eventsBeforeRoom;
      const dmEventsReceived = eventsA.filter((e) => e?.type === "dm.message.created").length - eventsBeforeDm;

      assert(roomEventsReceived >= WS_VERIFY_COUNT,
        `WS room events: expected>=${WS_VERIFY_COUNT}, got=${roomEventsReceived}`);
      assert(dmEventsReceived >= WS_VERIFY_COUNT,
        `WS DM events: expected>=${WS_VERIFY_COUNT}, got=${dmEventsReceived}`);
      console.log(`${PREFIX}   ✓ WS room events=${roomEventsReceived} DM events=${dmEventsReceived}`);

      // Verify unread after WS messages
      const snap9 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap9.unreadCount === WS_VERIFY_COUNT,
        `WS room unread expected=${WS_VERIFY_COUNT}, got=${snap9.unreadCount}`);
      const dmThreads7 = await getDmThreads(tokenA);
      const abThread7 = dmThreads7.find((t) => t.id === threadAB.id);
      assert(abThread7.unreadCount === WS_VERIFY_COUNT,
        `WS DM unread expected=${WS_VERIFY_COUNT}, got=${abThread7.unreadCount}`);
      console.log(`${PREFIX}   ✓ WS unread consistent: room=${snap9.unreadCount} dm=${abThread7.unreadCount}`);

      // Final cleanup: read all
      await markTopicRead(tokenA, topicId, wsRoomMsgIds[wsRoomMsgIds.length - 1]);
      const abLatestWs = await getDmMessages(tokenA, threadAB.id, 1);
      await markDmThreadRead(tokenA, threadAB.id, String(abLatestWs[0].id));
    } finally {
      closeWs(wsA);
    }

    // ══════════════════════════════════════════════════
    // PHASE 6: Unread divider consistency
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 6: unread divider`);

    // Ensure clean slate: fetch latest topic message and mark as read
    {
      const { response: latR, payload: latP } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=1`, { token: tokenA }
      );
      ok(latR, latP, "fetch latest topic msg for phase 6 reset");
      const msgs = Array.isArray(latP?.messages) ? latP.messages : [];
      if (msgs.length) await markTopicRead(tokenA, topicId, String(msgs[0].id));
      await clearMentions(tokenA, topicId);
      // small delay to ensure last_read_at is strictly before new messages
      await sleep(50);
    }

    // Send 5 from B sequentially (preserve created_at order for divider check)
    const dividerMsgIds = [];
    for (let i = 0; i < 5; i++) {
      const { response: dr, payload: dp } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages`,
        { method: "POST", token: tokenB, body: { text: `b-divider-${i + 1}` } }
      );
      ok(dr, dp, `divider msg ${i + 1}`);
      dividerMsgIds.push(String(dp?.message?.id || ""));
    }
    const { response: divR, payload: divP } = await fetchJson(
      `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&aroundUnreadWindow=true`, { token: tokenA }
    );
    ok(divR, divP, "around unread window");
    const dividerMessageId = String(divP?.unreadDividerMessageId || "").trim();
    assert(dividerMessageId === dividerMsgIds[0],
      `divider expected=${dividerMsgIds[0]}, got=${dividerMessageId || "<empty>"}`);
    console.log(`${PREFIX}   ✓ unread divider points to first unread message`);

    // Read all → divider should be empty
    await markTopicRead(tokenA, topicId, dividerMsgIds[dividerMsgIds.length - 1]);
    const { response: divR2, payload: divP2 } = await fetchJson(
      `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&aroundUnreadWindow=true`, { token: tokenA }
    );
    ok(divR2, divP2, "around unread window cleared");
    const dividerAfter = String(divP2?.unreadDividerMessageId || "").trim();
    assert(!dividerAfter, `divider expected empty after read, got=${dividerAfter}`);
    console.log(`${PREFIX}   ✓ unread divider cleared after read-all`);

  } finally {
    // cleanup: delete topic
    const { response: delR } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}`, {
      method: "DELETE", token: tokenA,
    });
    if (!delR.ok) console.warn(`${PREFIX} cleanup: topic delete failed`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalMsgsSent = 1 + (ROOM_MSG_COUNT * 2) + (MENTION_COUNT * 2) + (DM_MSG_COUNT * 2) + (20 * 4) + (10 * 2) + 5;
  console.log(`${PREFIX} ok (${baseUrl}) elapsed=${elapsed}s totalMessages=${totalMsgsSent} phases=6/6`);

})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
