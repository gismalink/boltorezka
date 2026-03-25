#!/usr/bin/env node
// Purpose: Validate desktop telemetry payload includes runtime labels.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

/**
 * @typedef {Window & { __boltorezkaDesktopSmokeTrack?: () => void }} SmokeWindow
 */

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_TELEMETRY_TIMEOUT_MS || 30000);
const telemetryUrlPath = "/v1/telemetry/web";

async function main() {
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [appDir],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: `${baseUrl}/?desktop_smoke_telemetry=1`
    }
  });

  let telemetryPayload = null;

  try {
    const context = app.context();
    await context.route(`**${telemetryUrlPath}`, async (route) => {
      try {
        const request = route.request();
        const body = request.postDataJSON?.();
        if (body && body.event === "desktop_smoke_probe") {
          telemetryPayload = body;
        }
      } catch {
        // Ignore malformed events and continue waiting for the expected payload.
      }

      await route.fulfill({
        status: 204,
        contentType: "application/json",
        body: "{}"
      });
    });

    const page = await app.firstWindow();

    await page.waitForSelector("#root", { timeout: timeoutMs });

    await page.evaluate(() => {
      const smokeWindow = window;
      if (typeof smokeWindow.__boltorezkaDesktopSmokeTrack === "function") {
        smokeWindow.__boltorezkaDesktopSmokeTrack();
      }
    });

    const started = Date.now();
    while (!telemetryPayload && Date.now() - started < timeoutMs) {
      await page.waitForTimeout(250);
    }

    if (!telemetryPayload) {
      throw new Error("desktop_smoke_probe telemetry event was not observed");
    }

    const meta = telemetryPayload.meta || {};
    const runtime = String(meta.runtime || "").trim();
    const platform = String(meta.platform || "").trim();
    const electronVersion = String(meta.electronVersion || "").trim();

    if (runtime !== "desktop") {
      throw new Error(`expected meta.runtime=desktop, got '${runtime || "<empty>"}'`);
    }
    if (!platform) {
      throw new Error("expected meta.platform to be non-empty");
    }
    if (!electronVersion) {
      throw new Error("expected meta.electronVersion to be non-empty");
    }

    console.log("[smoke:desktop:telemetry] ok");
    console.log(`- runtime: ${runtime}`);
    console.log(`- platform: ${platform}`);
    console.log(`- electronVersion: ${electronVersion}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:telemetry] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
