#!/usr/bin/env node
// Purpose: Static smoke for denied media UI markers in built web assets.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const appPath = resolve(root, "apps/web/src/App.tsx");
const userDockPath = resolve(root, "apps/web/src/components/UserDock.tsx");
const mediaHookPath = resolve(root, "apps/web/src/hooks/useMediaDevicePreferences.ts");

const appSource = readFileSync(appPath, "utf8");
const userDockSource = readFileSync(userDockPath, "utf8");
const mediaHookSource = readFileSync(mediaHookPath, "utf8");

const checks = [
  {
    name: "denied banner render guard in App.tsx",
    ok: appSource.includes('mediaDevicesState === "denied"') && appSource.includes("mic-denied-banner")
  },
  {
    name: "banner contains request access CTA",
    ok: appSource.includes('t("settings.requestMediaAccess")') && appSource.includes("onClick={requestMediaAccess}")
  },
  {
    name: "unified 4-control bar layout",
    ok: userDockSource.includes("user-panel-actions-grid")
      && (userDockSource.includes("bi-camera-video") || userDockSource.includes("bi-camera-video-fill") || userDockSource.includes("bi-camera-video-off-fill"))
      && userDockSource.includes("bi bi-telephone-x")
  },
  {
    name: "media controls lock state variable",
    ok: userDockSource.includes('const mediaControlsLocked = mediaDevicesState === "denied";')
  },
  {
    name: "locked mic/output buttons",
    ok: userDockSource.includes("disabled={mediaControlsLocked}")
  },
  {
    name: "permission flow keeps denied state",
    ok: mediaHookSource.includes("applyDeniedState") && mediaHookSource.includes('setMediaDevicesState("denied")') && mediaHookSource.includes("permissionsApi?.query")
  }
];

const failed = checks.filter((item) => !item.ok);

if (failed.length > 0) {
  console.error("[smoke:web:denied-media] FAILED");
  failed.forEach((item) => {
    console.error(`- ${item.name}`);
  });
  process.exit(1);
}

console.log("[smoke:web:denied-media] ok");
checks.forEach((item) => {
  console.log(`- ${item.name}`);
});
