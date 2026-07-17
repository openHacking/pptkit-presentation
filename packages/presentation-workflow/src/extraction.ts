import type { ExtractedSource, PptxEvidence, SourceInput } from "./contracts.js";

export interface SourceParserResult {
  content?: string;
  pptx?: PptxEvidence;
  sheets?: Array<{ name: string; rows: unknown[][] }>;
  width?: number;
  height?: number;
  warnings?: string[];
}

export type SourceParser = (input: SourceInput) => Promise<SourceParserResult>;

export interface SourceParsers {
  pdf?: SourceParser;
  docx?: SourceParser;
  workbook?: SourceParser;
  image?: SourceParser;
  pptx?: SourceParser;
}

export function measureImageDimensions(input: SourceInput): { width?: number; height?: number } {
  const bytes = input.bytes;
  if (input.mimeType === "image/png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (input.mimeType === "image/gif" && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (input.mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) {
        return { height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
      }
      offset += Math.max(2, length + 2);
    }
  }
  if (input.mimeType === "image/svg+xml") {
    const text = new TextDecoder().decode(bytes);
    const viewBox = text.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)["']/i);
    const width = text.match(/\bwidth=["']([\d.]+)(?:px)?["']/i);
    const height = text.match(/\bheight=["']([\d.]+)(?:px)?["']/i);
    const measuredWidth = Number(width?.[1] ?? viewBox?.[1]);
    const measuredHeight = Number(height?.[1] ?? viewBox?.[2]);
    return { ...(measuredWidth ? { width: measuredWidth } : {}), ...(measuredHeight ? { height: measuredHeight } : {}) };
  }
  return {};
}

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

export function sourceId(name: string, index: number) {
  const extension = extensionOf(name);
  const stem = name.slice(0, extension ? -extension.length : undefined).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "source";
  return `src-${String(index + 1).padStart(2, "0")}-${stem}`;
}

export async function extractSource(input: SourceInput, index: number, parsers: SourceParsers = {}): Promise<ExtractedSource> {
  const extension = extensionOf(input.name);
  const base = { id: sourceId(input.name, index), name: input.name, mimeType: input.mimeType, warnings: [] as string[] };
  if ([".md", ".markdown", ".txt"].includes(extension) || input.mimeType.startsWith("text/")) {
    return { ...base, type: "text", content: new TextDecoder().decode(input.bytes) };
  }
  const parser = extension === ".pdf"
    ? parsers.pdf
    : extension === ".docx"
      ? parsers.docx
      : extension === ".pptx"
        ? parsers.pptx
      : [".csv", ".xlsx", ".xls"].includes(extension)
        ? parsers.workbook
        : [".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(extension)
          ? parsers.image
          : undefined;
  if (!parser) return { ...base, type: "document", warnings: [`Unsupported source type: ${extension || input.mimeType || "unknown"}`] };
  try {
    const result = await parser(input);
    if ([".csv", ".xlsx", ".xls"].includes(extension)) return { ...base, type: "table", ...(result.sheets ? { sheets: result.sheets } : {}), warnings: result.warnings ?? [] };
    if ([".png", ".jpg", ".jpeg", ".gif", ".svg"].includes(extension)) return {
      ...base, type: "image", assetId: `${base.id}${extension}`,
      ...(result.width === undefined ? {} : { width: result.width }),
      ...(result.height === undefined ? {} : { height: result.height }),
      warnings: result.warnings ?? [],
    };
    return {
      ...base,
      type: "document",
      ...(result.content === undefined ? {} : { content: result.content }),
      ...(result.pptx === undefined ? {} : { pptx: result.pptx }),
      warnings: result.warnings ?? [],
    };
  } catch (error) {
    return { ...base, type: "document", warnings: [`Extraction failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export async function extractSources(inputs: SourceInput[], parsers: SourceParsers = {}) {
  return Promise.all(inputs.map((input, index) => extractSource(input, index, parsers)));
}

export async function blobToSourceInput(file: Blob & { name?: string }): Promise<SourceInput> {
  return {
    name: file.name ?? "source",
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}
