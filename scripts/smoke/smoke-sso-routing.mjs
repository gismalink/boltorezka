// Purpose: Validate SSO routing contract for both start and logout redirects.
const baseUrl = (process.env.SMOKE_API_URL ?? "https://test.datowave.com").replace(/\/+$/, "");
const provider = (process.env.SSO_PROVIDER ?? "google").toLowerCase();
const fetchTimeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);
const maxFetchAttempts = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);

if (!["google", "yandex"].includes(provider)) {
  console.error(`[smoke:sso:routing] invalid SSO_PROVIDER: ${provider}`);
  process.exit(1);
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

  throw new Error(`[smoke:sso:routing] ${label} failed after ${maxFetchAttempts} attempts: ${toErrorMessage(lastError)}`);
}

function resolveExpectedAuthHost(expectedHost) {
  const localHostStartsWithTest = expectedHost.startsWith("test.");
  const expectedAuthHostFromEnv = String(process.env.SMOKE_EXPECT_AUTH_HOST || "").trim();
  if (expectedAuthHostFromEnv) {
    return expectedAuthHostFromEnv;
  }

  if (expectedHost.endsWith("datowave.com")) {
    return localHostStartsWithTest ? "test.auth.datowave.com" : "auth.datowave.com";
  }

  return localHostStartsWithTest ? "test.auth.datowave.com" : "auth.datowave.com";
}

function assertRedirect({ response, location, expectedHost, expectedPathPrefix, expectedReturnUrl, label }) {
  if (response.status !== 302 || !location) {
    throw new Error(`[smoke:sso:routing] expected 302 redirect for ${label}, got ${response.status}`);
  }

  const locationUrl = new URL(location);
  if (locationUrl.host !== expectedHost) {
    throw new Error(`[smoke:sso:routing] ${label} host mismatch: expected ${expectedHost}, got ${locationUrl.host}`);
  }

  if (!locationUrl.pathname.startsWith(expectedPathPrefix)) {
    throw new Error(`[smoke:sso:routing] ${label} path mismatch: expected prefix ${expectedPathPrefix}, got ${locationUrl.pathname}`);
  }

  const redirectedReturnUrl = locationUrl.searchParams.get("returnUrl") || "";
  if (redirectedReturnUrl !== expectedReturnUrl) {
    throw new Error(`[smoke:sso:routing] ${label} returnUrl mismatch: expected ${expectedReturnUrl}, got ${redirectedReturnUrl}`);
  }

  return locationUrl;
}

(async () => {
  const expectedHost = new URL(baseUrl).host;
  const expectedAuthHost = resolveExpectedAuthHost(expectedHost);

  const startReturnUrl = process.env.SSO_RETURN_URL ?? `${baseUrl}/`;
  const logoutReturnUrl = process.env.SSO_LOGOUT_RETURN_URL ?? `${baseUrl}/`;

  const startUrl = `${baseUrl}/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(startReturnUrl)}`;
  const startResponse = await fetchWithRetry(startUrl, { method: "GET", redirect: "manual" }, "/v1/auth/sso/start");
  const startLocation = startResponse.headers.get("location") || "";

  const startLocationUrl = assertRedirect({
    response: startResponse,
    location: startLocation,
    expectedHost: expectedAuthHost,
    expectedPathPrefix: `/auth/${provider}`,
    expectedReturnUrl: startReturnUrl,
    label: "sso/start"
  });

  const logoutUrl = `${baseUrl}/v1/auth/sso/logout?returnUrl=${encodeURIComponent(logoutReturnUrl)}`;
  const logoutResponse = await fetchWithRetry(logoutUrl, { method: "GET", redirect: "manual" }, "/v1/auth/sso/logout");
  const logoutLocation = logoutResponse.headers.get("location") || "";

  const logoutLocationUrl = assertRedirect({
    response: logoutResponse,
    location: logoutLocation,
    expectedHost: expectedAuthHost,
    expectedPathPrefix: "/auth/logout",
    expectedReturnUrl: logoutReturnUrl,
    label: "sso/logout"
  });

  console.log(
    `[smoke:sso:routing] ok (${baseUrl}) start=${startLocationUrl.host}${startLocationUrl.pathname} logout=${logoutLocationUrl.host}${logoutLocationUrl.pathname}`
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
