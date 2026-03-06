#!/usr/bin/env node
// Purpose: Browser media-plane smoke for realtime RTC audio+video over signaling relay with measurable RTP stats.
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const roomSlug = String(process.env.SMOKE_ROOM_SLUG || "test-room").trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 20000);
const settleMs = Number(process.env.SMOKE_RTC_MEDIA_SETTLE_MS || 12000);
const toneBaseFrequencyHz = Number(process.env.SMOKE_RTC_TONE_FREQUENCY_HZ || process.env.SMOKE_RTC_TONE_FREQUENCY_BASE_HZ || 440);
const toneFrequencySpreadHz = Number(process.env.SMOKE_RTC_TONE_SPREAD_HZ || 18);
const melodyStepMs = Number(process.env.SMOKE_RTC_TONE_MELODY_STEP_MS || 440);
const videoNoiseWidth = Number(process.env.SMOKE_RTC_VIDEO_NOISE_WIDTH || 320);
const videoNoiseHeight = Number(process.env.SMOKE_RTC_VIDEO_NOISE_HEIGHT || 240);
const videoNoiseFps = Number(process.env.SMOKE_RTC_VIDEO_NOISE_FPS || 12);
const iceServersJsonRaw = String(process.env.SMOKE_RTC_ICE_SERVERS_JSON || "").trim();
const iceServersCsv = String(process.env.SMOKE_RTC_ICE_SERVERS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302");
const hostResolveRule = String(process.env.SMOKE_CHROMIUM_HOST_RESOLVE_RULE || "").trim();
const targetUserIdEnv = String(process.env.SMOKE_RTC_TARGET_USER_ID || "").trim();
const reconnectIntervalMs = Number(process.env.SMOKE_RTC_RECONNECT_INTERVAL_MS || 3000);

const tokenA = String(process.env.SMOKE_TEST_BEARER_TOKEN || "").trim();
const tokenB = String(process.env.SMOKE_TEST_BEARER_TOKEN_SECOND || "").trim();
const ticketAEnv = String(process.env.SMOKE_WS_TICKET || "").trim();
const ticketBEnv = String(process.env.SMOKE_WS_TICKET_SECOND || "").trim();

function resolveIceServers() {
  if (iceServersJsonRaw) {
    const candidates = [iceServersJsonRaw];
    const outerSingleQuoted = iceServersJsonRaw.match(/^'(.*)'$/s);
    const outerDoubleQuoted = iceServersJsonRaw.match(/^"(.*)"$/s);
    if (outerSingleQuoted) {
      candidates.push(outerSingleQuoted[1]);
    }
    if (outerDoubleQuoted) {
      candidates.push(outerDoubleQuoted[1]);
    }
    candidates.push(iceServersJsonRaw.replace(/\\"/g, '"'));

    let parsed;
    let parseError = null;
    for (const candidate of candidates) {
      try {
        parsed = JSON.parse(candidate);
        parseError = null;
        break;
      } catch (error) {
        parseError = error;
      }
    }
    if (!parsed) {
      throw new Error(`[smoke:realtime:media] invalid SMOKE_RTC_ICE_SERVERS_JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error("[smoke:realtime:media] SMOKE_RTC_ICE_SERVERS_JSON must be a JSON array");
    }

    const normalized = parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const urls = Array.isArray(entry.urls)
          ? entry.urls.map((url) => String(url || "").trim()).filter(Boolean)
          : [String(entry.urls || "").trim()].filter(Boolean);

        if (urls.length === 0) {
          return null;
        }

        const server = { urls };
        if (entry.username !== undefined) {
          server.username = String(entry.username || "").trim();
        }
        if (entry.credential !== undefined) {
          server.credential = String(entry.credential || "").trim();
        }
        return server;
      })
      .filter(Boolean);

    if (normalized.length === 0) {
      throw new Error("[smoke:realtime:media] SMOKE_RTC_ICE_SERVERS_JSON has no valid entries");
    }

    return normalized;
  }

  return iceServersCsv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url) => ({ urls: [url] }));
}

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

async function preparePeerPage({ context, label, ticket, toneHz }) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

  const result = await page.evaluate(async ({ baseUrlInner, roomSlugInner, ticketInner, labelInner, timeoutMsInner, toneHz, melodyStepMsInner, iceServers, videoNoiseWidthInner, videoNoiseHeightInner, videoNoiseFpsInner }) => {
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
      toneMelodyTimer: null,
      toneTrack: null,
      videoCanvas: null,
      videoNoiseTimer: null,
      videoTrack: null,
      callConnectedAt: 0,
      inboundTrackCount: 0,
      relayedOfferCount: 0,
      relayedAnswerCount: 0,
      relayedIceCount: 0,
      joinAcked: false,
      lastVideoStateBroadcastAt: 0,
      lastLocalVideoEnabledBroadcast: null,
      remoteVideoStateByUserId: new Map(),
      remoteVideoStateTransitionsByUserId: new Map(),
      pendingRemoteCandidates: [],
      presentUserIds: new Set(),
      peerLastSeenAt: new Map(),
      reconnectAttempts: 0,
      reconnectSuccesses: 0
    };

    const noteRatios = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
    const labelHash = Array.from(labelInner).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    const markPeerSeen = (userId) => {
      const normalized = String(userId || "").trim();
      if (!normalized) {
        return;
      }
      state.presentUserIds.add(normalized);
      state.peerLastSeenAt.set(normalized, Date.now());
    };

    const unmarkPeer = (userId) => {
      const normalized = String(userId || "").trim();
      if (!normalized) {
        return;
      }
      state.presentUserIds.delete(normalized);
      state.peerLastSeenAt.delete(normalized);
    };

    const isPcConnected = () => {
      const pc = state.pc;
      if (!pc) {
        return false;
      }

      return (
        pc.connectionState === "connected"
        || pc.iceConnectionState === "connected"
        || pc.iceConnectionState === "completed"
      );
    };

    const closePeerConnection = () => {
      if (!state.pc) {
        return;
      }

      try {
        state.pc.onicecandidate = null;
        state.pc.onconnectionstatechange = null;
        state.pc.oniceconnectionstatechange = null;
        state.pc.ontrack = null;
        state.pc.close();
      } catch {
        // noop
      }

      state.pc = null;
      state.pendingRemoteCandidates = [];
      state.callConnectedAt = 0;
    };

    const pickRoomPeer = (excludedIds = []) => {
      const excluded = new Set((Array.isArray(excludedIds) ? excludedIds : []).map((item) => String(item || "").trim()));
      let bestUserId = "";
      let bestSeenAt = -1;

      for (const userId of state.presentUserIds.values()) {
        if (!userId || excluded.has(userId)) {
          continue;
        }

        const seenAt = Number(state.peerLastSeenAt.get(userId) || 0);
        if (seenAt >= bestSeenAt) {
          bestSeenAt = seenAt;
          bestUserId = userId;
        }
      }

      return bestUserId;
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

    const broadcastLocalVideoState = async (localVideoEnabled = true) => {
      const now = Date.now();
      const normalizedEnabled = Boolean(localVideoEnabled);
      if (
        now - state.lastVideoStateBroadcastAt < 700
        && state.lastLocalVideoEnabledBroadcast === normalizedEnabled
      ) {
        return;
      }

      state.lastVideoStateBroadcastAt = now;
      state.lastLocalVideoEnabledBroadcast = normalizedEnabled;
      await sendEvent("call.video_state", {
        settings: {
          localVideoEnabled: normalizedEnabled
        }
      });
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

      const melodyStartIndex = labelHash % noteRatios.length;
      let step = 0;
      state.toneMelodyTimer = window.setInterval(() => {
        const ratio = noteRatios[(melodyStartIndex + step) % noteRatios.length] || 1;
        oscillator.frequency.value = Math.max(140, toneHz * ratio);
        step += 1;
      }, Math.max(140, melodyStepMsInner));

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

    const ensureVideoTrack = () => {
      if (state.videoTrack) {
        return state.videoTrack;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(64, Number(videoNoiseWidthInner) || 320);
      canvas.height = Math.max(48, Number(videoNoiseHeightInner) || 240);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("[smoke:realtime:media] canvas2d context is missing");
      }

      let frame = 0;
      const paint = () => {
        const w = canvas.width;
        const h = canvas.height;
        const image = ctx.createImageData(w, h);
        const data = image.data;

        for (let i = 0; i < data.length; i += 4) {
          const x = ((i / 4) % w);
          const y = Math.floor((i / 4) / w);
          const noise = (Math.random() * 255) | 0;
          data[i] = (noise + ((x + frame) % 255)) & 255;
          data[i + 1] = (noise + ((y * 2 + frame * 3) % 255)) & 255;
          data[i + 2] = (noise + ((x + y + frame * 5) % 255)) & 255;
          data[i + 3] = 255;
        }

        ctx.putImageData(image, 0, 0);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect((frame * 7) % w, 0, 2, h);
        frame += 1;
      };

      paint();
      state.videoNoiseTimer = window.setInterval(paint, Math.max(40, Math.round(1000 / Math.max(1, Number(videoNoiseFpsInner) || 12))));

      const stream = canvas.captureStream(Math.max(1, Number(videoNoiseFpsInner) || 12));
      const [track] = stream.getVideoTracks();
      if (!track) {
        throw new Error("[smoke:realtime:media] video track is missing");
      }

      state.videoCanvas = canvas;
      state.videoTrack = track;
      return track;
    };

    const ensurePeerConnection = () => {
      if (state.pc) {
        return state.pc;
      }

      const pc = new RTCPeerConnection({ iceServers });
      const toneTrack = ensureToneTrack();
      const videoTrack = ensureVideoTrack();
      pc.addTrack(toneTrack);
      pc.addTrack(videoTrack);

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
        markPeerSeen(state.userId);
      }

      if (data?.type === "room.presence") {
        const users = Array.isArray(data?.payload?.users) ? data.payload.users : [];
        state.presentUserIds.clear();
        state.peerLastSeenAt.clear();
        users.forEach((user) => {
          const userId = String(user?.userId || "").trim();
          markPeerSeen(userId);
        });
      }

      if (data?.type === "presence.joined") {
        const userId = String(data?.payload?.userId || "").trim();
        markPeerSeen(userId);
        if (userId && userId !== state.userId) {
          broadcastLocalVideoState().catch(() => undefined);
        }
      }

      if (data?.type === "presence.left") {
        const userId = String(data?.payload?.userId || "").trim();
        unmarkPeer(userId);

        if (state.remoteUserId && state.remoteUserId === userId) {
          closePeerConnection();
          state.remoteUserId = "";
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

      if (data?.type === "call.video_state") {
        const fromUserId = String(data?.payload?.fromUserId || data?.payload?.userId || "").trim();
        const localVideoEnabled = data?.payload?.settings?.localVideoEnabled;
        if (fromUserId && typeof localVideoEnabled === "boolean") {
          state.remoteVideoStateByUserId.set(fromUserId, localVideoEnabled);
          const existing = state.remoteVideoStateTransitionsByUserId.get(fromUserId) || [];
          existing.push(localVideoEnabled);
          state.remoteVideoStateTransitionsByUserId.set(fromUserId, existing.slice(-8));
        }
      }
    });

    await waitFor(() => ws.readyState === WebSocket.OPEN, `${labelInner} websocket open`);
    await waitFor(() => state.userId, `${labelInner} server.ready userId`);

    await sendEvent("room.join", { roomSlug: roomSlugInner });
    state.joinAcked = true;
    await broadcastLocalVideoState();

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
        reconnectAttempts: state.reconnectAttempts,
        reconnectSuccesses: state.reconnectSuccesses,
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
          () => isPcConnected(),
          `${labelInner} peer connection connected`,
          timeoutMsInner
        );
      },
      ensureConnectedToRoomPeer: async ({ excludeUserIds = [], preferredTargetUserId = "" } = {}) => {
        const preferred = String(preferredTargetUserId || "").trim();
        const connectedRemoteUserId = String(state.remoteUserId || "").trim();
        const shouldRetargetPreferred = Boolean(preferred && connectedRemoteUserId && preferred !== connectedRemoteUserId);

        if (isPcConnected() && !shouldRetargetPreferred) {
          return {
            ok: true,
            connected: true,
            targetUserId: state.remoteUserId || "",
            reason: "already-connected"
          };
        }

        const selectedTarget = preferred || pickRoomPeer(excludeUserIds);
        if (!selectedTarget) {
          return {
            ok: false,
            connected: false,
            targetUserId: "",
            reason: "no-target"
          };
        }

        if (state.remoteUserId && state.remoteUserId !== selectedTarget) {
          closePeerConnection();
          state.remoteUserId = "";
        }

        state.reconnectAttempts += 1;

        try {
          await window.__rtcMediaSmoke.startCall(selectedTarget);
          await window.__rtcMediaSmoke.waitConnected();
          state.reconnectSuccesses += 1;
          return {
            ok: true,
            connected: true,
            targetUserId: selectedTarget,
            reason: "connected"
          };
        } catch (error) {
          return {
            ok: false,
            connected: false,
            targetUserId: selectedTarget,
            reason: String(error instanceof Error ? error.message : error || "connect-failed")
          };
        }
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
        let outboundVideoBytes = 0;
        let outboundVideoPackets = 0;
        let inboundVideoBytes = 0;
        let inboundVideoPackets = 0;

        report.forEach((entry) => {
          if (entry.type === "outbound-rtp" && entry.kind === "audio") {
            outboundAudioBytes += Number(entry.bytesSent || 0);
            outboundAudioPackets += Number(entry.packetsSent || 0);
          }

          if (entry.type === "inbound-rtp" && entry.kind === "audio") {
            inboundAudioBytes += Number(entry.bytesReceived || 0);
            inboundAudioPackets += Number(entry.packetsReceived || 0);
          }

          if (entry.type === "outbound-rtp" && entry.kind === "video") {
            outboundVideoBytes += Number(entry.bytesSent || 0);
            outboundVideoPackets += Number(entry.packetsSent || 0);
          }

          if (entry.type === "inbound-rtp" && entry.kind === "video") {
            inboundVideoBytes += Number(entry.bytesReceived || 0);
            inboundVideoPackets += Number(entry.packetsReceived || 0);
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
          outboundVideoBytes,
          outboundVideoPackets,
          inboundVideoBytes,
          inboundVideoPackets,
          inboundTrackCount: state.inboundTrackCount,
          relayedOfferCount: state.relayedOfferCount,
          relayedAnswerCount: state.relayedAnswerCount,
          relayedIceCount: state.relayedIceCount
        };
      },
      getPresenceUserIds: () => Array.from(state.presentUserIds),
      sendLocalVideoState: async (localVideoEnabled) => {
        await broadcastLocalVideoState(Boolean(localVideoEnabled));
      },
      waitForRemoteVideoState: async (fromUserId, expectedEnabled, timeoutForStateMs = timeoutMsInner) => {
        const normalizedUserId = String(fromUserId || "").trim();
        const normalizedExpected = Boolean(expectedEnabled);
        await waitFor(() => {
          if (!normalizedUserId) {
            return false;
          }

          return state.remoteVideoStateByUserId.get(normalizedUserId) === normalizedExpected;
        }, `${labelInner} remote video state ${normalizedUserId}=${normalizedExpected}`, timeoutForStateMs);
      },
      getRemoteVideoStateSnapshot: () => {
        const byUser = {};
        state.remoteVideoStateByUserId.forEach((value, key) => {
          byUser[key] = Boolean(value);
        });
        const transitionsByUser = {};
        state.remoteVideoStateTransitionsByUserId.forEach((value, key) => {
          transitionsByUser[key] = Array.isArray(value) ? value.map(Boolean) : [];
        });

        return {
          byUser,
          transitionsByUser
        };
      },
      closeAll: async () => {
        try {
          state.toneTrack?.stop();
        } catch {
          // noop
        }
        if (state.toneMelodyTimer !== null) {
          clearInterval(state.toneMelodyTimer);
          state.toneMelodyTimer = null;
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
          state.videoTrack?.stop();
        } catch {
          // noop
        }
        if (state.videoNoiseTimer !== null) {
          clearInterval(state.videoNoiseTimer);
          state.videoNoiseTimer = null;
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
    toneHz,
    melodyStepMsInner: melodyStepMs,
    videoNoiseWidthInner: videoNoiseWidth,
    videoNoiseHeightInner: videoNoiseHeight,
    videoNoiseFpsInner: videoNoiseFps,
    iceServers
  });

  return { page, userId: String(result?.userId || "").trim() };
}

async function main() {
  assertPreconditions();
  const iceServers = resolveIceServers();

  const ticketA = ticketAEnv || await fetchTicket(tokenA, "primary");
  const ticketB = ticketBEnv || await fetchTicket(tokenB, "secondary");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required"
    ].concat(hostResolveRule ? [`--host-resolver-rules=${hostResolveRule}`] : [])
  });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  let pageA = null;
  let pageB = null;

  try {
    const peerA = await preparePeerPage({
      context: contextA,
      label: "peer-a",
      ticket: ticketA,
      toneHz: Math.max(140, toneBaseFrequencyHz - toneFrequencySpreadHz)
    });
    const peerB = await preparePeerPage({
      context: contextB,
      label: "peer-b",
      ticket: ticketB,
      toneHz: Math.max(140, toneBaseFrequencyHz + toneFrequencySpreadHz)
    });

    pageA = peerA.page;
    pageB = peerB.page;

    if (!peerA.userId || !peerB.userId || peerA.userId === peerB.userId) {
      throw new Error("[smoke:realtime:media] expected two distinct users in room");
    }

    let targetUserId = "";
    let targetKind = "room-participant";
    let targetCursorA = 0;
    let targetCursorB = 0;

    if (targetUserIdEnv) {
      targetUserId = targetUserIdEnv;
      targetKind = targetUserId === peerB.userId ? "room-participant-explicit-bot" : "custom-explicit";
    } else {
      const detected = await pageA.evaluate(
        ({ excludedIds, peerTimeoutMs }) => window.__rtcMediaSmoke.waitForRoomPeer(excludedIds, peerTimeoutMs),
        {
          excludedIds: [peerA.userId, peerB.userId],
          peerTimeoutMs: Math.max(timeoutMs, 90000)
        }
      ).catch(() => "");

      if (detected) {
        targetUserId = String(detected);
        targetKind = "room-participant-user";
      } else {
        targetKind = "room-participant-bot-fallback";
      }
    }

    const pickNextTarget = ({ candidates, cursor }) => {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return { nextTarget: "", nextCursor: cursor };
      }

      const normalizedCursor = cursor % candidates.length;
      return {
        nextTarget: String(candidates[normalizedCursor] || "").trim(),
        nextCursor: normalizedCursor + 1
      };
    };

    const sessionDeadline = Date.now() + Math.max(8000, settleMs);
    let redialSuccessesA = 0;
    let redialSuccessesB = 0;
    while (Date.now() < sessionDeadline) {
      const [presenceA, presenceB] = await Promise.all([
        pageA.evaluate(() => window.__rtcMediaSmoke.getPresenceUserIds()),
        pageB.evaluate(() => window.__rtcMediaSmoke.getPresenceUserIds())
      ]);

      const targetsA = Array.from(new Set((Array.isArray(presenceA) ? presenceA : [])
        .map((item) => String(item || "").trim())
        .filter((userId) => Boolean(userId && userId !== peerA.userId))));
      const targetsB = Array.from(new Set((Array.isArray(presenceB) ? presenceB : [])
        .map((item) => String(item || "").trim())
        .filter((userId) => Boolean(userId && userId !== peerB.userId))));

      const nextA = targetUserIdEnv
        ? { nextTarget: targetUserIdEnv, nextCursor: targetCursorA }
        : pickNextTarget({ candidates: targetsA, cursor: targetCursorA });
      const nextB = targetUserIdEnv
        ? { nextTarget: targetUserIdEnv, nextCursor: targetCursorB }
        : pickNextTarget({ candidates: targetsB, cursor: targetCursorB });

      targetCursorA = nextA.nextCursor;
      targetCursorB = nextB.nextCursor;

      const [reconnectA, reconnectB] = await Promise.all([
        pageA.evaluate(
          ({ excludedIds, preferredTargetUserId }) => window.__rtcMediaSmoke.ensureConnectedToRoomPeer({
            excludeUserIds: excludedIds,
            preferredTargetUserId
          }),
          {
            excludedIds: [peerA.userId],
            preferredTargetUserId: nextA.nextTarget
          }
        ),
        pageB.evaluate(
          ({ excludedIds, preferredTargetUserId }) => window.__rtcMediaSmoke.ensureConnectedToRoomPeer({
            excludeUserIds: excludedIds,
            preferredTargetUserId
          }),
          {
            excludedIds: [peerB.userId],
            preferredTargetUserId: nextB.nextTarget
          }
        )
      ]);

      if (reconnectA?.ok) {
        redialSuccessesA += 1;
      }
      if (reconnectB?.ok) {
        redialSuccessesB += 1;
      }

      if (!targetUserId) {
        const discovered = await pageA.evaluate(
          ({ excludedIds }) => window.__rtcMediaSmoke.waitForRoomPeer(excludedIds, 200),
          { excludedIds: [peerA.userId, peerB.userId] }
        ).catch(() => "");

        if (discovered) {
          targetUserId = String(discovered);
          targetKind = "room-participant-user";
        }
      }

      await new Promise((resolve) => setTimeout(resolve, Math.max(800, reconnectIntervalMs)));
    }

    const statsA = await pageA.evaluate(() => window.__rtcMediaSmoke.getRtcStats());
    const statsB = await pageB.evaluate(() => window.__rtcMediaSmoke.getRtcStats());
    const stateA = await pageA.evaluate(() => window.__rtcMediaSmoke.getState());
    const stateB = await pageB.evaluate(() => window.__rtcMediaSmoke.getState());

    await pageA.evaluate(() => window.__rtcMediaSmoke.sendLocalVideoState(false));
    await pageB.evaluate(
      ({ fromUserId, timeoutForStateMs }) => window.__rtcMediaSmoke.waitForRemoteVideoState(fromUserId, false, timeoutForStateMs),
      { fromUserId: peerA.userId, timeoutForStateMs: Math.max(timeoutMs, 12000) }
    );
    await pageA.evaluate(() => window.__rtcMediaSmoke.sendLocalVideoState(true));
    await pageB.evaluate(
      ({ fromUserId, timeoutForStateMs }) => window.__rtcMediaSmoke.waitForRemoteVideoState(fromUserId, true, timeoutForStateMs),
      { fromUserId: peerA.userId, timeoutForStateMs: Math.max(timeoutMs, 12000) }
    );

    await pageB.evaluate(() => window.__rtcMediaSmoke.sendLocalVideoState(false));
    await pageA.evaluate(
      ({ fromUserId, timeoutForStateMs }) => window.__rtcMediaSmoke.waitForRemoteVideoState(fromUserId, false, timeoutForStateMs),
      { fromUserId: peerB.userId, timeoutForStateMs: Math.max(timeoutMs, 12000) }
    );
    await pageB.evaluate(() => window.__rtcMediaSmoke.sendLocalVideoState(true));
    await pageA.evaluate(
      ({ fromUserId, timeoutForStateMs }) => window.__rtcMediaSmoke.waitForRemoteVideoState(fromUserId, true, timeoutForStateMs),
      { fromUserId: peerB.userId, timeoutForStateMs: Math.max(timeoutMs, 12000) }
    );

    const [remoteVideoStateA, remoteVideoStateB] = await Promise.all([
      pageA.evaluate(() => window.__rtcMediaSmoke.getRemoteVideoStateSnapshot()),
      pageB.evaluate(() => window.__rtcMediaSmoke.getRemoteVideoStateSnapshot())
    ]);

    const cameraStateConvergenceOk = Boolean(
      remoteVideoStateA?.byUser?.[peerB.userId] === true
      && remoteVideoStateB?.byUser?.[peerA.userId] === true
      && Array.isArray(remoteVideoStateA?.transitionsByUser?.[peerB.userId])
      && remoteVideoStateA.transitionsByUser[peerB.userId].includes(false)
      && remoteVideoStateA.transitionsByUser[peerB.userId].includes(true)
      && Array.isArray(remoteVideoStateB?.transitionsByUser?.[peerA.userId])
      && remoteVideoStateB.transitionsByUser[peerA.userId].includes(false)
      && remoteVideoStateB.transitionsByUser[peerA.userId].includes(true)
    );

    const isBotToBot = !targetUserId || targetUserId === peerA.userId || targetUserId === peerB.userId;

    const relayLooksHealthy = isBotToBot
      ? (
        (Number(statsA.relayedAnswerCount || 0) >= 1 || Number(statsB.relayedAnswerCount || 0) >= 1)
        && (Number(statsA.relayedOfferCount || 0) >= 1 || Number(statsB.relayedOfferCount || 0) >= 1)
        && (Number(statsA.relayedIceCount || 0) >= 1 || Number(statsB.relayedIceCount || 0) >= 1)
      )
      : (
        Number(statsA.relayedAnswerCount || 0) >= 1
        || Number(statsB.relayedAnswerCount || 0) >= 1
      );

    const mediaLooksHealthy = isBotToBot
      ? [statsA, statsB].every((item) => (
        Number(item.outboundAudioBytes || 0) > 0
        && Number(item.outboundAudioPackets || 0) > 0
        && Number(item.outboundVideoBytes || 0) > 0
        && Number(item.outboundVideoPackets || 0) > 0
      ))
      : (
        Number(statsA.outboundAudioBytes || 0) > 0
        && Number(statsA.outboundAudioPackets || 0) > 0
        && Number(statsA.outboundVideoBytes || 0) > 0
        && Number(statsA.outboundVideoPackets || 0) > 0
        && Number(statsB.outboundAudioBytes || 0) > 0
        && Number(statsB.outboundAudioPackets || 0) > 0
        && Number(statsB.outboundVideoBytes || 0) > 0
        && Number(statsB.outboundVideoPackets || 0) > 0
        && redialSuccessesA > 0
        && redialSuccessesB > 0
      );

    const failureSnapshot = JSON.stringify({
      users: {
        peerA: peerA.userId,
        peerB: peerB.userId,
        targetUserId,
        targetKind
      },
      redialSuccesses: {
        peerA: redialSuccessesA,
        peerB: redialSuccessesB
      },
      peerA: {
        state: stateA,
        stats: statsA
      },
      peerB: {
        state: stateB,
        stats: statsB
      }
    });

    if (!relayLooksHealthy) {
      throw new Error(`[smoke:realtime:media] signaling relay is incomplete (offer/answer/ice) snapshot=${failureSnapshot}`);
    }

    if (!mediaLooksHealthy) {
      throw new Error(`[smoke:realtime:media] RTP audio stats did not grow on one or both peers snapshot=${failureSnapshot}`);
    }

    if (!cameraStateConvergenceOk) {
      throw new Error("[smoke:realtime:media] camera state convergence failed for call.video_state off/on propagation");
    }

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      roomSlug,
      settleMs,
      toneBaseFrequencyHz,
      toneFrequencySpreadHz,
      melodyStepMs,
      videoNoiseWidth,
      videoNoiseHeight,
      videoNoiseFps,
      users: {
        peerA: peerA.userId,
        peerB: peerB.userId,
        targetUserId,
        targetKind
      },
      redialSuccesses: {
        peerA: redialSuccessesA,
        peerB: redialSuccessesB
      },
      cameraStateConvergenceOk,
      remoteVideoStateA,
      remoteVideoStateB,
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
