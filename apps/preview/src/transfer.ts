import { parseDeckSession, type DeckSession } from "presentation-workflow";

import {
  completeAssetTransfers,
  completeSessionTransfer,
  discardTransfer,
  loadTransfers,
  loadTransferChunkBatches,
  saveTransferChunks,
  type StoredTransfer,
  TransferChunkConflictError,
} from "./storage.js";

export const PPTKIT_TRANSFER_PROTOCOL = "pptkit-transfer" as const;
export const MAX_TRANSFER_CHUNK_BYTES = 512 * 1024;
export const MAX_TRANSFER_BATCH_CHUNKS = 8;
const STORAGE_RESERVE_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/i;

export interface TransferEnvelope {
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

export interface TransferBatchSubmission {
  protocol: typeof PPTKIT_TRANSFER_PROTOCOL;
  mode: "batch";
  chunks: TransferEnvelope[];
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
  session?: DeckSession;
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

function parseEnvelopeInput(input: unknown): TransferEnvelope {
  if (!input || typeof input !== "object") throw new Error("Transfer envelope must be an object.");
  const candidate = input as Partial<TransferEnvelope>;
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
  return { ...candidate, byteLength, chunkIndex, chunkCount, chunkByteLength } as TransferEnvelope;
}

function parseSubmission(value: string): TransferEnvelope[] {
  let input: unknown;
  try { input = JSON.parse(value); }
  catch { throw new Error("Transfer submission must be valid JSON."); }
  if (input && typeof input === "object" && "mode" in input && (input as { mode?: unknown }).mode === "batch") {
    const batch = input as Partial<TransferBatchSubmission>;
    if (batch.protocol !== PPTKIT_TRANSFER_PROTOCOL) throw new Error(`Unsupported transfer protocol: ${String(batch.protocol)}.`);
    if (!Array.isArray(batch.chunks) || batch.chunks.length === 0) throw new Error("Transfer batch requires at least one chunk.");
    if (batch.chunks.length > MAX_TRANSFER_BATCH_CHUNKS) throw new Error(`Transfer batches must not exceed ${MAX_TRANSFER_BATCH_CHUNKS} chunks.`);
    return batch.chunks.map(parseEnvelopeInput);
  }
  return [parseEnvelopeInput(input)];
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try { binary = atob(value); }
  catch { throw new Error("Transfer chunk contains invalid Base64 data."); }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(bytes: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function metadataMatches(stored: StoredTransfer, envelope: TransferEnvelope) {
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

function createStoredTransfer(envelope: TransferEnvelope): StoredTransfer {
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

export async function receiveTransferChunk(serialized: string, activeSession?: DeckSession): Promise<TransferResult> {
  const results = await receiveTransferBatch(serialized, activeSession);
  return results[0]!;
}

export async function receiveTransferBatch(serialized: string, activeSession?: DeckSession): Promise<TransferResult[]> {
  const envelopes = parseSubmission(serialized);
  let pending: Array<{ envelope: TransferEnvelope; transfer: StoredTransfer; bytes: Uint8Array<ArrayBuffer> }> = [];
  let failedTransfer: StoredTransfer | undefined;
  let discardFailedTransfer = false;
  try {
    const storedTransfers = await loadTransfers(envelopes.map((envelope) => envelope.transferId));
    const storedTransferIds = new Set(storedTransfers.flatMap((transfer) => transfer ? [transfer.transferId] : []));
    const transferById = new Map(storedTransfers.filter((transfer): transfer is StoredTransfer => Boolean(transfer)).map((transfer) => [transfer.transferId, transfer]));
    const newTransferBytes = new Map<string, number>();
    const submittedChunkKeys = new Set<string>();

    for (const envelope of envelopes) {
      let transfer = transferById.get(envelope.transferId);
      if (transfer?.status === "failed") transfer = undefined;
      if (!transfer) {
        transfer = createStoredTransfer(envelope);
        transferById.set(envelope.transferId, transfer);
      } else if (!metadataMatches(transfer, envelope)) {
        failedTransfer = transfer;
        throw new Error("Transfer metadata conflicts with the stored transfer.");
      }
      failedTransfer = transfer;
      const bytes = decodeBase64(envelope.dataBase64);
      if (bytes.byteLength !== envelope.chunkByteLength) throw new Error(`Transfer chunk ${envelope.chunkIndex} has an unexpected byte length.`);
      const chunkKey = `${transfer.transferId}:${envelope.chunkIndex}`;
      if (submittedChunkKeys.has(chunkKey)) throw new Error(`Transfer batch repeats chunk ${envelope.chunkIndex}.`);
      submittedChunkKeys.add(chunkKey);
      if (!storedTransferIds.has(transfer.transferId)) newTransferBytes.set(transfer.transferId, transfer.byteLength);
      pending.push({ envelope, transfer, bytes });
    }
    const chunkHashes = await Promise.all(pending.map((item) => sha256(item.bytes)));
    const failedHashIndex = pending.findIndex((item, index) => chunkHashes[index] !== item.envelope.chunkSha256.toLowerCase());
    if (failedHashIndex >= 0) {
      const failedItem = pending[failedHashIndex]!;
      failedTransfer = failedItem.transfer;
      discardFailedTransfer = true;
      throw new Error(`Transfer chunk ${failedItem.envelope.chunkIndex} failed SHA-256 verification.`);
    }
    const transfersToSave = pending.map(({ envelope, transfer, bytes }) => {
      transfer.received = [...new Set([...transfer.received, envelope.chunkIndex])].sort((left, right) => left - right);
      return {
        transfer,
        index: envelope.chunkIndex,
        sha256: envelope.chunkSha256.toLowerCase(),
        blob: new Blob([bytes]),
      };
    });
    if (newTransferBytes.size > 0) await ensureStorageCapacity([...newTransferBytes.values()].reduce((sum, value) => sum + value, 0));

    await saveTransferChunks(transfersToSave);
    const uniqueTransfers = [...new Map(pending.map((item) => [item.transfer.transferId, item.transfer])).values()];
    const completedTransfers = uniqueTransfers.filter((transfer) => transfer.received.length === transfer.chunkCount);
    const chunkBatches = await loadTransferChunkBatches(completedTransfers.map((transfer) => transfer.transferId));
    const completedBlobs = completedTransfers.map((transfer, index) => {
      const chunks = chunkBatches[index] ?? [];
      failedTransfer = transfer;
      discardFailedTransfer = true;
      if (chunks.length !== transfer.chunkCount || chunks.some((chunk, chunkIndex) => chunk.index !== chunkIndex)) {
        throw new Error("Transfer completed with missing or unordered chunks.");
      }
      const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: transfer.mimeType });
      if (blob.size !== transfer.byteLength) throw new Error("Completed transfer has an unexpected byte length.");
      return blob;
    });
    const completedHashes = await Promise.all(completedBlobs.map(async (blob) => sha256(await blob.arrayBuffer())));
    const failedPayloadIndex = completedTransfers.findIndex((transfer, index) => completedHashes[index] !== transfer.sha256);
    if (failedPayloadIndex >= 0) {
      failedTransfer = completedTransfers[failedPayloadIndex];
      discardFailedTransfer = true;
      throw new Error("Completed transfer failed SHA-256 verification.");
    }
    const completedBlobById = new Map(completedTransfers.map((transfer, index) => [transfer.transferId, completedBlobs[index]!]));

    let currentSession = activeSession;
    const results: TransferResult[] = [];
    const pendingAssetCompletions: Array<{
      transferId: string;
      sessionId: string;
      assetId: string;
      mimeType: string;
      sha256: string;
      blob: Blob;
      chunkCount: number;
    }> = [];
    for (const transfer of uniqueTransfers) {
      failedTransfer = transfer;
      if (transfer.received.length < transfer.chunkCount) {
        results.push(progress(transfer));
        continue;
      }

      discardFailedTransfer = true;
      const blob = completedBlobById.get(transfer.transferId)!;

      if (transfer.kind === "session") {
        let nextSession: DeckSession;
        try { nextSession = parseDeckSession(await blob.text()); }
        catch (error) { throw new SessionValidationError(error instanceof Error ? error.message : String(error)); }
        if (nextSession.id !== transfer.payloadId) throw new Error("Session payload id does not match the transferred session.");
        await completeSessionTransfer(transfer.transferId, nextSession, transfer.chunkCount);
        currentSession = nextSession;
        results.push({ ...progress(transfer, "completed"), session: nextSession });
      } else {
        if (!currentSession || transfer.sessionId !== currentSession.id) throw new Error("Import the matching session before transferring assets.");
        const asset = currentSession.assets.find((candidate) => candidate.id === transfer.payloadId);
        if (!asset) throw new Error(`Session does not declare asset ${transfer.payloadId}.`);
        if (asset.mimeType !== transfer.mimeType || asset.byteLength !== transfer.byteLength || asset.sha256.toLowerCase() !== transfer.sha256) {
          throw new Error(`Transferred asset ${transfer.payloadId} does not match the session manifest.`);
        }
        pendingAssetCompletions.push({
          transferId: transfer.transferId,
          sessionId: currentSession.id,
          assetId: asset.id,
          mimeType: asset.mimeType,
          sha256: asset.sha256.toLowerCase(),
          blob,
          chunkCount: transfer.chunkCount,
        });
        results.push({ ...progress(transfer, "completed"), completedAssetId: asset.id });
      }
    }
    await completeAssetTransfers(pendingAssetCompletions);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof TransferChunkConflictError) {
      failedTransfer = pending.find((item) => item.transfer.transferId === error.transferId)?.transfer ?? failedTransfer;
      discardFailedTransfer = true;
    }
    if (discardFailedTransfer && failedTransfer) await discardTransfer(failedTransfer.transferId).catch(() => undefined);
    if (error instanceof SessionValidationError) throw error;
    const failed = failedTransfer ? { ...failedTransfer, received: [], status: "failed" as const, error: message } : undefined;
    throw new TransferReceiveError(message, failed ? progress(failed, "failed") : {
      transferId: "",
      kind: "session",
      payloadId: "",
      received: [],
      missing: [],
      chunkCount: 0,
      status: "failed",
      error: message,
    });
  }
}

export class SessionValidationError extends Error {
  constructor(message: string) {
    super(`Session validation failed: ${message}`);
    this.name = "SessionValidationError";
  }
}
