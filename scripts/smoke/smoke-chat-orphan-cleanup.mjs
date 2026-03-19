// Purpose: Validate orphan attachment object cleanup flow for chat storage provider.
const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? "").trim();
const roomSlug = String(process.env.SMOKE_CHAT_OBJECT_STORAGE_ROOM_SLUG ?? "general").trim() || "general";

if (!token) {
  console.log("[smoke:chat:orphan-cleanup] skipped: SMOKE_TEST_BEARER_TOKEN is not set");
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
    throw new Error(`[smoke:chat:orphan-cleanup] upload init failed: ${initRes.response.status} ${JSON.stringify(initRes.payload)}`);
  }

  const uploadId = String(initRes.payload?.uploadId ?? "").trim();
  const storageKey = String(initRes.payload?.storageKey ?? "").trim();
  const uploadUrl = String(initRes.payload?.uploadUrl ?? "").trim();
  const requiredHeaders = initRes.payload?.requiredHeaders && typeof initRes.payload.requiredHeaders === "object"
    ? initRes.payload.requiredHeaders
    : { "content-type": "image/png" };

  if (!uploadId || !storageKey || !uploadUrl) {
    throw new Error(`[smoke:chat:orphan-cleanup] invalid init response: ${JSON.stringify(initRes.payload)}`);
  }

  const putResponse = await fetch(buildUrl(uploadUrl), {
    method: "PUT",
    headers: requiredHeaders,
    body: blob
  });

  if (putResponse.status !== 204) {
    const putText = await putResponse.text().catch(() => "");
    throw new Error(`[smoke:chat:orphan-cleanup] upload PUT failed: ${putResponse.status} ${putText}`);
  }

  const cleanupRes = await fetchJson("/v1/admin/chat/uploads/orphan-cleanup", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prefix: storageKey,
      olderThanSec: 0,
      dryRun: false,
      maxScan: 10,
      maxDelete: 10
    })
  });

  if (!cleanupRes.response.ok) {
    throw new Error(`[smoke:chat:orphan-cleanup] cleanup failed: ${cleanupRes.response.status} ${JSON.stringify(cleanupRes.payload)}`);
  }

  const deletedCount = Number(cleanupRes.payload?.deletedCount || 0);
  const deletedKeys = Array.isArray(cleanupRes.payload?.deletedKeys) ? cleanupRes.payload.deletedKeys : [];
  if (deletedCount < 1) {
    throw new Error(`[smoke:chat:orphan-cleanup] expected deletedCount>=1, got ${deletedCount}`);
  }

  if (!deletedKeys.includes(storageKey)) {
    throw new Error("[smoke:chat:orphan-cleanup] deletedKeys does not include uploaded orphan storageKey");
  }

  console.log(`[smoke:chat:orphan-cleanup] ok (${baseUrl}) uploadId=${uploadId} storageKey=${storageKey}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
