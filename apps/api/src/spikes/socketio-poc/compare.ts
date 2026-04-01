import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type ScenarioSummary = {
  baseUrl?: string;
  roomSlug?: string;
  transport: string;
  pingAckMs: number;
  roomJoinAckMs: {
    peerA: number;
    peerB: number;
  };
  chat: {
    sendAckMs: number;
    receiveMsOnPeerB: number;
    messageId: string | null;
  };
};

type DeltaMetrics = {
  pingAck: number;
  roomJoinAckPeerA: number;
  roomJoinAckPeerB: number;
  chatSendAck: number;
  chatReceivePeerB: number;
};

type ComparisonSample = {
  socketio: ScenarioSummary;
  nativeWs: ScenarioSummary;
  deltaMs: DeltaMetrics;
};

type NumericMetric = keyof DeltaMetrics;

type AggregatedMetric = {
  avg: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
};

type MultiRunSummary = {
  runs: number;
  metrics: Record<NumericMetric, AggregatedMetric>;
};

const currentFile = fileURLToPath(import.meta.url);
const pocDir = dirname(currentFile);
const apiDir = resolve(pocDir, "../../..");

function runScript(scriptName: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("npm", ["run", scriptName], {
      cwd: apiDir,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`${scriptName} failed (code=${code})\n${stderr || stdout}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function startServer(scriptName: string, env: Record<string, string>, readyMarker: string): Promise<ChildProcess> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("npm", ["run", scriptName], {
      cwd: apiDir,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let rejected = false;

    const fail = (message: string) => {
      if (rejected) {
        return;
      }
      rejected = true;
      child.kill("SIGTERM");
      rejectPromise(new Error(message));
    };

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (text.toLowerCase().includes("error")) {
        fail(`${scriptName} stderr: ${text}`);
      }
    });

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes(readyMarker)) {
        resolvePromise(child);
      }
    });

    child.on("close", (code) => {
      if (!rejected && code !== null && code !== 0) {
        fail(`${scriptName} exited early with code=${code}`);
      }
    });
  });
}

function parseLastJsonObject(output: string): ScenarioSummary {
  const end = output.lastIndexOf("}");
  if (end < 0) {
    throw new Error(`cannot parse summary json from output:\n${output}`);
  }

  let depth = 0;
  let start = -1;

  for (let index = end; index >= 0; index -= 1) {
    const char = output[index];
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char === "{") {
      depth -= 1;
      if (depth === 0) {
        start = index;
        break;
      }
    }
  }

  if (start < 0) {
    throw new Error(`cannot locate summary json boundaries in output:\n${output}`);
  }

  const text = output.slice(start, end + 1);
  return JSON.parse(text) as ScenarioSummary;
}

function toFixed(value: number): number {
  return Number(value.toFixed(2));
}

function toDelta(socketioSummary: ScenarioSummary, nativeWsSummary: ScenarioSummary): DeltaMetrics {
  return {
    pingAck: toFixed(socketioSummary.pingAckMs - nativeWsSummary.pingAckMs),
    roomJoinAckPeerA: toFixed(socketioSummary.roomJoinAckMs.peerA - nativeWsSummary.roomJoinAckMs.peerA),
    roomJoinAckPeerB: toFixed(socketioSummary.roomJoinAckMs.peerB - nativeWsSummary.roomJoinAckMs.peerB),
    chatSendAck: toFixed(socketioSummary.chat.sendAckMs - nativeWsSummary.chat.sendAckMs),
    chatReceivePeerB: toFixed(socketioSummary.chat.receiveMsOnPeerB - nativeWsSummary.chat.receiveMsOnPeerB)
  };
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(p * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function summarizeMetric(values: number[]): AggregatedMetric {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    avg: toFixed(sum / sorted.length),
    p50: toFixed(percentile(sorted, 0.5)),
    p95: toFixed(percentile(sorted, 0.95)),
    min: toFixed(sorted[0] ?? 0),
    max: toFixed(sorted[sorted.length - 1] ?? 0)
  };
}

function aggregateSamples(samples: ComparisonSample[]): MultiRunSummary {
  const metricKeys: NumericMetric[] = [
    "pingAck",
    "roomJoinAckPeerA",
    "roomJoinAckPeerB",
    "chatSendAck",
    "chatReceivePeerB"
  ];

  const metrics = Object.fromEntries(
    metricKeys.map((key) => [
      key,
      summarizeMetric(samples.map((sample) => sample.deltaMs[key]))
    ])
  ) as Record<NumericMetric, AggregatedMetric>;

  return {
    runs: samples.length,
    metrics
  };
}

async function runScenario(
  serverScript: string,
  serverEnv: Record<string, string>,
  serverReadyMarker: string,
  clientScript: string,
  clientEnv: Record<string, string>
): Promise<ScenarioSummary> {
  const server = await startServer(serverScript, serverEnv, serverReadyMarker);
  await delay(200);

  try {
    const output = await runScript(clientScript, clientEnv);
    return parseLastJsonObject(output);
  } finally {
    server.kill("SIGTERM");
  }
}

async function main() {
  const runs = Number.parseInt(String(process.env.SPIKE_COMPARE_RUNS || "1"), 10);
  const normalizedRuns = Number.isFinite(runs) && runs > 0 ? runs : 1;
  const samples: ComparisonSample[] = [];

  for (let index = 0; index < normalizedRuns; index += 1) {
    const socketioSummary = await runScenario(
      "spike:socketio:server",
      { SOCKETIO_POC_PORT: "3199" },
      "[socketio-poc] listening on :3199",
      "spike:socketio:client",
      { SOCKETIO_POC_URL: "http://127.0.0.1:3199" }
    );

    const nativeWsSummary = await runScenario(
      "spike:ws:server",
      { NATIVE_WS_POC_PORT: "3200" },
      "[native-ws-poc] listening on :3200",
      "spike:ws:client",
      { NATIVE_WS_POC_URL: "ws://127.0.0.1:3200/ws" }
    );

    samples.push({
      socketio: socketioSummary,
      nativeWs: nativeWsSummary,
      deltaMs: toDelta(socketioSummary, nativeWsSummary)
    });
  }

  const comparison = normalizedRuns === 1
    ? samples[0]
    : {
        runs: normalizedRuns,
        last: samples[samples.length - 1],
        aggregateDeltaMs: aggregateSamples(samples)
      };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(comparison, null, 2));
}

void main();
