#!/usr/bin/env node
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS || 20000);
const appUrl = `${baseUrl}/`;

function deniedPermissionStatus() {
  return {
    state: "denied",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    }
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.addInitScript(() => {
      const deniedStatus = {
        state: "denied",
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        }
      };

      const mediaDevices = {
        async enumerateDevices() {
          return [
            { kind: "audioinput", deviceId: "default", label: "" },
            { kind: "audiooutput", deviceId: "default", label: "" },
            { kind: "videoinput", deviceId: "default", label: "" }
          ];
        },
        async getUserMedia() {
          const error = new Error("permission denied");
          error.name = "NotAllowedError";
          throw error;
        },
        async getDisplayMedia() {
          const error = new Error("permission denied");
          error.name = "NotAllowedError";
          throw error;
        },
        addEventListener() {},
        removeEventListener() {}
      };

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: mediaDevices
      });

      const originalPermissions = navigator.permissions;
      if (originalPermissions?.query) {
        Object.defineProperty(navigator, "permissions", {
          configurable: true,
          value: {
            ...originalPermissions,
            query: async (descriptor) => {
              if (descriptor?.name === "microphone") {
                return deniedStatus;
              }
              return originalPermissions.query(descriptor);
            }
          }
        });
      } else {
        Object.defineProperty(navigator, "permissions", {
          configurable: true,
          value: {
            query: async () => deniedStatus
          }
        });
      }
    });

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    const deniedBanner = page.locator(".mic-denied-banner");
    await deniedBanner.waitFor({ state: "visible", timeout: timeoutMs });

    const requestAccessButton = deniedBanner.getByRole("button");
    await requestAccessButton.waitFor({ state: "visible", timeout: timeoutMs });

    console.log("[smoke:web:denied-media:browser] ok");
    console.log("- denied banner visible");
    console.log("- request media access CTA visible");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[smoke:web:denied-media:browser] FAILED");
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
