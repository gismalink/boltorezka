// Purpose: Validate reset/verify/invite/auth links use allowed datowave hosts and do not redirect to legacy domains.
const rawLinks = String(process.env.SMOKE_AUTH_LINK_URLS || "").trim();
const allowedHostsRaw = String(process.env.SMOKE_AUTH_ALLOWED_HOSTS || "test.auth.datowave.com,test.datowave.com").trim();
const allowedStatusesRaw = String(process.env.SMOKE_AUTH_ALLOWED_STATUSES || "200,301,302,303,307,308").trim();
const maxFetchAttempts = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);
const fetchTimeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);

function parseLinks(raw) {
  if (!raw) {
    throw new Error("SMOKE_AUTH_LINK_URLS is required (comma/newline-separated list or JSON array)");
  }

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("SMOKE_AUTH_LINK_URLS JSON array must be non-empty");
    }
    return parsed.map((value) => String(value).trim()).filter(Boolean);
  }

  const values = raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.length) {
    throw new Error("SMOKE_AUTH_LINK_URLS list is empty");
  }

  return values;
}

function parseAllowedHosts(raw) {
  const hosts = raw
    .split(/[\n,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!hosts.length) {
    throw new Error("SMOKE_AUTH_ALLOWED_HOSTS is empty");
  }

  return new Set(hosts);
}

function parseAllowedStatuses(raw) {
  const statuses = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));

  if (!statuses.length) {
    throw new Error("SMOKE_AUTH_ALLOWED_STATUSES is empty");
  }

  return new Set(statuses);
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

async function fetchWithRetry(url, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxFetchAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
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

  throw new Error(`[smoke:auth:links] ${label} failed after ${maxFetchAttempts} attempts: ${toErrorMessage(lastError)}`);
}

function assertHostAllowed(host, allowedHosts, label) {
  const normalized = host.toLowerCase();
  if (normalized.includes("gismalink.art")) {
    throw new Error(`[smoke:auth:links] ${label} uses legacy host: ${host}`);
  }
  if (!allowedHosts.has(normalized)) {
    throw new Error(`[smoke:auth:links] ${label} host not allowed: ${host}`);
  }
}

(async () => {
  const links = parseLinks(rawLinks);
  const allowedHosts = parseAllowedHosts(allowedHostsRaw);
  const allowedStatuses = parseAllowedStatuses(allowedStatusesRaw);

  for (const link of links) {
    const sourceUrl = new URL(link);
    assertHostAllowed(sourceUrl.host, allowedHosts, `source ${link}`);

    const response = await fetchWithRetry(link, link);
    if (!allowedStatuses.has(response.status)) {
      throw new Error(`[smoke:auth:links] status mismatch for ${link}: got ${response.status}`);
    }

    const location = response.headers.get("location") || "";
    if (location) {
      const redirectUrl = new URL(location, sourceUrl.origin);
      assertHostAllowed(redirectUrl.host, allowedHosts, `redirect from ${link}`);
      console.log(`[smoke:auth:links] ok ${sourceUrl.host} -> ${redirectUrl.host} (${response.status})`);
    } else {
      console.log(`[smoke:auth:links] ok ${sourceUrl.host} (${response.status})`);
    }
  }

  console.log(`[smoke:auth:links] validated links=${links.length}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
