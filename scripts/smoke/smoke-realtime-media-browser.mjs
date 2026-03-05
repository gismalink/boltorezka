#!/usr/bin/env node
// Purpose: Browser media-plane smoke for realtime RTC audio over signaling relay with measurable RTP stats.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "test-room").trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 20000);
const settleMs = Number(process.env.SMOKE_RTC_MEDIA_SETTLE_MS || 12000);
const toneFrequencyHz = Number(process.env.SMOKE_RTC_TONE_FREQUENCY_HZ || 440);
const iceServersCsv = String(process.env.SMOKE_RTC_ICE_SERVERS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302");
const targetUserIdEnv = String(process.env.SMOKE_RTC_TARGET_USER_ID || "").trim();
const preferHumanTarget = process.env.SMOKE_RTC_PREFER_HUMAN !== "0";

const tokenA = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const tokenB = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const ticketAEnv = String(process.env.SMOKE_WS_TICKET || "").trim();
const ticketBEnv = String(process.env.SMOKE_WS_TICKET_SECOND || "").trim();

function assertPreconditions() {
  const isHttp = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
  if (!isHttp) {
    throw new Error(`[smoke:realtime:media] invalid SMOKE_API_URL: ${baseUrl}`);
  }

  if (!roomSlug) {
    throw new Error("[smoke:realtime:media] SMOKE_ROOM_SLUG is required");
  }

  if (!ticketAEnv && !tokenA) {
    throw new Error("[smoke:realtime:media] set SMOKE_TEST_BEARER_TOKEN or SMOKE_WS_TICKET");
  }

  if (!ticketBEnv && !tokenB) {
    throw new Error("[smoke:realtime:media] set SMOKE_TEST_BEARER_TOKEN_SECOND or SMOKE_WS_TICKET_SECOND");
  }
}

async function fetchTicket(token, label) {
  const response = await fetch(`${baseUrl}/v1/auth/ws-ticket`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = await response.json().catch(() => null);
  const ticket = String(payload?.ticket || "").trim();
  if (!response.ok || !ticket) {
    throw new Error(`[smoke:realtime:media] ${label} ws-ticket failed: ${response.status}`);
  }
  return ticket;
}

async function preparePeerPage({ context, label, ticket }) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  const result = await page.evaluate(async ({ baseUrlInner, roomSlugInner, ticketInner, labelInner, timeoutMsInner, toneHz, iceServers }) => {
    const toWsUrl = (httpUrl) => {
      const parsed = new URL(httpUrl);
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      parsed.pathname = "/v1/realtime/ws";
      parsed.search = "";
      parsed.searchParams.set("ticket", ticketInner);
      return parsed.toString();
    };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const pendingByRequestId = new Map();

    const state = {
      label: labelInner,
      ws: null,
      userId: "",
      remoteUserId: "",
      pc: null,
      toneAudioContext: null,
      toneOscillator: null,
      toneGain: null,
      toneTrack: null,
      callConnectedAt: 0,
      inboundTrackCount: 0,
      relayedOfferCount: 0,
      relayedAnswerCount: 0,
      relayedIceCount: 0,
      joinAcked: false,
      pendingRemoteCandidates: [],
      presentUserIds: new Set()
    };

    const waitFor = async (predicate, labelText, timeoutMsValue = timeoutMsInner) => {
      const started = Date.now();
      while (Date.now() - started <= timeoutMsValue) {
        const value = predicate();
        if (value) {
          return value;
        }
        await wait(40);
      }
      throw new Error(`[smoke:realtime:media] timeout: ${labelText}`);
    };

    const sendEvent = async (type, payload) => {
      const requestId = `${type}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const frame = { type, requestId, payload };

      const ackPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingByRequestId.delete(requestId);
          reject(new Error(`[smoke:realtime:media] ack timeout for ${type}`));
        }, timeoutMsInner);

        pendingByRequestId.set(requestId, {
          resolve: (event) => {
            clearTimeout(timer);
            resolve(event);
          },
          reject: (event) => {
            clearTimeout(timer);
            reject(new Error(`[smoke:realtime:media] nack ${type}: ${String(event?.payload?.code || "")}`));
          }
        });
      });

      state.ws.send(JSON.stringify(frame));
      return ackPromise;
    };

    const ensureToneTrack = () => {
      if (state.toneTrack) {
        return state.toneTrack;
      }

      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = toneHz;

      const gain = audioContext.createGain();
      gain.gain.value = 0.015;

      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();

      const [track] = destination.stream.getAudioTracks();
      if (!track) {
        throw new Error("[smoke:realtime:media] tone track is missing");
      }

      state.toneAudioContext = audioContext;
      state.toneOscillator = oscillator;
      state.toneGain = gain;
      state.toneTrack = track;
      return track;
    };

    const ensurePeerConnection = () => {
      if (state.pc) {
        return state.pc;
      }

      const pc = new RTCPeerConnection({ iceServers });
      const toneTrack = ensureToneTrack();
      pc.addTrack(toneTrack);

      pc.onicecandidate = (event) => {
        if (!event.candidate || !state.remoteUserId) {
          return;
        }

        state.ws.send(JSON.stringify({
          type: "call.ice",
          requestId: `ice-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          payload: {
            targetUserId: state.remoteUserId,
            signal: { candidate: event.candidate.toJSON() }
          }
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          state.callConnectedAt = Date.now();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          state.callConnectedAt = Date.now();
        }
      };

      pc.ontrack = () => {
        state.inboundTrackCount += 1;
      };

      state.pc = pc;
      return pc;
    };

    const flushPendingRemoteCandidates = async () => {
      const pc = state.pc;
      if (!pc || !pc.remoteDescription || state.pendingRemoteCandidates.length === 0) {
        return;
      }

      const pending = state.pendingRemoteCandidates.splice(0, state.pendingRemoteCandidates.length);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // noop
        }
      }
    };

    const handleIncomingOffer = async (payload) => {
      const fromUserId = String(payload?.fromUserId || "").trim();
      const signal = payload?.signal;
      if (!fromUserId || !signal) {
        return;
      }

      state.remoteUserId = fromUserId;
      state.relayedOfferCount += 1;

      const pc = ensurePeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await flushPendingRemoteCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendEvent("call.answer", {
        targetUserId: fromUserId,
        signal: {
          type: pc.localDescription?.type || "answer",
          sdp: pc.localDescription?.sdp || ""
        }
      });
    };

    const handleIncomingAnswer = async (payload) => {
      const fromUserId = String(payload?.fromUserId || "").trim();
      const signal = payload?.signal;
      if (!fromUserId || !signal) {
        return;
      }

      state.remoteUserId = fromUserId;
      state.relayedAnswerCount += 1;

      const pc = ensurePeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await flushPendingRemoteCandidates();
    };

    const handleIncomingIce = async (payload) => {
      const fromUserId = String(payload?.fromUserId || "").trim();
      const signal = payload?.signal;
      const candidate = signal?.candidate || signal;
      if (!fromUserId || !candidate) {
        return;
      }

      state.remoteUserId = fromUserId;
      state.relayedIceCount += 1;

      const pc = ensurePeerConnection();
      if (!pc.remoteDescription) {
        state.pendingRemoteCandidates.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        return;
      }
    };

    const ws = new WebSocket(toWsUrl(baseUrlInner));
    state.ws = ws;

    ws.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(String(event.data || "{}"));
      } catch {
        return;
      }

      if (data?.type === "ack" || data?.type === "nack") {
        const requestId = String(data?.payload?.requestId || "").trim();
        const pending = pendingByRequestId.get(requestId);
        if (pending) {
          pendingByRequestId.delete(requestId);
          if (data.type === "ack") {
            pending.resolve(data);
          } else {
            pending.reject(data);
          }
        }
      }

      if (data?.type === "server.ready") {
        state.userId = String(data?.payload?.userId || "").trim();
        if (state.userId) {
          state.presentUserIds.add(state.userId);
        }
      }

      if (data?.type === "room.presence") {
        const users = Array.isArray(data?.payload?.users) ? data.payload.users : [];
        state.presentUserIds.clear();
        users.forEach((user) => {
          const userId = String(user?.userId || "").trim();
          if (userId) {
            state.presentUserIds.add(userId);
          }
        });
      }

      if (data?.type === "presence.joined") {
        const userId = String(data?.payload?.userId || "").trim();
        if (userId) {
          state.presentUserIds.add(userId);
        }
      }

      if (data?.type === "presence.left") {
        const userId = String(data?.payload?.userId || "").trim();
        if (userId) {
          state.presentUserIds.delete(userId);
        }
      }

      if (data?.type === "call.offer") {
        handleIncomingOffer(data.payload).catch(() => undefined);
      }

      if (data?.type === "call.answer") {
        handleIncomingAnswer(data.payload).catch(() => undefined);
      }

      if (data?.type === "call.ice") {
        handleIncomingIce(data.payload).catch(() => undefined);
      }
    });

    await waitFor(() => ws.readyState === WebSocket.OPEN, `${labelInner} websocket open`);
    await waitFor(() => state.userId, `${labelInner} server.ready userId`);

    await sendEvent("room.join", { roomSlug: roomSlugInner });
    state.joinAcked = true;

    window.__rtcMediaSmoke = {
      getState: () => ({
        userId: state.userId,
        remoteUserId: state.remoteUserId,
        callConnectedAt: state.callConnectedAt,
        inboundTrackCount: state.inboundTrackCount,
        relayedOfferCount: state.relayedOfferCount,
        relayedAnswerCount: state.relayedAnswerCount,
        relayedIceCount: state.relayedIceCount,
        presentUserIds: Array.from(state.presentUserIds),
        joinAcked: state.joinAcked,
        connectionState: state.pc?.connectionState || "new",
        iceConnectionState: state.pc?.iceConnectionState || "new"
      }),
      waitForRoomPeer: async (excludeUserIds = [], timeoutForPeerMs = timeoutMsInner) => {
        const excluded = new Set((Array.isArray(excludeUserIds) ? excludeUserIds : []).map((item) => String(item || "").trim()));
        return waitFor(() => {
          for (const userId of state.presentUserIds.values()) {
            if (userId && !excluded.has(userId)) {
              return userId;
            }
          }
          return "";
        }, `${labelInner} wait room peer`, timeoutForPeerMs);
      },
      startCall: async (targetUserId) => {
        state.remoteUserId = String(targetUserId || "").trim();
        const pc = ensurePeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendEvent("call.offer", {
          targetUserId: state.remoteUserId,
          signal: {
            type: pc.localDescription?.type || "offer",
            sdp: pc.localDescription?.sdp || ""
          }
        });
      },
      waitConnected: async () => {
        await waitFor(
          () => {
            const pc = state.pc;
            if (!pc) {
              return false;
            }
            return (
              pc.connectionState === "connected"
              || pc.iceConnectionState === "connected"
              || pc.iceConnectionState === "completed"
            );
          },
          `${labelInner} peer connection connected`,
          timeoutMsInner
        );
      },
      getRtcStats: async () => {
        const pc = state.pc;
        if (!pc) {
          return {
            hasPeerConnection: false,
            outboundAudioBytes: 0,
            outboundAudioPackets: 0,
            inboundAudioBytes: 0,
            inboundAudioPackets: 0
          };
        }

        const report = await pc.getStats();
        let outboundAudioBytes = 0;
        let outboundAudioPackets = 0;
        let inboundAudioBytes = 0;
        let inboundAudioPackets = 0;

        report.forEach((entry) => {
          if (entry.type === "outbound-rtp" && entry.kind === "audio") {
            outboundAudioBytes += Number(entry.bytesSent || 0);
            outboundAudioPackets += Number(entry.packetsSent || 0);
          }

          if (entry.type === "inbound-rtp" && entry.kind === "audio") {
            inboundAudioBytes += Number(entry.bytesReceived || 0);
            inboundAudioPackets += Number(entry.packetsReceived || 0);
          }
        });

        return {
          hasPeerConnection: true,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          outboundAudioBytes,
          outboundAudioPackets,
          inboundAudioBytes,
          inboundAudioPackets,
          inboundTrackCount: state.inboundTrackCount,
          relayedOfferCount: state.relayedOfferCount,
          relayedAnswerCount: state.relayedAnswerCount,
          relayedIceCount: state.relayedIceCount
        };
      },
      getPresenceUserIds: () => Array.from(state.presentUserIds),
      closeAll: async () => {
        try {
          state.toneTrack?.stop();
        } catch {
          // noop
        }
        try {
          state.toneOscillator?.stop();
        } catch {
          // noop
        }
        try {
          await state.toneAudioContext?.close?.();
        } catch {
          // noop
        }
        try {
          state.pc?.close();
        } catch {
          // noop
        }
        try {
          state.ws?.close();
        } catch {
          // noop
        }
      }
    };

    return {
      userId: state.userId,
      joined: state.joinAcked
    };
  }, {
    baseUrlInner: baseUrl,
    roomSlugInner: roomSlug,
    ticketInner: ticket,
    labelInner: label,
    timeoutMsInner: timeoutMs,
    toneHz: toneFrequencyHz,
    iceServers: iceServersCsv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((url) => ({ urls: url }))
  });

  return { page, userId: String(result?.userId || "").trim() };
}

async function main() {
  assertPreconditions();

  const ticketA = ticketAEnv || await fetchTicket(tokenA, "primary");
  const ticketB = ticketBEnv || await fetchTicket(tokenB, "secondary");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  let pageA = null;
  let pageB = null;

  try {
    const peerA = await preparePeerPage({ context: contextA, label: "peer-a", ticket: ticketA });
    const peerB = await preparePeerPage({ context: contextB, label: "peer-b", ticket: ticketB });

    pageA = peerA.page;
    pageB = peerB.page;

    if (!peerA.userId || !peerB.userId || peerA.userId === peerB.userId) {
      throw new Error("[smoke:realtime:media] expected two distinct users in room");
    }

    let targetUserId = peerB.userId;
    let targetKind = "bot";

    if (targetUserIdEnv) {
      targetUserId = targetUserIdEnv;
      targetKind = targetUserId === peerB.userId ? "bot" : "human-explicit";
    } else if (preferHumanTarget) {
      const detected = await pageA.evaluate(
        ({ excludedIds, peerTimeoutMs }) => window.__rtcMediaSmoke.waitForRoomPeer(excludedIds, peerTimeoutMs),
        {
          excludedIds: [peerA.userId, peerB.userId],
          peerTimeoutMs: Math.max(timeoutMs, 90000)
        }
      ).catch(() => "");

      if (detected) {
        targetUserId = String(detected);
        targetKind = "human-detected";
      }
    }

    await pageA.evaluate((targetUserId) => window.__rtcMediaSmoke.startCall(targetUserId), targetUserId);
    await pageA.evaluate(() => window.__rtcMediaSmoke.waitConnected());
    if (targetUserId === peerB.userId) {
      await pageB.evaluate(() => window.__rtcMediaSmoke.waitConnected());
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(4000, settleMs)));

    const statsA = await pageA.evaluate(() => window.__rtcMediaSmoke.getRtcStats());
    const statsB = await pageB.evaluate(() => window.__rtcMediaSmoke.getRtcStats());
    const stateA = await pageA.evaluate(() => window.__rtcMediaSmoke.getState());
    const stateB = await pageB.evaluate(() => window.__rtcMediaSmoke.getState());

    const isBotToBot = targetUserId === peerB.userId;

    const relayLooksHealthy = isBotToBot
      ? ((Number(statsA.relayedAnswerCount || 0) >= 1)
        && (Number(statsB.relayedOfferCount || 0) >= 1)
        && (Number(statsA.relayedIceCount || 0) >= 1 || Number(statsB.relayedIceCount || 0) >= 1))
      : ((Number(statsA.relayedAnswerCount || 0) >= 1) && (Number(statsA.relayedIceCount || 0) >= 1));

    const mediaLooksHealthy = isBotToBot
      ? [statsA, statsB].every((item) => (
        Number(item.outboundAudioBytes || 0) > 0
        && Number(item.outboundAudioPackets || 0) > 0
        && Number(item.inboundAudioBytes || 0) > 0
        && Number(item.inboundAudioPackets || 0) > 0
      ))
      : (Number(statsA.outboundAudioBytes || 0) > 0 && Number(statsA.outboundAudioPackets || 0) > 0);

    if (!relayLooksHealthy) {
      throw new Error("[smoke:realtime:media] signaling relay is incomplete (offer/answer/ice)");
    }

    if (!mediaLooksHealthy) {
      throw new Error("[smoke:realtime:media] RTP audio stats did not grow on one or both peers");
    }

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      roomSlug,
      settleMs,
      toneFrequencyHz,
      users: {
        peerA: peerA.userId,
        peerB: peerB.userId,
        targetUserId,
        targetKind
      },
      peerA: {
        state: stateA,
        stats: statsA
      },
      peerB: {
        state: stateB,
        stats: statsB
      }
    }, null, 2));
  } finally {
    try {
      if (pageA) {
        await pageA.evaluate(() => window.__rtcMediaSmoke?.closeAll?.());
      }
    } catch {
      // noop
    }

    try {
      if (pageB) {
        await pageB.evaluate(() => window.__rtcMediaSmoke?.closeAll?.());
      }
    } catch {
      // noop
    }

    await contextA.close();
    await contextB.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
