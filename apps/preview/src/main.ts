import { normalizePresentation, validatePresentation, type PresentationDocument } from "@pptkit/core";
import { generatePptx } from "@pptkit/pptx-exporter";
import {
  authorDeck,
  analyzePptxEvidence,
  auditRestyleTransformation,
  auditVisualRhythm,
  inspectPptxPackage,
  inspectStructure,
  NOT_RUN_PACKAGE_CHECK,
  validateDeckSpec,
  type BuildReport,
  type DeckSession,
  type StructuralIssue,
} from "presentation-workflow";
import { renderPresentationToSvg, type SvgRenderResult } from "@pptkit/svg-renderer";

import {
  clearAllPreviewData,
  deleteSessionData,
  listTransfers,
  loadAssetBlob,
  loadSession,
  pruneExpiredStorage,
  type StoredTransfer,
} from "./storage.js";
import {
  MAX_TRANSFER_CHUNK_BYTES,
  PPTKIT_TRANSFER_PROTOCOL,
  receiveTransferChunk,
  SessionValidationError,
  TransferReceiveError,
  type TransferProgress,
} from "./transfer.js";
import "./styles.css";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const deckTitle = byId<HTMLHeadingElement>("deck-title");
const deckMeta = byId<HTMLSpanElement>("deck-meta");
const status = byId<HTMLOutputElement>("status");
const workspace = byId<HTMLElement>("workspace");
const stage = byId<HTMLDivElement>("stage");
const previousButton = byId<HTMLButtonElement>("previous");
const nextButton = byId<HTMLButtonElement>("next");
const pageStatus = byId<HTMLSpanElement>("page-status");
const downloadButton = byId<HTMLButtonElement>("download");

const transferShell = byId<HTMLElement>("transfer-shell");
const transferToggle = byId<HTMLButtonElement>("transfer-toggle");
const transferToggleLabel = byId<HTMLSpanElement>("transfer-toggle-label");
const transferClose = byId<HTMLButtonElement>("transfer-close");
const transferPanel = byId<HTMLElement>("transfer-panel");
const transferInput = byId<HTMLTextAreaElement>("transfer-input");
const transferButton = byId<HTMLButtonElement>("transfer-submit");
const transferError = byId<HTMLParagraphElement>("transfer-error");
const transferProgress = byId<HTMLDivElement>("transfer-progress");
const previewBridge = byId<HTMLOutputElement>("preview-bridge");
const clearCurrentButton = byId<HTMLButtonElement>("clear-current");
const clearAllButton = byId<HTMLButtonElement>("clear-all");

const filmstrip = byId<HTMLElement>("filmstrip");
const filmstripToggle = byId<HTMLButtonElement>("filmstrip-toggle");
const filmstripCount = byId<HTMLSpanElement>("filmstrip-count");
const thumbnails = byId<HTMLDivElement>("thumbnails");

const findingsShell = byId<HTMLElement>("findings-shell");
const findingsToggle = byId<HTMLButtonElement>("findings-toggle");
const findingsClose = byId<HTMLButtonElement>("findings-close");
const findingsCount = byId<HTMLSpanElement>("findings-count");
const issuesPanel = byId<HTMLElement>("issues-panel");
const issuesContainer = byId<HTMLDivElement>("issues");

let session: DeckSession | undefined;
let presentation: PresentationDocument | undefined;
let layoutDecisions: BuildReport["layoutDecisions"] = [];
let visualAudit: BuildReport["visualAudit"] | undefined;
let preview: SvgRenderResult | undefined;
let currentIndex = 0;
let findings: StructuralIssue[] = [];
let currentDiagnostics: BuildReport["diagnostics"] = [];
let currentExportStatus: BuildReport["exportStatus"] = "not-run";
let objectUrls: string[] = [];
let persisted = true;
let transfers: TransferProgress[] = [];
let missingAssetCount = 0;
let lastTransferError: string | undefined;
let routeGeneration = 0;
let renderGeneration = 0;

function routeSessionId() {
  try { return decodeURIComponent(location.hash.slice(1)); }
  catch { return ""; }
}

function replaceRouteSessionId(sessionId?: string) {
  const url = new URL(location.href);
  url.hash = sessionId ? encodeURIComponent(sessionId) : "";
  history.replaceState(null, "", url);
  clearCurrentButton.disabled = !sessionId;
}

function setStatus(message: string, tone: "neutral" | "busy" | "success" | "error" = "neutral") {
  status.textContent = message;
  status.title = message;
  status.dataset.tone = tone;
}

function setDisclosure(button: HTMLButtonElement, panel: HTMLElement, open: boolean) {
  button.setAttribute("aria-expanded", String(open));
  panel.dataset.open = String(open);
  panel.setAttribute("aria-hidden", String(!open));
  panel.inert = !open;
}

function setTransferOpen(open: boolean) {
  if (!open && transferPanel.contains(document.activeElement)) transferToggle.focus({ preventScroll: true });
  setDisclosure(transferToggle, transferPanel, open);
}

function setFindingsOpen(open: boolean) {
  if (!open && issuesPanel.contains(document.activeElement)) findingsToggle.focus({ preventScroll: true });
  setDisclosure(findingsToggle, issuesPanel, open);
}

function setFilmstripPinned(pinned: boolean) {
  if (pinned) delete filmstrip.dataset.suppressHover;
  filmstrip.dataset.pinned = String(pinned);
  filmstripToggle.setAttribute("aria-expanded", String(pinned));
  filmstripToggle.setAttribute("aria-label", pinned ? "Hide slide thumbnails" : "Show slide thumbnails");
}

function closeTransientSurfaces(except?: "transfer" | "findings") {
  if (except !== "transfer") setTransferOpen(false);
  if (except !== "findings") setFindingsOpen(false);
}

function bridgeState() {
  return {
    protocol: PPTKIT_TRANSFER_PROTOCOL,
    maxChunkBytes: MAX_TRANSFER_CHUNK_BYTES,
    apis: {
      Blob: typeof Blob === "function",
      URL: typeof URL === "function",
      crypto: typeof crypto === "object" && typeof crypto.subtle === "object",
      fetch: typeof fetch === "function",
      indexedDB: typeof indexedDB === "object",
      storageEstimate: typeof navigator.storage?.estimate === "function",
      structuredClone: typeof structuredClone === "function",
      Uint8Array: typeof Uint8Array === "function",
    },
    state: {
      sessionId: session?.id,
      transfers: transfers.map((item) => ({ ...item, received: [...item.received], missing: [...item.missing] })),
      ...(lastTransferError ? { lastError: lastTransferError } : {}),
    },
  };
}

function renderBridgeState() {
  previewBridge.textContent = JSON.stringify(bridgeState());
}

function updateTransferSurface() {
  const active = transfers.some((item) => item.status === "receiving");
  const failed = transfers.some((item) => item.status === "failed") || transferError.textContent.length > 0;
  if (failed) {
    transferToggleLabel.textContent = "Transfer failed";
    transferToggle.dataset.tone = "error";
  } else if (active) {
    transferToggleLabel.textContent = "Receiving";
    transferToggle.dataset.tone = "busy";
  } else if (!session) {
    transferToggleLabel.textContent = "Connect";
    transferToggle.dataset.tone = "neutral";
  } else if (missingAssetCount > 0) {
    transferToggleLabel.textContent = `${missingAssetCount} asset${missingAssetCount === 1 ? "" : "s"}`;
    transferToggle.dataset.tone = "busy";
  } else {
    transferToggleLabel.textContent = "Agent connection";
    transferToggle.dataset.tone = "ready";
  }

  if (session && missingAssetCount === 0 && !active && !failed) setTransferOpen(false);
  transferToggle.hidden = false;
  clearCurrentButton.disabled = !routeSessionId();
  if (failed) setTransferOpen(true);
}

function revokeObjectUrls() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

async function createAssetResolver(activeSession: DeckSession) {
  const resolved = new Map<string, { source: { type: "url"; value: string }; mimeType: string; dedupeKey: string }>();
  const urls: string[] = [];
  for (const asset of activeSession.assets) {
    const blob = await loadAssetBlob(activeSession.id, asset).catch(() => undefined);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    resolved.set(asset.id, { source: { type: "url", value: url }, mimeType: asset.mimeType, dedupeKey: asset.id });
  }
  return { resolveAsset: (assetId: string) => resolved.get(assetId), urls };
}

function changedSlides(previous: DeckSession | undefined, next: DeckSession) {
  if (!previous || previous.id !== next.id) return [];
  const before = new Map(previous.deck.slides.map((slide) => [slide.id, JSON.stringify(slide)]));
  return next.deck.slides.filter((slide) => before.get(slide.id) !== JSON.stringify(slide)).map((slide) => slide.id);
}

function mountSvg(container: HTMLElement, svg: string, namespace: string) {
  container.insertAdjacentHTML("beforeend", svg);
  const idMap = new Map<string, string>();
  for (const element of container.querySelectorAll<HTMLElement>("[id]")) {
    const scopedId = `${namespace}-${element.id}`;
    idMap.set(element.id, scopedId);
    element.id = scopedId;
  }

  for (const element of container.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      for (const [id, scopedId] of idMap) {
        value = value.replaceAll(`url(#${id})`, `url(#${scopedId})`);
        if (value === `#${id}`) value = `#${scopedId}`;
      }
      if (attribute.name === "aria-labelledby" || attribute.name === "aria-describedby") {
        value = value.split(/\s+/).map((id) => idMap.get(id) ?? id).join(" ");
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  }
}

function showCurrentSlide() {
  const slides = preview?.slides ?? [];
  const selected = slides[currentIndex];
  stage.replaceChildren();
  stage.classList.toggle("has-slide", Boolean(selected));
  if (selected) {
    mountSvg(stage, selected.svg, `stage-${selected.index}`);
    stage.setAttribute("aria-label", `Slide ${currentIndex + 1}: ${selected.slideId}`);
  } else {
    stage.innerHTML = `<div class="empty-state"><strong>Waiting for a presentation</strong><span>The preview will appear automatically when the agent connects it.</span></div>`;
    stage.setAttribute("aria-label", "No presentation loaded");
  }
  pageStatus.textContent = `${slides.length === 0 ? 0 : currentIndex + 1} / ${slides.length}`;
  previousButton.disabled = currentIndex <= 0;
  nextButton.disabled = currentIndex >= slides.length - 1;
  for (const button of thumbnails.querySelectorAll<HTMLButtonElement>("button")) {
    const selectedButton = button.dataset.index === String(currentIndex);
    button.setAttribute("aria-current", selectedButton ? "page" : "false");
    if (selectedButton) button.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function selectSlide(index: number) {
  if (!preview?.slides.length) return;
  currentIndex = Math.max(0, Math.min(index, preview.slides.length - 1));
  showCurrentSlide();
  if (matchMedia("(max-width: 980px)").matches) setFilmstripPinned(false);
}

function showFindings(items: StructuralIssue[]) {
  issuesContainer.replaceChildren();
  const blocking = items.filter((item) => item.severity === "error").length;
  const warnings = items.length - blocking;
  findingsToggle.hidden = !session;
  findingsCount.hidden = items.length === 0;
  findingsCount.textContent = String(items.length);
  findingsToggle.dataset.tone = blocking > 0 ? "error" : warnings > 0 ? "warning" : "success";
  findingsToggle.setAttribute("aria-label", `Review findings: ${blocking} errors, ${warnings} warnings`);

  if (items.length === 0) {
    issuesContainer.innerHTML = '<p class="success">No blocking findings.</p>';
    return;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `finding ${item.severity}`;
    const code = document.createElement("strong");
    code.textContent = item.code;
    const message = document.createElement("span");
    message.textContent = item.message;
    button.append(code, message);
    if (item.slideId) {
      button.addEventListener("click", () => {
        const index = preview?.slides.findIndex((slide) => slide.slideId === item.slideId) ?? -1;
        if (index >= 0) selectSlide(index);
        setFindingsOpen(false);
      });
    } else {
      button.disabled = true;
    }
    issuesContainer.append(button);
  }
}

function renderThumbnails() {
  thumbnails.replaceChildren();
  const slides = preview?.slides ?? [];
  filmstrip.hidden = slides.length === 0;
  workspace.dataset.state = slides.length === 0 ? "empty" : "ready";
  filmstripCount.textContent = String(slides.length);
  for (const slide of slides) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(slide.index);
    button.setAttribute("aria-label", `Show slide ${slide.index + 1}: ${slide.slideId}`);
    const number = document.createElement("span");
    number.textContent = String(slide.index + 1);
    button.append(number);
    mountSvg(button, slide.svg, `thumbnail-${slide.index}`);
    button.addEventListener("click", () => {
      selectSlide(slide.index);
      if (matchMedia("(max-width: 980px)").matches) {
        filmstrip.dataset.suppressHover = "true";
        stage.focus({ preventScroll: true });
      }
    });
    thumbnails.append(button);
  }
}

function renderTransferProgress() {
  transferProgress.replaceChildren();
  renderBridgeState();
  const visibleTransfers = transfers.filter((item) => item.status !== "completed");
  transferProgress.hidden = visibleTransfers.length === 0;
  for (const item of visibleTransfers) {
    const row = document.createElement("p");
    row.dataset.transferId = item.transferId;
    row.className = `transfer-status ${item.status}`;
    const label = item.kind === "session" ? "Presentation" : `Asset ${item.payloadId}`;
    const state = item.status === "failed" ? "Failed" : "Receiving";
    row.textContent = `${label} · ${item.received.length} of ${item.chunkCount} parts · ${state}${item.error ? ` · ${item.error}` : ""}`;
    transferProgress.append(row);
  }
  updateTransferSurface();
}

function recordTransfer(item: TransferProgress) {
  transfers = [...transfers.filter((candidate) => candidate.transferId !== item.transferId), item];
  renderTransferProgress();
}

function storedTransferProgress(item: StoredTransfer): TransferProgress {
  const received = [...item.received].sort((left, right) => left - right);
  const receivedSet = new Set(received);
  return {
    transferId: item.transferId,
    kind: item.kind,
    payloadId: item.payloadId,
    received,
    missing: Array.from({ length: item.chunkCount }, (_, index) => index).filter((index) => !receivedSet.has(index)),
    chunkCount: item.chunkCount,
    status: item.status,
    ...(item.error ? { error: item.error } : {}),
  };
}

async function refreshStoredTransfers() {
  const targetSessionId = routeSessionId() || session?.id;
  const stored = targetSessionId ? (await listTransfers(targetSessionId)).map(storedTransferProgress) : [];
  const storedIds = new Set(stored.map((item) => item.transferId));
  transfers = [...transfers.filter((item) => item.status !== "receiving" && !storedIds.has(item.transferId)), ...stored];
  renderTransferProgress();
}

async function renderSession(nextSession: DeckSession, changed: string[] = []) {
  const generation = ++renderGeneration;
  const selectedSlideId = preview?.slides[currentIndex]?.slideId;
  const { resolveAsset, urls } = await createAssetResolver(nextSession);
  const authored = authorDeck(nextSession.deck, resolveAsset);
  const nextPresentation = authored.presentation;
  const availableAssets = new Set(nextSession.assets.filter((asset) => resolveAsset(asset.id)).map((asset) => asset.id));
  const nextMissingAssetCount = nextSession.assets.length - availableAssets.size;
  const specIssues = validateDeckSpec(nextSession.deck, availableAssets);
  const diagnostics = validatePresentation(nextPresentation);
  const nextDiagnostics = diagnostics.map((diagnostic) => ({ severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message, path: diagnostic.path }));
  const diagnosticIssues: StructuralIssue[] = diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity === "error" ? "error" : "warning",
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.slideId ? { slideId: diagnostic.slideId } : {}),
    ...(diagnostic.elementId ? { elementId: diagnostic.elementId } : {}),
  }));
  const structural = diagnostics.some((diagnostic) => diagnostic.severity === "error") ? [] : inspectStructure(normalizePresentation(nextPresentation));
  const nextVisualAudit = auditVisualRhythm(nextSession.deck, normalizePresentation(nextPresentation), authored.layoutDecisions);
  const nextPreview = await renderPresentationToSvg(nextPresentation);
  const nextFindings = [
    ...specIssues,
    ...diagnosticIssues,
    ...structural,
    ...nextVisualAudit.issues,
    ...nextPreview.warnings.map((warning) => ({ severity: "warning" as const, code: warning.code, message: warning.message, ...(warning.slideId ? { slideId: warning.slideId } : {}), ...(warning.elementId ? { elementId: warning.elementId } : {}) })),
  ];
  if (generation !== renderGeneration) {
    for (const url of urls) URL.revokeObjectURL(url);
    return;
  }
  revokeObjectUrls();
  objectUrls = urls;
  presentation = nextPresentation;
  layoutDecisions = authored.layoutDecisions;
  visualAudit = nextVisualAudit;
  missingAssetCount = nextMissingAssetCount;
  currentDiagnostics = nextDiagnostics;
  currentExportStatus = "not-run";
  preview = nextPreview;
  findings = nextFindings;
  renderThumbnails();
  const retainedIndex = selectedSlideId ? preview.slides.findIndex((slide) => slide.slideId === selectedSlideId) : -1;
  currentIndex = retainedIndex >= 0 ? retainedIndex : 0;
  showCurrentSlide();
  showFindings(findings);
  deckTitle.textContent = nextSession.deck.brief.title;
  deckMeta.textContent = `${nextSession.deck.design.theme.id} · ${preview.slides.length} slides · revision ${nextSession.revision}`;
  const blocking = findings.filter((item) => item.severity === "error").length;
  downloadButton.disabled = blocking > 0;
  const warnings = findings.length - blocking;
  const storageLabel = persisted ? "Saved locally" : "Memory only";
  const reviewLabel = blocking > 0
    ? `${blocking} blocking${warnings > 0 ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`
    : warnings > 0
      ? `${warnings} warning${warnings === 1 ? "" : "s"}`
      : "Ready";
  const changedText = changed.length > 0 ? ` Changed slides: ${changed.join(", ")}.` : "";
  setStatus(`${storageLabel} · ${reviewLabel}`, blocking > 0 ? "error" : "success");
  status.title = `${persisted ? "Saved in this browser." : "Previewing in memory; browser storage unavailable."} ${blocking} blocking findings, ${warnings} warnings.${changedText}`;
  renderBridgeState();
  updateTransferSurface();
}

function resetPreviewState(message = "Ready") {
  renderGeneration += 1;
  revokeObjectUrls();
  session = undefined;
  presentation = undefined;
  layoutDecisions = [];
  visualAudit = undefined;
  preview = undefined;
  currentIndex = 0;
  findings = [];
  currentDiagnostics = [];
  currentExportStatus = "not-run";
  transfers = [];
  missingAssetCount = 0;
  lastTransferError = undefined;
  transferInput.value = "";
  transferError.textContent = "";
  deckTitle.textContent = "PPTKit Preview";
  deckMeta.textContent = "";
  downloadButton.disabled = true;
  renderThumbnails();
  showCurrentSlide();
  showFindings([]);
  setFindingsOpen(false);
  setTransferOpen(false);
  setStatus(message);
  renderTransferProgress();
}

async function loadCurrentRoute() {
  const generation = ++routeGeneration;
  const targetSessionId = routeSessionId();
  resetPreviewState();
  if (!targetSessionId) return;
  const [stored, storedTransfers] = await Promise.all([
    loadSession(targetSessionId),
    listTransfers(targetSessionId),
  ]);
  if (generation !== routeGeneration) return;
  transfers = storedTransfers.map(storedTransferProgress);
  renderTransferProgress();
  if (!stored) {
    setStatus(transfers.length > 0 ? "Waiting for the remaining presentation data…" : "Presentation not found in this browser.", transfers.length > 0 ? "busy" : "neutral");
    return;
  }
  session = stored;
  await renderSession(stored);
}

function download(bytes: Uint8Array, mimeType: string, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function generateAndDownload() {
    if (!session || !presentation || !visualAudit || findings.some((item) => item.severity === "error")) return;
  downloadButton.disabled = true;
  setStatus("Generating and inspecting PPTX in this browser…", "busy");
  try {
    const result = await generatePptx(presentation);
    const packageChecks = inspectPptxPackage(result.bytes);
    let restyleAudit;
    try {
      restyleAudit = auditRestyleTransformation(session.deck, session.sources, session.assets, analyzePptxEvidence(result.bytes));
    } catch (error) {
      const fallback = auditRestyleTransformation(session.deck, session.sources, session.assets);
      const issue: StructuralIssue = { severity: "warning", code: "restyle-output-analysis-failed", message: `The generated PPTX could not be structurally compared with its source: ${error instanceof Error ? error.message : String(error)}` };
      restyleAudit = { ...fallback, issues: [...fallback.issues, issue] };
    }
    const exportIssues: StructuralIssue[] = result.warnings.map((warning) => ({ severity: "error", code: `export-${warning.code}`, message: warning.message, ...(warning.slideId ? { slideId: warning.slideId } : {}) }));
    if (!packageChecks.valid) exportIssues.push(...packageChecks.issues.map((message) => ({ severity: "error" as const, code: "invalid-package", message })));
    if (packageChecks.slideParts !== presentation.slides.length) exportIssues.push({ severity: "error", code: "slide-part-count", message: `Expected ${presentation.slides.length} slide parts, found ${packageChecks.slideParts}.` });
    findings = [...findings, ...restyleAudit.issues, ...exportIssues];
    showFindings(findings);
    const report: BuildReport = {
      runtime: "browser", sessionId: session.id, slideCount: result.slideCount, byteLength: result.byteLength,
      diagnostics: currentDiagnostics, exportWarnings: result.warnings, structuralIssues: findings, layoutDecisions, packageChecks,
      visualAudit,
      previewStatus: preview?.status ?? "failed", exportStatus: exportIssues.some((issue) => issue.severity === "error") ? "failed" : restyleAudit.issues.length > 0 ? "generated-with-warnings" : "generated",
      renderStatus: "not-run", restyleAudit, generatedAt: new Date().toISOString(),
    };
    currentExportStatus = report.exportStatus;
    download(new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`), "application/json", "build-report.json");
    if (report.exportStatus === "generated" || report.exportStatus === "generated-with-warnings") {
      download(result.bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation", `${session.id}.pptx`);
      setStatus(`Generated ${result.slideCount} slides (${result.byteLength} bytes) and passed package inspection${report.exportStatus === "generated-with-warnings" ? " with restyle warnings" : ""}.`, "success");
    } else {
      setStatus("PPTX failed package inspection. The build report was downloaded; the PPTX was withheld.", "error");
      setFindingsOpen(true);
    }
  } catch (error) {
    currentExportStatus = "failed";
    setStatus(`PPTX generation failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    downloadButton.disabled = findings.some((item) => item.severity === "error");
  }
}

transferToggle.addEventListener("click", () => {
  const open = transferToggle.getAttribute("aria-expanded") !== "true";
  closeTransientSurfaces("transfer");
  setTransferOpen(open);
  if (open) transferInput.focus();
});
transferClose.addEventListener("click", () => setTransferOpen(false));
findingsToggle.addEventListener("click", () => {
  const open = findingsToggle.getAttribute("aria-expanded") !== "true";
  closeTransientSurfaces("findings");
  setFindingsOpen(open);
});
findingsClose.addEventListener("click", () => setFindingsOpen(false));
filmstripToggle.addEventListener("click", () => setFilmstripPinned(filmstrip.dataset.pinned !== "true"));
filmstrip.addEventListener("pointerleave", () => delete filmstrip.dataset.suppressHover);

transferButton.addEventListener("click", async () => {
  transferError.textContent = "";
  try {
    const candidate = JSON.parse(transferInput.value) as { transferId?: unknown };
    if (typeof candidate.transferId === "string") {
      const retained = transfers.filter((item) => item.transferId !== candidate.transferId || item.status !== "failed");
      if (retained.length !== transfers.length) {
        transfers = retained;
        renderTransferProgress();
      }
    }
  } catch {
    // The transfer parser reports malformed JSON with the full validation context below.
  }
  transferButton.disabled = true;
  transferPanel.setAttribute("aria-busy", "true");
  setStatus("Processing transfer…", "busy");
  try {
    lastTransferError = undefined;
    renderBridgeState();
    const result = await receiveTransferChunk(transferInput.value, session);
    if (result.kind === "session") {
      if (session && session.id !== result.payloadId) resetPreviewState("Receiving a new presentation…");
      replaceRouteSessionId(result.payloadId);
    }
    recordTransfer(result);
    transferInput.value = "";
    if (result.session) {
      const changed = changedSlides(session, result.session);
      session = result.session;
      replaceRouteSessionId(session.id);
      await renderSession(session, changed);
    } else if (result.completedAssetId && session) {
      await renderSession(session);
      setStatus(`Asset ${result.completedAssetId} completed and the preview was refreshed.`, "success");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastTransferError = message;
    if (error instanceof TransferReceiveError) {
      if (error.progress.kind === "session") replaceRouteSessionId(error.progress.payloadId);
      recordTransfer(error.progress);
    }
    transferError.textContent = message;
    if (error instanceof SessionValidationError) transfers = transfers.filter((item) => item.status !== "failed");
    setStatus("Couldn’t load the presentation.", "error");
    await refreshStoredTransfers().catch(() => undefined);
    setTransferOpen(true);
  } finally {
    transferButton.disabled = false;
    transferPanel.removeAttribute("aria-busy");
    updateTransferSurface();
  }
});

clearCurrentButton.addEventListener("click", async () => {
  const targetSessionId = routeSessionId() || session?.id;
  if (!targetSessionId) return;
  clearCurrentButton.disabled = true;
  try {
    await deleteSessionData(targetSessionId);
    replaceRouteSessionId();
    resetPreviewState("Local presentation data deleted.");
  } catch (error) {
    setStatus(`Couldn’t delete local presentation data: ${error instanceof Error ? error.message : String(error)}`, "error");
    updateTransferSurface();
  }
});

clearAllButton.addEventListener("click", async () => {
  if (!window.confirm("Clear every PPTKit presentation and asset saved in this browser? Downloaded files will not be affected.")) return;
  clearAllButton.disabled = true;
  try {
    await clearAllPreviewData();
    replaceRouteSessionId();
    resetPreviewState("All local preview data deleted.");
  } catch (error) {
    setStatus(`Couldn’t clear local preview data: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    clearAllButton.disabled = false;
  }
});

previousButton.addEventListener("click", () => selectSlide(currentIndex - 1));
nextButton.addEventListener("click", () => selectSlide(currentIndex + 1));
downloadButton.addEventListener("click", () => void generateAndDownload());

document.addEventListener("click", (event) => {
  const target = event.target as Node;
  if (!transferShell.contains(target)) setTransferOpen(false);
  if (!findingsShell.contains(target)) setFindingsOpen(false);
  if (!filmstrip.contains(target) && matchMedia("(max-width: 980px)").matches) setFilmstripPinned(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTransientSurfaces();
    setFilmstripPinned(false);
    return;
  }
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (event.key === "ArrowLeft") selectSlide(currentIndex - 1);
  if (event.key === "ArrowRight") selectSlide(currentIndex + 1);
  if (event.key === "Home") selectSlide(0);
  if (event.key === "End") selectSlide((preview?.slides.length ?? 1) - 1);
});

async function initialize() {
  await pruneExpiredStorage();
  await loadCurrentRoute();
}

void initialize().catch(() => {
  persisted = false;
  setStatus("Browser storage is unavailable. The presentation will stay in memory.", "error");
  updateTransferSurface();
});

window.addEventListener("hashchange", () => {
  void loadCurrentRoute().catch(() => {
    persisted = false;
    setStatus("Browser storage is unavailable. The presentation will stay in memory.", "error");
  });
});

window.addEventListener("beforeunload", revokeObjectUrls);

Object.defineProperty(globalThis, "__pptkitPreviewBridge", {
  configurable: false,
  enumerable: true,
  writable: false,
  value: Object.freeze({
    protocol: PPTKIT_TRANSFER_PROTOCOL,
    maxChunkBytes: MAX_TRANSFER_CHUNK_BYTES,
    getState: () => bridgeState().state,
  }),
});

Object.defineProperty(globalThis, "__pptkitPreviewState", {
  get: () => ({ sessionId: session?.id, slideCount: preview?.slides.length ?? 0, findings, exportStatus: currentExportStatus, packageStatus: currentExportStatus === "not-run" ? NOT_RUN_PACKAGE_CHECK.status : "checked", transfers }),
});

renderBridgeState();
updateTransferSurface();
