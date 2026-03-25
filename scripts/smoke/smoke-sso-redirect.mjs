// Purpose: Validate SSO redirect contract and provider routing from auth start endpoint.
const baseUrl = (process.env.SMOKE_API_URL ?? "https://test.datowave.com").replace(/\/+$/, "");
const provider = (process.env.SSO_PROVIDER ?? "google").toLowerCase();
const fetchTimeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);
const maxFetchAttempts = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);

if (!["google", "yandex"].includes(provider)) {
  console.error(`[smoke:sso] invalid SSO_PROVIDER: ${provider}`);
  process.exit(1);
}

async function fetchJson(path, options = {}) {
  const response = await fetchWithRetry(`${baseUrl}${path}`, options, path);
  const text = await response.text();

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
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
  throw new Error(`[smoke:sso] ${label} failed after ${maxFetchAttempts} attempts: ${errorText}`);
}

(async () => {
  const expectedHost = new URL(baseUrl).host;
  const returnUrl = process.env.SSO_RETURN_URL ?? `${baseUrl}/`;

  const { response: modeResponse, payload: modePayload } = await fetchJson("/v1/auth/mode");
  if (!modeResponse.ok || modePayload?.mode !== "sso") {
    throw new Error(`[smoke:sso] /v1/auth/mode failed or mode!=sso: ${modeResponse.status}`);
  }

  const { response: registerResponse, payload: registerPayload } = await fetchJson("/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "smoke@example.com", password: "password123", name: "Smoke User" })
  });

  if (registerResponse.status !== 410 || registerPayload?.error !== "SsoOnly") {
    throw new Error(`[smoke:sso] expected SsoOnly for /v1/auth/register, got ${registerResponse.status}`);
  }

  const startUrl = `${baseUrl}/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  const redirectResponse = await fetchWithRetry(startUrl, { method: "GET", redirect: "manual" }, "/v1/auth/sso/start");
  const location = redirectResponse.headers.get("location") || "";

  if (redirectResponse.status !== 302 || !location) {
    throw new Error(`[smoke:sso] expected 302 redirect from /v1/auth/sso/start, got ${redirectResponse.status}`);
  }

  const locationUrl = new URL(location);
  const localHostStartsWithTest = expectedHost.startsWith("test.");
  const expectedAuthHostFromEnv = String(process.env.SMOKE_EXPECT_AUTH_HOST || "").trim();
  const expectedAuthHost = expectedAuthHostFromEnv
    || (expectedHost.endsWith("datowave.com")
      ? (localHostStartsWithTest ? "test.auth.datowave.com" : "auth.datowave.com")
      : (localHostStartsWithTest ? "test.auth.gismalink.art" : "auth.gismalink.art"));

  if (locationUrl.host !== expectedAuthHost) {
    throw new Error(`[smoke:sso] redirect host mismatch: expected ${expectedAuthHost}, got ${locationUrl.host}`);
  }

  if (!locationUrl.pathname.startsWith(`/auth/${provider}`)) {
    throw new Error(`[smoke:sso] redirect path mismatch: ${locationUrl.pathname}`);
  }

  const redirectedReturnUrl = locationUrl.searchParams.get("returnUrl") || "";
  if (redirectedReturnUrl !== returnUrl) {
    throw new Error(`[smoke:sso] returnUrl mismatch: expected ${returnUrl}, got ${redirectedReturnUrl}`);
  }

  console.log(`[smoke:sso] ok (${baseUrl}) -> ${locationUrl.host}${locationUrl.pathname}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
