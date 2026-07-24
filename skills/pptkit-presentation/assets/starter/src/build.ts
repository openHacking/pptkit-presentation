import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizePresentation, validatePresentation } from "@pptkit/core";
import { generatePptx } from "@pptkit/pptx-exporter/node";
import { analyzePptxEvidence, auditRestyleTransformation, auditVisualRhythm, authorDeck, inspectPptxPackage, inspectStructure, validateDeckSpec } from "presentation-workflow";

import type { BuildReport, ExtractedSource, SessionAsset, StructuralIssue } from "./contracts.js";
import { deckSpec } from "./deck-spec.js";
import { mimeTypeForAsset, resolveNodeAsset } from "./runtime/node-assets.js";

const outputDir = path.resolve("output");
const output = path.join(outputDir, "deck.pptx");
const reportPath = path.join(outputDir, "build-report.json");

await mkdir(outputDir, { recursive: true });

async function readCollection<T>(file: string, key: string): Promise<T[]> {
  try {
    const payload = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    return Array.isArray(payload[key]) ? payload[key] as T[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

const sources = await readCollection<ExtractedSource>(path.resolve("content/sources.json"), "sources");
const assets = await readCollection<SessionAsset>(path.resolve("content/assets.json"), "assets");
const availableAssetIds = new Set(await readdir(path.resolve("assets")));
const specIssues = validateDeckSpec(deckSpec, availableAssetIds);
const { presentation: document, layoutDecisions } = authorDeck(deckSpec, (assetId) => resolveNodeAsset(assetId, mimeTypeForAsset(assetId)));
const visualAudit = auditVisualRhythm(deckSpec, normalizePresentation(document), layoutDecisions);
const diagnostics = validatePresentation(document);
const diagnosticIssues: StructuralIssue[] = diagnostics
  .filter((item) => item.severity === "error")
  .map((item) => ({ severity: "error", code: item.code, message: item.message, slideId: item.slideId, elementId: item.elementId }));
const structuralIssues = diagnostics.some((item) => item.severity === "error")
  ? [...specIssues, ...diagnosticIssues]
  : [...specIssues, ...inspectStructure(normalizePresentation(document)), ...visualAudit.issues];

let report: BuildReport = {
  runtime: "node",
  output,
  slideCount: document.slides.length,
  byteLength: 0,
  diagnostics: diagnostics.map(({ severity, code, message, path: diagnosticPath }) => ({ severity, code, message, path: diagnosticPath })),
  exportWarnings: [],
  structuralIssues,
  layoutDecisions,
  visualAudit,
  packageChecks: { status: "not-run", valid: false, parts: 0, slideParts: 0, issues: [] },
  previewStatus: "not-run",
  exportStatus: "not-run",
  renderStatus: "not-run",
  generatedAt: new Date().toISOString(),
};

if (structuralIssues.some((issue) => issue.severity === "error")) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  throw new Error(`Deck failed pre-export checks. See ${reportPath}`);
}

const result = await generatePptx(document);
await writeFile(output, result.bytes);
const packageChecks = inspectPptxPackage(result.bytes);
let restyleAudit;
try {
  restyleAudit = auditRestyleTransformation(deckSpec, sources, assets, analyzePptxEvidence(result.bytes));
} catch (error) {
  const fallback = auditRestyleTransformation(deckSpec, sources, assets);
  const issue: StructuralIssue = { severity: "warning", code: "restyle-output-analysis-failed", message: `The generated PPTX could not be structurally compared with its source: ${error instanceof Error ? error.message : String(error)}` };
  restyleAudit = { ...fallback, issues: [...fallback.issues, issue] };
}
const exportIssues: StructuralIssue[] = result.warnings.map((warning) => ({ severity: "error", code: `export-${warning.code}`, message: warning.message, slideId: warning.slideId }));
if (!packageChecks.valid) exportIssues.push(...packageChecks.issues.map((message) => ({ severity: "error" as const, code: "invalid-package", message })));
if (packageChecks.slideParts !== document.slides.length) exportIssues.push({ severity: "error", code: "slide-part-count", message: `Expected ${document.slides.length} slide parts, found ${packageChecks.slideParts}.` });

report = {
  ...report,
  byteLength: result.byteLength,
  exportWarnings: result.warnings,
  structuralIssues: [...structuralIssues, ...restyleAudit.issues, ...exportIssues],
  packageChecks,
  exportStatus: exportIssues.some((issue) => issue.severity === "error") ? "failed" : restyleAudit.issues.length > 0 ? "generated-with-warnings" : "generated",
  restyleAudit,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ output, report: reportPath, slideCount: result.slideCount, warnings: result.warnings.length + restyleAudit.issues.length }, null, 2)}\n`);
if (report.structuralIssues.some((issue) => issue.severity === "error")) process.exitCode = 1;
