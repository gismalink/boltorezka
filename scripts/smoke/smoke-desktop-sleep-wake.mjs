#!/usr/bin/env node
// Purpose: Assist desktop sleep/wake validation with optional suspend detection.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.boltorezka.gismalink.art").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_SLEEP_WAKE_TIMEOUT_MS || 60000);
const windowMs = Number(process.env.SMOKE_DESKTOP_SLEEP_WAKE_WINDOW_MS || 30000);
const suspendThresholdMs = Number(process.env.SMOKE_DESKTOP_SLEEP_WAKE_SUSPEND_THRESHOLD_MS || 5000);
const requireSuspend = String(process.env.SMOKE_DESKTOP_SLEEP_WAKE_REQUIRE_SUSPEND || "0") === "1";

async function ensureRootLoaded(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForSelector("#root", { timeout: timeoutMs });
}

async function readMarkers(page) {
  return page.evaluate(() => ({
    runtime: document.documentElement.dataset.runtime || "",
    platform: document.documentElement.dataset.desktopPlatform || "",
    electronVersion: document.documentElement.dataset.desktopElectron || "",
    title: document.title || ""
  }));
}

function assertMarkers(markers, stage) {
  if (markers.runtime !== "desktop") {
    throw new Error(`${stage}: expected runtime=desktop, got '${markers.runtime || "<empty>"}'`);
  }
  if (!markers.platform) {
    throw new Error(`${stage}: desktop platform marker is empty`);
  }
  if (!markers.electronVersion) {
    throw new Error(`${stage}: desktop electron version marker is empty`);
  }
  if (!/Desktop/i.test(markers.title)) {
    throw new Error(`${stage}: expected desktop title marker, got '${markers.title}'`);
  }
}

async function main() {
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [appDir],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: `${baseUrl}/`
    }
  });

  try {
    const page = await app.firstWindow();
    await ensureRootLoaded(page);

    const before = await readMarkers(page);
    assertMarkers(before, "before");

    console.log("[smoke:desktop:sleep-wake] wait-window-start");
    console.log(`- instruction: sleep device during next ${windowMs}ms, then wake and unlock`);

    const startedAt = Date.now();
    await page.waitForTimeout(windowMs);
    const elapsedMs = Date.now() - startedAt;
    const suspendObserved = elapsedMs >= windowMs + suspendThresholdMs;

    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForSelector("#root", { timeout: timeoutMs });

    const after = await readMarkers(page);
    assertMarkers(after, "after");

    if (requireSuspend && !suspendObserved) {
      throw new Error(
        `suspend not detected: elapsed=${elapsedMs}ms, required >= ${windowMs + suspendThresholdMs}ms`
      );
    }

    console.log("[smoke:desktop:sleep-wake] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- windowMs: ${windowMs}`);
    console.log(`- elapsedMs: ${elapsedMs}`);
    console.log(`- suspendObserved: ${suspendObserved}`);
    console.log(`- requireSuspend: ${requireSuspend}`);
    console.log(`- platform: ${after.platform}`);
    console.log(`- electronVersion: ${after.electronVersion}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:sleep-wake] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
