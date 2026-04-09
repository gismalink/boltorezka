// Purpose: smoke-check topic around-anchor jump semantics (unread=0, unread>0 when second actor is available).
const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const tokenSecond = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();

function makeSlug(prefix) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${suffix}`.slice(0, 56);
}

async function fetchJson(path, { method = "GET", token: authToken = "", body } = {}) {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
}

function ensureOk(response, payload, label) {
  if (!response.ok) {
    throw new Error(`[smoke:chat:anchor-jump] ${label} failed: status=${response.status} body=${String(JSON.stringify(payload || {})).slice(0, 300)}`);
  }
}

(async () => {
  if (!token) {
    console.log(`[smoke:chat:anchor-jump] skipped (${baseUrl}) reason=no-token`);
    return;
  }

  const { response: roomsResponse, payload: roomsPayload } = await fetchJson("/v1/rooms", { token });
  ensureOk(roomsResponse, roomsPayload, "list rooms");

  const rooms = Array.isArray(roomsPayload?.rooms) ? roomsPayload.rooms : [];
  const room = rooms.find((item) => String(item?.slug || "") === "general") || rooms.find((item) => String(item?.kind || "") === "text") || rooms[0];
  const roomId = String(room?.id || "").trim();
  if (!roomId) {
    throw new Error("[smoke:chat:anchor-jump] cannot resolve room id");
  }

  const topicTitle = `Smoke Anchor ${makeSlug("topic")}`;
  const { response: topicCreateResponse, payload: topicCreatePayload } = await fetchJson(`/v1/rooms/${encodeURIComponent(roomId)}/topics`, {
    method: "POST",
    token,
    body: { title: topicTitle }
  });
  ensureOk(topicCreateResponse, topicCreatePayload, "create topic");

  const topicId = String(topicCreatePayload?.topic?.id || "").trim();
  if (!topicId) {
    throw new Error("[smoke:chat:anchor-jump] create topic missing id");
  }

  let unreadGtZeroChecked = false;

  try {
    const { response: seedMessageResponse, payload: seedMessagePayload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/messages`, {
      method: "POST",
      token,
      body: { text: "seed-message-self" }
    });
    ensureOk(seedMessageResponse, seedMessagePayload, "create seed message");

    const seedMessageId = String(seedMessagePayload?.message?.id || "").trim();
    if (!seedMessageId) {
      throw new Error("[smoke:chat:anchor-jump] seed message id is missing");
    }

    const { response: markSeedReadResponse, payload: markSeedReadPayload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/read`, {
      method: "POST",
      token,
      body: { lastReadMessageId: seedMessageId }
    });
    ensureOk(markSeedReadResponse, markSeedReadPayload, "mark seed read");

    if (tokenSecond) {
      const { response: foreignMsg1Response, payload: foreignMsg1Payload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/messages`, {
        method: "POST",
        token: tokenSecond,
        body: { text: "foreign-message-1" }
      });
      ensureOk(foreignMsg1Response, foreignMsg1Payload, "create foreign message 1");
      const foreignMessageId1 = String(foreignMsg1Payload?.message?.id || "").trim();

      const { response: foreignMsg2Response, payload: foreignMsg2Payload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/messages`, {
        method: "POST",
        token: tokenSecond,
        body: { text: "foreign-message-2" }
      });
      ensureOk(foreignMsg2Response, foreignMsg2Payload, "create foreign message 2");
      const foreignMessageId2 = String(foreignMsg2Payload?.message?.id || "").trim();

      if (!foreignMessageId1 || !foreignMessageId2) {
        throw new Error("[smoke:chat:anchor-jump] foreign message ids missing");
      }

      const { response: aroundUnreadResponse, payload: aroundUnreadPayload } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&aroundUnreadWindow=true`,
        { token }
      );
      ensureOk(aroundUnreadResponse, aroundUnreadPayload, "around unread window");

      const unreadDividerMessageId = String(aroundUnreadPayload?.unreadDividerMessageId || "").trim();
      if (unreadDividerMessageId !== foreignMessageId1) {
        throw new Error(`[smoke:chat:anchor-jump] unread divider mismatch: expected=${foreignMessageId1} actual=${unreadDividerMessageId || "<empty>"}`);
      }

      const { response: anchorJumpResponse, payload: anchorJumpPayload } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&anchorMessageId=${encodeURIComponent(foreignMessageId1)}&aroundWindowBefore=1&aroundWindowAfter=1`,
        { token }
      );
      ensureOk(anchorJumpResponse, anchorJumpPayload, "anchor jump around window");

      const anchorMessages = Array.isArray(anchorJumpPayload?.messages) ? anchorJumpPayload.messages : [];
      if (!anchorMessages.some((message) => String(message?.id || "") === foreignMessageId1)) {
        throw new Error("[smoke:chat:anchor-jump] anchor message not found in around window");
      }

      const { response: markUnreadClearResponse, payload: markUnreadClearPayload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}/read`, {
        method: "POST",
        token,
        body: { lastReadMessageId: foreignMessageId2 }
      });
      ensureOk(markUnreadClearResponse, markUnreadClearPayload, "mark unread clear");

      const { response: aroundNoUnreadResponse, payload: aroundNoUnreadPayload } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&aroundUnreadWindow=true`,
        { token }
      );
      ensureOk(aroundNoUnreadResponse, aroundNoUnreadPayload, "around unread window after read-all");

      const unreadAfterClear = String(aroundNoUnreadPayload?.unreadDividerMessageId || "").trim();
      if (unreadAfterClear) {
        throw new Error(`[smoke:chat:anchor-jump] expected no unread divider after read-all, got=${unreadAfterClear}`);
      }

      unreadGtZeroChecked = true;
    } else {
      const { response: anchorSelfResponse, payload: anchorSelfPayload } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&anchorMessageId=${encodeURIComponent(seedMessageId)}&aroundWindowBefore=1&aroundWindowAfter=1`,
        { token }
      );
      ensureOk(anchorSelfResponse, anchorSelfPayload, "anchor jump self message");

      const anchorMessages = Array.isArray(anchorSelfPayload?.messages) ? anchorSelfPayload.messages : [];
      if (!anchorMessages.some((message) => String(message?.id || "") === seedMessageId)) {
        throw new Error("[smoke:chat:anchor-jump] self anchor message not found in around window");
      }

      const { response: aroundNoUnreadResponse, payload: aroundNoUnreadPayload } = await fetchJson(
        `/v1/topics/${encodeURIComponent(topicId)}/messages?limit=20&aroundUnreadWindow=true`,
        { token }
      );
      ensureOk(aroundNoUnreadResponse, aroundNoUnreadPayload, "around unread window (single actor)");

      const unreadDivider = String(aroundNoUnreadPayload?.unreadDividerMessageId || "").trim();
      if (unreadDivider) {
        throw new Error(`[smoke:chat:anchor-jump] expected unreadDividerMessageId to be empty in single-actor scenario, got=${unreadDivider}`);
      }
    }
  } finally {
    const { response: topicDeleteResponse, payload: topicDeletePayload } = await fetchJson(`/v1/topics/${encodeURIComponent(topicId)}`, {
      method: "DELETE",
      token
    });

    if (!topicDeleteResponse.ok) {
      console.warn(`[smoke:chat:anchor-jump] cleanup topic delete failed: status=${topicDeleteResponse.status} body=${String(JSON.stringify(topicDeletePayload || {})).slice(0, 220)}`);
    }
  }

  console.log(`[smoke:chat:anchor-jump] ok (${baseUrl}) unreadGtZeroChecked=${unreadGtZeroChecked}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
