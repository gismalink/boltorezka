import test from "node:test";
import assert from "node:assert/strict";
import { consumeWsTicketAndInitializeConnection } from "./realtime-ws-auth.js";

type MockSocket = {
  OPEN: number;
  readyState: number;
  sent: string[];
  closeCalls: Array<{ code: number; reason: string }>;
  send: (payload: string) => void;
  close: (code: number, reason: string) => void;
};

function createMockSocket(): MockSocket {
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    closeCalls: [],
    send(payload: string) {
      this.sent.push(payload);
    },
    close(code: number, reason: string) {
      this.closeCalls.push({ code, reason });
    }
  };
}

const noop = () => {};

test("realtime ws auth boundary: missing ticket closes connection with auth error", async () => {
  const connection = createMockSocket();
  const initialized = await consumeWsTicketAndInitializeConnection({
    connection: connection as any,
    request: { url: "/v1/realtime/ws" } as any,
    socketState: new WeakMap(),
    attachUserSocket: noop,
    registerRealtimeSocket: noop,
    getAllRoomsPresence: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisHSet: async () => 0,
    redisExpire: async () => true
  });

  assert.equal(initialized, false);
  assert.equal(connection.closeCalls.length, 1);
  assert.equal(connection.closeCalls[0].code, 4001);

  const payload = JSON.parse(connection.sent[0]);
  assert.equal(payload.type, "error");
  assert.equal(payload.payload.code, "MissingTicket");
});

test("realtime ws auth boundary: invalid ticket closes connection", async () => {
  const connection = createMockSocket();
  const initialized = await consumeWsTicketAndInitializeConnection({
    connection: connection as any,
    request: { url: "/v1/realtime/ws?ticket=abc" } as any,
    socketState: new WeakMap(),
    attachUserSocket: noop,
    registerRealtimeSocket: noop,
    getAllRoomsPresence: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisHSet: async () => 0,
    redisExpire: async () => true
  });

  assert.equal(initialized, false);
  assert.equal(connection.closeCalls.length, 1);
  assert.equal(connection.closeCalls[0].code, 4002);

  const payload = JSON.parse(connection.sent[0]);
  assert.equal(payload.type, "error");
  assert.equal(payload.payload.code, "InvalidTicket");
});
