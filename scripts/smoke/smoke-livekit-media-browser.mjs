#!/usr/bin/env node
// Purpose: Browser media-plane smoke for LiveKit join/publish/subscribe/reconnect/late-join flow.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "test-room").trim();
const timeoutMs = Math.min(Number(process.env.SMOKE_TIMEOUT_MS || 35000), 120000);
const settleMs = Math.min(Number(process.env.SMOKE_LIVEKIT_MEDIA_SETTLE_MS || 2000), 15000);
const failOnOneWay = process.env.SMOKE_LIVEKIT_FAIL_ON_ONE_WAY !== "0";
const clientScriptUrl = String(
  process.env.SMOKE_LIVEKIT_CLIENT_CDN_URL
  || "https://cdn.jsdelivr.net/npm/livekit-client@2.15.8/dist/livekit-client.umd.min.js"
).trim();
const signalUrlOverride = String(process.env.SMOKE_LIVEKIT_MEDIA_SIGNAL_URL || "").trim();

const bearerA = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const bearerB = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const bearerC = String(process.env.SMOKE_TEST_BEARER_TOKEN_THIRD || "").trim();

if (!roomSlug) {
  console.error("[smoke:livekit:media] SMOKE_ROOM_SLUG is required");
  process.exit(1);
}

if (!bearerA || !bearerB || !bearerC) {
  console.error("[smoke:livekit:media] requires SMOKE_TEST_BEARER_TOKEN, _SECOND, _THIRD");
  process.exit(1);
}

async function mintLivekitToken(bearerToken, label) {
  const response = await fetch(`${baseUrl}/v1/auth/livekit-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ roomSlug })
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    throw new Error(`[smoke:livekit:media] ${label} token mint failed status=${response.status}`);
  }

  const token = String(payload?.token || "").trim();
  const url = String(payload?.url || "").trim();
  const identity = String(payload?.identity || "").trim();
  const room = String(payload?.room || "").trim();

  if (!token || !url || !identity || room !== roomSlug) {
    throw new Error(`[smoke:livekit:media] ${label} invalid token payload`);
  }

  return { token, url, identity };
}

async function setupPeer(page, tokenPayload, peerName) {
  const connectUrl = signalUrlOverride || tokenPayload.url;

  await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.addScriptTag({ url: clientScriptUrl });

  await page.evaluate(
    async ({ url, token, roomName, name }) => {
      const lk = globalThis.LivekitClient;
      if (!lk || !lk.Room || !lk.RoomEvent) {
        throw new Error("LiveKit client failed to load in browser context");
      }

      const state = {
        peerName: name,
        remoteAudioTracks: 0,
        remoteVideoTracks: 0,
        remoteParticipantIdentities: [],
        isConnected: false,
        lastDisconnectReason: "",
        reconnectCount: 0
      };

      function attachState(room) {
        room.on(lk.RoomEvent.Connected, () => {
          state.isConnected = true;
        });

        room.on(lk.RoomEvent.Disconnected, () => {
          state.isConnected = false;
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (participant && participant.identity) {
            if (!state.remoteParticipantIdentities.includes(participant.identity)) {
              state.remoteParticipantIdentities.push(participant.identity);
            }
          }

          if (track?.kind === "audio") {
            state.remoteAudioTracks += 1;
          }
          if (track?.kind === "video") {
            state.remoteVideoTracks += 1;
          }
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          if (track?.kind === "audio") {
            state.remoteAudioTracks = Math.max(0, state.remoteAudioTracks - 1);
          }
          if (track?.kind === "video") {
            state.remoteVideoTracks = Math.max(0, state.remoteVideoTracks - 1);
          }
        });
      }

      async function connectAndPublish(currentToken) {
        const room = new lk.Room({
          adaptiveStream: false,
          dynacast: false,
          stopLocalTrackOnUnpublish: false
        });

        attachState(room);
        await room.connect(url, currentToken, { autoSubscribe: true });

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 320, height: 240, frameRate: 15 }
        });

        const localTracks = stream.getTracks();
        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track);
        }

        return { room, localTracks };
      }

      const current = await connectAndPublish(token);

      globalThis.__lkSmoke = {
        state,
        roomName,
        url,
        token,
        room: current.room,
        localTracks: current.localTracks,
        async reconnect(nextToken) {
          state.reconnectCount += 1;
          for (const track of globalThis.__lkSmoke.localTracks || []) {
            try {
              track.stop();
            } catch {
              // no-op
            }
          }

          try {
            await globalThis.__lkSmoke.room.disconnect();
          } catch {
            // no-op
          }

          const connected = await connectAndPublish(nextToken);
          globalThis.__lkSmoke.room = connected.room;
          globalThis.__lkSmoke.localTracks = connected.localTracks;
          globalThis.__lkSmoke.token = nextToken;
        },
        async disconnect() {
          for (const track of globalThis.__lkSmoke.localTracks || []) {
            try {
              track.stop();
            } catch {
              // no-op
            }
          }
          try {
            await globalThis.__lkSmoke.room.disconnect();
          } catch {
            // no-op
          }
        }
      };
    },
    {
      url: connectUrl,
      token: tokenPayload.token,
      roomName: roomSlug,
      name: peerName
    }
  );
}

async function waitForRemoteTracks(page, minAudio, minVideo, label) {
  await page.waitForFunction(
    ({ expectedAudio, expectedVideo }) => {
      const state = globalThis.__lkSmoke?.state;
      if (!state) {
        return false;
      }
      return state.remoteAudioTracks >= expectedAudio && state.remoteVideoTracks >= expectedVideo;
    },
    { expectedAudio: minAudio, expectedVideo: minVideo },
    { timeout: timeoutMs }
  );

  const state = await page.evaluate(() => globalThis.__lkSmoke?.state || null);
  if (!state) {
    throw new Error(`[smoke:livekit:media] ${label} missing state`);
  }
  return state;
}

async function main() {
  const joinA = await mintLivekitToken(bearerA, "peer-a");
  const joinB = await mintLivekitToken(bearerB, "peer-b");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--no-sandbox"
    ]
  });

  const peers = [];
  const metrics = {
    roomSlug,
    join: "pass",
    reconnect: "pass",
    lateJoin: "pass",
    oneWayIncidents: {
      audio: 0,
      video: 0
    },
    identities: {
      a: joinA.identity,
      b: joinB.identity,
      c: ""
    }
  };

  try {
    const ctxA = await browser.newContext({ permissions: ["microphone", "camera"] });
    const ctxB = await browser.newContext({ permissions: ["microphone", "camera"] });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    peers.push({ context: ctxA, page: pageA });
    peers.push({ context: ctxB, page: pageB });

    await setupPeer(pageA, joinA, "peer-a");
    await setupPeer(pageB, joinB, "peer-b");

    await waitForRemoteTracks(pageA, 1, 1, "join peer-a");
    await waitForRemoteTracks(pageB, 1, 1, "join peer-b");

    await new Promise((resolve) => setTimeout(resolve, settleMs));

    // Reconnect peer A with a fresh token and verify peer B still receives media.
    const reconnectA = await mintLivekitToken(bearerA, "peer-a-reconnect");
    await pageA.evaluate(async (token) => {
      await globalThis.__lkSmoke.reconnect(token);
    }, reconnectA.token);

    await waitForRemoteTracks(pageB, 1, 1, "reconnect peer-b");

    // Late join peer C and verify the room converges to 3-way subscriptions.
    const joinC = await mintLivekitToken(bearerC, "peer-c");
    metrics.identities.c = joinC.identity;
    const ctxC = await browser.newContext({ permissions: ["microphone", "camera"] });
    const pageC = await ctxC.newPage();
    peers.push({ context: ctxC, page: pageC });

    await setupPeer(pageC, joinC, "peer-c");

    await waitForRemoteTracks(pageA, 2, 2, "late-join peer-a");
    await waitForRemoteTracks(pageB, 2, 2, "late-join peer-b");
    await waitForRemoteTracks(pageC, 2, 2, "late-join peer-c");

    const [stateA, stateB, stateC] = await Promise.all([
      pageA.evaluate(() => globalThis.__lkSmoke?.state || null),
      pageB.evaluate(() => globalThis.__lkSmoke?.state || null),
      pageC.evaluate(() => globalThis.__lkSmoke?.state || null)
    ]);

    const allStates = [stateA, stateB, stateC].filter(Boolean);
    metrics.oneWayIncidents.audio = allStates.some((state) => Number(state.remoteAudioTracks || 0) < 2) ? 1 : 0;
    metrics.oneWayIncidents.video = allStates.some((state) => Number(state.remoteVideoTracks || 0) < 2) ? 1 : 0;

    if (failOnOneWay && (metrics.oneWayIncidents.audio > 0 || metrics.oneWayIncidents.video > 0)) {
      throw new Error(
        `[smoke:livekit:media] one-way incidents detected audio=${metrics.oneWayIncidents.audio} video=${metrics.oneWayIncidents.video}`
      );
    }

    console.log(JSON.stringify({ ok: true, ...metrics }, null, 2));
  } finally {
    for (const peer of peers) {
      try {
        await peer.page.evaluate(async () => {
          if (globalThis.__lkSmoke?.disconnect) {
            await globalThis.__lkSmoke.disconnect();
          }
        });
      } catch {
        // ignore teardown errors
      }

      try {
        await peer.context.close();
      } catch {
        // ignore teardown errors
      }
    }

    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
