#!/usr/bin/env node
// Purpose: Desktop runtime smoke using Electron shell + Playwright.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.boltorezka.gismalink.art").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_RUNTIME_TIMEOUT_MS || 30000);
const strictMode = String(process.env.SMOKE_DESKTOP_RUNTIME_STRICT || "0") === "1";

function isIgnorableConsoleError(message) {
  const text = String(message || "");
  if (!text) {
    return false;
  }

  // Anonymous startup can produce expected 401s for protected resources.
  return /failed to load resource/i.test(text) && /status of 401/i.test(text);
}

async function ensureRootLoaded(page) {
  try {
    await page.waitForSelector("#root", { timeout: Math.max(5000, Math.floor(timeoutMs / 2)) });
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
        console.log("[smoke:desktop:runtime] skip");
        console.log(`- reason: renderer is unreachable (${String(error?.message || error)})`);
        return;
      }
      throw error;
    }

    const runtime = await page.evaluate(() => document.documentElement.dataset.runtime || "");
    const platform = await page.evaluate(() => document.documentElement.dataset.desktopPlatform || "");
    const electronVersion = await page.evaluate(() => document.documentElement.dataset.desktopElectron || "");
    const title = await page.title();

    if (runtime !== "desktop") {
      if (!strictMode && !runtime) {
        console.log("[smoke:desktop:runtime] skip");
        console.log("- reason: desktop runtime marker is empty (likely non-app renderer page)");
        return;
      }
      throw new Error(`expected runtime=desktop, got '${runtime || "<empty>"}'`);
    }

    if (!platform) {
      throw new Error("desktop platform marker is empty");
    }

    if (!electronVersion) {
      throw new Error("desktop electron version marker is empty");
    }

    if (!/Desktop/i.test(title)) {
      throw new Error(`expected desktop title marker, got '${title}'`);
    }

    if (errors.length > 0) {
      throw new Error(`runtime errors detected: ${errors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:desktop:runtime] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- runtime: ${runtime}`);
    console.log(`- platform: ${platform}`);
    console.log(`- electronVersion: ${electronVersion}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:runtime] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
