#!/usr/bin/env node
// Purpose: Desktop security smoke for Electron webPreferences and renderer isolation.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_SECURITY_TIMEOUT_MS || 30000);
const strictMode = String(process.env.SMOKE_DESKTOP_SECURITY_STRICT || "0") === "1";

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
        console.log("[smoke:desktop:security] skip");
        console.log(`- reason: renderer is unreachable (${String(error?.message || error)})`);
        return;
      }
      throw error;
    }

    const webPrefs = await app.evaluate(({ BrowserWindow }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (!mainWindow) {
        return null;
      }
      const prefs = mainWindow.webContents.getLastWebPreferences();
      return {
        contextIsolation: Boolean(prefs.contextIsolation),
        sandbox: Boolean(prefs.sandbox),
        nodeIntegration: Boolean(prefs.nodeIntegration),
        webSecurity: Boolean(prefs.webSecurity)
      };
    });

    if (!webPrefs) {
      throw new Error("main window webPreferences are unavailable");
    }

    if (!webPrefs.contextIsolation) {
      throw new Error("expected contextIsolation=true");
    }
    if (!webPrefs.sandbox) {
      throw new Error("expected sandbox=true");
    }
    if (webPrefs.nodeIntegration) {
      throw new Error("expected nodeIntegration=false");
    }
    if (!webPrefs.webSecurity) {
      throw new Error("expected webSecurity=true");
    }

    const rendererChecks = await page.evaluate(async () => {
      const hasRequire = typeof (globalThis).require !== "undefined";
      const hasProcess = typeof (globalThis).process !== "undefined";
      const hasBuffer = typeof (globalThis).Buffer !== "undefined";
      const bridge = (globalThis).boltorezkaDesktop || null;
      const bridgeKeys = bridge && typeof bridge === "object" ? Object.keys(bridge).sort() : [];
      const popupResult = window.open("https://example.com", "_blank");
      const popupBlocked = popupResult === null;
      if (popupResult && typeof popupResult.close === "function") {
        popupResult.close();
      }

      return {
        hasRequire,
        hasProcess,
        hasBuffer,
        bridgeKeys,
        bridgeHasPlatform: Boolean(bridge && bridge.platform),
        bridgeHasVersion: Boolean(bridge && bridge.version),
        popupBlocked
      };
    });

    if (rendererChecks.hasRequire) {
      throw new Error("renderer has require global");
    }
    if (rendererChecks.hasProcess) {
      throw new Error("renderer has process global");
    }
    if (rendererChecks.hasBuffer) {
      throw new Error("renderer has Buffer global");
    }

    const expectedBridgeKeys = ["platform", "version"];
    if (rendererChecks.bridgeKeys.join(",") !== expectedBridgeKeys.join(",")) {
      throw new Error(`unexpected preload bridge keys: ${rendererChecks.bridgeKeys.join(",") || "<empty>"}`);
    }

    if (!rendererChecks.bridgeHasPlatform || !rendererChecks.bridgeHasVersion) {
      throw new Error("preload bridge values are empty");
    }

    if (!rendererChecks.popupBlocked) {
      throw new Error("window.open is not blocked by shell handler");
    }

    if (errors.length > 0) {
      throw new Error(`runtime errors detected: ${errors.slice(0, 3).join(" | ")}`);
    }

    console.log("[smoke:desktop:security] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- contextIsolation: ${webPrefs.contextIsolation}`);
    console.log(`- sandbox: ${webPrefs.sandbox}`);
    console.log(`- nodeIntegration: ${webPrefs.nodeIntegration}`);
    console.log(`- webSecurity: ${webPrefs.webSecurity}`);
    console.log(`- bridgeKeys: ${rendererChecks.bridgeKeys.join(",")}`);
    console.log(`- popupBlocked: ${rendererChecks.popupBlocked}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:security] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
