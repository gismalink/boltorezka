// Purpose: Regression smoke for ws-ticket issuance via cookie auth (no bearer token).
// Tests that GET /v1/auth/ws-ticket works correctly when the client authenticates
// via HttpOnly session cookie instead of a bearer Authorization header.
//
// Requires: SMOKE_TEST_BEARER_TOKEN — used to acquire a session cookie via /v1/auth/refresh,
//           then dropped for the actual ws-ticket call to simulate cookie-only auth.
// Optional: SMOKE_SESSION_COOKIE_NAME — defaults to boltorezka_session_test.

const baseUrl = (process.env.SMOKE_API_URL ?? 'https://test.datowave.com').replace(/\/+$/, '');
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? '').trim();
const cookieName = String(process.env.SMOKE_SESSION_COOKIE_NAME ?? 'boltorezka_session_test').trim();

if (!token) {
  console.log('[smoke:auth:cookie-ws-ticket] skipped: SMOKE_TEST_BEARER_TOKEN is not set');
  process.exit(0);
}

const decodeJwtPayload = (value) => {
  const parts = String(value || '').split('.');
  if (parts.length < 2) return null;
  const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(Buffer.from(pad.padEnd(Math.ceil(pad.length / 4) * 4, '='), 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload };
}

(async () => {
  const initialClaims = decodeJwtPayload(token);
  if (!initialClaims?.sid) {
    console.log('[smoke:auth:cookie-ws-ticket] skipped: SMOKE_TEST_BEARER_TOKEN has no sid claim');
    process.exit(0);
  }

  // -----------------------------------------------------------------------
  // 1. Acquire session cookie by calling /v1/auth/refresh with bearer.
  //    In cookie-mode the server will issue a Set-Cookie header.
  // -----------------------------------------------------------------------
  const refreshResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!refreshResponse.ok) {
    throw new Error(`[smoke:auth:cookie-ws-ticket] refresh failed: ${refreshResponse.status}`);
  }

  const refreshPayload = await refreshResponse.json();
  const refreshedToken = String(refreshPayload?.token ?? '').trim();

  // Extract the session cookie from Set-Cookie header.
  const setCookieHeader = refreshResponse.headers.get('set-cookie');
  const cookieMatch = setCookieHeader ? setCookieHeader.match(new RegExp(`(?:^|[;,]\\s*)${cookieName}=([^;,]+)`)) : null;
  const sessionCookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1].trim()) : null;

  if (!sessionCookieValue) {
    console.log(`[smoke:auth:cookie-ws-ticket] warning: server did not set ${cookieName} cookie — AUTH_COOKIE_MODE may be off`);
    console.log(`[smoke:auth:cookie-ws-ticket] set-cookie: ${setCookieHeader ?? '(none)'}`);
    // Soft-fail: cookie mode may not be enabled on this environment.
    // We verify the ws-ticket endpoint still works via bearer as a baseline.
    const { response: bearerTicketRes, payload: bearerTicketPayload } = await fetchJson('/v1/auth/ws-ticket', {
      headers: { Authorization: `Bearer ${refreshedToken || token}` }
    });
    if (!bearerTicketRes.ok) {
      throw new Error(`[smoke:auth:cookie-ws-ticket] bearer ws-ticket failed: ${bearerTicketRes.status}`);
    }
    const ticket = String(bearerTicketPayload?.ticket ?? '').trim();
    const expiresInSec = Number(bearerTicketPayload?.expiresInSec);
    if (!ticket || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
      throw new Error(`[smoke:auth:cookie-ws-ticket] bearer ws-ticket response invalid: ${JSON.stringify(bearerTicketPayload)}`);
    }
    console.log(`[smoke:auth:cookie-ws-ticket] ok (bearer-only baseline, cookie-mode not detected) ticket=${ticket.slice(0, 8)}... expiresInSec=${expiresInSec}`);
    process.exit(0);
  }

  const sessionCookie = `${cookieName}=${encodeURIComponent(sessionCookieValue)}`;
  console.log(`[smoke:auth:cookie-ws-ticket] acquired session cookie (${cookieName})`);

  // -----------------------------------------------------------------------
  // 2. Call /v1/auth/ws-ticket with ONLY the session cookie — no bearer.
  //    This is the primary regression: ticket issuance must work cookie-only.
  // -----------------------------------------------------------------------
  const { response: wsTicketRes, payload: wsTicketPayload } = await fetchJson('/v1/auth/ws-ticket', {
    headers: { Cookie: sessionCookie }
  });

  if (!wsTicketRes.ok) {
    throw new Error(
      `[smoke:auth:cookie-ws-ticket] ws-ticket via cookie returned ${wsTicketRes.status} (expected 200)\n` +
      `response: ${JSON.stringify(wsTicketPayload)}`
    );
  }

  const ticket = String(wsTicketPayload?.ticket ?? '').trim();
  const expiresInSec = Number(wsTicketPayload?.expiresInSec);

  if (!ticket || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
    throw new Error(
      `[smoke:auth:cookie-ws-ticket] ws-ticket response missing required fields: ${JSON.stringify(wsTicketPayload)}`
    );
  }
  console.log(`[smoke:auth:cookie-ws-ticket] cookie-only ws-ticket ok: ticket=${ticket.slice(0, 8)}... expiresInSec=${expiresInSec}`);

  // -----------------------------------------------------------------------
  // 3. No auth at all → must return 401
  // -----------------------------------------------------------------------
  const { response: noAuthRes } = await fetchJson('/v1/auth/ws-ticket', {
    headers: {}
  });
  if (noAuthRes.status !== 401) {
    throw new Error(`[smoke:auth:cookie-ws-ticket] no-auth should return 401, got ${noAuthRes.status}`);
  }
  console.log('[smoke:auth:cookie-ws-ticket] no-auth 401: ok');

  // -----------------------------------------------------------------------
  // 4. Invalid cookie value → must return 401
  // -----------------------------------------------------------------------
  const { response: invalidCookieRes } = await fetchJson('/v1/auth/ws-ticket', {
    headers: { Cookie: `${cookieName}=this.is.not.a.valid.jwt` }
  });
  if (invalidCookieRes.status !== 401) {
    throw new Error(`[smoke:auth:cookie-ws-ticket] invalid cookie should return 401, got ${invalidCookieRes.status}`);
  }
  console.log('[smoke:auth:cookie-ws-ticket] invalid-cookie 401: ok');

  // -----------------------------------------------------------------------
  // 5. Cleanup: logout using the refreshed token to avoid polluting session state.
  // -----------------------------------------------------------------------
  await fetch(`${baseUrl}/v1/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshedToken || token}` }
  }).catch(() => {});

  console.log(`[smoke:auth:cookie-ws-ticket] ok (${baseUrl}) all checks passed`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
