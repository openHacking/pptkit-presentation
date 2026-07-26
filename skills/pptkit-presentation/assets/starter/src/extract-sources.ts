import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { extractPptxEmbeddedAssets, extractSource, measureImageDimensions, type SessionAsset, type SourceParsers } from "presentation-workflow";
import { parsePptxSource } from "./pptx-source.js";

const inputs = process.argv.slice(2);
if (inputs.length === 0) throw new Error("Usage: npm run extract -- <source paths...>");
const FILE_CONCURRENCY = 4;
const PDF_PAGE_CONCURRENCY = 3;

await mkdir("content", { recursive: true });
await mkdir("assets", { recursive: true });

const parsers: SourceParsers = {
  async pdf(input) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: input.bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const pages = await mapWithConcurrency(
      Array.from({ length: pdf.numPages }, (_, index) => index + 1),
      PDF_PAGE_CONCURRENCY,
      async (pageNumber) => {
        const page = await pdf.getPage(pageNumber);
        const text = await page.getTextContent();
        return text.items.map((item) => "str" in item ? item.str : "").join(" ");
      },
    );
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

const results = await mapWithConcurrency(inputs, FILE_CONCURRENCY, async (input, index) => {
  const file = path.resolve(inputs[index]!);
  try {
    const bytes = new Uint8Array(await readFile(file));
    const source = await extractSource({ name: path.basename(file), mimeType: mimeTypeFor(file), bytes }, index, parsers);
    const sourceAssets: SessionAsset[] = [];
    if (source.type === "image" && source.assetId) {
      await copyFile(file, path.resolve("assets", source.assetId));
      sourceAssets.push({
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
        sourceAssets.push({
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
    return { source, assets: sourceAssets, failed: source.warnings.some((warning) => warning.startsWith("Extraction failed:")) };
  } catch (error) {
    return {
      source: { id: `src-${String(index + 1).padStart(2, "0")}-source`, name: path.basename(file), mimeType: mimeTypeFor(file), type: "document" as const, warnings: [`Extraction failed: ${error instanceof Error ? error.message : String(error)}`] },
      assets: [],
      failed: true,
    };
  }
});

const sources = results.map((result) => result.source);
const assets = results.flatMap((result) => result.assets);
const failures = results.filter((result) => result.failed).length;

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

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  }));
  return results;
}
