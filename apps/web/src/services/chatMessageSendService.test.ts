import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChatMessage } from "./chatMessageSendService";

const {
  chatUploadInitMock,
  uploadChatObjectMock,
  chatUploadFinalizeMock,
  replyMessageMock,
  createTopicMessageMock,
  runChatEditMock
} = vi.hoisted(() => ({
  chatUploadInitMock: vi.fn(),
  uploadChatObjectMock: vi.fn(),
  chatUploadFinalizeMock: vi.fn(),
  replyMessageMock: vi.fn(),
  createTopicMessageMock: vi.fn(),
  runChatEditMock: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    chatUploadInit: chatUploadInitMock,
    uploadChatObject: uploadChatObjectMock,
    chatUploadFinalize: chatUploadFinalizeMock,
    replyMessage: replyMessageMock,
    createTopicMessage: createTopicMessageMock
  }
}));

vi.mock("./chatTransportCommands", () => ({
  runChatEdit: runChatEditMock
}));

function createBaseParams() {
  return {
    authToken: "token",
    chatRoomSlug: "general",
    activeTopicId: "topic-1",
    replyingToMessageId: null,
    chatText: "hello",
    mentionUserIds: [],
    editingMessageId: null,
    pendingChatImageDataUrl: null,
    pendingChatAttachmentFile: null,
    user: null,
    maxChatRetries: 1,
    maxDataUrlLength: 20,
    chatController: {
      sendMessage: vi.fn(() => ({ sent: true }))
    },
    sendWsEvent: vi.fn(() => null),
    sendWsEventAwaitAck: vi.fn(async () => undefined)
  };
}

describe("chatMessageSendService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns attachment-unsupported-type for ws-style UnsupportedMimeType error", async () => {
    const params = createBaseParams();
    params.pendingChatAttachmentFile = { type: "application/x-msdownload", size: 120 } as File;
    chatUploadInitMock.mockRejectedValue(new Error("chat.upload:UnsupportedMimeType:blocked"));

    const result = await sendChatMessage(params);

    expect(result).toEqual({ kind: "attachment-unsupported-type" });
  });

  it("returns attachment-too-large for explicit AttachmentTooLarge code", async () => {
    const params = createBaseParams();
    params.pendingChatAttachmentFile = { type: "image/png", size: 5_000_000 } as File;
    chatUploadInitMock.mockRejectedValue(
      Object.assign(new Error("too large"), { code: "AttachmentTooLarge" })
    );

    const result = await sendChatMessage(params);

    expect(result).toEqual({ kind: "attachment-too-large" });
  });

  it("returns server-error for unknown upload failure", async () => {
    const params = createBaseParams();
    params.pendingChatAttachmentFile = { type: "image/png", size: 200 } as File;
    chatUploadInitMock.mockRejectedValue(new Error("network failure"));

    const result = await sendChatMessage(params);

    expect(result).toEqual({ kind: "server-error" });
  });

  it("returns too-large for oversize inline data url before upload", async () => {
    const params = createBaseParams();
    params.chatText = "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    params.maxDataUrlLength = 12;

    const result = await sendChatMessage(params);

    expect(result).toEqual({ kind: "too-large" });
    expect(chatUploadInitMock).not.toHaveBeenCalled();
  });
});