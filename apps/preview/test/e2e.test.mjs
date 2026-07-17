import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const protocol = "pptkit-transfer-v1";
const chunkBytes = 512 * 1024;

function mimeType(file) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  return "application/octet-stream";
}

async function serve() {
  const server = createServer(async (request, response) => {
    const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    const file = path.join(root, "dist", requestPath);
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
      response.writeHead(200, { "content-type": mimeType(file) });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture(revision = 1, assets = [], imageSlides = []) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: "browser-review",
    revision,
    createdAt: now,
    updatedAt: now,
    deck: {
      design: { theme: { id: "clean-business" }, seed: "browser-review", variation: "balanced" },
      brief: { title: "Browser Review", audience: "QA", purpose: "Review before download", language: "en-US", slideCountRange: [3 + imageSlides.length, 3 + imageSlides.length], imagePolicy: "Local", constraints: [] },
      slides: [
        { id: "cover", role: "cover", title: "Browser Review", subtitle: "SVG first" },
        { id: "process", role: "process", title: revision === 1 ? "Review loop" : "Updated review loop", steps: ["Import", "Preview", "Revise", "Download"] },
        ...imageSlides.map((asset, index) => ({ id: `image-${index + 1}`, role: "image", title: `Large image ${index + 1}`, image: { assetId: asset.id, alt: asset.name, width: 1200, height: 675 } })),
        { id: "closing", role: "closing", title: "Approved", message: "Download only on request." },
      ],
    },
    sources: [],
    assets,
  };
}

async function sendPayload(page, { bytes, kind, payloadId, mimeType, sessionId, indexes, expectComplete = true }) {
  const sha256 = digest(bytes);
  const transferId = digest(Buffer.from([kind, payloadId, sessionId ?? "", sha256].join("\0")));
  const count = Math.ceil(bytes.byteLength / chunkBytes);
  const selectedIndexes = indexes ?? Array.from({ length: count }, (_, index) => index);
  for (const index of selectedIndexes) {
    const chunk = bytes.subarray(index * chunkBytes, Math.min(bytes.byteLength, (index + 1) * chunkBytes));
    const envelope = JSON.stringify({
      protocol, transferId, kind, payloadId, ...(sessionId ? { sessionId } : {}), mimeType,
      byteLength: bytes.byteLength, sha256, chunkIndex: index, chunkCount: count,
      chunkByteLength: chunk.byteLength, chunkSha256: digest(chunk), dataBase64: chunk.toString("base64"),
    });
    const toggle = page.getByTestId("pptkit-transfer-toggle");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await page.getByTestId("pptkit-transfer-input").fill(envelope);
    await page.getByTestId("pptkit-transfer-submit").click();
    await page.waitForFunction(({ id, index }) => globalThis.__pptkitPreviewBridge.getState().transfers.some((item) => item.transferId === id && (item.received.includes(index) || item.status === "failed")), { id: transferId, index });
    const state = await page.evaluate((id) => globalThis.__pptkitPreviewBridge.getState().transfers.find((item) => item.transferId === id), transferId);
    if (state?.status === "failed") throw new Error(state.error ?? `Transfer ${transferId} failed.`);
  }
  if (expectComplete) await page.waitForFunction((id) => globalThis.__pptkitPreviewBridge.getState().transfers.some((item) => item.transferId === id && item.status === "completed"), transferId);
  return { transferId, chunkCount: count };
}

async function assertNoPageScroll(page) {
  const overflow = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  }));
  assert.equal(overflow.bodyWidth, overflow.viewportWidth);
  assert.equal(overflow.bodyHeight, overflow.viewportHeight);
}

async function assertElementCentered(page, containerSelector, elementSelector) {
  const offsets = await page.evaluate(({ containerSelector, elementSelector }) => {
    const container = document.querySelector(containerSelector)?.getBoundingClientRect();
    const element = document.querySelector(elementSelector)?.getBoundingClientRect();
    if (!container || !element) throw new Error(`Missing ${containerSelector} or ${elementSelector}.`);
    return {
      x: element.left + element.width / 2 - (container.left + container.width / 2),
      y: element.top + element.height / 2 - (container.top + container.height / 2),
    };
  }, { containerSelector, elementSelector });
  assert.ok(Math.abs(offsets.x) <= 0.5, `${elementSelector} is horizontally offset by ${offsets.x}px.`);
  assert.ok(Math.abs(offsets.y) <= 0.5, `${elementSelector} is vertically offset by ${offsets.y}px.`);
}

async function sendSession(page, session) {
  const bytes = Buffer.from(JSON.stringify(session));
  await sendPayload(page, { bytes, kind: "session", payloadId: session.id, mimeType: "application/json" });
}

async function domBridge(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="pptkit-preview-bridge"]')?.textContent));
  return JSON.parse(await page.getByTestId("pptkit-preview-bridge").textContent());
}

function largeSvg(byteLength, label) {
  const start = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#2457d6"/><text x="80" y="340" fill="white" font-size="72">${label}</text><!--`);
  const end = Buffer.from("--></svg>");
  return Buffer.concat([start, Buffer.alloc(byteLength - start.length - end.length, 120), end]);
}

async function updateStoredTransfer(page, transferId, patch) {
  await page.evaluate(async ({ transferId, patch }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pptkit-presentation-preview-transfer-v2", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("transfers", "readwrite");
    const store = transaction.objectStore("transfers");
    const transfer = await new Promise((resolve, reject) => {
      const request = store.get(transferId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    store.put({ ...transfer, ...patch });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { transferId, patch });
}

async function storageCounts(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pptkit-presentation-preview-transfer-v2", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ["sessions", "assets", "transfers", "chunks"];
    const transaction = database.transaction(names, "readonly");
    const entries = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
      const request = transaction.objectStore(name).count();
      request.onsuccess = () => resolve([name, request.result]);
      request.onerror = () => reject(request.error);
    })));
    database.close();
    return Object.fromEntries(entries);
  });
}

test("keeps the manual transfer envelope in sync with its DeckSession fixture", async () => {
  const fixtures = path.join(root, "test", "fixtures");
  const sessionBytes = await readFile(path.join(fixtures, "manual-deck-session.json"));
  const envelope = JSON.parse(await readFile(path.join(fixtures, "manual-transfer-envelope.json"), "utf8"));
  assert.equal(envelope.protocol, protocol);
  assert.equal(envelope.kind, "session");
  assert.equal(envelope.payloadId, JSON.parse(sessionBytes).id);
  assert.equal(envelope.chunkCount, 1);
  assert.equal(envelope.chunkIndex, 0);
  assert.equal(envelope.byteLength, sessionBytes.byteLength);
  assert.equal(envelope.chunkByteLength, sessionBytes.byteLength);
  assert.equal(envelope.sha256, digest(sessionBytes));
  assert.equal(envelope.chunkSha256, digest(sessionBytes));
  assert.deepEqual(Buffer.from(envelope.dataBase64, "base64"), sessionBytes);
});

test("imports, persists, revises, previews, and exports through the chunk protocol", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(url);
  assert.equal(await page.locator("#session-input").count(), 0);
  assert.equal(await page.locator("[data-testid=pptkit-transfer-input]").count(), 1);
  assert.equal(await page.getByText("Open a presentation").count(), 0);
  assert.equal(await page.getByTestId("pptkit-transfer-toggle").isVisible(), true);
  assert.equal(await page.locator("#transfer-panel").isHidden(), true);
  assert.equal(await page.getByText(/Loading your presentation/i).count(), 0);
  assert.equal(await page.locator("#transfer-progress").isHidden(), true);
  assert.equal(await page.locator("#issues-panel").isHidden(), true);
  assert.equal(await page.locator("#status").innerText(), "Ready");
  assert.equal(await page.locator("#filmstrip").isHidden(), true);
  await assertNoPageScroll(page);
  const compatibility = await domBridge(page);
  assert.equal(compatibility.protocol, protocol);
  assert.equal(compatibility.maxChunkBytes, chunkBytes);
  assert.deepEqual(Object.values(compatibility.apis), Object.values(compatibility.apis).map(() => true));

  await sendSession(page, fixture());
  await page.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 3);
  assert.equal(await page.locator("#transfer-progress").isHidden(), true);
  assert.equal(await page.getByTestId("pptkit-transfer-toggle").isVisible(), true);
  assert.equal(await page.getByTestId("pptkit-transfer-toggle").getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("#issues-panel").isHidden(), true);
  assert.equal(await page.getByTestId("pptkit-findings-toggle").isVisible(), true);
  await page.getByTestId("pptkit-findings-toggle").click();
  assert.equal(await page.locator("#issues-panel").isVisible(), true);
  await page.getByRole("button", { name: "Close review findings" }).click();
  assert.equal(await page.locator("#stage svg").count(), 1);
  assert.equal(await page.locator("#status").innerText(), "Saved locally · Ready");
  assert.match(await page.locator("#status").getAttribute("title"), /Saved in this browser/);
  assert.equal(await page.locator("#findings-count").isHidden(), true);
  assert.equal(await page.locator(".findings-mark-success").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), true);
  assert.equal((await domBridge(page)).state.sessionId, "browser-review");

  const warningSession = fixture();
  warningSession.deck.brief.slideCountRange = [4, 4];
  await sendSession(page, warningSession);
  await page.waitForFunction(() => document.querySelector("#findings-toggle")?.getAttribute("data-tone") === "warning");
  assert.ok(Number(await page.locator("#findings-count").innerText()) > 0);
  assert.equal(await page.locator(".findings-mark-success").isHidden(), true);
  assert.equal(await page.locator(".findings-mark-attention").first().isVisible(), true);
  await sendSession(page, fixture());
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Saved locally · Ready");

  await page.getByRole("button", { name: "Next" }).click();
  assert.equal(await page.locator("#page-status").innerText(), "2 / 3");
  await page.keyboard.press("End");
  assert.equal(await page.locator("#page-status").innerText(), "3 / 3");
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#page-status").innerText(), "1 / 3");
  await page.getByRole("button", { name: "Next" }).click();
  await sendSession(page, fixture(2));
  await page.waitForFunction(() => document.querySelector("#status")?.getAttribute("title")?.includes("Changed slides: process"));
  assert.equal(await page.locator("#page-status").innerText(), "2 / 3");

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 3);
  assert.match(await page.locator("#deck-meta").innerText(), /revision 2/);

  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Generate & download PPTX" }).click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("passed package inspection"));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(downloads.map((download) => download.suggestedFilename()).sort(), ["browser-review.pptx", "build-report.json"]);
  const pptx = downloads.find((download) => download.suggestedFilename().endsWith(".pptx"));
  assert.ok(pptx);
});

test("scopes restored state to the hash and keeps the base URL clean", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const bytes = largeSvg(1024 * 1024, "Resumable");
  const asset = { id: "resumable", name: "resumable.svg", mimeType: "image/svg+xml", byteLength: bytes.byteLength, sha256: digest(bytes), width: 1200, height: 675 };
  await sendSession(page, fixture(1, [asset], [asset]));
  const partial = await sendPayload(page, { bytes, kind: "asset", payloadId: asset.id, sessionId: "browser-review", mimeType: asset.mimeType, indexes: [0], expectComplete: false });
  assert.equal(new URL(page.url()).hash, "#browser-review");
  assert.equal((await domBridge(page)).state.transfers.some((item) => item.transferId === partial.transferId), true);

  await page.evaluate(() => { location.hash = ""; });
  await page.waitForFunction(() => globalThis.__pptkitPreviewState.sessionId === undefined && document.querySelectorAll("#stage svg").length === 0);
  assert.deepEqual((await domBridge(page)).state.transfers, []);
  assert.equal(await page.locator("#deck-title").innerText(), "PPTKit Preview");
  assert.equal(await page.locator("#status").innerText(), "Ready");

  await page.evaluate(() => { location.hash = "browser-review"; });
  await page.waitForFunction(() => globalThis.__pptkitPreviewState.sessionId === "browser-review");
  assert.equal((await domBridge(page)).state.transfers.some((item) => item.transferId === partial.transferId), true);
  await sendPayload(page, { bytes, kind: "asset", payloadId: asset.id, sessionId: "browser-review", mimeType: asset.mimeType, indexes: [1] });
  assert.equal((await storageCounts(page)).assets, 1);
  await page.getByTestId("pptkit-transfer-toggle").click();
  await page.getByRole("button", { name: "Delete current presentation" }).click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Local presentation data deleted.");
  assert.equal(new URL(page.url()).hash, "");
  await page.evaluate(() => { location.hash = "browser-review"; });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Presentation not found in this browser.");
  assert.equal((await domBridge(page)).state.sessionId, undefined);
  assert.deepEqual(await storageCounts(page), { sessions: 0, assets: 0, transfers: 0, chunks: 0 });
});

test("keeps same-named assets isolated between sessions", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const firstBytes = largeSvg(2048, "First session");
  const secondBytes = largeSvg(2048, "Second session");
  const firstAsset = { id: "shared-id", name: "shared.svg", mimeType: "image/svg+xml", byteLength: firstBytes.byteLength, sha256: digest(firstBytes), width: 1200, height: 675 };
  const secondAsset = { ...firstAsset, sha256: digest(secondBytes) };
  const firstSession = fixture(1, [firstAsset], [firstAsset]);
  const secondSession = fixture(1, [secondAsset], [secondAsset]);
  secondSession.id = "other-review";
  secondSession.deck.design.seed = secondSession.id;

  await sendSession(page, firstSession);
  await sendPayload(page, { bytes: firstBytes, kind: "asset", payloadId: firstAsset.id, sessionId: firstSession.id, mimeType: firstAsset.mimeType });
  await sendSession(page, secondSession);
  await sendPayload(page, { bytes: secondBytes, kind: "asset", payloadId: secondAsset.id, sessionId: secondSession.id, mimeType: secondAsset.mimeType });

  async function renderedImageText(sessionId) {
    await page.evaluate((id) => { location.hash = id; }, sessionId);
    await page.waitForFunction((id) => globalThis.__pptkitPreviewState.sessionId === id && document.querySelectorAll("#thumbnails image").length === 1, sessionId);
    return page.evaluate(async () => {
      const image = document.querySelector("#thumbnails image");
      return fetch(image.href.baseVal).then((response) => response.text());
    });
  }

  assert.match(await renderedImageText(firstSession.id), /First session/);
  assert.match(await renderedImageText(secondSession.id), /Second session/);
});

test("keeps failures transient and allows the same transfer to retry", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const session = fixture();
  const bytes = Buffer.from(JSON.stringify(session));
  const transferId = digest(Buffer.from(["session", session.id, "", digest(bytes)].join("\0")));
  const envelope = {
    protocol, transferId, kind: "session", payloadId: session.id, mimeType: "application/json",
    byteLength: bytes.byteLength, sha256: digest(bytes), chunkIndex: 0, chunkCount: 1,
    chunkByteLength: bytes.byteLength, chunkSha256: "0".repeat(64), dataBase64: bytes.toString("base64"),
  };
  await page.getByTestId("pptkit-transfer-toggle").click();
  await page.getByTestId("pptkit-transfer-input").fill(JSON.stringify(envelope));
  await page.getByTestId("pptkit-transfer-submit").click();
  await page.waitForFunction((id) => globalThis.__pptkitPreviewBridge.getState().transfers.some((item) => item.transferId === id && item.status === "failed"), transferId);
  assert.equal((await storageCounts(page)).transfers, 0);
  assert.equal((await storageCounts(page)).chunks, 0);

  await sendSession(page, session);
  await page.waitForFunction(() => globalThis.__pptkitPreviewState.sessionId === "browser-review");
  const retried = (await domBridge(page)).state.transfers.find((item) => item.transferId === transferId);
  assert.equal(retried.status, "completed");
});

test("prunes expired sessions, assets, and incomplete transfers", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const bytes = largeSvg(1024 * 1024, "Expired");
  const asset = { id: "expired", name: "expired.svg", mimeType: "image/svg+xml", byteLength: bytes.byteLength, sha256: digest(bytes), width: 1200, height: 675 };
  const expiredSession = fixture(1, [asset], [asset]);
  expiredSession.updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  await sendSession(page, expiredSession);
  const partial = await sendPayload(page, { bytes, kind: "asset", payloadId: asset.id, sessionId: expiredSession.id, mimeType: asset.mimeType, indexes: [0], expectComplete: false });
  await updateStoredTransfer(page, partial.transferId, { lastActivityAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });

  await page.reload();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Presentation not found in this browser.");
  assert.deepEqual(await storageCounts(page), { sessions: 0, assets: 0, transfers: 0, chunks: 0 });
});

test("clears all locally stored preview data after confirmation", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);
  await sendSession(page, fixture());
  await page.getByTestId("pptkit-transfer-toggle").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear all local preview data" }).click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "All local preview data deleted.");
  assert.equal(new URL(page.url()).hash, "");
  assert.deepEqual(await storageCounts(page), { sessions: 0, assets: 0, transfers: 0, chunks: 0 });
});

test("transfers assets larger than 5 MB and more than 20 MB in total", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const payloads = Array.from({ length: 4 }, (_, index) => largeSvg(5 * 1024 * 1024 + 256 * 1024, `Asset ${index + 1}`));
  const assets = payloads.map((bytes, index) => ({
    id: `large-${index + 1}`,
    name: `large-${index + 1}.svg`,
    mimeType: "image/svg+xml",
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
    width: 1200,
    height: 675,
  }));
  await sendSession(page, fixture(1, assets, assets));
  assert.equal(await page.getByTestId("pptkit-transfer-toggle").isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), false);
  const partial = await sendPayload(page, { bytes: payloads[0], kind: "asset", payloadId: assets[0].id, sessionId: "browser-review", mimeType: assets[0].mimeType, indexes: [0, 1], expectComplete: false });
  assert.equal(await page.locator("#transfer-progress").isVisible(), true);
  assert.match(await page.locator("#transfer-progress").innerText(), /Asset large-1 · 2 of \d+ parts · Receiving/);
  await page.reload();
  await page.waitForFunction((id) => globalThis.__pptkitPreviewBridge.getState().transfers.some((item) => item.transferId === id && item.received.includes(1)), partial.transferId);
  await sendPayload(page, { bytes: payloads[0], kind: "asset", payloadId: assets[0].id, sessionId: "browser-review", mimeType: assets[0].mimeType, indexes: Array.from({ length: partial.chunkCount - 2 }, (_, index) => index + 2) });
  for (let index = 1; index < assets.length; index += 1) {
    await sendPayload(page, { bytes: payloads[index], kind: "asset", payloadId: assets[index].id, sessionId: "browser-review", mimeType: assets[index].mimeType });
  }
  await page.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 7);
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), true);
  assert.equal(await page.evaluate(() => globalThis.__pptkitPreviewBridge.protocol), protocol);
});

test("rejects inconsistent chunks and never reuses stale asset bytes across revisions", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);

  const oneByte = Buffer.from("x");
  await page.getByTestId("pptkit-transfer-toggle").click();
  await page.getByTestId("pptkit-transfer-input").fill(JSON.stringify({
    protocol, transferId: "invalid-count", kind: "session", payloadId: "invalid", mimeType: "application/json",
    byteLength: 1, sha256: digest(oneByte), chunkIndex: 0, chunkCount: 2,
    chunkByteLength: 1, chunkSha256: digest(oneByte), dataBase64: oneByte.toString("base64"),
  }));
  await page.getByTestId("pptkit-transfer-submit").click();
  await page.waitForFunction(() => document.querySelector("#transfer-error")?.textContent?.includes("chunkCount is inconsistent"));

  await page.getByTestId("pptkit-transfer-input").fill(JSON.stringify({
    protocol, transferId: "invalid-hash", kind: "session", payloadId: "invalid", mimeType: "application/json",
    byteLength: 1, sha256: digest(oneByte), chunkIndex: 0, chunkCount: 1,
    chunkByteLength: 1, chunkSha256: "0".repeat(64), dataBase64: oneByte.toString("base64"),
  }));
  await page.getByTestId("pptkit-transfer-submit").click();
  await page.waitForFunction(() => document.querySelector("#transfer-error")?.textContent?.includes("failed SHA-256 verification"));

  const conflictingPayload = Buffer.from("ab");
  const firstChunk = Buffer.from("a");
  const conflictingChunk = Buffer.from("x");
  const conflictBase = { protocol, transferId: "conflicting-chunk", kind: "session", payloadId: "conflict", mimeType: "application/json", byteLength: 2, sha256: digest(conflictingPayload), chunkIndex: 0, chunkCount: 2, chunkByteLength: 1 };
  await page.getByTestId("pptkit-transfer-input").fill(JSON.stringify({ ...conflictBase, chunkSha256: digest(firstChunk), dataBase64: firstChunk.toString("base64") }));
  await page.getByTestId("pptkit-transfer-submit").click();
  await page.waitForFunction(() => globalThis.__pptkitPreviewBridge.getState().transfers.some((item) => item.transferId === "conflicting-chunk" && item.received.includes(0)));
  await page.getByTestId("pptkit-transfer-input").fill(JSON.stringify({ ...conflictBase, chunkSha256: digest(conflictingChunk), dataBase64: conflictingChunk.toString("base64") }));
  await page.getByTestId("pptkit-transfer-submit").click();
  await page.waitForFunction(() => document.querySelector("#transfer-error")?.textContent?.includes("conflicts with the previously stored chunk"));

  const first = largeSvg(2048, "First");
  const firstAsset = { id: "replaceable", name: "replaceable.svg", mimeType: "image/svg+xml", byteLength: first.byteLength, sha256: digest(first), width: 1200, height: 675 };
  await sendSession(page, fixture(1, [firstAsset], [firstAsset]));
  await assert.rejects(
    () => sendPayload(page, { bytes: oneByte, kind: "asset", payloadId: "unknown", sessionId: "browser-review", mimeType: "image/png" }),
    /does not declare asset unknown/,
  );
  await sendPayload(page, { bytes: first, kind: "asset", payloadId: firstAsset.id, sessionId: "browser-review", mimeType: firstAsset.mimeType });
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), true);

  const replacement = largeSvg(2048, "Replacement");
  const replacementAsset = { ...firstAsset, sha256: digest(replacement) };
  await sendSession(page, fixture(2, [replacementAsset], [replacementAsset]));
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), false);
  await sendPayload(page, { bytes: replacement, kind: "asset", payloadId: replacementAsset.id, sessionId: "browser-review", mimeType: replacementAsset.mimeType });
  assert.equal(await page.getByRole("button", { name: "Generate & download PPTX" }).isEnabled(), true);
});

test("isolates SVG definition IDs between hidden thumbnails and the stage", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  await page.goto(url);

  const bytes = largeSvg(2048, "Responsive image");
  const asset = {
    id: "responsive-image",
    name: "responsive-image.svg",
    mimeType: "image/svg+xml",
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
    width: 1200,
    height: 675,
  };
  await sendSession(page, fixture(1, [asset], [asset]));
  await sendPayload(page, { bytes, kind: "asset", payloadId: asset.id, sessionId: "browser-review", mimeType: asset.mimeType });
  await page.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 4);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  const evidence = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const image = document.querySelector("#stage image");
    const clipPath = image?.parentElement?.getAttribute("clip-path") ?? "";
    const clipId = clipPath.match(/#([^\)]+)/)?.[1];
    const resolvedClip = clipId ? document.getElementById(clipId) : null;
    return {
      duplicates,
      filmstripVisibility: getComputedStyle(document.querySelector("#filmstrip-surface")).visibility,
      imageCount: document.querySelectorAll("#stage image").length,
      resolvedClipOwner: resolvedClip?.closest("#stage, #thumbnails")?.id,
    };
  });
  assert.deepEqual(evidence.duplicates, []);
  assert.equal(evidence.filmstripVisibility, "hidden");
  assert.equal(evidence.imageCount, 1);
  assert.equal(evidence.resolvedClipOwner, "stage");
});

test("keeps the stage in the viewport and progressively discloses navigation", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const narrow = await browser.newPage({ viewport: { width: 760, height: 900 } });
  await narrow.goto(url);
  await assertElementCentered(narrow, "#transfer-toggle", "#transfer-toggle .status-dot");
  await sendSession(narrow, fixture());
  await narrow.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 3);
  await assertElementCentered(narrow, "#transfer-toggle", "#transfer-toggle .status-dot");
  await assertElementCentered(narrow, "#previous", "#previous .chevron-icon");
  await assertElementCentered(narrow, "#next", "#next .chevron-icon");
  const indicatorStyles = await narrow.evaluate(() => {
    const status = getComputedStyle(document.querySelector("#status"));
    const findings = getComputedStyle(document.querySelector("#findings-toggle"));
    return {
      statusBorder: status.borderTopWidth,
      statusBackground: status.backgroundColor,
      findingsBorder: findings.borderTopWidth,
      findingsShadow: findings.boxShadow,
    };
  });
  assert.equal(indicatorStyles.statusBorder, "0px");
  assert.equal(indicatorStyles.statusBackground, "rgba(0, 0, 0, 0)");
  assert.equal(indicatorStyles.findingsBorder, "0px");
  assert.equal(indicatorStyles.findingsShadow, "none");
  await assertNoPageScroll(narrow);
  assert.equal(Math.round((await narrow.locator("#filmstrip").boundingBox()).width), 42);
  assert.equal(await narrow.locator("#filmstrip-surface").isHidden(), true);
  await narrow.getByTestId("pptkit-filmstrip-toggle").hover();
  assert.equal(await narrow.locator("#filmstrip-surface").isVisible(), true);
  await narrow.getByTestId("pptkit-filmstrip-toggle").click();
  assert.equal(await narrow.getByTestId("pptkit-filmstrip-toggle").getAttribute("aria-expanded"), "true");
  await narrow.getByRole("button", { name: /Show slide 2/ }).click();
  assert.equal(await narrow.locator("#page-status").innerText(), "2 / 3");
  assert.equal(await narrow.getByTestId("pptkit-filmstrip-toggle").getAttribute("aria-expanded"), "false");
  await narrow.waitForFunction(() => getComputedStyle(document.querySelector("#filmstrip-surface")).visibility === "hidden");
  const narrowStage = await narrow.locator("#stage svg").boundingBox();
  assert.ok(narrowStage.width > 0 && narrowStage.height > 0);
  assert.ok(narrowStage.x >= 0 && narrowStage.y >= 0);
  assert.ok(narrowStage.x + narrowStage.width <= 760 && narrowStage.y + narrowStage.height <= 900);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(url);
  await sendSession(phone, fixture());
  await phone.waitForFunction(() => document.querySelectorAll("#thumbnails button").length === 3);
  await assertNoPageScroll(phone);
  await phone.getByTestId("pptkit-filmstrip-toggle").click();
  assert.equal(await phone.locator("#filmstrip-surface").isVisible(), true);
  const phoneStage = await phone.locator("#stage svg").boundingBox();
  assert.ok(phoneStage.width > 0 && phoneStage.height > 0);
  assert.ok(phoneStage.x >= 0 && phoneStage.y >= 0);
  assert.ok(phoneStage.x + phoneStage.width <= 390 && phoneStage.y + phoneStage.height <= 844);
  await phone.keyboard.press("Escape");
  assert.equal(await phone.getByTestId("pptkit-filmstrip-toggle").getAttribute("aria-expanded"), "false");
});

test("declares reduced motion, transparency, and contrast fallbacks", async () => {
  const css = await readFile(path.join(root, "src", "styles.css"), "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /prefers-contrast:\s*more/);
});
