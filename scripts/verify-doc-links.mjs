#!/usr/bin/env node
// Purpose: Lightweight docs link validation for local/CI verify gates.
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");

const LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;

const isIgnoredTarget = (target) => {
  const normalized = String(target || "").trim();
  if (!normalized) {
    return true;
  }

  return normalized.startsWith("#")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.startsWith("mailto:")
    || normalized.startsWith("tel:")
    || normalized.startsWith("data:");
};

const normalizeLinkTarget = (rawTarget) => {
  const trimmed = String(rawTarget || "").trim();
  const withoutAnchor = trimmed.split("#")[0] || "";
  const withoutTitle = withoutAnchor.split(/\s+"/)[0] || "";
  return withoutTitle;
};

async function listMarkdownFiles(rootDir) {
  const out = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const files = await listMarkdownFiles(docsRoot);
  const missing = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const dir = path.dirname(filePath);
    const relFile = path.relative(repoRoot, filePath).replace(/\\/g, "/");

    for (const match of content.matchAll(LINK_RE)) {
      const rawTarget = match[1] || "";
      if (isIgnoredTarget(rawTarget)) {
        continue;
      }

      const target = normalizeLinkTarget(rawTarget);
      if (!target) {
        continue;
      }

      const resolved = path.resolve(dir, target);
      if (!(await pathExists(resolved))) {
        missing.push({
          file: relFile,
          target: target.replace(/\\/g, "/")
        });
      }
    }
  }

  if (missing.length > 0) {
    console.error("[verify:docs-links] broken markdown links found:");
    for (const entry of missing) {
      console.error(` - ${entry.file} -> ${entry.target}`);
    }
    process.exit(1);
  }

  console.log("[verify:docs-links] ok");
}

main().catch((error) => {
  console.error("[verify:docs-links] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
