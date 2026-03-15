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
const allowManualWindowConfirm = String(process.env.SMOKE_DESKTOP_SLEEP_WAKE_ALLOW_MANUAL_WINDOW_CONFIRM || "0") === "1";
const manualWindowConfirmed = String(process.env.SMOKE_DESKTOP_SLEEP_WAKE_MANUAL_WINDOW_OK || "0") === "1";

async function ensureRootLoaded(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForSelector("#root", { timeout: timeoutMs });
}

async function waitForAnyWindow(app, waitTimeoutMs) {
  const startedAt = Date.now();
  let nextActivateNudgeAt = startedAt;

  const tryFirstWindowWithTimeout = async (ms) => {
    try {
      const candidate = await Promise.race([
        app.firstWindow(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("firstWindow timeout")), ms))
      ]);
      return candidate;
    } catch {
      return null;
    }
  };

  while (Date.now() - startedAt < waitTimeoutMs) {
    const windows = app.windows();
    if (windows.length > 0) {
      const active = windows[windows.length - 1];
      if (!active.isClosed()) {
        return active;
      }
    }

    const firstWindowCandidate = await tryFirstWindowWithTimeout(1200);
    if (firstWindowCandidate && !firstWindowCandidate.isClosed()) {
      return firstWindowCandidate;
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
  let prevTickAt = startedAt;
  let maxGapMs = 0;

  while (Date.now() < deadline) {
    const now = Date.now();
    const gapMs = now - prevTickAt;
    if (gapMs > maxGapMs) {
      maxGapMs = gapMs;
    }
    prevTickAt = now;

    if (now >= nextProgressAt) {
      const remaining = Math.max(0, deadline - now);
      console.log(`[smoke:desktop:sleep-wake] waiting... remainingMs=${remaining}`);
      nextProgressAt = now + 10000;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    elapsedMs: Date.now() - startedAt,
    maxGapMs
  };
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

    const waitStats = await waitByWallClock(windowMs);
    const elapsedMs = waitStats.elapsedMs;
    const suspendObserved = waitStats.maxGapMs >= suspendThresholdMs;

    let after = null;
    let windowRecoveryMode = "automatic";

    try {
      if (page.isClosed()) {
        page = await waitForAnyWindow(app, timeoutMs);
      }

      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForSelector("#root", { timeout: timeoutMs });
      } catch {
        await ensureRootLoaded(page);
      }

      after = await readMarkers(page);
      assertMarkers(after, "after");
    } catch (windowRecoveryError) {
      const canUseManualFallback = requireSuspend
        && allowManualWindowConfirm
        && manualWindowConfirmed;

      if (!canUseManualFallback) {
        throw windowRecoveryError;
      }

      windowRecoveryMode = "manual-confirmed";
      after = {
        runtime: "desktop",
        platform: before.platform,
        electronVersion: before.electronVersion,
        title: before.title
      };
    }

    if (requireSuspend && !suspendObserved) {
      throw new Error(
        `suspend not detected: elapsed=${elapsedMs}ms, required >= ${windowMs + suspendThresholdMs}ms`
      );
    }

    console.log("[smoke:desktop:sleep-wake] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- windowMs: ${windowMs}`);
    console.log(`- elapsedMs: ${elapsedMs}`);
    console.log(`- maxGapMs: ${waitStats.maxGapMs}`);
    console.log(`- suspendObserved: ${suspendObserved}`);
    console.log(`- requireSuspend: ${requireSuspend}`);
    console.log(`- windowRecoveryMode: ${windowRecoveryMode}`);
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
