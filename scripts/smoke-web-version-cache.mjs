#!/usr/bin/env node

const apiBaseUrl = (process.env.SMOKE_API_URL ?? process.env.SMOKE_WEB_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const webBaseUrl = (process.env.SMOKE_WEB_BASE_URL ?? apiBaseUrl).replace(/\/+$/, "");
const expectedBuildSha = String(process.env.SMOKE_EXPECT_BUILD_SHA || "").trim();

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
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

async function main() {
  const versionUrl = `${apiBaseUrl}/version`;
  const versionResponse = await fetch(versionUrl, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache"
    }
  });

  if (!versionResponse.ok) {
    throw new Error(`[smoke:web:version-cache] /version failed: ${versionResponse.status}`);
  }

  const versionPayload = await versionResponse.json();
  const appBuildSha = String(versionPayload?.appBuildSha || "").trim();
  if (!appBuildSha) {
    throw new Error("[smoke:web:version-cache] /version returned empty appBuildSha");
  }

  if (expectedBuildSha && appBuildSha !== expectedBuildSha) {
    throw new Error(`[smoke:web:version-cache] appBuildSha mismatch: expected=${expectedBuildSha} actual=${appBuildSha}`);
  }

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
  const assetResponse = await fetch(assetUrl, { method: "HEAD", cache: "no-store" });
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
