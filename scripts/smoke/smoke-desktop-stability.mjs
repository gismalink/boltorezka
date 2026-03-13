#!/usr/bin/env node
// Purpose: Desktop long-session stability soak (runtime marker consistency + no critical runtime errors).
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.boltorezka.gismalink.art").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_STABILITY_TIMEOUT_MS || 30000);
const durationMs = Math.max(10000, Number(process.env.SMOKE_DESKTOP_STABILITY_DURATION_MS || 1800000));
const probeIntervalMs = Math.max(5000, Number(process.env.SMOKE_DESKTOP_STABILITY_PROBE_INTERVAL_MS || 30000));
const strictMode = String(process.env.SMOKE_DESKTOP_STABILITY_STRICT || "0") === "1";

function isIgnorableConsoleError(message) {
  const text = String(message || "");
  if (!text) {
    return false;
  }
  return /failed to load resource/i.test(text) && /status of 401/i.test(text);
}

async function ensureRootLoaded(page) {
  try {
    await page.waitForSelector("#root", { timeout: Math.max(5000, Math.floor(timeoutMs / 2)) });
    return;
  } catch {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForSelector("#root", { timeout: timeoutMs });
  }
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
  let app = null;
  let launchError = null;
  const launchAttempts = 3;

  for (let attempt = 1; attempt <= launchAttempts; attempt += 1) {
    try {
      app = await electron.launch({
        executablePath: electronBinary,
        args: [appDir],
        env: {
          ...process.env,
          ELECTRON_RENDERER_URL: `${baseUrl}/`,
          ELECTRON_ALLOW_MULTIPLE_INSTANCES: "1"
        }
      });
      launchError = null;
      break;
    } catch (error) {
      launchError = error;
      if (attempt < launchAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  if (!app) {
    if (!strictMode) {
      console.log("[smoke:desktop:stability] skip");
      console.log(`- reason: electron launch failed (${String(launchError?.message || launchError)})`);
      return;
    }
    throw launchError || new Error("electron launch failed");
  }

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
        console.log("[smoke:desktop:stability] skip");
        console.log(`- reason: renderer is unreachable (${String(error?.message || error)})`);
        return;
      }
      throw error;
    }

    const startedAt = Date.now();
    let probes = 0;
    let maxGapMs = 0;
    let prevProbeAt = startedAt;

    while (Date.now() - startedAt < durationMs) {
      let markers = await readMarkers(page);
      try {
        assertMarkers(markers, `probe#${probes + 1}`);
      } catch {
        // Transient renderer navigation/race can briefly clear markers; do one recovery attempt.
        await ensureRootLoaded(page);
        markers = await readMarkers(page);
        assertMarkers(markers, `probe#${probes + 1}:recovered`);
      }
      probes += 1;

      const now = Date.now();
      const gap = now - prevProbeAt;
      if (gap > maxGapMs) {
        maxGapMs = gap;
      }
      prevProbeAt = now;

      if (errors.length > 0) {
        throw new Error(`runtime errors detected: ${errors.slice(0, 5).join(" | ")}`);
      }

      const remaining = durationMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        break;
      }

      const sleepFor = Math.min(probeIntervalMs, remaining);
      await new Promise((resolve) => setTimeout(resolve, sleepFor));
    }

    const elapsedMs = Date.now() - startedAt;

    console.log("[smoke:desktop:stability] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- durationMs: ${durationMs}`);
    console.log(`- elapsedMs: ${elapsedMs}`);
    console.log(`- probes: ${probes}`);
    console.log(`- maxProbeGapMs: ${maxGapMs}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:stability] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
