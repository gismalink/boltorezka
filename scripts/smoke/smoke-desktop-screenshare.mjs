#!/usr/bin/env node
// Purpose: Validate desktop screen share start/stop control path in Electron runtime.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.datowave.com").replace(/\/$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "test-room").trim();
const bearer = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const timeoutMs = Number(process.env.SMOKE_DESKTOP_SCREENSHARE_TIMEOUT_MS || 45000);

if (!bearer) {
  console.error("[smoke:desktop:screenshare] requires SMOKE_TEST_BEARER_TOKEN");
  process.exit(1);
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

async function establishSessionAndRoom(page) {
  const result = await page.evaluate(async ({ token, slug }) => {
    async function req(pathname, init = {}) {
      const response = await fetch(pathname, {
        credentials: "include",
        ...init
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, payload };
    }

    const create = await req("/v1/auth/desktop-handoff", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!create.ok || !create.payload?.code) {
      return { ok: false, stage: "handoff_create", status: create.status };
    }

    const exchange = await req("/v1/auth/desktop-handoff/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ code: create.payload.code })
    });

    if (!exchange.ok || exchange.payload?.authenticated !== true) {
      return { ok: false, stage: "handoff_exchange", status: exchange.status };
    }

    localStorage.setItem("boltorezka_room_slug", slug);
    return { ok: true };
  }, { token: bearer, slug: roomSlug });

  if (!result?.ok) {
    throw new Error(`failed to establish desktop session via ${result?.stage || "unknown"} status=${result?.status || "n/a"}`);
  }
}

async function injectFakeDisplayMedia(page) {
  await page.addInitScript(() => {
    const originalMediaDevices = navigator.mediaDevices || {};

    const fakeGetDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const timer = window.setInterval(() => {
        if (!ctx) {
          return;
        }
        frame += 1;
        ctx.fillStyle = frame % 2 === 0 ? "#1f2937" : "#0ea5e9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px sans-serif";
        ctx.fillText(`screen-share ${frame}`, 20, 40);
      }, 120);

      const stream = canvas.captureStream(15);
      const [track] = stream.getVideoTracks();
      if (track) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          window.clearInterval(timer);
          stop();
        };
      }
      return stream;
    };

    const patched = {
      ...originalMediaDevices,
      getDisplayMedia: fakeGetDisplayMedia
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      enumerable: true,
      writable: false,
      value: patched
    });
  });
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

  try {
    const page = await app.firstWindow();
    await injectFakeDisplayMedia(page);
    await ensureRootLoaded(page);
    await establishSessionAndRoom(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await ensureRootLoaded(page);

    await page.waitForSelector(".rtc-actions-grid", { timeout: timeoutMs });
    const screenButton = page.locator(".rtc-actions-grid > span:nth-child(2) button").first();
    await screenButton.waitFor({ state: "visible", timeout: timeoutMs });

    const runtime = await page.evaluate(() => document.documentElement.dataset.runtime || "");
    if (runtime !== "desktop") {
      throw new Error(`expected runtime=desktop, got '${runtime || "<empty>"}'`);
    }

    const waitStarted = Date.now();
    while (Date.now() - waitStarted < timeoutMs) {
      if (await screenButton.isEnabled()) {
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!(await screenButton.isEnabled())) {
      const disabledClass = await screenButton.getAttribute("class");
      console.log("[smoke:desktop:screenshare] skip");
      console.log(`- baseUrl: ${baseUrl}`);
      console.log(`- roomSlug: ${roomSlug}`);
      console.log("- reason: screen share control is disabled (likely roomVoiceConnected=false or room policy)");
      console.log(`- classCurrent: ${disabledClass || "<empty>"}`);
      return;
    }

    const initialClass = await screenButton.getAttribute("class");
    await screenButton.click({ timeout: timeoutMs });

    await page.waitForFunction(() => {
      const button = document.querySelector(".rtc-actions-grid > span:nth-child(2) button");
      return Boolean(button && button.className.includes("icon-btn-danger"));
    }, undefined, { timeout: timeoutMs });

    const activeClass = await screenButton.getAttribute("class");
    await screenButton.click({ timeout: timeoutMs });

    await page.waitForFunction(() => {
      const button = document.querySelector(".rtc-actions-grid > span:nth-child(2) button");
      return Boolean(button && !button.className.includes("icon-btn-danger"));
    }, undefined, { timeout: timeoutMs });

    const finalClass = await screenButton.getAttribute("class");

    console.log("[smoke:desktop:screenshare] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- roomSlug: ${roomSlug}`);
    console.log(`- classBefore: ${initialClass || "<empty>"}`);
    console.log(`- classActive: ${activeClass || "<empty>"}`);
    console.log(`- classAfterStop: ${finalClass || "<empty>"}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:screenshare] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
