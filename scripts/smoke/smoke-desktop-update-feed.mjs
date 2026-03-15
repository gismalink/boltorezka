#!/usr/bin/env node
// Purpose: Validate public desktop updater feed endpoints for electron-updater generic provider.

const webBaseUrl = String(process.env.SMOKE_WEB_BASE_URL || "https://test.boltorezka.gismalink.art").replace(/\/+$/, "");
const channel = String(process.env.SMOKE_DESKTOP_CHANNEL || "test").trim().toLowerCase();
const timeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);
const retries = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);

if (channel !== "test" && channel !== "prod") {
  console.error(`[smoke:desktop:update-feed] invalid channel: ${channel}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMessage(error) {
  if (!error) return "unknown error";
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

async function fetchWithRetry(url, options = {}, label = "request") {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw new Error(`[smoke:desktop:update-feed] ${label} failed after ${retries} attempts: ${toMessage(lastError)}`);
}

function parseYamlPath(yamlText) {
  const match = String(yamlText).match(/^path:\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

async function main() {
  const latestJsonUrl = `${webBaseUrl}/desktop/${channel}/latest.json`;
  const macYamlUrl = `${webBaseUrl}/desktop/${channel}/mac/latest-mac.yml`;

  const latestJsonResponse = await fetchWithRetry(latestJsonUrl, { cache: "no-store" }, "latest.json");
  if (!latestJsonResponse.ok) {
    throw new Error(`[smoke:desktop:update-feed] latest.json status=${latestJsonResponse.status}`);
  }

  const latestJson = await latestJsonResponse.json();
  const sha = String(latestJson?.sha || "").trim();
  if (!sha) {
    throw new Error("[smoke:desktop:update-feed] latest.json missing sha");
  }

  const macYamlResponse = await fetchWithRetry(macYamlUrl, { cache: "no-store" }, "latest-mac.yml");
  if (!macYamlResponse.ok) {
    throw new Error(`[smoke:desktop:update-feed] latest-mac.yml status=${macYamlResponse.status}`);
  }

  const macYamlText = await macYamlResponse.text();
  if (macYamlText.includes("<!doctype html>")) {
    throw new Error("[smoke:desktop:update-feed] latest-mac.yml returned HTML fallback");
  }
  if (!macYamlText.includes("sha512:")) {
    throw new Error("[smoke:desktop:update-feed] latest-mac.yml missing sha512");
  }

  const macZipPath = parseYamlPath(macYamlText);
  if (!macZipPath) {
    throw new Error("[smoke:desktop:update-feed] latest-mac.yml missing path field");
  }

  const macZipUrl = `${webBaseUrl}/desktop/${channel}/mac/${macZipPath}`;
  const macZipHead = await fetchWithRetry(macZipUrl, { method: "HEAD", cache: "no-store" }, "mac zip HEAD");
  if (!macZipHead.ok) {
    throw new Error(`[smoke:desktop:update-feed] mac zip HEAD status=${macZipHead.status}`);
  }

  const contentLength = String(macZipHead.headers.get("content-length") || "").trim();
  if (!contentLength || Number(contentLength) <= 0) {
    throw new Error("[smoke:desktop:update-feed] mac zip missing valid content-length");
  }

  console.log(
    `[smoke:desktop:update-feed] ok base=${webBaseUrl} channel=${channel} sha=${sha} path=${macZipPath} contentLength=${contentLength}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
