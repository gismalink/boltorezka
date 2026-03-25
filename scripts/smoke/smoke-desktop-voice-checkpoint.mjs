#!/usr/bin/env node
// Purpose: Desktop voice-session checkpoint soak (runtime markers + voice diagnostics evidence).
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_VOICE_TIMEOUT_MS || 30000);
const durationMs = Math.max(60000, Number(process.env.SMOKE_DESKTOP_VOICE_DURATION_MS || 900000));
const probeIntervalMs = Math.max(5000, Number(process.env.SMOKE_DESKTOP_VOICE_PROBE_INTERVAL_MS || 10000));

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

async function readSnapshot(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const diagnosticsApi = window.__boltVoiceDiagnostics;
    const diagnostics = diagnosticsApi?.snapshot?.() || null;
    return {
      runtime: html.dataset.runtime || "",
      platform: html.dataset.desktopPlatform || "",
      electronVersion: html.dataset.desktopElectron || "",
      title: document.title || "",
      diagnostics
    };
  });
}

function assertMarkers(snapshot, stage) {
  if (snapshot.runtime !== "desktop") {
    throw new Error(`${stage}: expected runtime=desktop, got '${snapshot.runtime || "<empty>"}'`);
  }
  if (!snapshot.platform) {
    throw new Error(`${stage}: desktop platform marker is empty`);
  }
  if (!snapshot.electronVersion) {
    throw new Error(`${stage}: desktop electron version marker is empty`);
  }
  if (!/Desktop/i.test(snapshot.title)) {
    throw new Error(`${stage}: expected desktop title marker, got '${snapshot.title}'`);
  }
}

function mergeMaxCounters(maxCounters, diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") {
    return maxCounters;
  }
  for (const [key, value] of Object.entries(diagnostics)) {
    const numeric = typeof value === "number" ? value : 0;
    maxCounters[key] = Math.max(maxCounters[key] || 0, numeric);
  }
  return maxCounters;
}

function hasVoiceEvidence(maxCounters) {
  return (
    Number(maxCounters.runtimeLocalStreams || 0) > 0 ||
    Number(maxCounters.runtimePeers || 0) > 0 ||
    Number(maxCounters.meterStreams || 0) > 0
  );
}

async function main() {
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [appDir],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: `${baseUrl}/`,
      ELECTRON_ALLOW_MULTIPLE_INSTANCES: "1"
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

    await ensureRootLoaded(page);

    console.log("[smoke:desktop:voice-checkpoint] running");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- durationMs: ${durationMs}`);
    console.log("- action: login in Desktop app, join a voice-enabled room, keep mic connected for the full window");

    const startedAt = Date.now();
    let probes = 0;
    let maxGapMs = 0;
    let prevProbeAt = startedAt;
    const maxCounters = {};

    while (Date.now() - startedAt < durationMs) {
      let snapshot = await readSnapshot(page);
      try {
        assertMarkers(snapshot, `probe#${probes + 1}`);
      } catch {
        await ensureRootLoaded(page);
        snapshot = await readSnapshot(page);
        assertMarkers(snapshot, `probe#${probes + 1}:recovered`);
      }

      probes += 1;
      mergeMaxCounters(maxCounters, snapshot.diagnostics);

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
      await new Promise((resolve) => setTimeout(resolve, Math.min(probeIntervalMs, remaining)));
    }

    const elapsedMs = Date.now() - startedAt;
    const voiceEvidence = hasVoiceEvidence(maxCounters);

    if (!voiceEvidence) {
      throw new Error(
        `voice diagnostics evidence missing; expected one of runtimeLocalStreams/runtimePeers/meterStreams > 0, got ${JSON.stringify(maxCounters)}`
      );
    }

    console.log("[smoke:desktop:voice-checkpoint] ok");
    console.log(`- elapsedMs: ${elapsedMs}`);
    console.log(`- probes: ${probes}`);
    console.log(`- maxProbeGapMs: ${maxGapMs}`);
    console.log(`- maxVoiceCounters: ${JSON.stringify(maxCounters)}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:voice-checkpoint] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
