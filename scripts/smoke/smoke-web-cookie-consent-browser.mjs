// Purpose: Validate cookie-consent UX (show -> accept -> hidden after reload) and no known non-essential cookies pre-consent.
import { chromium } from "playwright";

const webBaseUrl = (process.env.SMOKE_WEB_BASE_URL ?? process.env.SMOKE_API_URL ?? "https://test.datowave.com").replace(/\/+$/, "");
const legalPath = process.env.SMOKE_COOKIE_CONSENT_PATH ?? "/privacy";
const consentKey = process.env.SMOKE_COOKIE_CONSENT_KEY ?? "datowave_cookie_consent_v1";

const knownNonEssentialCookieNames = [
  /^_ga/i,
  /^_gid$/i,
  /^_ym/i,
  /^_fbp$/i,
  /^amplitude/i,
  /^mp_/i,
  /^analytics/i,
  /^segment/i
];

function hasKnownNonEssentialCookie(name) {
  return knownNonEssentialCookieNames.some((pattern) => pattern.test(name));
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const targetUrl = `${webBaseUrl}${legalPath}`;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
    }, consentKey);
    await page.reload({ waitUntil: "domcontentloaded" });

    const preConsentCookies = await context.cookies();
    const nonEssentialBeforeConsent = preConsentCookies.filter((cookie) => hasKnownNonEssentialCookie(cookie.name));
    if (nonEssentialBeforeConsent.length > 0) {
      throw new Error(
        `[smoke:web:cookie-consent:browser] non-essential cookies found before consent: ${nonEssentialBeforeConsent
          .map((cookie) => cookie.name)
          .join(", ")}`
      );
    }

    const consentButton = page.getByRole("button", { name: /^(Ок|OK)$/i });
    await consentButton.waitFor({ state: "visible", timeout: 15000 });
    await consentButton.click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await consentButton.waitFor({ state: "hidden", timeout: 15000 });

    console.log(
      `[smoke:web:cookie-consent:browser] ok web=${webBaseUrl} path=${legalPath} key=${consentKey} nonEssentialBeforeConsent=0`
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
