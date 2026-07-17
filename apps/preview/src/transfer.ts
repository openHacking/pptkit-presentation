import { parseDeckSession, type DeckSessionV2 } from "presentation-workflow";

import {
  completeAssetTransfer,
  completeSessionTransfer,
  discardTransfer,
  loadTransfer,
  loadTransferChunks,
  saveTransferChunk,
  type StoredTransfer,
} from "./storage.js";

export const PPTKIT_TRANSFER_PROTOCOL = "pptkit-transfer-v1" as const;
export const MAX_TRANSFER_CHUNK_BYTES = 512 * 1024;
const STORAGE_RESERVE_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/i;

export interface PptkitTransferV1 {
  protocol: typeof PPTKIT_TRANSFER_PROTOCOL;
  transferId: string;
  kind: "session" | "asset";
  payloadId: string;
  sessionId?: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  chunkIndex: number;
  chunkCount: number;
  chunkByteLength: number;
  chunkSha256: string;
  dataBase64: string;
}

export interface TransferProgress {
  transferId: string;
  kind: "session" | "asset";
  payloadId: string;
  received: number[];
  missing: number[];
  chunkCount: number;
  status: "receiving" | "completed" | "failed";
  error?: string;
}

export type TransferResult = TransferProgress & {
  session?: DeckSessionV2;
  completedAssetId?: string;
};

export class TransferReceiveError extends Error {
  constructor(message: string, readonly progress: TransferProgress) {
    super(message);
    this.name = "TransferReceiveError";
  }
}

function integer(value: unknown, name: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  return Number(value);
}

function parseEnvelope(value: string): PptkitTransferV1 {
  const input: unknown = JSON.parse(value);
  if (!input || typeof input !== "object") throw new Error("Transfer envelope must be an object.");
  const candidate = input as Partial<PptkitTransferV1>;
  if (candidate.protocol !== PPTKIT_TRANSFER_PROTOCOL) throw new Error(`Unsupported transfer protocol: ${String(candidate.protocol)}.`);
  if (!candidate.transferId || !candidate.payloadId) throw new Error("Transfer envelope requires transferId and payloadId.");
  if (candidate.kind !== "session" && candidate.kind !== "asset") throw new Error(`Unsupported transfer kind: ${String(candidate.kind)}.`);
  if (candidate.kind === "asset" && !candidate.sessionId) throw new Error("Asset transfers require sessionId.");
  if (!candidate.mimeType) throw new Error("Transfer envelope requires mimeType.");
  const byteLength = integer(candidate.byteLength, "byteLength", 1);
  const chunkIndex = integer(candidate.chunkIndex, "chunkIndex");
  const chunkCount = integer(candidate.chunkCount, "chunkCount", 1);
  const chunkByteLength = integer(candidate.chunkByteLength, "chunkByteLength", 1);
  if (chunkIndex >= chunkCount) throw new Error("chunkIndex must be smaller than chunkCount.");
  if (chunkCount < Math.ceil(byteLength / MAX_TRANSFER_CHUNK_BYTES) || chunkCount > byteLength) throw new Error("chunkCount is inconsistent with the declared payload size.");
  if (chunkByteLength > MAX_TRANSFER_CHUNK_BYTES) throw new Error(`Transfer chunks must not exceed ${MAX_TRANSFER_CHUNK_BYTES} bytes.`);
  if (!SHA256.test(candidate.sha256 ?? "") || !SHA256.test(candidate.chunkSha256 ?? "")) throw new Error("Transfer envelope requires valid SHA-256 digests.");
  if (typeof candidate.dataBase64 !== "string" || candidate.dataBase64.length === 0) throw new Error("Transfer envelope requires Base64 chunk data.");
  if (candidate.kind === "session" && candidate.mimeType !== "application/json") throw new Error("Session transfers require application/json.");
  return { ...candidate, byteLength, chunkIndex, chunkCount, chunkByteLength } as PptkitTransferV1;
}

function decodeBase64(value: string) {
  let binary: string;
  try { binary = atob(value); }
  catch { throw new Error("Transfer chunk contains invalid Base64 data."); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(bytes: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function metadataMatches(stored: StoredTransfer, envelope: PptkitTransferV1) {
  return stored.kind === envelope.kind
    && stored.payloadId === envelope.payloadId
    && stored.sessionId === envelope.sessionId
    && stored.mimeType === envelope.mimeType
    && stored.byteLength === envelope.byteLength
    && stored.sha256.toLowerCase() === envelope.sha256.toLowerCase()
    && stored.chunkCount === envelope.chunkCount;
}

function progress(transfer: StoredTransfer, status: TransferProgress["status"] = transfer.status) {
  const received = [...transfer.received].sort((left, right) => left - right);
  const receivedSet = new Set(received);
  const missing = Array.from({ length: transfer.chunkCount }, (_, index) => index).filter((index) => !receivedSet.has(index));
  return {
    transferId: transfer.transferId,
    kind: transfer.kind,
    payloadId: transfer.payloadId,
    received,
    missing,
    chunkCount: transfer.chunkCount,
    status,
    ...(transfer.error ? { error: transfer.error } : {}),
  } satisfies TransferProgress;
}

async function ensureStorageCapacity(byteLength: number) {
  if (!navigator.storage?.estimate) throw new Error("Browser storage estimation is unavailable.");
  const estimate = await navigator.storage.estimate();
  if (estimate.quota === undefined || estimate.usage === undefined) throw new Error("Browser storage quota could not be determined.");
  const required = byteLength * 2 + STORAGE_RESERVE_BYTES;
  if (estimate.quota - estimate.usage < required) throw new Error(`Insufficient browser storage: ${required} bytes of free quota are required.`);
}

function createStoredTransfer(envelope: PptkitTransferV1): StoredTransfer {
  return {
    transferId: envelope.transferId,
    kind: envelope.kind,
    payloadId: envelope.payloadId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    mimeType: envelope.mimeType,
    byteLength: envelope.byteLength,
    sha256: envelope.sha256.toLowerCase(),
    chunkCount: envelope.chunkCount,
    received: [],
    status: "receiving",
    lastActivityAt: new Date().toISOString(),
  };
}

export async function receiveTransferChunk(serialized: string, activeSession?: DeckSessionV2): Promise<TransferResult> {
  const envelope = parseEnvelope(serialized);
  let transfer = await loadTransfer(envelope.transferId);
  if (transfer?.status === "failed") {
    await discardTransfer(transfer.transferId);
    transfer = undefined;
  }
  if (!transfer) {
    await ensureStorageCapacity(envelope.byteLength);
    transfer = createStoredTransfer(envelope);
  } else {
    if (!metadataMatches(transfer, envelope)) throw new Error("Transfer metadata conflicts with the stored transfer.");
  }

  try {
    const bytes = decodeBase64(envelope.dataBase64);
    if (bytes.byteLength !== envelope.chunkByteLength) throw new Error(`Transfer chunk ${envelope.chunkIndex} has an unexpected byte length.`);
    if (await sha256(bytes) !== envelope.chunkSha256.toLowerCase()) throw new Error(`Transfer chunk ${envelope.chunkIndex} failed SHA-256 verification.`);
    transfer.received = [...new Set([...transfer.received, envelope.chunkIndex])].sort((left, right) => left - right);
    await saveTransferChunk(transfer, envelope.chunkIndex, envelope.chunkSha256.toLowerCase(), new Blob([bytes]));
    if (transfer.received.length < transfer.chunkCount) return progress(transfer);

    const chunks = await loadTransferChunks(transfer.transferId);
    if (chunks.length !== transfer.chunkCount || chunks.some((chunk, index) => chunk.index !== index)) throw new Error("Transfer completed with missing or unordered chunks.");
    const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: transfer.mimeType });
    if (blob.size !== transfer.byteLength) throw new Error("Completed transfer has an unexpected byte length.");
    if (await sha256(await blob.arrayBuffer()) !== transfer.sha256) throw new Error("Completed transfer failed SHA-256 verification.");

    if (transfer.kind === "session") {
      const nextSession = parseDeckSession(await blob.text());
      if (nextSession.id !== transfer.payloadId) throw new Error("Session payload id does not match the transferred session.");
      await completeSessionTransfer(transfer.transferId, nextSession);
      return { ...progress(transfer, "completed"), session: nextSession };
    }

    if (!activeSession || transfer.sessionId !== activeSession.id) throw new Error("Import the matching session before transferring assets.");
    const asset = activeSession.assets.find((candidate) => candidate.id === transfer.payloadId);
    if (!asset) throw new Error(`Session does not declare asset ${transfer.payloadId}.`);
    if (asset.mimeType !== transfer.mimeType || asset.byteLength !== transfer.byteLength || asset.sha256.toLowerCase() !== transfer.sha256) {
      throw new Error(`Transferred asset ${transfer.payloadId} does not match the session manifest.`);
    }
    await completeAssetTransfer(transfer.transferId, activeSession.id, asset.id, asset.mimeType, asset.sha256.toLowerCase(), blob);
    return { ...progress(transfer, "completed"), completedAssetId: asset.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await discardTransfer(transfer.transferId).catch(() => undefined);
    const failed = { ...transfer, received: [], status: "failed" as const, error: message };
    throw new TransferReceiveError(message, progress(failed, "failed"));
  }
}
