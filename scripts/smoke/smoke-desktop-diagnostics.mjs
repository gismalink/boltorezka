#!/usr/bin/env node
// Purpose: Ensure desktop runtime diagnostics artifact is generated with expected fields.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_DIAGNOSTICS_TIMEOUT_MS || 30000);
const outPath = String(process.env.SMOKE_DESKTOP_DIAGNOSTICS_OUT || "").trim() || path.join(os.tmpdir(), `datowave-desktop-diagnostics-${Date.now()}.json`);

async function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  try {
    fs.unlinkSync(outPath);
  } catch {
    // no-op
  }

  const app = await electron.launch({
    executablePath: electronBinary,
    args: [appDir],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: `${baseUrl}/`,
      ELECTRON_DESKTOP_DIAGNOSTICS_OUT: outPath
    }
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#root", { timeout: timeoutMs });

    const startedAt = Date.now();
    while (!fs.existsSync(outPath)) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`diagnostics file not generated: ${outPath}`);
      }
      await page.waitForTimeout(200);
    }

    const raw = fs.readFileSync(outPath, "utf8");
    const payload = JSON.parse(raw);

    if (!payload.ts) {
      throw new Error("diagnostics.ts is empty");
    }
    if (!payload.platform) {
      throw new Error("diagnostics.platform is empty");
    }
    if (!payload.electronVersion) {
      throw new Error("diagnostics.electronVersion is empty");
    }

    const prefs = payload.webPreferences || {};
    if (prefs.contextIsolation !== true) {
      throw new Error("diagnostics.webPreferences.contextIsolation must be true");
    }
    if (prefs.sandbox !== true) {
      throw new Error("diagnostics.webPreferences.sandbox must be true");
    }
    if (prefs.nodeIntegration !== false) {
      throw new Error("diagnostics.webPreferences.nodeIntegration must be false");
    }

    console.log("[smoke:desktop:diagnostics] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- diagnosticsOut: ${outPath}`);
    console.log(`- ts: ${payload.ts}`);
    console.log(`- platform: ${payload.platform}`);
    console.log(`- electronVersion: ${payload.electronVersion}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:diagnostics] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
