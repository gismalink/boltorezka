#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

function resolveDesktopVersion() {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const version = String(pkg.version || "").trim();
  if (!version) {
    throw new Error("desktop package.json version is empty");
  }
  return version;
}

function resolveBuildSha() {
  const fromEnv = String(process.env.VITE_APP_BUILD_SHA || process.env.APP_BUILD_SHA || "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: path.resolve(__dirname, "..", "..", ".."),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();
  } catch {
    return "dev";
  }
}

function resolveBuildDate() {
  const fromEnv = String(process.env.VITE_APP_BUILD_DATE || "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  return new Date().toISOString().slice(0, 10);
}

function run() {
  const version = resolveDesktopVersion();
  const buildSha = resolveBuildSha();
  const buildDate = resolveBuildDate();

  const env = {
    ...process.env,
    VITE_APP_VERSION: version,
    VITE_APP_BUILD_SHA: buildSha,
    VITE_APP_BUILD_DATE: buildDate
  };

  console.log(`[desktop:build:renderer] VITE_APP_VERSION=${version}`);
  console.log(`[desktop:build:renderer] VITE_APP_BUILD_SHA=${buildSha}`);
  console.log(`[desktop:build:renderer] VITE_APP_BUILD_DATE=${buildDate}`);

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["--prefix", "../web", "run", "build"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run();
