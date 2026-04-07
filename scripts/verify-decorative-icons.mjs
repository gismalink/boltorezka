#!/usr/bin/env node
// Purpose: Ensure decorative icon tags are hidden from accessibility tree in web components.
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd(), "apps/web/src/components");
const allowedExtensions = new Set([".tsx", ".jsx"]);
const iconTagPattern = /<i\b[^>]*className=["'`][^"'`]*["'`][^>]*>/gms;

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name))) {
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
    console.log("[verify:decorative-icons] skipped: apps/web/src/components not found");
    return;
  }

  const files = collectFiles(rootDir);
  const violations = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    let match = null;

    while ((match = iconTagPattern.exec(content)) !== null) {
      const tag = match[0];
      const hasAriaHiddenTrue = /aria-hidden\s*=\s*["']true["']/.test(tag);
      if (!hasAriaHiddenTrue) {
        violations.push({
          filePath,
          line: lineFromOffset(content, match.index),
          snippet: tag.replace(/\s+/g, " ").slice(0, 160)
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`[verify:decorative-icons] FAILED (${violations.length} violation(s))`);
    for (const item of violations) {
      const rel = path.relative(process.cwd(), item.filePath);
      console.error(`- ${rel}:${item.line} missing aria-hidden=\"true\" on icon tag`);
      console.error(`  ${item.snippet}`);
    }
    process.exit(1);
  }

  console.log("[verify:decorative-icons] ok");
  console.log(`- files scanned: ${files.length}`);
  console.log("- all icon tags with className are aria-hidden=true");
}

main();
