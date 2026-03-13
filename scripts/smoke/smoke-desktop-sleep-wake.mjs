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

async function waitForAnyWindow(app, waitTimeoutMs) {
  const startedAt = Date.now();
  let nextActivateNudgeAt = startedAt;
  while (Date.now() - startedAt < waitTimeoutMs) {
    const windows = app.windows();
    if (windows.length > 0) {
      const active = windows[windows.length - 1];
      if (!active.isClosed()) {
        return active;
      }
    }

    const now = Date.now();
    if (now >= nextActivateNudgeAt) {
      try {
        const countAfterActivate = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
          if (BrowserWindow.getAllWindows().length === 0) {
            electronApp.emit("activate");
          }
          return BrowserWindow.getAllWindows().length;
        });
        if (Number(countAfterActivate || 0) > 0) {
          const refreshed = app.windows();
          if (refreshed.length > 0 && !refreshed[refreshed.length - 1].isClosed()) {
            return refreshed[refreshed.length - 1];
          }
        }
      } catch {
        // Keep polling; app may still be resuming after wake.
      }
      nextActivateNudgeAt = now + 3000;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`desktop window is unavailable after wake (timeout ${waitTimeoutMs}ms)`);
}

async function waitByWallClock(windowMs) {
  const startedAt = Date.now();
  const deadline = startedAt + windowMs;
  let nextProgressAt = startedAt + 10000;

  while (Date.now() < deadline) {
    const now = Date.now();
    if (now >= nextProgressAt) {
      const remaining = Math.max(0, deadline - now);
      console.log(`[smoke:desktop:sleep-wake] waiting... remainingMs=${remaining}`);
      nextProgressAt = now + 10000;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return Date.now() - startedAt;
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
    let page = await app.firstWindow();
    await ensureRootLoaded(page);

    const before = await readMarkers(page);
    assertMarkers(before, "before");

    console.log("[smoke:desktop:sleep-wake] wait-window-start");
    console.log(`- instruction: sleep device during next ${windowMs}ms, then wake and unlock`);

    const elapsedMs = await waitByWallClock(windowMs);
    const suspendObserved = elapsedMs >= windowMs + suspendThresholdMs;

    if (page.isClosed()) {
      page = await waitForAnyWindow(app, timeoutMs);
    }

    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForSelector("#root", { timeout: timeoutMs });
    } catch {
      await ensureRootLoaded(page);
    }

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
