#!/usr/bin/env node
// Purpose: Desktop reconnect smoke using Electron shell + simulated network flap.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.boltorezka.gismalink.art").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_RECONNECT_TIMEOUT_MS || 40000);
const offlineWindowMs = Number(process.env.SMOKE_DESKTOP_OFFLINE_WINDOW_MS || 2500);
const strictMode = String(process.env.SMOKE_DESKTOP_RECONNECT_STRICT || "0") === "1";

function isIgnorableConsoleError(message) {
  const text = String(message || "");
  if (!text) {
    return false;
  }

  if (/failed to load resource/i.test(text) && /status of 401/i.test(text)) {
    return true;
  }

  if (/err_internet_disconnected|internet disconnected/i.test(text)) {
    return true;
  }

  return false;
}

async function ensureRootLoaded(page) {
  try {
    await page.waitForSelector("#root", { timeout: Math.max(6000, Math.floor(timeoutMs / 2)) });
    return;
  } catch {
    const attempts = 2;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForSelector("#root", { timeout: timeoutMs });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

async function readRuntimeMarkers(page) {
  return page.evaluate(() => ({
    runtime: document.documentElement.dataset.runtime || "",
    platform: document.documentElement.dataset.desktopPlatform || "",
    electronVersion: document.documentElement.dataset.desktopElectron || "",
    title: document.title || ""
  }));
}

async function assertDesktopMarkers(page) {
  const markers = await readRuntimeMarkers(page);

  if (markers.runtime !== "desktop") {
    throw new Error(`expected runtime=desktop, got '${markers.runtime || "<empty>"}'`);
  }
  if (!markers.platform) {
    throw new Error("desktop platform marker is empty");
  }
  if (!markers.electronVersion) {
    throw new Error("desktop electron version marker is empty");
  }
  if (!/Desktop/i.test(markers.title)) {
    throw new Error(`expected desktop title marker, got '${markers.title}'`);
  }

  return markers;
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

  const errors = [];

  try {
    const page = await app.firstWindow();

    page.on("pageerror", (error) => {
      errors.push(`pageerror:${String(error?.message || error)}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!isIgnorableConsoleError(text)) {
          errors.push(`console:${text}`);
        }
      }
    });

    try {
      await ensureRootLoaded(page);
    } catch (error) {
      if (!strictMode) {
        console.log("[smoke:desktop:reconnect] skip");
        console.log(`- reason: renderer is unreachable (${String(error?.message || error)})`);
        return;
      }
      throw error;
    }
    const before = await assertDesktopMarkers(page);

    const context = page.context();
    await context.setOffline(true);
    await page.waitForTimeout(offlineWindowMs);
    await context.setOffline(false);

    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await ensureRootLoaded(page);
    const after = await assertDesktopMarkers(page);

    if (errors.length > 0) {
      throw new Error(`runtime errors detected: ${errors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:desktop:reconnect] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- offlineWindowMs: ${offlineWindowMs}`);
    console.log(`- runtime(before): ${before.runtime}`);
    console.log(`- runtime(after): ${after.runtime}`);
    console.log(`- platform: ${after.platform}`);
    console.log(`- electronVersion: ${after.electronVersion}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:reconnect] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
