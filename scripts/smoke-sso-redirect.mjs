const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const provider = (process.env.SSO_PROVIDER ?? "google").toLowerCase();

if (!["google", "yandex"].includes(provider)) {
  console.error(`[smoke:sso] invalid SSO_PROVIDER: ${provider}`);
  process.exit(1);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
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
  const redirectResponse = await fetch(startUrl, { method: "GET", redirect: "manual" });
  const location = redirectResponse.headers.get("location") || "";

  if (redirectResponse.status !== 302 || !location) {
    throw new Error(`[smoke:sso] expected 302 redirect from /v1/auth/sso/start, got ${redirectResponse.status}`);
  }

  const locationUrl = new URL(location);
  const localHostStartsWithTest = expectedHost.startsWith("test.");
  const expectedAuthHost = localHostStartsWithTest ? "test.auth.gismalink.art" : "auth.gismalink.art";

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
