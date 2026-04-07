#!/usr/bin/env node
// Purpose: Validate data-agent semantic contract for interactive controls in web components.
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd(), "apps/web/src/components");
const allowedExtensions = new Set([".tsx", ".jsx"]);
const interactiveTagPattern = /<(button|input|select|textarea|a)\b[^>]*data-agent-id="([^"]+)"[^>]*>/gms;
const requiresStateValue = process.env.VERIFY_AGENT_SEMANTICS_REQUIRE_STATE_VALUE !== "0";

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
      const agentId = match[2];
      const hasStateOrValue = /data-agent-state=|data-agent-value=/.test(fullTag);
      if (requiresStateValue && !hasStateOrValue) {
        violations.push({
          filePath,
          line: lineFromOffset(content, match.index),
          tagName,
          agentId,
          problem: "missing data-agent-state/data-agent-value"
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`[verify:agent-semantics] FAILED (${violations.length} violation(s))`);
    for (const item of violations) {
      const rel = path.relative(process.cwd(), item.filePath);
      console.error(`- ${rel}:${item.line} ${item.tagName}[data-agent-id=\"${item.agentId}\"] ${item.problem}`);
    }
    process.exit(1);
  }

  console.log("[verify:agent-semantics] ok");
  console.log(`- files scanned: ${files.length}`);
  console.log("- interactive data-agent-id controls include state/value");
}

main();
