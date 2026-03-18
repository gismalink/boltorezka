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
const rtcIceServersJsonRaw = String(process.env.SMOKE_RTC_ICE_SERVERS_JSON || "").trim();
const rtcIceTransportPolicyRaw = String(process.env.SMOKE_RTC_ICE_TRANSPORT_POLICY || "all").trim().toLowerCase();
const rtcIceTransportPolicy = rtcIceTransportPolicyRaw === "relay" ? "relay" : "all";

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

function normalizeIceServer(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawUrls = value.urls;
  const urls = Array.isArray(rawUrls)
    ? rawUrls.map((item) => String(item || "").trim()).filter(Boolean)
    : [String(rawUrls || "").trim()].filter(Boolean);

  if (urls.length === 0) {
    return null;
  }

  const server = { urls };
  if (value.username !== undefined) {
    server.username = String(value.username || "").trim();
  }
  if (value.credential !== undefined) {
    server.credential = String(value.credential || "").trim();
  }

  return server;
}

function resolveRtcConfig() {
  if (!rtcIceServersJsonRaw) {
    return {
      iceTransportPolicy: rtcIceTransportPolicy
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rtcIceServersJsonRaw);
  } catch (error) {
    throw new Error(`[smoke:livekit:media] invalid SMOKE_RTC_ICE_SERVERS_JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("[smoke:livekit:media] SMOKE_RTC_ICE_SERVERS_JSON must be a JSON array");
  }

  const iceServers = parsed
    .map((value) => normalizeIceServer(value))
    .filter(Boolean);

  if (iceServers.length === 0) {
    throw new Error("[smoke:livekit:media] SMOKE_RTC_ICE_SERVERS_JSON has no valid ice servers");
  }

  return {
    iceServers,
    iceTransportPolicy: rtcIceTransportPolicy
  };
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

async function setupPeer(page, tokenPayload, peerName, rtcConfig) {
  const connectUrl = signalUrlOverride || tokenPayload.url;

  await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.addScriptTag({ url: clientScriptUrl });

  await page.evaluate(
    async ({ url, token, roomName, name, rtcConfig }) => {
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
        await room.connect(url, currentToken, {
          autoSubscribe: true,
          rtcConfig
        });

        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        let frame = 0;
        const drawTimer = setInterval(() => {
          if (!ctx) {
            return;
          }
          frame += 1;
          ctx.fillStyle = frame % 2 === 0 ? "#4b9cff" : "#18c58f";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#0b1220";
          ctx.font = "20px sans-serif";
          ctx.fillText(`${name} frame ${frame}`, 12, 40);
        }, 120);

        const videoStream = canvas.captureStream(15);
        const videoTrack = videoStream.getVideoTracks()[0];

        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0.05;
        oscillator.frequency.value = 440;
        oscillator.connect(gain);
        const destination = audioContext.createMediaStreamDestination();
        gain.connect(destination);
        oscillator.start();

        const audioTrack = destination.stream.getAudioTracks()[0];
        const localTracks = [audioTrack, videoTrack].filter(Boolean);
        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track);
        }

        return {
          room,
          localTracks,
          resources: {
            drawTimer,
            oscillator,
            audioContext,
            videoStream
          }
        };
      }

      const current = await connectAndPublish(token);

      globalThis.__lkSmoke = {
        state,
        roomName,
        url,
        token,
        room: current.room,
        localTracks: current.localTracks,
        resources: current.resources,
        async reconnect(nextToken) {
          state.reconnectCount += 1;
          if (globalThis.__lkSmoke.resources?.drawTimer) {
            clearInterval(globalThis.__lkSmoke.resources.drawTimer);
          }
          if (globalThis.__lkSmoke.resources?.oscillator) {
            try {
              globalThis.__lkSmoke.resources.oscillator.stop();
            } catch {
              // no-op
            }
          }
          if (globalThis.__lkSmoke.resources?.audioContext) {
            try {
              await globalThis.__lkSmoke.resources.audioContext.close();
            } catch {
              // no-op
            }
          }
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
          globalThis.__lkSmoke.resources = connected.resources;
          globalThis.__lkSmoke.token = nextToken;
        },
        async disconnect() {
          if (globalThis.__lkSmoke.resources?.drawTimer) {
            clearInterval(globalThis.__lkSmoke.resources.drawTimer);
          }
          if (globalThis.__lkSmoke.resources?.oscillator) {
            try {
              globalThis.__lkSmoke.resources.oscillator.stop();
            } catch {
              // no-op
            }
          }
          if (globalThis.__lkSmoke.resources?.audioContext) {
            try {
              await globalThis.__lkSmoke.resources.audioContext.close();
            } catch {
              // no-op
            }
          }
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
      name: peerName,
      rtcConfig
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
  const rtcConfig = resolveRtcConfig();
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
    },
    rtcConfig: {
      iceTransportPolicy: rtcConfig.iceTransportPolicy,
      iceServersCount: Array.isArray(rtcConfig.iceServers) ? rtcConfig.iceServers.length : 0
    }
  };

  try {
    const ctxA = await browser.newContext({ permissions: ["microphone", "camera"] });
    const ctxB = await browser.newContext({ permissions: ["microphone", "camera"] });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    peers.push({ context: ctxA, page: pageA });
    peers.push({ context: ctxB, page: pageB });

    await setupPeer(pageA, joinA, "peer-a", rtcConfig);
    await setupPeer(pageB, joinB, "peer-b", rtcConfig);

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

    await setupPeer(pageC, joinC, "peer-c", rtcConfig);

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
