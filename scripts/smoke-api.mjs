const baseUrl = (process.env.SMOKE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const token = process.env.SMOKE_BEARER_TOKEN ?? '';

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
  const { response: healthResponse } = await fetchJson('/health');
  if (!healthResponse.ok) {
    throw new Error(`[smoke] /health failed: ${healthResponse.status}`);
  }

  const { response: modeResponse, payload: modePayload } = await fetchJson('/v1/auth/mode');
  if (!modeResponse.ok || modePayload?.mode !== 'sso') {
    throw new Error(`[smoke] /v1/auth/mode failed or mode!=sso: ${modeResponse.status}`);
  }

  const { response: registerResponse, payload: registerPayload } = await fetchJson('/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke@example.com', password: 'password123', name: 'Smoke User' }),
  });

  if (registerResponse.status !== 410 || registerPayload?.error !== 'SsoOnly') {
    throw new Error(`[smoke] expected SsoOnly for /v1/auth/register, got ${registerResponse.status}`);
  }

  if (token) {
    const authHeaders = { Authorization: `Bearer ${token}` };

    const { response: roomsResponse } = await fetchJson('/v1/rooms', { headers: authHeaders });
    if (!roomsResponse.ok) {
      throw new Error(`[smoke] /v1/rooms failed: ${roomsResponse.status}`);
    }

    const { response: historyResponse } = await fetchJson('/v1/rooms/general/messages?limit=10', {
      headers: authHeaders,
    });
    if (!historyResponse.ok) {
      throw new Error(`[smoke] /v1/rooms/general/messages failed: ${historyResponse.status}`);
    }
  } else {
    console.log('[smoke] SMOKE_BEARER_TOKEN is not set -> protected endpoints skipped');
  }

  console.log(`[smoke] api ok (${baseUrl})`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
