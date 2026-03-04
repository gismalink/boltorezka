// Purpose: Validate web static delivery contract (index/assets/auth mode endpoints).
const apiBaseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const webBaseUrl = (process.env.SMOKE_WEB_BASE_URL ?? apiBaseUrl).replace(/\/+$/, "");

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { response, text };
}

function extractFirstAssetPath(html) {
  const match = html.match(/<(?:script|link)[^>]+(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/i);
  if (!match) {
    return null;
  }
  return match[1];
}

(async () => {
  const webRoot = `${webBaseUrl}/`;
  const { response: webResponse, text: webHtml } = await fetchText(webRoot);

  if (!webResponse.ok) {
    throw new Error(`[smoke:web:static] web root failed: ${webResponse.status}`);
  }

  if (!webHtml.includes("<div id=\"root\"></div>")) {
    throw new Error("[smoke:web:static] root marker is missing in web html");
  }

  const assetPath = extractFirstAssetPath(webHtml);
  if (!assetPath) {
    throw new Error("[smoke:web:static] cannot find /assets/* reference in web html");
  }

  const assetUrl = new URL(assetPath, webRoot).toString();
  const assetResponse = await fetch(assetUrl);
  if (!assetResponse.ok) {
    throw new Error(`[smoke:web:static] asset fetch failed: ${assetResponse.status} ${assetUrl}`);
  }

  const healthResponse = await fetch(`${apiBaseUrl}/health`);
  if (!healthResponse.ok) {
    throw new Error(`[smoke:web:static] api health failed: ${healthResponse.status}`);
  }

  const modeResponse = await fetch(`${apiBaseUrl}/v1/auth/mode`);
  const modePayload = await modeResponse.json();
  if (!modeResponse.ok || modePayload?.mode !== "sso") {
    throw new Error(`[smoke:web:static] auth mode check failed: ${modeResponse.status}`);
  }

  console.log(`[smoke:web:static] ok api=${apiBaseUrl} web=${webBaseUrl} asset=${new URL(assetUrl).pathname}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
