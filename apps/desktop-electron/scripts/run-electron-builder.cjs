#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

function run() {
  const appVersion = String(process.env.APP_VERSION || "").trim();
  const passthroughArgs = process.argv.slice(2);
  const electronBuilderArgs = ["electron-builder", ...passthroughArgs];

  if (appVersion) {
    electronBuilderArgs.push(`--config.extraMetadata.version=${appVersion}`);
  }

  const npmExecPath = String(process.env.npm_execpath || "").trim();
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npx.cmd" : "npx");
  const args = npmExecPath
    ? [npmExecPath, "exec", "--", ...electronBuilderArgs]
    : electronBuilderArgs;

  const result = spawnSync(command, args, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    console.error(`[desktop:electron-builder] failed to spawn command: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

run();
