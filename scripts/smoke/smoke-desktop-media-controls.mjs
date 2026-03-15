#!/usr/bin/env node
// Purpose: Validate desktop media controls path (mic/audio toggles + device menus) in Electron runtime.
import path from "path";
import { createRequire } from "module";
import { _electron as electron } from "playwright";

const repoDir = process.cwd();
const appDir = path.resolve(repoDir, "apps/desktop-electron");
const requireFromDesktop = createRequire(path.join(appDir, "package.json"));
const electronBinary = requireFromDesktop("electron");

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "https://test.boltorezka.gismalink.art").replace(/\/$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "test-room").trim();
const bearer = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const timeoutMs = Number(process.env.SMOKE_DESKTOP_MEDIA_CONTROLS_TIMEOUT_MS || 45000);

if (!bearer) {
  console.error("[smoke:desktop:media-controls] requires SMOKE_TEST_BEARER_TOKEN");
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

async function clickButton(page, selector, label) {
  const button = page.locator(selector).first();
  await button.waitFor({ state: "visible", timeout: timeoutMs });
  await button.click({ timeout: timeoutMs });
  return label;
}

async function readLocalState(page) {
  return page.evaluate(() => ({
    runtime: document.documentElement.dataset.runtime || "",
    micMuted: localStorage.getItem("boltorezka_mic_muted"),
    audioMuted: localStorage.getItem("boltorezka_audio_muted"),
    selectedInputId: localStorage.getItem("boltorezka_selected_input_id") || "",
    selectedOutputId: localStorage.getItem("boltorezka_selected_output_id") || "",
    selectedVideoInputId: localStorage.getItem("boltorezka_selected_video_input_id") || ""
  }));
}

async function selectFirstDeviceOption(page) {
  const option = page.locator(".settings-popup .device-item").first();
  const count = await page.locator(".settings-popup .device-item").count();
  if (count > 0) {
    await option.click({ timeout: timeoutMs });
  }
  return count;
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
    await ensureRootLoaded(page);
    await establishSessionAndRoom(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await ensureRootLoaded(page);

    await page.waitForSelector(".user-panel-actions-grid", { timeout: timeoutMs });

    const initial = await readLocalState(page);
    if (initial.runtime !== "desktop") {
      throw new Error(`expected runtime=desktop, got '${initial.runtime || "<empty>"}'`);
    }

    // Toggle mic twice.
    await clickButton(page, ".voice-settings-anchor .split-main-btn", "mic-main");
    await page.waitForTimeout(200);
    const afterMicToggle = await readLocalState(page);
    await clickButton(page, ".voice-settings-anchor .split-main-btn", "mic-main-restore");

    // Toggle audio output mute twice.
    await clickButton(page, ".audio-output-anchor .split-main-btn", "audio-main");
    await page.waitForTimeout(200);
    const afterAudioToggle = await readLocalState(page);
    await clickButton(page, ".audio-output-anchor .split-main-btn", "audio-main-restore");

    // Open/select input device from voice settings.
    await clickButton(page, ".voice-settings-anchor .split-caret-btn", "voice-caret");
    await page.waitForSelector(".voice-settings-popup", { timeout: timeoutMs });
    await clickButton(page, ".voice-settings-popup .voice-menu-items button", "input-submenu");
    await page.waitForSelector(".voice-submenu-popup", { timeout: timeoutMs });
    const inputOptionsCount = await selectFirstDeviceOption(page);

    // Open/select output device.
    await clickButton(page, ".audio-output-anchor .split-caret-btn", "output-caret");
    await page.waitForSelector(".voice-mini-popup", { timeout: timeoutMs });
    const outputOptionsCount = await selectFirstDeviceOption(page);

    // Open/select camera device.
    await clickButton(page, ".camera-anchor .split-caret-btn", "camera-caret");
    await page.waitForSelector(".voice-mini-popup", { timeout: timeoutMs });
    const cameraOptionsCount = await selectFirstDeviceOption(page);

    const finalState = await readLocalState(page);

    const micToggled = afterMicToggle.micMuted !== initial.micMuted;
    const audioToggled = afterAudioToggle.audioMuted !== initial.audioMuted;

    if (!micToggled) {
      throw new Error("mic toggle did not change local muted state");
    }
    if (!audioToggled) {
      throw new Error("audio toggle did not change local muted state");
    }

    console.log("[smoke:desktop:media-controls] ok");
    console.log(`- baseUrl: ${baseUrl}`);
    console.log(`- roomSlug: ${roomSlug}`);
    console.log(`- micStateTransition: ${initial.micMuted || "<null>"} -> ${afterMicToggle.micMuted || "<null>"}`);
    console.log(`- audioStateTransition: ${initial.audioMuted || "<null>"} -> ${afterAudioToggle.audioMuted || "<null>"}`);
    console.log(`- inputOptionsCount: ${inputOptionsCount}`);
    console.log(`- outputOptionsCount: ${outputOptionsCount}`);
    console.log(`- cameraOptionsCount: ${cameraOptionsCount}`);
    console.log(`- selectedInputId: ${finalState.selectedInputId || "<empty>"}`);
    console.log(`- selectedOutputId: ${finalState.selectedOutputId || "<empty>"}`);
    console.log(`- selectedVideoInputId: ${finalState.selectedVideoInputId || "<empty>"}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[smoke:desktop:media-controls] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
