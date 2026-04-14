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

async function getLatestTopicMessageId(token, topicId) {
  const { response, payload } = await fetchJson(
    `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=1`, { token }
  );
  ok(response, payload, "fetch latest topic message");
  const msgs = Array.isArray(payload?.messages) ? payload.messages : [];
  assert(msgs.length > 0, "no messages in topic for getLatestTopicMessageId");
  return String(msgs[0].id);
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
  // DM API max limit=100, cursor-based pagination (cursor=messageId, returns older messages)
  // Returns messages newest-first (DESC)
  if (limit <= 100) {
    const { response, payload } = await fetchJson(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}`, { token }
    );
    ok(response, payload, "get dm messages");
    return Array.isArray(payload?.messages) ? payload.messages : [];
  }
  // Paginated fetch for limit > 100
  let allMsgs = [];
  let cursor = "";
  let remaining = limit;
  while (remaining > 0) {
    const pageSize = Math.min(remaining, 100);
    const qs = cursor
      ? `/v1/dm/threads/${encodeURIComponent(threadId)}/messages?limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
      : `/v1/dm/threads/${encodeURIComponent(threadId)}/messages?limit=${pageSize}`;
    const { response, payload } = await fetchJson(qs, { token });
    ok(response, payload, "get dm messages (paginated)");
    const batch = Array.isArray(payload?.messages) ? payload.messages : [];
    if (batch.length === 0) break;
    allMsgs.push(...batch);
    remaining -= batch.length;
    if (!payload?.hasMore) break;
    cursor = String(batch[batch.length - 1].id);
  }
  return allMsgs;
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
    // has OLDER messages, so we prepend. Safest: deduplicate + sort by (createdAt, id).
    const seenIds = new Set();
    const dedupedMsgs = allMsgs.filter((m) => {
      const id = String(m.id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    const otherMsgsChron = dedupedMsgs
      .filter((m) => String(m.userId || m.user_id || "") !== userIdA)
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.created_at).getTime();
        const tB = new Date(b.createdAt || b.created_at).getTime();
        if (tA !== tB) return tA - tB;
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
    // Allow ±CONCURRENCY_BATCH tolerance: JS Date.getTime() has ms precision while
    // PostgreSQL timestamps have µs precision, so concurrent batch sends can cause
    // the JS sort order to differ slightly from SQL (created_at, id) order.
    const tolerance = CONCURRENCY_BATCH;
    assert(Math.abs(snap2.unreadCount - expectedAfter) <= tolerance,
      `expected unread≈${expectedAfter} (±${tolerance}) after partial read, got=${snap2.unreadCount}`);
    console.log(`${PREFIX}   ✓ partial read: unread=${snap2.unreadCount} (expected ≈${expectedAfter})`);

    // Full read: use API to get the actual latest message (avoids µs ordering mismatch)
    const latestMsgId = await getLatestTopicMessageId(tokenA, topicId);
    await markTopicRead(tokenA, topicId, latestMsgId);
    const snap3 = await getTopicUnread(tokenA, roomId, topicId);
    assert(snap3.unreadCount === 0,
      `expected unread=0 after full read, got=${snap3.unreadCount}`);
    console.log(`${PREFIX}   ✓ full read: unread=0`);

    // ══════════════════════════════════════════════════
    // PHASE 2: Mentions stress
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 2: mention unread stress`);

    // Reset read pointer for A (use API to get actual latest message to avoid ordering issues)
    const phase2ResetId = await getLatestTopicMessageId(tokenA, topicId);
    await markTopicRead(tokenA, topicId, phase2ResetId);
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
    const latestMentionMsgId = await getLatestTopicMessageId(tokenA, topicId);
    await markTopicRead(tokenA, topicId, latestMentionMsgId);
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
    // sort chronologically by (createdAt, id) ASC
    const abMsgsChron = [...abMsgsOrdered].sort((a, b) => {
      const ta = new Date(a.createdAt || a.created_at).getTime();
      const tb = new Date(b.createdAt || b.created_at).getTime();
      return ta - tb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
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
    assert(Math.abs(abThread2.unreadCount - expectedPartial) <= CONCURRENCY_BATCH,
      `A↔B partial read expected≈${expectedPartial} (±${CONCURRENCY_BATCH}), got=${abThread2.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔B after partial read: unread=${abThread2.unreadCount} (expected ≈${expectedPartial})`);

    // Full DM read: use latest message from API to avoid µs ordering mismatch
    const abLatestForRead = await getDmMessages(tokenA, threadAB.id, 1);
    assert(abLatestForRead.length > 0, "no messages in A↔B thread");
    await markDmThreadRead(tokenA, threadAB.id, String(abLatestForRead[0].id));
    const dmThreads3 = await getDmThreads(tokenA);
    const abThread3 = dmThreads3.find((t) => t.id === threadAB.id);
    assert(abThread3.unreadCount === 0,
      `A↔B full read expected=0, got=${abThread3.unreadCount}`);
    console.log(`${PREFIX}   ✓ A↔B after full read: unread=0`);

    // Full DM read: A reads C thread (use latest message from API)
    const acLatestForRead = await getDmMessages(tokenA, threadAC.id, 1);
    assert(acLatestForRead.length > 0, "no messages in A↔C thread");
    await markDmThreadRead(tokenA, threadAC.id, String(acLatestForRead[0].id));
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

    // ══════════════════════════════════════════════════
    // PHASE 7: Divider at scale (ROOM_MSG_COUNT unread)
    // Verifies divider and aroundWindow with many unread messages
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 7: divider at scale (${ROOM_MSG_COUNT} unread)`);
    {
      // Clean slate
      const resetId = await getLatestTopicMessageId(tokenA, topicId);
      await markTopicRead(tokenA, topicId, resetId);
      await sleep(50);

      // Send ROOM_MSG_COUNT messages sequentially (preserve order for divider check)
      const scaleMsgIds = [];
      for (let i = 0; i < Math.min(ROOM_MSG_COUNT, 20); i++) {
        const { response: r, payload: p } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topicId)}/messages`,
          { method: "POST", token: tokenB, body: { text: `b-scale-${i + 1}` } }
        );
        ok(r, p, `scale msg ${i + 1}`);
        scaleMsgIds.push(String(p?.message?.id || ""));
      }
      // Batch the rest if ROOM_MSG_COUNT > 20
      if (ROOM_MSG_COUNT > 20) {
        const batchIds = await sendMessagesBatched(topicId, tokenB, ROOM_MSG_COUNT - 20, "b-scale-batch");
        scaleMsgIds.push(...batchIds);
      }

      // Check divider points to very first unread message
      const { response: dR7, payload: dP7 } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?aroundUnreadWindow=true&aroundWindowBefore=5&aroundWindowAfter=10`,
        { token: tokenA }
      );
      ok(dR7, dP7, "around unread window (scale)");
      const divId7 = String(dP7?.unreadDividerMessageId || "").trim();
      assert(divId7 === scaleMsgIds[0],
        `scale divider expected first unread=${scaleMsgIds[0].slice(0, 8)}, got=${divId7.slice(0, 8) || "<empty>"}`);

      // Messages returned should include the divider and some after it
      const returnedMsgs7 = Array.isArray(dP7?.messages) ? dP7.messages : [];
      const dividerInList = returnedMsgs7.some((m) => String(m.id) === divId7);
      assert(dividerInList, "divider message should be in returned window");
      console.log(`${PREFIX}   ✓ divider at scale: firstUnread=${divId7.slice(0, 8)}, window=${returnedMsgs7.length} msgs`);

      // Use anchorMessageId to "jump" to middle of unread
      const midIdx = Math.min(Math.floor(ROOM_MSG_COUNT / 2), scaleMsgIds.length - 1);
      const midMsgId = scaleMsgIds[midIdx];
      const { response: aR7, payload: aP7 } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?anchorMessageId=${encodeURIComponent(midMsgId)}&aroundWindowBefore=3&aroundWindowAfter=3`,
        { token: tokenA }
      );
      ok(aR7, aP7, "anchor jump to mid-unread");
      const anchorMsgs = Array.isArray(aP7?.messages) ? aP7.messages : [];
      const anchorInList = anchorMsgs.some((m) => String(m.id) === midMsgId);
      assert(anchorInList, "anchor message should be in returned window");
      console.log(`${PREFIX}   ✓ anchor jump: mid=${midMsgId.slice(0, 8)}, window=${anchorMsgs.length} msgs`);
    }

    // ══════════════════════════════════════════════════
    // PHASE 8: Incremental scroll-read (counter decreases step by step)
    // Simulates user scrolling through chat and marking batches read
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 8: incremental scroll-read`);
    {
      // Clean slate
      const resetId = await getLatestTopicMessageId(tokenA, topicId);
      await markTopicRead(tokenA, topicId, resetId);
      await sleep(50);

      // Send 50 messages sequentially (controlled order)
      const SCROLL_COUNT = 50;
      const scrollMsgIds = [];
      for (let i = 0; i < SCROLL_COUNT; i++) {
        const { response: r, payload: p } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topicId)}/messages`,
          { method: "POST", token: tokenB, body: { text: `b-scroll-${i + 1}` } }
        );
        ok(r, p, `scroll msg ${i + 1}`);
        scrollMsgIds.push(String(p?.message?.id || ""));
      }

      // Verify starting unread = 50
      const snap0 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap0.unreadCount === SCROLL_COUNT,
        `scroll start: expected ${SCROLL_COUNT}, got=${snap0.unreadCount}`);

      // Read in batches of 10, verify counter decreases
      const BATCH_SIZE = 10;
      const steps = SCROLL_COUNT / BATCH_SIZE;
      for (let step = 0; step < steps; step++) {
        const readUpToIdx = (step + 1) * BATCH_SIZE - 1;
        await markTopicRead(tokenA, topicId, scrollMsgIds[readUpToIdx]);
        const snapStep = await getTopicUnread(tokenA, roomId, topicId);
        const expectedRemaining = SCROLL_COUNT - (step + 1) * BATCH_SIZE;
        assert(snapStep.unreadCount === expectedRemaining,
          `scroll step ${step + 1}: expected ${expectedRemaining}, got=${snapStep.unreadCount}`);
      }
      console.log(`${PREFIX}   ✓ counter decreased: 50→40→30→20→10→0 (${steps} steps)`);

      // Verify divider moves with each partial read
      // Reset and send 10 more, read first 5, check divider at 6th
      await sleep(50);
      const extraMsgs = [];
      for (let i = 0; i < 10; i++) {
        const { response: r, payload: p } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topicId)}/messages`,
          { method: "POST", token: tokenB, body: { text: `b-divmove-${i + 1}` } }
        );
        ok(r, p, `divmove msg ${i + 1}`);
        extraMsgs.push(String(p?.message?.id || ""));
      }
      await markTopicRead(tokenA, topicId, extraMsgs[4]); // read first 5
      const { response: dR8, payload: dP8 } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?aroundUnreadWindow=true&aroundWindowBefore=3&aroundWindowAfter=10`,
        { token: tokenA }
      );
      ok(dR8, dP8, "divider after partial scroll read");
      const divId8 = String(dP8?.unreadDividerMessageId || "").trim();
      assert(divId8 === extraMsgs[5],
        `divider should point to 6th msg=${extraMsgs[5].slice(0, 8)}, got=${divId8.slice(0, 8) || "<empty>"}`);
      console.log(`${PREFIX}   ✓ divider moves with scroll: points to msg #6 after reading #1-5`);
    }

    // ══════════════════════════════════════════════════
    // PHASE 9: Read idempotency + backward cursor safety
    // Re-reading same message or reading OLDER message shouldn't break count
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 9: read idempotency + backward cursor`);
    {
      // Clean slate
      const resetId = await getLatestTopicMessageId(tokenA, topicId);
      await markTopicRead(tokenA, topicId, resetId);
      await sleep(50);

      // Send 20 messages sequentially
      const idempMsgIds = [];
      for (let i = 0; i < 20; i++) {
        const { response: r, payload: p } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topicId)}/messages`,
          { method: "POST", token: tokenB, body: { text: `b-idemp-${i + 1}` } }
        );
        ok(r, p, `idemp msg ${i + 1}`);
        idempMsgIds.push(String(p?.message?.id || ""));
      }

      // Read to msg #15 → unread=5
      await markTopicRead(tokenA, topicId, idempMsgIds[14]);
      const snap1 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap1.unreadCount === 5,
        `idemp step1: expected 5, got=${snap1.unreadCount}`);

      // Read same msg #15 again → still unread=5 (idempotent)
      await markTopicRead(tokenA, topicId, idempMsgIds[14]);
      const snap2 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap2.unreadCount === 5,
        `idemp re-read: expected 5, got=${snap2.unreadCount}`);
      console.log(`${PREFIX}   ✓ re-read same message: unread stays at 5`);

      // Now try reading OLDER msg #10 (cursor goes backward) → should NOT increase unread
      await markTopicRead(tokenA, topicId, idempMsgIds[9]);
      const snap3 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap3.unreadCount <= 5,
        `idemp backward: expected ≤5, got=${snap3.unreadCount}`);
      console.log(`${PREFIX}   ✓ read older message: unread=${snap3.unreadCount} (≤5, cursor didn't regress)`);

      // Read to end
      await markTopicRead(tokenA, topicId, idempMsgIds[19]);
      const snap4 = await getTopicUnread(tokenA, roomId, topicId);
      assert(snap4.unreadCount === 0,
        `idemp final: expected 0, got=${snap4.unreadCount}`);
      console.log(`${PREFIX}   ✓ read to end: unread=0`);
    }

    // ══════════════════════════════════════════════════
    // PHASE 10: Cross-topic isolation
    // Unreads in one topic must not affect another topic
    // ══════════════════════════════════════════════════
    console.log(`${PREFIX} phase 10: cross-topic isolation`);
    {
      // Create second topic in same room
      const topic2Title = `unread-isolation-${Date.now().toString(36)}`;
      const { response: t2r, payload: t2p } = await fetchJson(
        `/v1/rooms/${encodeURIComponent(roomId)}/topics`,
        { method: "POST", token: tokenA, body: { title: topic2Title } }
      );
      ok(t2r, t2p, "create isolation topic");
      const topic2Id = String(t2p?.topic?.id || "");

      try {
        // Seed + mark read in topic2
        const { response: s2r, payload: s2p } = await fetchJson(
          `/v1/topics/${encodeURIComponent(topic2Id)}/messages`,
          { method: "POST", token: tokenA, body: { text: "seed-t2" } }
        );
        ok(s2r, s2p, "seed topic2");
        await markTopicRead(tokenA, topic2Id, String(s2p?.message?.id || ""));

        // Clean slate on topic1
        const t1ResetId = await getLatestTopicMessageId(tokenA, topicId);
        await markTopicRead(tokenA, topicId, t1ResetId);

        // Send 10 msgs in topic1, 5 in topic2
        const t1Ids = [];
        for (let i = 0; i < 10; i++) {
          const { response: r, payload: p } = await fetchJson(
            `/v1/topics/${encodeURIComponent(topicId)}/messages`,
            { method: "POST", token: tokenB, body: { text: `b-t1-${i + 1}` } }
          );
          ok(r, p, `iso t1 msg ${i + 1}`);
          t1Ids.push(String(p?.message?.id || ""));
        }
        const t2Ids = [];
        for (let i = 0; i < 5; i++) {
          const { response: r, payload: p } = await fetchJson(
            `/v1/topics/${encodeURIComponent(topic2Id)}/messages`,
            { method: "POST", token: tokenB, body: { text: `b-t2-${i + 1}` } }
          );
          ok(r, p, `iso t2 msg ${i + 1}`);
          t2Ids.push(String(p?.message?.id || ""));
        }

        // Check: topic1 unread=10, topic2 unread=5
        const snap1 = await getTopicUnread(tokenA, roomId, topicId);
        const snap2 = await getTopicUnread(tokenA, roomId, topic2Id);
        assert(snap1.unreadCount === 10, `iso t1: expected 10, got=${snap1.unreadCount}`);
        assert(snap2.unreadCount === 5, `iso t2: expected 5, got=${snap2.unreadCount}`);

        // Read topic1 completely → topic2 should stay at 5
        await markTopicRead(tokenA, topicId, t1Ids[9]);
        const snap3 = await getTopicUnread(tokenA, roomId, topicId);
        const snap4 = await getTopicUnread(tokenA, roomId, topic2Id);
        assert(snap3.unreadCount === 0, `iso t1 after read: expected 0, got=${snap3.unreadCount}`);
        assert(snap4.unreadCount === 5, `iso t2 after t1 read: expected 5, got=${snap4.unreadCount}`);
        console.log(`${PREFIX}   ✓ reading topic1 didn't affect topic2 (t1=0, t2=5)`);

        // Read topic2 completely → topic1 stays at 0
        await markTopicRead(tokenA, topic2Id, t2Ids[4]);
        const snap5 = await getTopicUnread(tokenA, roomId, topicId);
        const snap6 = await getTopicUnread(tokenA, roomId, topic2Id);
        assert(snap5.unreadCount === 0, `iso t1 final: expected 0, got=${snap5.unreadCount}`);
        assert(snap6.unreadCount === 0, `iso t2 final: expected 0, got=${snap6.unreadCount}`);
        console.log(`${PREFIX}   ✓ both topics clean (t1=0, t2=0)`);
      } finally {
        await fetchJson(`/v1/topics/${encodeURIComponent(topic2Id)}`, { method: "DELETE", token: tokenA });
      }
    }

  } finally {
    // cleanup: delete topic
    const { response: delR } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}`, {
      method: "DELETE", token: tokenA,
    });
    if (!delR.ok) console.warn(`${PREFIX} cleanup: topic delete failed`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalMsgsSent = 1 + (ROOM_MSG_COUNT * 2) + (MENTION_COUNT * 2) + (DM_MSG_COUNT * 2) + (20 * 4) + (10 * 2) + 5
    + ROOM_MSG_COUNT + 50 + 10 + 20 + 15; // phases 7-10
  console.log(`${PREFIX} ok (${baseUrl}) elapsed=${elapsed}s totalMessages≈${totalMsgsSent} phases=10/10`);

})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
