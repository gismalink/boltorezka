// Purpose: Validate chat object storage flow (upload init -> PUT -> finalize -> history read).
const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();
const roomSlug = String(process.env.SMOKE_CHAT_OBJECT_STORAGE_ROOM_SLUG ?? "general").trim() || "general";

if (!token) {
  console.log("[smoke:chat:object-storage] skipped: SMOKE_TEST_BEARER_TOKEN is not set");
  process.exit(0);
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${baseUrl}/${path}`;
  }
  return `${baseUrl}${path}`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(buildUrl(path), options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

(async () => {
  // 1x1 transparent PNG
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9v8WwAAAAASUVORK5CYII=";
  const binary = Buffer.from(pngBase64, "base64");
  const blob = new Blob([binary], { type: "image/png" });

  const initRes = await fetchJson("/v1/chat/uploads/init", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomSlug,
      mimeType: "image/png",
      sizeBytes: blob.size
    })
  });

  if (!initRes.response.ok) {
    throw new Error(`[smoke:chat:object-storage] upload init failed: ${initRes.response.status} ${JSON.stringify(initRes.payload)}`);
  }

  const uploadId = String(initRes.payload?.uploadId ?? "").trim();
  const storageKey = String(initRes.payload?.storageKey ?? "").trim();
  const uploadUrl = String(initRes.payload?.uploadUrl ?? "").trim();
  const requiredHeaders = initRes.payload?.requiredHeaders && typeof initRes.payload.requiredHeaders === "object"
    ? initRes.payload.requiredHeaders
    : { "content-type": "image/png" };

  if (!uploadId || !storageKey || !uploadUrl) {
    throw new Error(`[smoke:chat:object-storage] upload init contract invalid: ${JSON.stringify(initRes.payload)}`);
  }

  const putResponse = await fetch(buildUrl(uploadUrl), {
    method: "PUT",
    headers: requiredHeaders,
    body: blob
  });
  if (putResponse.status !== 204) {
    const putText = await putResponse.text().catch(() => "");
    throw new Error(`[smoke:chat:object-storage] upload PUT failed: ${putResponse.status} ${putText}`);
  }

  const text = `smoke object storage ${Date.now()}`;
  const finalizeRes = await fetchJson("/v1/chat/uploads/finalize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uploadId,
      roomSlug,
      storageKey,
      mimeType: "image/png",
      sizeBytes: blob.size,
      text
    })
  });

  if (!finalizeRes.response.ok) {
    throw new Error(`[smoke:chat:object-storage] upload finalize failed: ${finalizeRes.response.status} ${JSON.stringify(finalizeRes.payload)}`);
  }

  const messageId = String(finalizeRes.payload?.message?.id ?? "").trim();
  const attachmentId = String(finalizeRes.payload?.attachment?.id ?? "").trim();
  if (!messageId || !attachmentId) {
    throw new Error(`[smoke:chat:object-storage] finalize contract invalid: ${JSON.stringify(finalizeRes.payload)}`);
  }

  const historyRes = await fetchJson(`/v1/rooms/${encodeURIComponent(roomSlug)}/messages?limit=25`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!historyRes.response.ok) {
    throw new Error(`[smoke:chat:object-storage] messages fetch failed: ${historyRes.response.status}`);
  }

  const messages = Array.isArray(historyRes.payload?.messages) ? historyRes.payload.messages : [];
  const targetMessage = messages.find((item) => String(item?.id || "") === messageId);
  if (!targetMessage) {
    throw new Error("[smoke:chat:object-storage] finalized message not found in history");
  }

  const attachments = Array.isArray(targetMessage.attachments) ? targetMessage.attachments : [];
  if (attachments.length === 0) {
    throw new Error("[smoke:chat:object-storage] history message has no attachments");
  }

  const imageAttachment = attachments.find((item) => String(item?.type || "") === "image");
  if (!imageAttachment) {
    throw new Error("[smoke:chat:object-storage] image attachment is missing in history payload");
  }

  console.log(`[smoke:chat:object-storage] ok (${baseUrl}) room=${roomSlug} messageId=${messageId} attachmentId=${attachmentId}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
