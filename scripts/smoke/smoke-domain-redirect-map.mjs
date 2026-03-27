// Purpose: Validate legacy->datowave redirect map and ensure path/query are preserved.
const testDefaultCases = [
  {
    from: "https://test.boltorezka.gismalink.art/health?smoke=1",
    toHost: "test.datowave.com"
  },
  {
    from: "https://test.datute.ru/health?smoke=1",
    toHost: "test.datowave.com"
  }
];

const prodDefaultCases = [
  {
    from: "https://boltorezka.gismalink.art/health?smoke=1",
    toHost: "datowave.com"
  }
];

const maxFetchAttempts = Number(process.env.SMOKE_FETCH_RETRIES || 3);
const retryDelayMs = Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS || 700);
const fetchTimeoutMs = Number(process.env.SMOKE_FETCH_TIMEOUT_MS || 15000);
const allowedStatusesRaw = String(process.env.SMOKE_REDIRECT_ALLOWED_STATUSES || "301,308").trim();
const redirectScope = String(process.env.SMOKE_REDIRECT_SCOPE || "test").trim().toLowerCase();
const allowedStatuses = new Set(
  allowedStatusesRaw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value))
);

if (!allowedStatuses.size) {
  console.error("[smoke:redirect-map] SMOKE_REDIRECT_ALLOWED_STATUSES is empty");
  process.exit(1);
}

if (!["test", "prod"].includes(redirectScope)) {
  console.error(`[smoke:redirect-map] invalid SMOKE_REDIRECT_SCOPE: ${redirectScope}`);
  process.exit(1);
}

function resolveDefaultCases() {
  return redirectScope === "prod" ? prodDefaultCases : testDefaultCases;
}

function parseCases() {
  const raw = String(process.env.SMOKE_REDIRECT_CASES || "").trim();
  if (!raw) {
    return resolveDefaultCases();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("must be a non-empty JSON array");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[smoke:redirect-map] invalid SMOKE_REDIRECT_CASES: ${message}`);
  }
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

  throw new Error(`[smoke:redirect-map] ${label} failed after ${maxFetchAttempts} attempts: ${toErrorMessage(lastError)}`);
}

(async () => {
  const cases = parseCases();

  for (const testCase of cases) {
    const from = String(testCase?.from || "").trim();
    const expectedHost = String(testCase?.toHost || "").trim();

    if (!from || !expectedHost) {
      throw new Error("[smoke:redirect-map] each case must include from and toHost");
    }

    const sourceUrl = new URL(from);
    const response = await fetchWithRetry(from, from);
    const location = response.headers.get("location") || "";

    if (!allowedStatuses.has(response.status)) {
      throw new Error(`[smoke:redirect-map] status mismatch for ${from}: got ${response.status}, expected one of ${[...allowedStatuses].join(",")}`);
    }

    if (!location) {
      throw new Error(`[smoke:redirect-map] missing location header for ${from}`);
    }

    const redirectUrl = new URL(location, sourceUrl.origin);
    if (redirectUrl.host !== expectedHost) {
      throw new Error(`[smoke:redirect-map] host mismatch for ${from}: expected ${expectedHost}, got ${redirectUrl.host}`);
    }

    if (redirectUrl.pathname !== sourceUrl.pathname) {
      throw new Error(`[smoke:redirect-map] path mismatch for ${from}: expected ${sourceUrl.pathname}, got ${redirectUrl.pathname}`);
    }

    if (redirectUrl.search !== sourceUrl.search) {
      throw new Error(`[smoke:redirect-map] query mismatch for ${from}: expected ${sourceUrl.search}, got ${redirectUrl.search}`);
    }

    console.log(`[smoke:redirect-map] ok ${sourceUrl.host} -> ${redirectUrl.host} (${response.status})`);
  }

  console.log(`[smoke:redirect-map] scope=${redirectScope} cases=${cases.length}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
