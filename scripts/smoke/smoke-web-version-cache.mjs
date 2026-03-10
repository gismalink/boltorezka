#!/usr/bin/env node
// Purpose: Verify version endpoint/build-sha and cache policy for index and hashed assets.

const apiBaseUrl = (process.env.SMOKE_API_URL ?? process.env.SMOKE_WEB_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const webBaseUrl = (process.env.SMOKE_WEB_BASE_URL ?? apiBaseUrl).replace(/\/+$/, "");
const expectedBuildSha = String(process.env.SMOKE_EXPECT_BUILD_SHA || "").trim();
const fetchTimeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);
const maxFetchAttempts = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const versionSettleAttempts = Number(process.env.SMOKE_VERSION_SETTLE_ATTEMPTS || 5);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);

function hasToken(value, token) {
  return String(value || "")
    .toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .includes(token);
}

function extractFirstAssetPath(html) {
  const match = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  return match ? match[1] : null;
}

async function readText(url, options = {}) {
  const response = await fetchWithRetry(url, options, `GET ${new URL(url).pathname}`);
  const text = await response.text();
  return { response, text };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown error";
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

async function fetchWithRetry(url, options = {}, label = "request") {
  let lastError = null;

  for (let attempt = 1; attempt <= maxFetchAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt < maxFetchAttempts) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  const errorText = toErrorMessage(lastError);
  throw new Error(`[smoke:web:version-cache] ${label} failed after ${maxFetchAttempts} attempts: ${errorText}`);
}

async function resolveVersionPayload(versionUrl) {
  let lastObservedSha = "";

  for (let attempt = 1; attempt <= versionSettleAttempts; attempt += 1) {
    const versionResponse = await fetchWithRetry(
      versionUrl,
      {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache"
        }
      },
      `GET ${new URL(versionUrl).pathname}`
    );

    if (!versionResponse.ok) {
      throw new Error(`[smoke:web:version-cache] /version failed: ${versionResponse.status}`);
    }

    const versionPayload = await versionResponse.json();
    const appBuildSha = String(versionPayload?.appBuildSha || "").trim();
    lastObservedSha = appBuildSha;

    const shaMatches = !expectedBuildSha || appBuildSha === expectedBuildSha;
    if (appBuildSha && shaMatches) {
      return versionPayload;
    }

    if (attempt < versionSettleAttempts) {
      await sleep(retryDelayMs * attempt);
    }
  }

  if (!lastObservedSha) {
    throw new Error("[smoke:web:version-cache] /version returned empty appBuildSha");
  }

  throw new Error(
    `[smoke:web:version-cache] appBuildSha mismatch after ${versionSettleAttempts} checks: expected=${expectedBuildSha} actual=${lastObservedSha}`
  );
}

async function main() {
  const versionUrl = `${apiBaseUrl}/version`;
  const versionPayload = await resolveVersionPayload(versionUrl);
  const appBuildSha = String(versionPayload?.appBuildSha || "").trim();

  const webRootUrl = `${webBaseUrl}/`;
  const { response: indexResponse, text: indexHtml } = await readText(webRootUrl, {
    cache: "no-store"
  });
  if (!indexResponse.ok) {
    throw new Error(`[smoke:web:version-cache] index fetch failed: ${indexResponse.status}`);
  }

  const indexCacheControl = String(indexResponse.headers.get("cache-control") || "").toLowerCase();
  if (!hasToken(indexCacheControl, "no-store")) {
    throw new Error(`[smoke:web:version-cache] index cache-control must include no-store, got: ${indexCacheControl || "<empty>"}`);
  }

  const assetPath = extractFirstAssetPath(indexHtml);
  if (!assetPath) {
    throw new Error("[smoke:web:version-cache] cannot resolve hashed js asset path from index.html");
  }

  const assetUrl = new URL(assetPath, webRootUrl).toString();
  const assetResponse = await fetchWithRetry(assetUrl, { method: "HEAD", cache: "no-store" }, `HEAD ${new URL(assetUrl).pathname}`);
  if (!assetResponse.ok) {
    throw new Error(`[smoke:web:version-cache] asset HEAD failed: ${assetResponse.status} (${assetUrl})`);
  }

  const assetCacheControl = String(assetResponse.headers.get("cache-control") || "").toLowerCase();
  if (!hasToken(assetCacheControl, "immutable")) {
    throw new Error(`[smoke:web:version-cache] asset cache-control must include immutable, got: ${assetCacheControl || "<empty>"}`);
  }

  console.log(`[smoke:web:version-cache] ok api=${apiBaseUrl} web=${webBaseUrl} sha=${appBuildSha} asset=${new URL(assetUrl).pathname}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
