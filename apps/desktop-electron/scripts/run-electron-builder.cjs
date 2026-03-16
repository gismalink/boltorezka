#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

function run() {
  const appVersion = String(process.env.APP_VERSION || "").trim();
  const passthroughArgs = process.argv.slice(2);
  const args = ["electron-builder", ...passthroughArgs];

  if (appVersion) {
    args.push(`--config.extraMetadata.version=${appVersion}`);
  }

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npxCmd, args, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env
  });

  process.exit(typeof result.status === "number" ? result.status : 1);
}

run();
