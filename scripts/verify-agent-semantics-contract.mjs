#!/usr/bin/env node
// Purpose: Validate semantic contract for interactive controls in web components.
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd(), "apps/web/src/components");
const allowedExtensions = new Set([".tsx", ".jsx"]);
const interactiveTagPattern = /<(button|input|select|textarea|a)\b[^>]*>/gms;
const requiresStateValue = process.env.VERIFY_AGENT_SEMANTICS_REQUIRE_STATE_VALUE !== "0";
const strictMode = process.env.VERIFY_AGENT_SEMANTICS_STRICT === "1";
const baselinePath = path.resolve(process.cwd(), "scripts/verify-agent-semantics-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
      continue;
    }
    const ext = path.extname(entry.name);
    if (allowedExtensions.has(ext)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function lineFromOffset(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function normalizeSnippet(tag) {
  return String(tag).replace(/\s+/g, " ").trim();
}

function getSignature(relPath, line, tagName, agentId, snippet) {
  return `${relPath}:${line}|${tagName}|${agentId || "<missing>"}|${snippet}`;
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return new Set();
  }
  const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const items = Array.isArray(parsed?.violations) ? parsed.violations : [];
  return new Set(items.map((item) => item.signature));
}

function writeBaseline(violations) {
  const payload = {
    updatedAt: new Date().toISOString(),
    note: "Legacy baseline for global interactive semantic contract. New violations are blocked.",
    violations: violations
      .map((item) => ({ signature: item.signature, relPath: item.relPath, line: item.line, problem: item.problem }))
      .sort((a, b) => a.signature.localeCompare(b.signature))
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main() {
  if (!fs.existsSync(rootDir)) {
    console.log("[verify:agent-semantics] skipped: apps/web/src/components not found");
    return;
  }

  const files = collectFiles(rootDir);
  const violations = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    let match = null;

    while ((match = interactiveTagPattern.exec(content)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      const agentIdMatch = fullTag.match(/data-agent-id="([^"]+)"/);
      const agentId = agentIdMatch ? agentIdMatch[1] : "";
      const isAriaHidden = /aria-hidden\s*=\s*["']true["']/.test(fullTag);
      const inputTypeMatch = fullTag.match(/type="([^"]+)"/);
      const inputType = inputTypeMatch ? String(inputTypeMatch[1]).toLowerCase() : "";
      if (isAriaHidden || inputType === "hidden") {
        continue;
      }
      const hasStateOrValue = /data-agent-state=|data-agent-value=/.test(fullTag);
      const hasIdentifier = Boolean(agentId);
      if (!hasIdentifier || (requiresStateValue && !hasStateOrValue)) {
        const relPath = path.relative(process.cwd(), filePath);
        const line = lineFromOffset(content, match.index);
        const snippet = normalizeSnippet(fullTag).slice(0, 220);
        const signature = getSignature(relPath, line, tagName, agentId, snippet);
        violations.push({
          filePath,
          relPath,
          line,
          tagName,
          agentId,
          signature,
          problem: !hasIdentifier
            ? "missing data-agent-id"
            : "missing data-agent-state/data-agent-value"
        });
      }
    }
  }

  if (updateBaseline) {
    writeBaseline(violations);
    console.log(`[verify:agent-semantics] baseline updated: ${path.relative(process.cwd(), baselinePath)}`);
    console.log(`- violations recorded: ${violations.length}`);
    return;
  }

  const baseline = readBaseline();
  const newViolations = strictMode
    ? violations
    : violations.filter((item) => !baseline.has(item.signature));

  const baselineViolations = violations.length - newViolations.length;

  if (newViolations.length > 0) {
    console.error(`[verify:agent-semantics] FAILED (${newViolations.length} new violation(s))`);
    for (const item of newViolations) {
      console.error(`- ${item.relPath}:${item.line} ${item.tagName}[data-agent-id=\"${item.agentId || "<missing>"}\"] ${item.problem}`);
    }
    console.error("[verify:agent-semantics] hint: fix violations or (only when intentional) refresh baseline with --update-baseline");
    process.exit(1);
  }

  console.log("[verify:agent-semantics] ok");
  console.log(`- files scanned: ${files.length}`);
  console.log(`- total violations detected: ${violations.length}`);
  console.log(`- baseline-covered violations: ${baselineViolations}`);
  console.log(`- new violations: ${newViolations.length}`);
  if (!strictMode && violations.length > 0) {
    console.log("- ratchet mode active: legacy debt allowed, regressions blocked");
  }
}

main();
