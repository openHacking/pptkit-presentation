import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { validateDeckSession } from "./session-contract.mjs";

export const PPTKIT_TRANSFER_PROTOCOL = "pptkit-transfer";
export const DEFAULT_CHUNK_BYTES = 512 * 1024;
export const DEFAULT_BATCH_CHUNKS = 8;
const READY_PREVIEW_STATUSES = new Set(["ready", "ready-with-warnings"]);
const REQUIRED_BRIDGE_APIS = [
  "Blob",
  "URL",
  "crypto",
  "fetch",
  "indexedDB",
  "storageEstimate",
  "structuredClone",
  "Uint8Array",
];

async function fileSha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function transferIdFor(kind, payloadId, sessionId, sha256) {
  return createHash("sha256").update([kind, payloadId, sessionId ?? "", sha256].join("\0")).digest("hex");
}

export function createPptkitTransferBatch(envelopes) {
  if (!Array.isArray(envelopes) || envelopes.length === 0 || envelopes.length > DEFAULT_BATCH_CHUNKS) {
    throw new Error(`createPptkitTransferBatch requires between 1 and ${DEFAULT_BATCH_CHUNKS} envelopes.`);
  }
  const chunks = envelopes.map((value) => {
    const envelope = typeof value === "string" ? JSON.parse(value) : value;
    if (!envelope || typeof envelope !== "object" || envelope.protocol !== PPTKIT_TRANSFER_PROTOCOL || envelope.mode === "batch") {
      throw new Error("Transfer batches require pptkit-transfer chunk envelopes.");
    }
    return envelope;
  });
  const keys = new Set(chunks.map((chunk) => `${chunk.transferId}:${chunk.chunkIndex}`));
  if (keys.size !== chunks.length) throw new Error("Transfer batches cannot repeat a chunk.");
  return JSON.stringify({ protocol: PPTKIT_TRANSFER_PROTOCOL, mode: "batch", chunks });
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
  let sessionRevision;
  if (kind === "session") {
    let session;
    try { session = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { throw new Error(`Session file ${file} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`); }
    try { validateDeckSession(session); }
    catch (error) { throw new Error(`Session validation failed for ${file}: ${error instanceof Error ? error.message : String(error)}`); }
    if (session.id !== payloadId) throw new Error(`Session payloadId ${payloadId} does not match session.id ${String(session.id)}.`);
    sessionRevision = session.revision;
  }
  const sha256 = await fileSha256(file);
  const chunkCount = Math.ceil(info.size / chunkBytes);
  const transferId = transferIdFor(kind, payloadId, sessionId, sha256);

  const prepared = {
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
    ...(sessionRevision ? { sessionRevision } : {}),
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
    async batchEnvelope(chunkIndexes) {
      if (!Array.isArray(chunkIndexes) || chunkIndexes.length === 0 || chunkIndexes.length > DEFAULT_BATCH_CHUNKS) {
        throw new Error(`batchEnvelope requires between 1 and ${DEFAULT_BATCH_CHUNKS} chunk indexes.`);
      }
      const chunks = await Promise.all(chunkIndexes.map((chunkIndex) => prepared.envelope(chunkIndex)));
      return createPptkitTransferBatch(chunks);
    },
  };
  return Object.freeze(prepared);
}

function parseBridgeText(value) {
  let bridge;
  try { bridge = JSON.parse(value ?? ""); }
  catch { throw new Error("PPTKit preview bridge did not contain valid JSON."); }
  if (bridge?.protocol !== PPTKIT_TRANSFER_PROTOCOL) throw new Error(`Unsupported preview protocol: ${String(bridge?.protocol)}.`);
  if (!Number.isSafeInteger(bridge.maxChunkBytes) || bridge.maxChunkBytes <= 0) throw new Error("PPTKit preview bridge reported an invalid maxChunkBytes.");
  if (!Array.isArray(bridge.submissionModes) || !bridge.submissionModes.some((mode) => mode === "single" || mode === "batch")) {
    throw new Error("PPTKit preview bridge did not report a supported submission mode.");
  }
  if (bridge.submissionModes.includes("batch") && (!Number.isSafeInteger(bridge.maxBatchChunks) || bridge.maxBatchChunks <= 0)) {
    throw new Error("PPTKit preview bridge reported an invalid maxBatchChunks.");
  }
  const unavailableApis = REQUIRED_BRIDGE_APIS.filter((name) => bridge.apis?.[name] !== true);
  if (unavailableApis.length > 0) throw new Error(`PPTKit preview is missing required browser APIs: ${unavailableApis.join(", ")}.`);
  return bridge;
}

async function uniqueLocator(locator, label) {
  const count = await locator.count();
  if (count !== 1) throw new Error(`Expected exactly one ${label}, found ${count}.`);
  return locator;
}

async function readBridge(bridgeLocator) {
  return parseBridgeText(await bridgeLocator.textContent());
}

function assertTransferSucceeded(bridge, transferId) {
  const transfer = matchingTransfer(bridge, transferId);
  if (transfer?.status === "failed") throw new Error(transfer.error ?? bridge.state?.lastError ?? "PPTKit transfer failed.");
  return transfer;
}

function assertPreviewSucceeded(bridge, prepared) {
  const preview = bridge.state?.preview;
  if (preview?.sessionId === prepared.payloadId && preview?.revision === prepared.sessionRevision && preview.status === "failed") {
    const details = (preview.findings ?? []).map((finding) => finding.message).filter(Boolean).join("; ");
    throw new Error(`PPTKit preview failed${details ? `: ${details}` : "."}`);
  }
  return preview;
}

function cssAttributeValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\a ");
}

function matchingTransfer(bridge, transferId) {
  return bridge.state?.transfers?.find((transfer) => transfer.transferId === transferId);
}

function previewMatches(bridge, prepared) {
  const preview = bridge.state?.preview;
  return preview?.sessionId === prepared.payloadId
    && preview?.revision === prepared.sessionRevision
    && READY_PREVIEW_STATUSES.has(preview?.status)
    && preview?.slideCount === preview?.svgCount;
}

export async function transferPptkitSession({
  tab,
  file,
  payloadId,
  timeoutMs = 15_000,
}) {
  if (!tab?.playwright) throw new Error("transferPptkitSession requires a connected Codex Browser tab.");
  const startedAt = Date.now();
  const prepared = await preparePptkitTransfer({
    file,
    kind: "session",
    payloadId,
    mimeType: "application/json",
  });
  const bridgeLocator = await uniqueLocator(tab.playwright.getByTestId("pptkit-preview-bridge"), "PPTKit preview bridge");
  const toggle = await uniqueLocator(tab.playwright.getByTestId("pptkit-transfer-toggle"), "PPTKit transfer toggle");
  const input = await uniqueLocator(tab.playwright.getByTestId("pptkit-transfer-input"), "PPTKit transfer input");
  const submit = await uniqueLocator(tab.playwright.getByTestId("pptkit-transfer-submit"), "PPTKit transfer submit button");
  const readySubmit = tab.playwright.locator('[data-testid="pptkit-transfer-submit"]:not([disabled])');
  let bridge = await readBridge(bridgeLocator);
  if (prepared.chunkBytes > bridge.maxChunkBytes) throw new Error(`Prepared chunks exceed the preview limit of ${bridge.maxChunkBytes} bytes.`);

  const existing = matchingTransfer(bridge, prepared.transferId);
  const missing = existing?.status === "completed"
    ? []
    : Array.isArray(existing?.missing)
      ? existing.missing
      : Array.from({ length: prepared.chunkCount }, (_, index) => index);
  let batchesSubmitted = 0;

  if (missing.length > 0) {
    if (!await toggle.isVisible() || !await toggle.isEnabled()) throw new Error("PPTKit transfer toggle is not actionable.");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    if (!await input.isVisible() || !await input.isEnabled()) throw new Error("PPTKit transfer input is not actionable.");
    if (!await submit.isVisible() || !await submit.isEnabled()) throw new Error("PPTKit transfer submit button is not actionable.");
    const supportsBatch = bridge.submissionModes?.includes("batch");
    const batchSize = supportsBatch
      ? Math.min(bridge.maxBatchChunks ?? DEFAULT_BATCH_CHUNKS, DEFAULT_BATCH_CHUNKS)
      : 1;
    for (let offset = 0; offset < missing.length; offset += batchSize) {
      const indexes = missing.slice(offset, offset + batchSize);
      const submission = indexes.length === 1
        ? await prepared.envelope(indexes[0])
        : await prepared.batchEnvelope(indexes);
      await input.fill(submission);
      await submit.click();
      batchesSubmitted += 1;
      const expected = new Set(indexes);
      await readySubmit.waitFor({ state: "attached", timeoutMs });
      bridge = await readBridge(bridgeLocator);
      const progress = assertTransferSucceeded(bridge, prepared.transferId);
      const received = Array.isArray(progress?.received) && [...expected].every((index) => progress.received.includes(index));
      if (progress?.status !== "completed" && !received) {
        throw new Error(`PPTKit transfer batch ${batchesSubmitted} did not acknowledge every submitted chunk.`);
      }
    }
  }

  if (!previewMatches(bridge, prepared)) {
    const sessionId = cssAttributeValue(prepared.payloadId);
    const revision = cssAttributeValue(prepared.sessionRevision);
    const selector = [
      `[data-testid="pptkit-preview-bridge"][data-preview-session-id="${sessionId}"][data-preview-revision="${revision}"][data-preview-status="ready"]`,
      `[data-testid="pptkit-preview-bridge"][data-preview-session-id="${sessionId}"][data-preview-revision="${revision}"][data-preview-status="ready-with-warnings"]`,
      `[data-testid="pptkit-preview-bridge"][data-preview-session-id="${sessionId}"][data-preview-revision="${revision}"][data-preview-status="failed"]`,
    ].join(",");
    await tab.playwright.locator(selector).waitFor({ state: "attached", timeoutMs });
    bridge = await readBridge(bridgeLocator);
  }
  assertTransferSucceeded(bridge, prepared.transferId);
  const preview = assertPreviewSucceeded(bridge, prepared);
  if (!previewMatches(bridge, prepared)) {
    throw new Error(`PPTKit preview did not produce one SVG per slide for session ${prepared.payloadId} revision ${prepared.sessionRevision}.`);
  }
  return Object.freeze({
    protocol: PPTKIT_TRANSFER_PROTOCOL,
    sessionId: prepared.payloadId,
    revision: prepared.sessionRevision,
    transferId: prepared.transferId,
    chunkCount: prepared.chunkCount,
    batchesSubmitted,
    status: preview.status,
    persisted: preview.persisted,
    slideCount: preview.slideCount,
    svgCount: preview.svgCount,
    findings: preview.findings ?? [],
    qa: preview.qa,
    elapsedMs: Date.now() - startedAt,
  });
}
