#!/usr/bin/env bash
# Purpose: Build rolling 5m/30m SLO signal from telemetry summary counters and emit alert status.
set -euo pipefail

SLO_BASE_URL="${SLO_BASE_URL:-https://test.boltorezka.gismalink.art}"
SLO_BEARER_TOKEN="${SLO_BEARER_TOKEN:-${TEST_SMOKE_TEST_BEARER_TOKEN:-}}"
SLO_SUMMARY_ENDPOINT="${SLO_SUMMARY_ENDPOINT:-/v1/telemetry/summary}"
SLO_STATE_DIR="${SLO_STATE_DIR:-.deploy/slo}"
SLO_SNAPSHOTS_FILE="${SLO_SNAPSHOTS_FILE:-$SLO_STATE_DIR/telemetry-snapshots.ndjson}"
SLO_REPORT_FILE="${SLO_REPORT_FILE:-$SLO_STATE_DIR/last-slo-report.md}"
SLO_ENV_FILE="${SLO_ENV_FILE:-$SLO_STATE_DIR/last-slo-eval.env}"
SLO_RETENTION_MINUTES="${SLO_RETENTION_MINUTES:-1440}"
SLO_STRICT="${SLO_STRICT:-0}"

SLO_MIN_ACK_5M="${SLO_MIN_ACK_5M:-20}"
SLO_MIN_ACK_30M="${SLO_MIN_ACK_30M:-80}"
SLO_NACK_RATE_5M="${SLO_NACK_RATE_5M:-0.12}"
SLO_NACK_RATE_30M="${SLO_NACK_RATE_30M:-0.08}"
SLO_RECONNECT_SPIKE_30M="${SLO_RECONNECT_SPIKE_30M:-60}"
SLO_INITIAL_STATE_LAG_AVG_MS_30M="${SLO_INITIAL_STATE_LAG_AVG_MS_30M:-15000}"

if [[ -z "$SLO_BEARER_TOKEN" ]]; then
  echo "[slo-rolling-gate] missing SLO_BEARER_TOKEN (or TEST_SMOKE_TEST_BEARER_TOKEN)" >&2
  exit 1
fi

mkdir -p "$SLO_STATE_DIR"

summary_json="$(curl -fsS -H "Authorization: Bearer $SLO_BEARER_TOKEN" "${SLO_BASE_URL%/}${SLO_SUMMARY_ENDPOINT}")"

snapshot_json="$(node - "$summary_json" <<'NODE'
const payload = JSON.parse(process.argv[2] || "{}");
const m = payload.metrics || {};

const num = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const snapshot = {
  ts: new Date().toISOString(),
  day: String(payload.day || ""),
  metrics: {
    ack_sent: num(m.ack_sent),
    nack_sent: num(m.nack_sent),
    chat_sent: num(m.chat_sent),
    call_signal_sent: num(m.call_signal_sent),
    call_reconnect_joined: num(m.call_reconnect_joined),
    call_initial_state_lag_ms_total: num(m.call_initial_state_lag_ms_total),
    call_initial_state_lag_samples: num(m.call_initial_state_lag_samples),
    call_offer_rate_limited: num(m.call_offer_rate_limited),
    call_glare_suspected: num(m.call_glare_suspected),
    call_signal_target_miss: num(m.call_signal_target_miss)
  }
};

if (!snapshot.day) {
  throw new Error("telemetry summary payload missing day");
}

if (!Object.prototype.hasOwnProperty.call(m, "ack_sent") || !Object.prototype.hasOwnProperty.call(m, "nack_sent")) {
  throw new Error("telemetry summary payload missing required ack/nack counters");
}

process.stdout.write(JSON.stringify(snapshot));
NODE
)"

printf '%s\n' "$snapshot_json" >> "$SLO_SNAPSHOTS_FILE"

# Keep snapshot log bounded by retention minutes.
node - "$SLO_SNAPSHOTS_FILE" "$SLO_RETENTION_MINUTES" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const retentionMinutes = Number(process.argv[3] || 1440);
if (!fs.existsSync(file)) {
  process.exit(0);
}
const now = Date.now();
const maxAge = Math.max(60, retentionMinutes) * 60 * 1000;
const lines = fs.readFileSync(file, "utf8").split(/\n+/).filter(Boolean);
const kept = [];
for (const line of lines) {
  try {
    const item = JSON.parse(line);
    const ts = Date.parse(String(item.ts || ""));
    if (!Number.isFinite(ts)) {
      continue;
    }
    if (now - ts <= maxAge) {
      kept.push(JSON.stringify(item));
    }
  } catch {
    // ignore malformed lines
  }
}
fs.writeFileSync(file, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
NODE

delta_json="$(node - "$SLO_SNAPSHOTS_FILE" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\n+/).filter(Boolean) : [];
const snapshots = lines.map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean).map((item) => ({ ...item, epoch: Date.parse(String(item.ts || "")) })).filter((item) => Number.isFinite(item.epoch));

if (snapshots.length === 0) {
  process.stdout.write(JSON.stringify({ ok: false, error: "no snapshots" }));
  process.exit(0);
}

snapshots.sort((a, b) => a.epoch - b.epoch);
const current = snapshots[snapshots.length - 1];

function pickBaseline(windowMinutes) {
  const targetEpoch = current.epoch - windowMinutes * 60 * 1000;
  let candidate = snapshots[0];
  for (const item of snapshots) {
    if (item.epoch <= targetEpoch) {
      candidate = item;
    } else {
      break;
    }
  }
  return candidate;
}

function deltas(base, cur) {
  const keys = new Set([...Object.keys(base.metrics || {}), ...Object.keys(cur.metrics || {})]);
  const out = {};
  for (const key of keys) {
    const value = Number(cur.metrics?.[key] || 0) - Number(base.metrics?.[key] || 0);
    out[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return out;
}

const base5 = pickBaseline(5);
const base30 = pickBaseline(30);

process.stdout.write(JSON.stringify({
  ok: true,
  currentTs: current.ts,
  windows: {
    m5: { baseTs: base5.ts, delta: deltas(base5, current) },
    m30: { baseTs: base30.ts, delta: deltas(base30, current) }
  }
}));
NODE
)"

analysis_json="$(node - "$delta_json" "$SLO_MIN_ACK_5M" "$SLO_MIN_ACK_30M" "$SLO_NACK_RATE_5M" "$SLO_NACK_RATE_30M" "$SLO_RECONNECT_SPIKE_30M" "$SLO_INITIAL_STATE_LAG_AVG_MS_30M" <<'NODE'
const payload = JSON.parse(process.argv[2] || "{}");
const minAck5 = Number(process.argv[3] || 20);
const minAck30 = Number(process.argv[4] || 80);
const nackRate5Limit = Number(process.argv[5] || 0.12);
const nackRate30Limit = Number(process.argv[6] || 0.08);
const reconnectSpike30Limit = Number(process.argv[7] || 60);
const lagAvg30Limit = Number(process.argv[8] || 15000);

if (!payload.ok) {
  process.stdout.write(JSON.stringify({ ok: false, status: "unknown", alerts: ["insufficient snapshots"] }));
  process.exit(0);
}

const m5 = payload.windows?.m5?.delta || {};
const m30 = payload.windows?.m30?.delta || {};

const ack5 = Number(m5.ack_sent || 0);
const nack5 = Number(m5.nack_sent || 0);
const ack30 = Number(m30.ack_sent || 0);
const nack30 = Number(m30.nack_sent || 0);

const nackRate5 = ack5 > 0 ? nack5 / ack5 : 0;
const nackRate30 = ack30 > 0 ? nack30 / ack30 : 0;
const reconnect30 = Number(m30.call_reconnect_joined || 0);
const lagSamples30 = Number(m30.call_initial_state_lag_samples || 0);
const lagTotal30 = Number(m30.call_initial_state_lag_ms_total || 0);
const lagAvg30 = lagSamples30 > 0 ? lagTotal30 / lagSamples30 : 0;

const alerts = [];

if (ack5 >= minAck5 && nackRate5 > nackRate5Limit) {
  alerts.push(`nack_rate_5m=${nackRate5.toFixed(3)} > ${nackRate5Limit}`);
}
if (ack30 >= minAck30 && nackRate30 > nackRate30Limit) {
  alerts.push(`nack_rate_30m=${nackRate30.toFixed(3)} > ${nackRate30Limit}`);
}
if (reconnect30 > reconnectSpike30Limit) {
  alerts.push(`reconnect_spike_30m=${reconnect30} > ${reconnectSpike30Limit}`);
}
if (lagSamples30 >= 5 && lagAvg30 > lagAvg30Limit) {
  alerts.push(`initial_state_lag_avg_30m=${lagAvg30.toFixed(1)}ms > ${lagAvg30Limit}ms`);
}

process.stdout.write(JSON.stringify({
  ok: true,
  status: alerts.length === 0 ? "pass" : "alert",
  currentTs: payload.currentTs,
  windows: {
    m5: {
      baseTs: payload.windows.m5.baseTs,
      ack: ack5,
      nack: nack5,
      nackRate: nackRate5
    },
    m30: {
      baseTs: payload.windows.m30.baseTs,
      ack: ack30,
      nack: nack30,
      nackRate: nackRate30,
      reconnect: reconnect30,
      initialStateLagAvgMs: lagAvg30,
      initialStateLagSamples: lagSamples30
    }
  },
  alerts
}));
NODE
)"

node - "$analysis_json" "$SLO_REPORT_FILE" "$SLO_ENV_FILE" <<'NODE'
const fs = require("fs");
const analysis = JSON.parse(process.argv[2] || "{}");
const reportFile = process.argv[3];
const envFile = process.argv[4];

const status = String(analysis.status || "unknown").toUpperCase();
const alerts = Array.isArray(analysis.alerts) ? analysis.alerts : [];

const lines = [
  "# Rolling SLO Gate",
  "",
  `- Timestamp UTC: ${analysis.currentTs || "n/a"}`,
  `- Status: **${status}**`,
  "",
  "## 5m Window",
  `- Base snapshot: ${analysis.windows?.m5?.baseTs || "n/a"}`,
  `- ACK delta: ${analysis.windows?.m5?.ack ?? 0}`,
  `- NACK delta: ${analysis.windows?.m5?.nack ?? 0}`,
  `- NACK rate: ${Number(analysis.windows?.m5?.nackRate || 0).toFixed(3)}`,
  "",
  "## 30m Window",
  `- Base snapshot: ${analysis.windows?.m30?.baseTs || "n/a"}`,
  `- ACK delta: ${analysis.windows?.m30?.ack ?? 0}`,
  `- NACK delta: ${analysis.windows?.m30?.nack ?? 0}`,
  `- NACK rate: ${Number(analysis.windows?.m30?.nackRate || 0).toFixed(3)}`,
  `- Reconnect delta: ${analysis.windows?.m30?.reconnect ?? 0}`,
  `- Initial-state lag avg: ${Number(analysis.windows?.m30?.initialStateLagAvgMs || 0).toFixed(1)} ms (${analysis.windows?.m30?.initialStateLagSamples ?? 0} samples)`,
  "",
  "## Alerts",
  ...(alerts.length ? alerts.map((item) => `- ${item}`) : ["- none"]),
  ""
];

fs.writeFileSync(reportFile, `${lines.join("\n")}\n`, "utf8");

const env = [
  `SLO_ROLLING_STATUS=${String(analysis.status || "unknown")}`,
  `SLO_ROLLING_ALERT_COUNT=${alerts.length}`,
  `SLO_ROLLING_TS=${String(analysis.currentTs || "")}`,
  `SLO_ROLLING_5M_ACK=${Number(analysis.windows?.m5?.ack || 0)}`,
  `SLO_ROLLING_5M_NACK=${Number(analysis.windows?.m5?.nack || 0)}`,
  `SLO_ROLLING_30M_ACK=${Number(analysis.windows?.m30?.ack || 0)}`,
  `SLO_ROLLING_30M_NACK=${Number(analysis.windows?.m30?.nack || 0)}`,
  `SLO_ROLLING_30M_RECONNECT=${Number(analysis.windows?.m30?.reconnect || 0)}`,
  `SLO_ROLLING_30M_INITIAL_STATE_LAG_AVG_MS=${Number(analysis.windows?.m30?.initialStateLagAvgMs || 0)}`
];

fs.writeFileSync(envFile, `${env.join("\n")}\n`, "utf8");
NODE

status="$(node -e 'const v = JSON.parse(process.argv[1] || "{}"); process.stdout.write(String(v.status || "unknown"));' "$analysis_json")"

if [[ "$status" == "alert" ]]; then
  echo "[slo-rolling-gate] ALERT"
  cat "$SLO_REPORT_FILE"
  if [[ "$SLO_STRICT" == "1" ]]; then
    exit 2
  fi
  exit 0
fi

echo "[slo-rolling-gate] PASS"
cat "$SLO_REPORT_FILE"
