#!/usr/bin/env node
// Purpose: Run agent semantics browser smoke and optionally write evidence into docs/status/test-results/2026-04-06.md.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoDir = path.resolve(__dirname, "../..");
const evidencePath = path.resolve(repoDir, "docs/status/test-results/2026-04-06.md");
const smokeScriptPath = path.resolve(__dirname, "smoke-web-agent-semantics-browser.mjs");
const defaultApiUrl = "https://test.datowave.com";
const shouldWriteEvidence = process.env.SMOKE_EVIDENCE_WRITE_DOC === "1";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoDir,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    ...options
  });
}

function safeOneLine(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLine(content, prefix, value) {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}.*$`, "m");
  return content.replace(pattern, `${prefix}${value}`);
}

function stripOuterQuotes(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvRaw(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1);
    }
  }
  return "";
}

function parseEnvFile(filePath) {
  const result = new Map();
  if (!fs.existsSync(filePath)) {
    return result;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    const value = stripOuterQuotes(line.slice(eqIndex + 1));
    if (key) {
      result.set(key, value);
    }
  }
  return result;
}

function resolveBearerToken() {
  const directToken = safeOneLine(process.env.SMOKE_TEST_BEARER_TOKEN || process.env.SMOKE_BEARER_TOKEN || "");
  if (directToken) {
    return directToken;
  }

  const authEnvFileRel = String(process.env.SMOKE_AUTH_ENV_FILE || ".deploy/smoke-auth.env");
  const authEnvPath = path.resolve(repoDir, authEnvFileRel);
  const composeFile = String(process.env.SMOKE_AUTH_COMPOSE_FILE || "infra/docker-compose.host.yml");
  const hostEnvFile = String(process.env.SMOKE_AUTH_HOST_ENV_FILE || "infra/.env.host");
  const postgresService = String(process.env.SMOKE_AUTH_POSTGRES_SERVICE || "datowave-db-test");
  const apiService = String(process.env.SMOKE_AUTH_API_SERVICE || "datowave-api-test");
  const baseUrl = String(process.env.SMOKE_API_URL || defaultApiUrl);
  const shouldRegenerate = process.env.SMOKE_REGENERATE_AUTH === "1" || !fs.existsSync(authEnvPath);

  if (shouldRegenerate) {
    console.log("[smoke:web:agent-semantics:evidence] token missing, trying smoke-auth bootstrap");
    const hostEnvPath = path.resolve(repoDir, hostEnvFile);
    const testJwtSecret = stripOuterQuotes(readEnvRaw(hostEnvPath, "TEST_JWT_SECRET"));
    const bootstrapEnv = {
      ...process.env,
      SMOKE_API_URL: baseUrl,
      SMOKE_AUTH_COMPOSE_FILE: composeFile,
      SMOKE_AUTH_ENV_FILE: authEnvFileRel,
      SMOKE_AUTH_POSTGRES_SERVICE: postgresService,
      SMOKE_AUTH_API_SERVICE: apiService
    };
    if (testJwtSecret) {
      bootstrapEnv.SMOKE_AUTH_JWT_SECRET = testJwtSecret;
    }

    const bootstrapResult = run("npm", ["run", "-s", "smoke:auth:bootstrap"], { env: bootstrapEnv });
    if (bootstrapResult.status !== 0) {
      const bootstrapOutput = `${bootstrapResult.stdout || ""}\n${bootstrapResult.stderr || ""}`;
      console.error("[smoke:web:agent-semantics:evidence] smoke-auth bootstrap failed");
      console.error(bootstrapOutput.trim());
    }
  }

  const parsed = parseEnvFile(authEnvPath);
  const token = safeOneLine(
    process.env.SMOKE_TEST_BEARER_TOKEN
    || parsed.get("SMOKE_TEST_BEARER_TOKEN")
    || process.env.SMOKE_BEARER_TOKEN
    || parsed.get("SMOKE_BEARER_TOKEN")
    || ""
  );

  if (token) {
    process.env.SMOKE_TEST_BEARER_TOKEN = token;
  }
  return token;
}

function updateEvidenceFile({ sha, result, outputLine, selectorsLine, note }) {
  let content = fs.readFileSync(evidencePath, "utf8");

  content = replaceLine(content, "- Applied SHA: `", `${sha}\``);
  content = replaceLine(content, "- Result: `", `${result}\``);

  const runResultSectionPattern = /(### 4\) Run result[\s\S]*?- Output excerpt:\n)(\s*- `\[smoke:web:agent-semantics:browser\][^\n]*`\n)(\s*- `- verified selectors:[^\n]*`\n)([\s\S]*?- Notes:\n)(\s*- `[^\n]*`)/m;
  content = content.replace(
    runResultSectionPattern,
    `$1  - \`[smoke:web:agent-semantics:browser] ${outputLine}\`\n  - \`- verified selectors: ${selectorsLine}\`\n$4  - \`${note}\``
  );

  fs.writeFileSync(evidencePath, content, "utf8");
}

function main() {
  const token = resolveBearerToken();
  if (!token) {
    console.error("[smoke:web:agent-semantics:evidence] missing token after bootstrap (set SMOKE_TEST_BEARER_TOKEN or configure smoke-auth bootstrap)");
    process.exit(2);
  }

  const shaResult = run("git", ["rev-parse", "--short", "HEAD"]);
  if (shaResult.status !== 0) {
    console.error("[smoke:web:agent-semantics:evidence] failed to get current SHA");
    console.error(String(shaResult.stderr || shaResult.stdout || ""));
    process.exit(1);
  }
  const sha = safeOneLine(shaResult.stdout) || "unknown";

  const smokeResult = run(process.execPath, [smokeScriptPath], {
    env: {
      ...process.env,
      SMOKE_API_URL: String(process.env.SMOKE_API_URL || defaultApiUrl),
      SMOKE_WEB_BASE_URL: String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || defaultApiUrl),
      SMOKE_TEST_BEARER_TOKEN: token
    }
  });
  const combinedOutput = `${smokeResult.stdout || ""}\n${smokeResult.stderr || ""}`;
  const selectorsMatch = combinedOutput.match(/- verified selectors:\s*([0-9]+)/i);
  const selectorsCount = selectorsMatch ? selectorsMatch[1] : "n/a";

  const resultText = smokeResult.status === 0 ? "PASS" : "FAIL";
  const outputStatus = smokeResult.status === 0 ? "pass" : "fail";
  const firstErrorLine = combinedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("[smoke:web:agent-semantics:browser] ok") && !line.startsWith("- "));

  const note = smokeResult.status === 0
    ? "auto-updated by smoke:web:agent-semantics:evidence"
    : `auto-updated by smoke:web:agent-semantics:evidence; error=${safeOneLine(firstErrorLine || "unknown")}`;

  if (shouldWriteEvidence) {
    updateEvidenceFile({
      sha,
      result: resultText,
      outputLine: `${outputStatus}|${safeOneLine(combinedOutput.includes("[smoke:web:agent-semantics:browser] ok") ? "ok" : "failed")}`,
      selectorsLine: selectorsCount,
      note
    });
    console.log("[smoke:web:agent-semantics:evidence] docs evidence updated (SMOKE_EVIDENCE_WRITE_DOC=1)");
  } else {
    console.log("[smoke:web:agent-semantics:evidence] docs evidence not updated (set SMOKE_EVIDENCE_WRITE_DOC=1 to enable)");
  }

  process.stdout.write(combinedOutput);
  if (smokeResult.status !== 0) {
    process.exit(smokeResult.status || 1);
  }
}

main();
