import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { AppConfig } from "../config.types.ts";
import { normalizeOptionalString } from "../validators.js";

export class ChatObjectStorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatObjectStorageNotFoundError";
  }
}

export type ChatObjectStat = {
  sizeBytes: number;
  mimeType: string | null;
};

export type ChatObjectContent = {
  buffer: Buffer;
  mimeType: string | null;
};

export type ChatObjectListItem = {
  storageKey: string;
  lastModifiedAt: string | null;
};

export interface ChatObjectStorage {
  putObject(storageKey: string, body: Buffer, mimeType: string): Promise<void>;
  statObject(storageKey: string): Promise<ChatObjectStat>;
  getObject(storageKey: string): Promise<ChatObjectContent>;
  deleteObject(storageKey: string): Promise<void>;
  listObjectsByPrefix(prefix: string, maxKeys: number): Promise<ChatObjectListItem[]>;
}

function normalizeStorageKey(storageKey: string): string {
  return String(storageKey || "").replace(/^\/+/, "").replace(/\.\./g, "");
}

function localObjectPath(storageKey: string): string {
  const normalizedKey = normalizeStorageKey(storageKey);
  return path.resolve(process.cwd(), "public", "uploads", normalizedKey);
}

class LocalFsChatObjectStorage implements ChatObjectStorage {
  private readonly uploadsRoot: string;

  constructor() {
    this.uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  }

  async putObject(storageKey: string, body: Buffer): Promise<void> {
    const absolutePath = localObjectPath(storageKey);
    if (!absolutePath.startsWith(this.uploadsRoot)) {
      throw new Error("local_storage_path_invalid");
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body);
  }

  async statObject(storageKey: string): Promise<ChatObjectStat> {
    const absolutePath = localObjectPath(storageKey);
    try {
      const objectStat = await stat(absolutePath);
      if (!objectStat.isFile()) {
        throw new ChatObjectStorageNotFoundError("Object is not a file");
      }

      return {
        sizeBytes: objectStat.size,
        mimeType: null
      };
    } catch (error) {
      if (error instanceof ChatObjectStorageNotFoundError) {
        throw error;
      }

      throw new ChatObjectStorageNotFoundError("Object is missing");
    }
  }

  async getObject(storageKey: string): Promise<ChatObjectContent> {
    const absolutePath = localObjectPath(storageKey);
    try {
      const objectStat = await stat(absolutePath);
      if (!objectStat.isFile()) {
        throw new ChatObjectStorageNotFoundError("Object is not a file");
      }

      const buffer = await readFile(absolutePath);
      return {
        buffer,
        mimeType: null
      };
    } catch (error) {
      if (error instanceof ChatObjectStorageNotFoundError) {
        throw error;
      }

      throw new ChatObjectStorageNotFoundError("Object is missing");
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    const absolutePath = localObjectPath(storageKey);
    try {
      await unlink(absolutePath);
    } catch {
      // Delete is best-effort and idempotent.
    }
  }

  async listObjectsByPrefix(prefix: string, maxKeys: number): Promise<ChatObjectListItem[]> {
    const safeMaxKeys = Number.isFinite(maxKeys) ? Math.max(1, Math.min(Math.trunc(maxKeys), 10000)) : 1000;
    const normalizedPrefix = normalizeStorageKey(prefix);
    const result: ChatObjectListItem[] = [];

    const walk = async (relativeDir: string): Promise<void> => {
      if (result.length >= safeMaxKeys) {
        return;
      }

      const absoluteDir = path.resolve(this.uploadsRoot, relativeDir);
      let entries;
      try {
        entries = await readdir(absoluteDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (result.length >= safeMaxKeys) {
          return;
        }

        const nextRelativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await walk(nextRelativePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const storageKey = normalizeStorageKey(nextRelativePath);
        if (normalizedPrefix && !storageKey.startsWith(normalizedPrefix)) {
          continue;
        }

        let lastModifiedAt: string | null = null;
        try {
          const objectStat = await stat(path.resolve(this.uploadsRoot, nextRelativePath));
          lastModifiedAt = objectStat.mtime.toISOString();
        } catch {
          lastModifiedAt = null;
        }

        result.push({
          storageKey,
          lastModifiedAt
        });
      }
    };

    await walk("");
    return result;
  }
}

function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const name = String(maybeError.name || "");
  const status = Number(maybeError.$metadata?.httpStatusCode);

  return name === "NotFound" || status === 404;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  if (stream instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 body stream type");
}

class MinioChatObjectStorage implements ChatObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    this.bucket = config.chatMinioBucket;

    this.client = new S3Client({
      region: config.chatMinioRegion,
      endpoint: config.chatMinioEndpoint,
      forcePathStyle: config.chatMinioForcePathStyle,
      credentials: {
        accessKeyId: config.chatMinioAccessKey,
        secretAccessKey: config.chatMinioSecretKey
      }
    });
  }

  async putObject(storageKey: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: normalizeStorageKey(storageKey),
      Body: body,
      ContentType: mimeType,
      ContentLength: body.length
    }));
  }

  async statObject(storageKey: string): Promise<ChatObjectStat> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: normalizeStorageKey(storageKey)
      }));

      return {
        sizeBytes: Number(result.ContentLength || 0),
        mimeType: typeof result.ContentType === "string" ? result.ContentType : null
      };
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new ChatObjectStorageNotFoundError("Object is missing");
      }

      throw error;
    }
  }

  async getObject(storageKey: string): Promise<ChatObjectContent> {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalizeStorageKey(storageKey)
      }));

      const buffer = await streamToBuffer(result.Body);
      return {
        buffer,
        mimeType: typeof result.ContentType === "string" ? result.ContentType : null
      };
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new ChatObjectStorageNotFoundError("Object is missing");
      }

      throw error;
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: normalizeStorageKey(storageKey)
    }));
  }

  async listObjectsByPrefix(prefix: string, maxKeys: number): Promise<ChatObjectListItem[]> {
    const normalizedPrefix = normalizeStorageKey(prefix);
    const safeMaxKeys = Number.isFinite(maxKeys) ? Math.max(1, Math.min(Math.trunc(maxKeys), 10000)) : 1000;
    const items: ChatObjectListItem[] = [];
    let continuationToken: string | undefined;

    while (items.length < safeMaxKeys) {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: normalizedPrefix || undefined,
        MaxKeys: Math.min(1000, safeMaxKeys - items.length),
        ContinuationToken: continuationToken
      }));

      const objects = Array.isArray(page.Contents) ? page.Contents : [];
      for (const object of objects) {
        const storageKey = normalizeOptionalString(object.Key) || "";
        if (!storageKey) {
          continue;
        }

        items.push({
          storageKey,
          lastModifiedAt: object.LastModified instanceof Date ? object.LastModified.toISOString() : null
        });
      }

      if (!page.IsTruncated || !page.NextContinuationToken) {
        break;
      }

      continuationToken = page.NextContinuationToken;
    }

    return items;
  }
}

function ensureMinioConfig(config: AppConfig): void {
  if (!config.chatMinioEndpoint) {
    throw new Error("CHAT_MINIO_ENDPOINT is required for minio storage provider");
  }
  if (!config.chatMinioAccessKey) {
    throw new Error("CHAT_MINIO_ACCESS_KEY is required for minio storage provider");
  }
  if (!config.chatMinioSecretKey) {
    throw new Error("CHAT_MINIO_SECRET_KEY is required for minio storage provider");
  }
  if (!config.chatMinioBucket) {
    throw new Error("CHAT_MINIO_BUCKET is required for minio storage provider");
  }
}

export function createChatObjectStorage(config: AppConfig): ChatObjectStorage {
  if (config.chatStorageProvider === "minio") {
    ensureMinioConfig(config);
    return new MinioChatObjectStorage(config);
  }

  return new LocalFsChatObjectStorage();
}
