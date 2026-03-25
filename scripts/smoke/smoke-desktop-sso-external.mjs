#!/usr/bin/env node
// Purpose: Verify that SSO start is externalized and desktop logout stays in-app.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_DESKTOP_SSO_EXTERNAL_TIMEOUT_MS || 30000);

async function ensureRootLoaded(page) {
  try {
    await page.waitForSelector("#root", { timeout: Math.max(5000, Math.floor(timeoutMs / 2)) });
    return;
  } catch {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForSelector("#root", { timeout: timeoutMs });
  }
}

async function getLastExternalUrl(app) {
  return app.evaluate(() => String(global.__boltorezkaLastExternalUrl || ""));
}

async function main() {
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [appDir],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: `${baseUrl}/`,
      ELECTRON_ALLOW_MULTIPLE_INSTANCES: "1",
      ELECTRON_SMOKE_SUPPRESS_EXTERNAL_OPEN: "1",
      ELECTRON_FORCE_EXTERNAL_SSO_START: "1"
    }
  });

  try {
    const page = await app.firstWindow();
    await ensureRootLoaded(page);

    const startUrl = `${baseUrl}/v1/auth/sso/start?provider=google&returnUrl=${encodeURIComponent(`${baseUrl}/`)}`;
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(1200);

    const startExternalUrl = await getLastExternalUrl(app);
    const startExternalized = startExternalUrl.includes("/v1/auth/sso/start")
      || /\/auth\/(google|yandex)(\?|$)/i.test(startExternalUrl)
      || /accounts\.google\.com\/(o\/oauth2\/v2\/auth|v3\/signin\/accountchooser)/i.test(startExternalUrl);
    if (!startExternalized) {
      throw new Error(`expected externalized sso/start url, got '${startExternalUrl || "<empty>"}'`);
    }

    await app.evaluate(() => {
      global.__boltorezkaLastExternalUrl = "";
    });

    await ensureRootLoaded(page);

    const logoutUrl = `${baseUrl}/v1/auth/sso/logout?returnUrl=${encodeURIComponent(`${baseUrl}/`)}`;
    await page.goto(logoutUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(1200);

    const logoutExternalUrl = await getLastExternalUrl(app);
    const logoutWasExternalized = logoutExternalUrl.includes("/v1/auth/sso/logout")
      || /\/auth\/logout(\?|$)/i.test(logoutExternalUrl);
    if (logoutWasExternalized) {
      throw new Error(`expected local desktop logout handling, got external url '${logoutExternalUrl}'`);
    }

    const logoutUrlAfterFlow = page.url();
    if (!/desktop_logged_out=1/.test(logoutUrlAfterFlow)) {
      throw new Error(`expected desktop local logout marker in url, got '${logoutUrlAfterFlow || "<empty>"}'`);
    }

    const runtime = await page.evaluate(() => document.documentElement.dataset.runtime || "");
    if (runtime !== "desktop") {
      throw new Error(`expected runtime=desktop after sso external flow, got '${runtime || "<empty>"}'`);
    }

    console.log("[smoke:desktop:sso-external] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- ssoStartExternalized: ${startExternalized}`);
    console.log("- ssoLogoutMode: local-desktop");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:sso-external] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
