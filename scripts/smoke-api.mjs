const baseUrl = (process.env.SMOKE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const token = process.env.SMOKE_BEARER_TOKEN ?? '';
const checkTelemetrySummary = process.env.SMOKE_TELEMETRY_SUMMARY !== '0';
const checkRoomHierarchy = process.env.SMOKE_ROOM_HIERARCHY !== '0';

function makeSmokeSlug(prefix) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${suffix}`.slice(0, 48);
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
    let createdRoomId = '';
    let createdCategoryId = '';

    const { response: telemetryResponse } = await fetchJson('/v1/telemetry/web', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'smoke.api.telemetry', meta: { source: 'smoke-api' } }),
    });
    if (!telemetryResponse.ok) {
      throw new Error(`[smoke] /v1/telemetry/web failed: ${telemetryResponse.status}`);
    }

    if (checkTelemetrySummary) {
      const { response: summaryResponse, payload: summaryPayload } = await fetchJson('/v1/telemetry/summary', {
        method: 'GET',
        headers: authHeaders,
      });

      if (!summaryResponse.ok) {
        throw new Error(`[smoke] /v1/telemetry/summary failed: ${summaryResponse.status}`);
      }

      const metrics = summaryPayload?.metrics || {};
      const telemetryMetric = Number(metrics.telemetry_web_event || 0);
      if (!Number.isFinite(telemetryMetric) || telemetryMetric < 1) {
        throw new Error('[smoke] telemetry summary metric telemetry_web_event is invalid');
      }
    }

    const { response: roomsResponse } = await fetchJson('/v1/rooms', { headers: authHeaders });
    if (!roomsResponse.ok) {
      throw new Error(`[smoke] /v1/rooms failed: ${roomsResponse.status}`);
    }

    if (checkRoomHierarchy) {
      const categorySlug = makeSmokeSlug('smoke-cat');
      const roomSlug = makeSmokeSlug('smoke-room');

      const { response: categoryCreateResponse, payload: categoryCreatePayload } = await fetchJson('/v1/room-categories', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: categorySlug, title: 'Smoke Category' }),
      });

      if (categoryCreateResponse.status !== 201 || !categoryCreatePayload?.category?.id) {
        throw new Error(`[smoke] /v1/room-categories create failed: ${categoryCreateResponse.status}`);
      }

      createdCategoryId = String(categoryCreatePayload.category.id);

      try {
        const { response: roomCreateResponse, payload: roomCreatePayload } = await fetchJson('/v1/rooms', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: roomSlug,
            title: 'Smoke Room',
            is_public: true,
            kind: 'text',
            category_id: createdCategoryId,
          }),
        });

        if (roomCreateResponse.status !== 201 || !roomCreatePayload?.room?.id) {
          throw new Error(`[smoke] /v1/rooms create in category failed: ${roomCreateResponse.status}`);
        }

        createdRoomId = String(roomCreatePayload.room.id);

        const { response: treeResponse, payload: treePayload } = await fetchJson('/v1/rooms/tree', { headers: authHeaders });
        if (!treeResponse.ok) {
          throw new Error(`[smoke] /v1/rooms/tree failed: ${treeResponse.status}`);
        }

        const categories = Array.isArray(treePayload?.categories) ? treePayload.categories : [];
        const createdCategory = categories.find((item) => item?.id === createdCategoryId);
        if (!createdCategory) {
          throw new Error('[smoke] /v1/rooms/tree missing created category');
        }

        const channels = Array.isArray(createdCategory.channels) ? createdCategory.channels : [];
        const createdRoom = channels.find((item) => item?.id === createdRoomId && item?.slug === roomSlug);
        if (!createdRoom) {
          throw new Error('[smoke] /v1/rooms/tree missing created room in created category');
        }
      } finally {
        if (createdRoomId) {
          const { response: roomDeleteResponse } = await fetchJson(`/v1/rooms/${encodeURIComponent(createdRoomId)}`, {
            method: 'DELETE',
            headers: authHeaders,
          });

          if (!roomDeleteResponse.ok) {
            throw new Error(`[smoke] cleanup room delete failed: ${roomDeleteResponse.status}`);
          }
        }

        if (createdCategoryId) {
          const { response: categoryDeleteResponse } = await fetchJson(
            `/v1/room-categories/${encodeURIComponent(createdCategoryId)}`,
            {
              method: 'DELETE',
              headers: authHeaders,
            }
          );

          if (!categoryDeleteResponse.ok) {
            throw new Error(`[smoke] cleanup category delete failed: ${categoryDeleteResponse.status}`);
          }
        }
      }
    }

    const { response: historyResponse, payload: historyPayload } = await fetchJson('/v1/rooms/general/messages?limit=10', {
      headers: authHeaders,
    });
    if (!historyResponse.ok) {
      throw new Error(`[smoke] /v1/rooms/general/messages failed: ${historyResponse.status}`);
    }

    if (!historyPayload || typeof historyPayload !== 'object') {
      throw new Error('[smoke] /v1/rooms/general/messages invalid payload');
    }

    if (!historyPayload.pagination || typeof historyPayload.pagination.hasMore !== 'boolean') {
      throw new Error('[smoke] /v1/rooms/general/messages missing pagination contract');
    }

    const nextCursor = historyPayload.pagination.nextCursor;
    if (nextCursor) {
      const beforeCreatedAt = encodeURIComponent(String(nextCursor.beforeCreatedAt || ''));
      const beforeId = encodeURIComponent(String(nextCursor.beforeId || ''));
      const { response: historyPage2Response } = await fetchJson(
        `/v1/rooms/general/messages?limit=5&beforeCreatedAt=${beforeCreatedAt}&beforeId=${beforeId}`,
        { headers: authHeaders }
      );

      if (!historyPage2Response.ok) {
        throw new Error(`[smoke] paginated /v1/rooms/general/messages failed: ${historyPage2Response.status}`);
      }
    }
  } else {
    console.log('[smoke] SMOKE_BEARER_TOKEN is not set -> protected endpoints skipped');
  }

  console.log(`[smoke] api ok (${baseUrl})`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
