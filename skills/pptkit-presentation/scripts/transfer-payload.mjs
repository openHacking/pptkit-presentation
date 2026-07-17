import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export const PPTKIT_TRANSFER_PROTOCOL = "pptkit-transfer-v1";
export const DEFAULT_CHUNK_BYTES = 512 * 1024;

async function fileSha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function transferIdFor(kind, payloadId, sessionId, sha256) {
  return createHash("sha256").update([kind, payloadId, sessionId ?? "", sha256].join("\0")).digest("hex");
}

export async function preparePptkitTransfer({
  file,
  kind,
  payloadId,
  mimeType,
  sessionId,
  chunkBytes = DEFAULT_CHUNK_BYTES,
}) {
  if (kind !== "session" && kind !== "asset") throw new Error(`Unsupported transfer kind: ${kind}`);
  if (kind === "session" && mimeType !== "application/json") throw new Error("Session transfers require application/json.");
  if (kind === "asset" && !sessionId) throw new Error("Asset transfers require sessionId.");
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes > DEFAULT_CHUNK_BYTES) throw new Error(`chunkBytes must be between 1 and ${DEFAULT_CHUNK_BYTES}.`);
  const info = await stat(file);
  if (!info.isFile() || info.size <= 0) throw new Error(`Transfer payload must be a non-empty file: ${file}`);
  const sha256 = await fileSha256(file);
  const chunkCount = Math.ceil(info.size / chunkBytes);
  const transferId = transferIdFor(kind, payloadId, sessionId, sha256);

  return Object.freeze({
    protocol: PPTKIT_TRANSFER_PROTOCOL,
    transferId,
    kind,
    payloadId,
    ...(sessionId ? { sessionId } : {}),
    mimeType,
    byteLength: info.size,
    sha256,
    chunkCount,
    chunkBytes,
    async envelope(chunkIndex) {
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= chunkCount) throw new Error(`Invalid chunk index: ${chunkIndex}`);
      const handle = await open(file, "r");
      try {
        const offset = chunkIndex * chunkBytes;
        const length = Math.min(chunkBytes, info.size - offset);
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const chunk = buffer.subarray(0, bytesRead);
        return JSON.stringify({
          protocol: PPTKIT_TRANSFER_PROTOCOL,
          transferId,
          kind,
          payloadId,
          ...(sessionId ? { sessionId } : {}),
          mimeType,
          byteLength: info.size,
          sha256,
          chunkIndex,
          chunkCount,
          chunkByteLength: chunk.byteLength,
          chunkSha256: createHash("sha256").update(chunk).digest("hex"),
          dataBase64: chunk.toString("base64"),
        });
      } finally {
        await handle.close();
      }
    },
  });
}
