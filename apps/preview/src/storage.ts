import type { DeckSessionV2 } from "presentation-workflow";

const DATABASE = "pptkit-presentation-preview-transfer-v2";
const VERSION = 2;
const SESSIONS = "sessions";
const ASSETS = "assets";
const TRANSFERS = "transfers";
const CHUNKS = "chunks";
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TRANSFER_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface StoredTransfer {
  transferId: string;
  kind: "session" | "asset";
  payloadId: string;
  sessionId?: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  chunkCount: number;
  received: number[];
  status: "receiving" | "failed";
  lastActivityAt: string;
  error?: string;
}

interface StoredChunk {
  key: string;
  transferId: string;
  index: number;
  sha256: string;
  blob: Blob;
}

interface StoredAsset {
  key: string;
  sessionId: string;
  assetId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  blob: Blob;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSIONS)) database.createObjectStore(SESSIONS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(ASSETS)) {
        const assets = database.createObjectStore(ASSETS, { keyPath: "key" });
        assets.createIndex("sessionId", "sessionId");
      }
      if (!database.objectStoreNames.contains(TRANSFERS)) database.createObjectStore(TRANSFERS, { keyPath: "transferId" });
      if (!database.objectStoreNames.contains(CHUNKS)) {
        const chunks = database.createObjectStore(CHUNKS, { keyPath: "key" });
        chunks.createIndex("transferId", "transferId");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function requestValue<T>(request: IDBRequest<T>, message: string) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(message));
  });
}

export async function saveSession(session: DeckSessionV2) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSIONS, "readwrite");
  transaction.objectStore(SESSIONS).put(session);
  await complete(transaction);
  database.close();
}

export async function loadSession(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSIONS, "readonly");
  const result = await requestValue(transaction.objectStore(SESSIONS).get(id), "Session could not be loaded.") as DeckSessionV2 | undefined;
  await complete(transaction);
  database.close();
  return result;
}

export async function loadAssetBlob(sessionId: string, asset: DeckSessionV2["assets"][number]) {
  const database = await openDatabase();
  const transaction = database.transaction(ASSETS, "readonly");
  const result = await requestValue(transaction.objectStore(ASSETS).get(`${sessionId}:${asset.id}`), "Asset could not be loaded.") as StoredAsset | undefined;
  await complete(transaction);
  database.close();
  if (!result
    || result.mimeType !== asset.mimeType
    || result.byteLength !== asset.byteLength
    || result.sha256.toLowerCase() !== asset.sha256.toLowerCase()) return undefined;
  return result.blob;
}

export async function loadTransfer(transferId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(TRANSFERS, "readonly");
  const result = await requestValue(transaction.objectStore(TRANSFERS).get(transferId), "Transfer could not be loaded.") as StoredTransfer | undefined;
  await complete(transaction);
  database.close();
  return result;
}

export async function listTransfers(sessionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(TRANSFERS, "readonly");
  const result = await requestValue(transaction.objectStore(TRANSFERS).getAll(), "Transfers could not be listed.") as StoredTransfer[];
  await complete(transaction);
  database.close();
  return result.filter((transfer) => transfer.kind === "session" ? transfer.payloadId === sessionId : transfer.sessionId === sessionId);
}

export async function saveTransferChunk(transfer: StoredTransfer, index: number, sha256: string, blob: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSFERS, CHUNKS], "readwrite");
  const chunks = transaction.objectStore(CHUNKS);
  const key = `${transfer.transferId}:${index}`;
  const existing = await requestValue(chunks.get(key), "Transfer chunk could not be loaded.") as StoredChunk | undefined;
  if (existing && existing.sha256 !== sha256) {
    transaction.abort();
    database.close();
    throw new Error(`Transfer chunk ${index} conflicts with the previously stored chunk.`);
  }
  if (!existing) chunks.put({ key, transferId: transfer.transferId, index, sha256, blob } satisfies StoredChunk);
  transaction.objectStore(TRANSFERS).put({ ...transfer, lastActivityAt: new Date().toISOString() });
  await complete(transaction);
  database.close();
}

export async function loadTransferChunks(transferId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(CHUNKS, "readonly");
  const index = transaction.objectStore(CHUNKS).index("transferId");
  const result = await requestValue(index.getAll(transferId), "Transfer chunks could not be loaded.") as StoredChunk[];
  await complete(transaction);
  database.close();
  return result.sort((left, right) => left.index - right.index);
}

async function deleteTransferIn(transaction: IDBTransaction, transferId: string) {
  transaction.objectStore(TRANSFERS).delete(transferId);
  const chunks = transaction.objectStore(CHUNKS);
  const keys = await requestValue(chunks.index("transferId").getAllKeys(transferId), "Transfer chunk keys could not be loaded.");
  for (const key of keys) chunks.delete(key);
}

export async function completeSessionTransfer(transferId: string, session: DeckSessionV2) {
  const database = await openDatabase();
  const transaction = database.transaction([SESSIONS, ASSETS, TRANSFERS, CHUNKS], "readwrite");
  transaction.objectStore(SESSIONS).put(session);
  const expected = new Map(session.assets.map((asset) => [asset.id, asset]));
  const assets = transaction.objectStore(ASSETS);
  const storedAssets = await requestValue(assets.index("sessionId").getAll(session.id), "Session assets could not be loaded.") as StoredAsset[];
  for (const stored of storedAssets) {
    const asset = expected.get(stored.assetId);
    if (!asset || asset.mimeType !== stored.mimeType || asset.byteLength !== stored.byteLength || asset.sha256.toLowerCase() !== stored.sha256.toLowerCase()) {
      assets.delete(stored.key);
    }
  }
  await deleteTransferIn(transaction, transferId);
  await complete(transaction);
  database.close();
}

export async function completeAssetTransfer(transferId: string, sessionId: string, assetId: string, mimeType: string, sha256: string, blob: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction([ASSETS, TRANSFERS, CHUNKS], "readwrite");
  transaction.objectStore(ASSETS).put({ key: `${sessionId}:${assetId}`, sessionId, assetId, mimeType, byteLength: blob.size, sha256, blob } satisfies StoredAsset);
  await deleteTransferIn(transaction, transferId);
  await complete(transaction);
  database.close();
}

export async function discardTransfer(transferId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([TRANSFERS, CHUNKS], "readwrite");
  await deleteTransferIn(transaction, transferId);
  await complete(transaction);
  database.close();
}

function transferBelongsToSession(transfer: StoredTransfer, sessionId: string) {
  return transfer.kind === "session" ? transfer.payloadId === sessionId : transfer.sessionId === sessionId;
}

export async function deleteSessionData(sessionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([SESSIONS, ASSETS, TRANSFERS, CHUNKS], "readwrite");
  transaction.objectStore(SESSIONS).delete(sessionId);
  const assets = transaction.objectStore(ASSETS);
  const assetKeys = await requestValue(assets.index("sessionId").getAllKeys(sessionId), "Session asset keys could not be loaded.");
  for (const key of assetKeys) assets.delete(key);
  const storedTransfers = await requestValue(transaction.objectStore(TRANSFERS).getAll(), "Transfers could not be listed.") as StoredTransfer[];
  for (const transfer of storedTransfers) {
    if (transferBelongsToSession(transfer, sessionId)) await deleteTransferIn(transaction, transfer.transferId);
  }
  await complete(transaction);
  database.close();
}

export async function clearAllPreviewData() {
  const database = await openDatabase();
  const transaction = database.transaction([SESSIONS, ASSETS, TRANSFERS, CHUNKS], "readwrite");
  transaction.objectStore(SESSIONS).clear();
  transaction.objectStore(ASSETS).clear();
  transaction.objectStore(TRANSFERS).clear();
  transaction.objectStore(CHUNKS).clear();
  await complete(transaction);
  database.close();
}

export async function pruneExpiredStorage(now = Date.now()) {
  const database = await openDatabase();
  const transaction = database.transaction([SESSIONS, ASSETS, TRANSFERS, CHUNKS], "readwrite");
  const sessionsStore = transaction.objectStore(SESSIONS);
  const assetsStore = transaction.objectStore(ASSETS);
  const transfersStore = transaction.objectStore(TRANSFERS);
  const chunksStore = transaction.objectStore(CHUNKS);
  const sessionRequest = sessionsStore.getAll();
  const assetRequest = assetsStore.getAll();
  const transferRequest = transfersStore.getAll();
  const chunkRequest = chunksStore.getAll();
  const [sessions, assets, transfers, chunks] = await Promise.all([
    requestValue(sessionRequest, "Sessions could not be listed.") as Promise<DeckSessionV2[]>,
    requestValue(assetRequest, "Assets could not be listed.") as Promise<StoredAsset[]>,
    requestValue(transferRequest, "Transfers could not be listed.") as Promise<StoredTransfer[]>,
    requestValue(chunkRequest, "Chunks could not be listed.") as Promise<StoredChunk[]>,
  ]);

  const retainedSessionIds = new Set<string>();
  for (const storedSession of sessions) {
    const updatedAt = Date.parse(storedSession.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt > SESSION_RETENTION_MS) sessionsStore.delete(storedSession.id);
    else retainedSessionIds.add(storedSession.id);
  }

  for (const asset of assets) {
    if (!retainedSessionIds.has(asset.sessionId)) assetsStore.delete(asset.key);
  }

  const retainedTransferIds = new Set<string>();
  for (const transfer of transfers) {
    const lastActivityAt = Date.parse(transfer.lastActivityAt);
    const referencesMissingSession = transfer.kind === "asset" && (!transfer.sessionId || !retainedSessionIds.has(transfer.sessionId));
    const expired = transfer.status === "failed"
      || !Number.isFinite(lastActivityAt)
      || now - lastActivityAt > TRANSFER_RETENTION_MS
      || referencesMissingSession;
    if (expired) transfersStore.delete(transfer.transferId);
    else retainedTransferIds.add(transfer.transferId);
  }

  for (const chunk of chunks) {
    if (!retainedTransferIds.has(chunk.transferId)) chunksStore.delete(chunk.key);
  }

  await complete(transaction);
  database.close();
}
