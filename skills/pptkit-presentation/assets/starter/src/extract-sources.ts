import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { extractPptxEmbeddedAssets, extractSource, measureImageDimensions, type SessionAsset, type SourceParsers } from "presentation-workflow";
import { parsePptxSource } from "./pptx-source.js";

const inputs = process.argv.slice(2);
if (inputs.length === 0) throw new Error("Usage: npm run extract -- <source paths...>");

await mkdir("content", { recursive: true });
await mkdir("assets", { recursive: true });

const parsers: SourceParsers = {
  async pdf(input) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: input.bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push(text.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return { content: pages.join("\n\n") };
  },
  async docx(input) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
    return { content: result.value, warnings: result.messages.map((message) => message.message) };
  },
  async workbook(input) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(input.bytes, { type: "array" });
    return { sheets: workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name]!, { header: 1, raw: false }) as unknown[][] })) };
  },
  async image(input) {
    return measureImageDimensions(input);
  },
  pptx: parsePptxSource,
};

const sources = [];
const assets: SessionAsset[] = [];
let failures = 0;
for (let index = 0; index < inputs.length; index += 1) {
  const file = path.resolve(inputs[index]!);
  try {
    const bytes = new Uint8Array(await readFile(file));
    const source = await extractSource({ name: path.basename(file), mimeType: mimeTypeFor(file), bytes }, index, parsers);
    if (source.type === "image" && source.assetId) {
      await copyFile(file, path.resolve("assets", source.assetId));
      assets.push({
        id: source.assetId,
        name: path.basename(file),
        mimeType: source.mimeType,
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...(source.width === undefined ? {} : { width: source.width }),
        ...(source.height === undefined ? {} : { height: source.height }),
        origin: { kind: "user" },
      });
    }
    if (source.pptx) {
      for (const embedded of extractPptxEmbeddedAssets(bytes, source.pptx)) {
        const assetId = `${source.id}-${embedded.name}`;
        await writeFile(path.resolve("assets", assetId), embedded.bytes);
        assets.push({
          id: assetId,
          name: embedded.name,
          mimeType: embedded.mimeType,
          byteLength: embedded.bytes.byteLength,
          sha256: createHash("sha256").update(embedded.bytes).digest("hex"),
          ...(embedded.width === undefined ? {} : { width: embedded.width }),
          ...(embedded.height === undefined ? {} : { height: embedded.height }),
          origin: { kind: "source-embedded", sourceId: source.id, slideNumbers: embedded.slideNumbers, partName: embedded.partName },
        });
      }
    }
    if (source.warnings.some((warning) => warning.startsWith("Extraction failed:"))) failures += 1;
    sources.push(source);
  } catch (error) {
    failures += 1;
    sources.push({ id: `src-${String(index + 1).padStart(2, "0")}-source`, name: path.basename(file), mimeType: mimeTypeFor(file), type: "document" as const, warnings: [`Extraction failed: ${error instanceof Error ? error.message : String(error)}`] });
  }
}

await writeFile("content/sources.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), sources }, null, 2)}\n`);
await writeFile("content/assets.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ sources: sources.length, assets: assets.length, failures, output: path.resolve("content/sources.json") }, null, 2)}\n`);
if (failures > 0) process.exitCode = 1;

function mimeTypeFor(file: string) {
  const extension = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".md": "text/markdown", ".markdown": "text/markdown", ".txt": "text/plain", ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xls": "application/vnd.ms-excel",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return types[extension] ?? "application/octet-stream";
}
