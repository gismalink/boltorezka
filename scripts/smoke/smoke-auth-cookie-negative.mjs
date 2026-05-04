// Purpose: Negative smoke tests for cookie-mode auth security properties.
// Tests: invalid cookie → 401, refresh replay → 401, missing cookie → 401.
// Requires: SMOKE_TEST_BEARER_TOKEN with valid sid claim pointing at test env.
const baseUrl = (process.env.SMOKE_API_URL ?? 'https://test.datowave.com').replace(/\/+$/, '');
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? '').trim();
const cookieName = process.env.SMOKE_SESSION_COOKIE_NAME ?? 'datowave_session_test';

if (!token) {
  console.log('[smoke:auth:cookie-negative] skipped: SMOKE_TEST_BEARER_TOKEN is not set');
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
    console.log('[smoke:auth:cookie-negative] skipped: SMOKE_TEST_BEARER_TOKEN has no sid claim');
    process.exit(0);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // -----------------------------------------------------------------------
  // 1. Invalid cookie value → must get 401 (not 200 or 500)
  // -----------------------------------------------------------------------
  const invalidCookie = `${cookieName}=this-is-not-a-valid-jwt-token`;
  const { response: invalidCookieResponse } = await fetchJson('/v1/auth/me', {
    method: 'GET',
    headers: { Cookie: invalidCookie }
  });

  if (invalidCookieResponse.status !== 401) {
    throw new Error(
      `[smoke:auth:cookie-negative] invalid cookie should return 401, got ${invalidCookieResponse.status}`
    );
  }

  // -----------------------------------------------------------------------
  // 2. Absent cookie (no Authorization, no Cookie) → must get 401
  // -----------------------------------------------------------------------
  const { response: noCookieResponse } = await fetchJson('/v1/auth/me', {
    method: 'GET',
    headers: {}
  });

  if (noCookieResponse.status !== 401) {
    throw new Error(
      `[smoke:auth:cookie-negative] missing auth should return 401, got ${noCookieResponse.status}`
    );
  }

  // -----------------------------------------------------------------------
  // 3. Refresh replay protection: rotate once with bearer, then replay old token → 401
  // -----------------------------------------------------------------------
  const { response: r1, payload: p1 } = await fetchJson('/v1/auth/refresh', {
    method: 'POST',
    headers: authHeaders
  });

  if (!r1.ok || !p1?.token) {
    throw new Error(`[smoke:auth:cookie-negative] initial refresh failed: ${r1.status}`);
  }

  const rotatedToken = String(p1.token).trim();

  // Replay the original (stale) bearer token for refresh → should get 401
  const { response: replayResponse } = await fetchJson('/v1/auth/refresh', {
    method: 'POST',
    headers: authHeaders  // original token, not rotated
  });

  if (replayResponse.status !== 401) {
    throw new Error(
      `[smoke:auth:cookie-negative] refresh replay should return 401, got ${replayResponse.status}`
    );
  }

  // -----------------------------------------------------------------------
  // 4. Cookie with wrong name → field ignored, 401 expected
  // -----------------------------------------------------------------------
  const wrongNameCookie = `wrong_cookie_name=${encodeURIComponent(rotatedToken)}`;
  const { response: wrongNameResponse } = await fetchJson('/v1/auth/me', {
    method: 'GET',
    headers: { Cookie: wrongNameCookie }
  });

  if (wrongNameResponse.status !== 401) {
    throw new Error(
      `[smoke:auth:cookie-negative] wrong cookie name should return 401, got ${wrongNameResponse.status}`
    );
  }

  // -----------------------------------------------------------------------
  // 5. Cleanup: logout the rotated token so it doesn't pollute session state
  // -----------------------------------------------------------------------
  await fetchJson('/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${rotatedToken}` }
  });

  console.log(`[smoke:auth:cookie-negative] ok (${baseUrl}) all negative checks passed`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
