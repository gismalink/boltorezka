// Purpose: Validate auth refresh rotation and logout-driven session invalidation.
const baseUrl = (process.env.SMOKE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const token = String(process.env.SMOKE_TEST_BEARER_TOKEN ?? '').trim();

if (!token) {
  console.log('[smoke:auth:session] skipped: SMOKE_TEST_BEARER_TOKEN is not set');
  process.exit(0);
}

const decodeJwtPayload = (value) => {
  const parts = String(value || '').split('.');
  if (parts.length < 2) {
    return null;
  }

  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

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
  const authHeaders = { Authorization: `Bearer ${token}` };

  const { response: refreshResponse, payload: refreshPayload } = await fetchJson('/v1/auth/refresh', {
    method: 'POST',
    headers: authHeaders
  });

  if (!refreshResponse.ok || !refreshPayload?.token) {
    throw new Error(`[smoke:auth:session] /v1/auth/refresh failed: ${refreshResponse.status}`);
  }

  const refreshedToken = String(refreshPayload.token || '').trim();
  if (!refreshedToken) {
    throw new Error('[smoke:auth:session] refreshed token is empty');
  }

  const refreshedClaims = decodeJwtPayload(refreshedToken);
  if (!refreshedClaims?.sid) {
    throw new Error('[smoke:auth:session] refreshed token missing sid claim');
  }

  const initialClaims = decodeJwtPayload(token);

  const { response: meResponse } = await fetchJson('/v1/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${refreshedToken}` }
  });

  if (!meResponse.ok) {
    throw new Error(`[smoke:auth:session] /v1/auth/me with refreshed token failed: ${meResponse.status}`);
  }

  if (initialClaims?.sid) {
    const { response: staleResponse } = await fetchJson('/v1/auth/me', {
      method: 'GET',
      headers: authHeaders
    });

    if (staleResponse.status !== 401) {
      throw new Error(`[smoke:auth:session] stale token expected 401 after refresh rotation, got ${staleResponse.status}`);
    }
  }

  const { response: logoutResponse } = await fetchJson('/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshedToken}` }
  });

  if (!logoutResponse.ok) {
    throw new Error(`[smoke:auth:session] /v1/auth/logout failed: ${logoutResponse.status}`);
  }

  const { response: revokedResponse } = await fetchJson('/v1/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${refreshedToken}` }
  });

  if (revokedResponse.status !== 401) {
    throw new Error(`[smoke:auth:session] revoked token expected 401 after logout, got ${revokedResponse.status}`);
  }

  console.log(`[smoke:auth:session] ok (${baseUrl}) sid=${refreshedClaims.sid}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
