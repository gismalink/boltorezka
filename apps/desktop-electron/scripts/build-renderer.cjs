#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

function resolveDesktopVersion() {
  const fromEnv = String(process.env.APP_VERSION || "").trim();
  if (fromEnv) {
    return fromEnv;
  }

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

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to resolve Moscow build date");
  }

  return `${year}-${month}-${day}`;
}

function run() {
  const version = resolveDesktopVersion();
  const buildSha = resolveBuildSha();
  const buildDate = resolveBuildDate();
  const desktopRoot = path.resolve(__dirname, "..");
  const webRoot = path.resolve(desktopRoot, "../web");

  const env = {
    ...process.env,
    VITE_APP_VERSION: version,
    VITE_APP_BUILD_SHA: buildSha,
    VITE_APP_BUILD_DATE: buildDate,
    VITE_APP_PUBLIC_ORIGIN: String(process.env.VITE_APP_PUBLIC_ORIGIN || "").trim(),
    VITE_ASSET_BASE: "./"
  };

  console.log(`[desktop:build:renderer] VITE_APP_VERSION=${version}`);
  console.log(`[desktop:build:renderer] VITE_APP_BUILD_SHA=${buildSha}`);
  console.log(`[desktop:build:renderer] VITE_APP_BUILD_DATE=${buildDate}`);
  if (env.VITE_APP_PUBLIC_ORIGIN) {
    console.log(`[desktop:build:renderer] VITE_APP_PUBLIC_ORIGIN=${env.VITE_APP_PUBLIC_ORIGIN}`);
  }
  console.log("[desktop:build:renderer] VITE_ASSET_BASE=./");

  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const npmRunner = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const npmArgs = npmExecPath
    ? [npmExecPath, "--prefix", webRoot, "run", "build"]
    : ["--prefix", webRoot, "run", "build"];

  console.log(`[desktop:build:renderer] webRoot=${webRoot}`);
  const result = spawnSync(npmRunner, npmArgs, {
    cwd: desktopRoot,
    stdio: "inherit",
    env
  });

  if (result.error) {
    console.error(`[desktop:build:renderer] failed to spawn web build: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run();
