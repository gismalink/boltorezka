export type CallStatus = "idle" | "ringing" | "connecting" | "active";
export type CallSignalEventType = "call.offer" | "call.answer" | "call.ice";

type WsSender = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

type CallSignalingControllerOptions = {
  sendWsEvent: WsSender;
  setCallStatus: (status: CallStatus) => void;
  setLastCallPeer: (peer: string) => void;
  pushCallLog: (text: string) => void;
};

export class CallSignalingController {
  private readonly options: CallSignalingControllerOptions;

  constructor(options: CallSignalingControllerOptions) {
    this.options = options;
  }

  sendSignal(eventType: CallSignalEventType, callSignalJson: string, callTargetUserId: string) {
    let signal: Record<string, unknown>;
    try {
      const parsed = JSON.parse(callSignalJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("signal must be a JSON object");
      }
      signal = parsed as Record<string, unknown>;
    } catch (error) {
      this.options.pushCallLog(`invalid signal json: ${(error as Error).message}`);
      return;
    }

    const payload: Record<string, unknown> = { signal };
    const targetUserId = callTargetUserId.trim();
    if (targetUserId) {
      payload.targetUserId = targetUserId;
    }

    const requestId = this.options.sendWsEvent(eventType, payload, { maxRetries: 1 });
    if (!requestId) {
      this.options.pushCallLog(`${eventType} skipped: socket unavailable`);
      return;
    }

    this.options.pushCallLog(`${eventType} sent${targetUserId ? ` -> ${targetUserId}` : " -> room"}`);
    this.options.setLastCallPeer(targetUserId || "room");
    if (eventType === "call.offer") {
      this.options.setCallStatus("connecting");
    }
    if (eventType === "call.answer") {
      this.options.setCallStatus("active");
    }
  }

  sendReject(callTargetUserId: string) {
    const targetUserId = callTargetUserId.trim();
    const payload: Record<string, unknown> = { reason: "busy" };
    if (targetUserId) {
      payload.targetUserId = targetUserId;
    }

    const requestId = this.options.sendWsEvent("call.reject", payload, { maxRetries: 1 });
    if (!requestId) {
      this.options.pushCallLog("call.reject skipped: socket unavailable");
      return;
    }

    this.options.setCallStatus("idle");
    this.options.setLastCallPeer(targetUserId || "room");
    this.options.pushCallLog(`call.reject sent${targetUserId ? ` -> ${targetUserId}` : " -> room"}`);
  }

  sendHangup(callTargetUserId: string) {
    const targetUserId = callTargetUserId.trim();
    const payload: Record<string, unknown> = { reason: "manual" };
    if (targetUserId) {
      payload.targetUserId = targetUserId;
    }

    const requestId = this.options.sendWsEvent("call.hangup", payload, { maxRetries: 1 });
    if (!requestId) {
      this.options.pushCallLog("call.hangup skipped: socket unavailable");
      return;
    }

    this.options.setCallStatus("idle");
    this.options.setLastCallPeer(targetUserId || "room");
    this.options.pushCallLog(`call.hangup sent${targetUserId ? ` -> ${targetUserId}` : " -> room"}`);
  }
}