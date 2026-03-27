// Purpose: Validate invite acceptance idempotency and server/service ban enforcement in multi-server API.
const baseUrl = (process.env.SMOKE_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const ownerToken = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const secondToken = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const adminToken = String(process.env.SMOKE_TEST_BEARER_TOKEN_ADMIN || "").trim();

if (!ownerToken) {
  console.error("[smoke:multiserver] SMOKE_TEST_BEARER_TOKEN is required");
  process.exit(1);
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
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

function assertOk(response, payload, message) {
  if (!response.ok) {
    throw new Error(`${message}: status=${response.status} payload=${JSON.stringify(payload)}`);
  }
}

async function resolveOperableServerId(token) {
  const defaultServer = await fetchJson("/v1/servers/default", {
    headers: authHeader(token)
  });

  if (defaultServer.response.ok) {
    const id = String(defaultServer.payload?.server?.id || "").trim();
    if (id) {
      return id;
    }
  }

  const serversResponse = await fetchJson("/v1/servers", {
    headers: authHeader(token)
  });
  assertOk(serversResponse.response, serversResponse.payload, "servers list request failed");

  const servers = Array.isArray(serversResponse.payload?.servers)
    ? serversResponse.payload.servers
    : [];

  const operable = servers.find((server) => {
    const role = String(server?.role || "").trim();
    return role === "owner" || role === "admin";
  });

  if (operable?.id) {
    return String(operable.id).trim();
  }

  const createServer = await fetchJson("/v1/servers", {
    method: "POST",
    headers: {
      ...authHeader(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: `SmokeServer-${Date.now().toString(36)}` })
  });

  if (createServer.response.ok) {
    const createdId = String(createServer.payload?.server?.id || "").trim();
    if (createdId) {
      return createdId;
    }
  }

  throw new Error(
    `cannot resolve operable server: default_status=${defaultServer.response.status} create_status=${createServer.response.status}`
  );
}

(async () => {
  const serverId = await resolveOperableServerId(ownerToken);

  const { response: createInviteResponse, payload: createInvitePayload } = await fetchJson(
    `/v1/servers/${encodeURIComponent(serverId)}/invites`,
    {
      method: "POST",
      headers: {
        ...authHeader(ownerToken),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ttlHours: 1, maxUses: 2 })
    }
  );
  assertOk(createInviteResponse, createInvitePayload, "create invite failed");

  const inviteToken = String(createInvitePayload?.token || "").trim();
  if (!inviteToken) {
    throw new Error("invite token is missing");
  }

  const firstAccept = await fetchJson(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, {
    method: "POST",
    headers: authHeader(ownerToken)
  });
  assertOk(firstAccept.response, firstAccept.payload, "owner first invite accept failed");

  const secondAccept = await fetchJson(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, {
    method: "POST",
    headers: authHeader(ownerToken)
  });
  assertOk(secondAccept.response, secondAccept.payload, "owner second invite accept failed");

  if (!secondToken) {
    console.log("[smoke:multiserver] second user token missing, only idempotency checks were executed");
    console.log(`[smoke:multiserver] ok (${baseUrl}) serverId=${serverId} mode=idempotency-only`);
    return;
  }

  const { response: meSecondResponse, payload: meSecondPayload } = await fetchJson("/v1/auth/me", {
    headers: authHeader(secondToken)
  });
  assertOk(meSecondResponse, meSecondPayload, "second user /v1/auth/me failed");
  const secondUserId = String(meSecondPayload?.user?.id || "").trim();
  if (!secondUserId) {
    throw new Error("second user id is missing");
  }

  const secondAcceptResponse = await fetchJson(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, {
    method: "POST",
    headers: authHeader(secondToken)
  });
  assertOk(secondAcceptResponse.response, secondAcceptResponse.payload, "second user invite accept failed");

  const applyServerBan = await fetchJson(`/v1/servers/${encodeURIComponent(serverId)}/bans`, {
    method: "POST",
    headers: {
      ...authHeader(ownerToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId: secondUserId, reason: "smoke server ban" })
  });
  assertOk(applyServerBan.response, applyServerBan.payload, "apply server ban failed");

  const secondAfterServerBan = await fetchJson("/v1/servers", {
    headers: authHeader(secondToken)
  });
  if (secondAfterServerBan.response.status !== 403) {
    throw new Error(`expected 403 after server ban, got ${secondAfterServerBan.response.status}`);
  }

  const revokeServerBan = await fetchJson(
    `/v1/servers/${encodeURIComponent(serverId)}/bans/${encodeURIComponent(secondUserId)}`,
    {
      method: "DELETE",
      headers: authHeader(ownerToken)
    }
  );
  assertOk(revokeServerBan.response, revokeServerBan.payload, "revoke server ban failed");

  const inviteAfterUnban = await fetchJson(`/v1/servers/${encodeURIComponent(serverId)}/invites`, {
    method: "POST",
    headers: {
      ...authHeader(ownerToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ttlHours: 1, maxUses: 1 })
  });
  assertOk(inviteAfterUnban.response, inviteAfterUnban.payload, "create invite after unban failed");

  const inviteAfterUnbanToken = String(inviteAfterUnban.payload?.token || "").trim();
  if (!inviteAfterUnbanToken) {
    throw new Error("invite token after unban is missing");
  }

  const secondAcceptAfterUnban = await fetchJson(`/v1/invites/${encodeURIComponent(inviteAfterUnbanToken)}/accept`, {
    method: "POST",
    headers: authHeader(secondToken)
  });
  assertOk(secondAcceptAfterUnban.response, secondAcceptAfterUnban.payload, "second user invite accept after unban failed");

  if (adminToken) {
    const applyServiceBan = await fetchJson("/v1/admin/service-bans", {
      method: "POST",
      headers: {
        ...authHeader(adminToken),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userId: secondUserId, reason: "smoke service ban" })
    });
    assertOk(applyServiceBan.response, applyServiceBan.payload, "apply service ban failed");

    const secondAfterServiceBan = await fetchJson("/v1/servers", {
      headers: authHeader(secondToken)
    });
    if (secondAfterServiceBan.response.status !== 403) {
      throw new Error(`expected 403 after service ban, got ${secondAfterServiceBan.response.status}`);
    }

    const revokeServiceBan = await fetchJson(`/v1/admin/service-bans/${encodeURIComponent(secondUserId)}`, {
      method: "DELETE",
      headers: authHeader(adminToken)
    });
    assertOk(revokeServiceBan.response, revokeServiceBan.payload, "revoke service ban failed");

    const secondAfterServiceUnban = await fetchJson("/v1/servers", {
      headers: authHeader(secondToken)
    });
    assertOk(secondAfterServiceUnban.response, secondAfterServiceUnban.payload, "second user access after service unban failed");
  } else {
    console.log("[smoke:multiserver] admin token missing, service-ban checks skipped");
  }

  console.log(`[smoke:multiserver] ok (${baseUrl}) serverId=${serverId}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
