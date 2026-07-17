import { DOMParser, type Document, type Element, type Node } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

import type {
  PptxEvidence,
  PptxEmbeddedAsset,
  SourceBox,
  SourceDiagramEvidence,
  SourceShapeEvidence,
  SourceSlideEvidence,
  SourceTableEvidence,
  SourceTextBlock,
} from "./contracts.js";
import { measureImageDimensions } from "./extraction.js";

const EMU_PER_INCH = 914400;

interface Relationship {
  id: string;
  target: string;
  type: string;
}

interface Transform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

const IDENTITY: Transform = { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };

function parseXml(bytes: Uint8Array | undefined, partName: string): Document {
  if (!bytes) throw new Error(`Missing PPTX part: ${partName}`);
  const issues: string[] = [];
  const document = new DOMParser({ onError: (level, message) => issues.push(`${level}: ${message}`) }).parseFromString(new TextDecoder().decode(bytes), "application/xml");
  if (issues.some((issue) => issue.startsWith("error:") || issue.startsWith("fatalError:"))) {
    throw new Error(`Malformed XML in ${partName}: ${issues.join("; ")}`);
  }
  return document;
}

function childElements(node: Node): Element[] {
  const result: Element[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) result.push(child as Element);
  }
  return result;
}

function descendants(node: Node, localName: string): Element[] {
  return Array.from((node as Element | Document).getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function firstDescendant(node: Node, localName: string): Element | undefined {
  return descendants(node, localName)[0];
}

function attr(element: Element | undefined, localName: string): string | undefined {
  if (!element) return undefined;
  for (let index = 0; index < element.attributes.length; index += 1) {
    const candidate = element.attributes.item(index);
    if (candidate?.localName === localName) return candidate.value;
  }
  return undefined;
}

function relationshipAttr(element: Element | undefined, localName: string): string | undefined {
  if (!element) return undefined;
  for (let index = 0; index < element.attributes.length; index += 1) {
    const candidate = element.attributes.item(index);
    if (candidate?.localName === localName && (candidate.prefix === "r" || candidate.namespaceURI?.includes("officeDocument/2006/relationships"))) return candidate.value;
  }
  return undefined;
}

function textOf(node: Node): string {
  return descendants(node, "t").map((element) => element.textContent ?? "").join("").trim();
}

function paragraphsOf(node: Node): string {
  const paragraphs = descendants(node, "p").map(textOf).filter(Boolean);
  return paragraphs.join("\n").trim();
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function directChild(node: Node, localName: string): Element | undefined {
  return childElements(node).find((element) => element.localName === localName);
}

function xfrmValues(container: Node): { x: number; y: number; width: number; height: number; childX?: number; childY?: number; childWidth?: number; childHeight?: number } | undefined {
  const xfrm = directChild(container, "xfrm") ?? firstDescendant(container, "xfrm");
  if (!xfrm) return undefined;
  const off = directChild(xfrm, "off");
  const ext = directChild(xfrm, "ext");
  const x = toNumber(attr(off, "x"));
  const y = toNumber(attr(off, "y"));
  const width = toNumber(attr(ext, "cx"));
  const height = toNumber(attr(ext, "cy"));
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  const childOff = directChild(xfrm, "chOff");
  const childExt = directChild(xfrm, "chExt");
  const childX = toNumber(attr(childOff, "x"));
  const childY = toNumber(attr(childOff, "y"));
  const childWidth = toNumber(attr(childExt, "cx"));
  const childHeight = toNumber(attr(childExt, "cy"));
  return {
    x, y, width, height,
    ...(childX === undefined ? {} : { childX }),
    ...(childY === undefined ? {} : { childY }),
    ...(childWidth === undefined ? {} : { childWidth }),
    ...(childHeight === undefined ? {} : { childHeight }),
  };
}

function mapBox(raw: { x: number; y: number; width: number; height: number } | undefined, transform: Transform): SourceBox | undefined {
  if (!raw) return undefined;
  return {
    x: (transform.translateX + raw.x * transform.scaleX) / EMU_PER_INCH,
    y: (transform.translateY + raw.y * transform.scaleY) / EMU_PER_INCH,
    width: raw.width * transform.scaleX / EMU_PER_INCH,
    height: raw.height * transform.scaleY / EMU_PER_INCH,
  };
}

function groupTransform(raw: ReturnType<typeof xfrmValues>, parent: Transform): Transform {
  if (!raw) return parent;
  const childWidth = raw.childWidth && raw.childWidth !== 0 ? raw.childWidth : raw.width;
  const childHeight = raw.childHeight && raw.childHeight !== 0 ? raw.childHeight : raw.height;
  const scaleX = raw.width / childWidth;
  const scaleY = raw.height / childHeight;
  return {
    scaleX: parent.scaleX * scaleX,
    scaleY: parent.scaleY * scaleY,
    translateX: parent.translateX + parent.scaleX * (raw.x - (raw.childX ?? 0) * scaleX),
    translateY: parent.translateY + parent.scaleY * (raw.y - (raw.childY ?? 0) * scaleY),
  };
}

function partDirectory(partName: string): string {
  return partName.slice(0, partName.lastIndexOf("/") + 1);
}

function normalizePart(path: string): string {
  const result: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop();
    else result.push(segment);
  }
  return result.join("/");
}

function resolveTarget(partName: string, target: string): string {
  return normalizePart(`${partDirectory(partName)}${target}`);
}

function relationshipsPart(partName: string): string {
  const slash = partName.lastIndexOf("/");
  return `${partName.slice(0, slash + 1)}_rels/${partName.slice(slash + 1)}.rels`;
}

function parseRelationships(files: Record<string, Uint8Array>, ownerPart: string): Map<string, Relationship> {
  const relsName = relationshipsPart(ownerPart);
  if (!files[relsName]) return new Map();
  const document = parseXml(files[relsName], relsName);
  return new Map(descendants(document, "Relationship").map((element) => {
    const id = attr(element, "Id") ?? "";
    return [id, { id, target: resolveTarget(ownerPart, attr(element, "Target") ?? ""), type: attr(element, "Type") ?? "" }];
  }));
}

function objectId(element: Element, fallback: string): string {
  const property = firstDescendant(element, "cNvPr");
  return attr(property, "id") ?? fallback;
}

function objectName(element: Element): string | undefined {
  return attr(firstDescendant(element, "cNvPr"), "name");
}

function shapeBox(element: Element, transform: Transform): SourceBox | undefined {
  const properties = childElements(element).find((child) => ["spPr", "grpSpPr", "xfrm"].includes(child.localName ?? ""));
  return mapBox(xfrmValues(properties ?? element), transform);
}

function textFormatting(element: Element): { fontSize?: number; bold?: boolean } {
  const runs = [...descendants(element, "rPr"), ...descendants(element, "defRPr"), ...descendants(element, "endParaRPr")];
  const sizes = runs.map((run) => toNumber(attr(run, "sz"))).filter((size): size is number => size !== undefined);
  return {
    ...(sizes.length > 0 ? { fontSize: Math.max(...sizes) / 100 } : {}),
    ...(runs.some((run) => attr(run, "b") === "1" || attr(run, "b") === "true") ? { bold: true } : {}),
  };
}

function evidenceForSlide(files: Record<string, Uint8Array>, partName: string, slideNumber: number): SourceSlideEvidence {
  const document = parseXml(files[partName], partName);
  const relationships = parseRelationships(files, partName);
  const shapes: SourceShapeEvidence[] = [];
  const textBlocks: SourceTextBlock[] = [];
  const tables: SourceTableEvidence[] = [];
  const diagrams: SourceDiagramEvidence[] = [];
  const warnings: string[] = [];
  let sequence = 0;

  function addShape(element: Element, kind: SourceShapeEvidence["kind"], transform: Transform, groupPath: string[], relationshipTarget?: string) {
    sequence += 1;
    const id = objectId(element, `${kind}-${sequence}`);
    const text = kind === "group" ? "" : paragraphsOf(element);
    const box = shapeBox(element, transform);
    const name = objectName(element);
    shapes.push({ id, kind, ...(name ? { name } : {}), ...(box ? { box } : {}), ...(text ? { text } : {}), groupPath, ...(relationshipTarget ? { relationshipTarget } : {}) });
    if (text) textBlocks.push({ id, text, ...(box ? { box } : {}), groupPath, ...textFormatting(element) });
    return id;
  }

  function parseGraphicFrame(element: Element, transform: Transform, groupPath: string[]) {
    const id = objectId(element, `frame-${sequence + 1}`);
    const box = shapeBox(element, transform);
    const table = firstDescendant(element, "tbl");
    if (table) {
      const rows = descendants(table, "tr").map((row) => childElements(row).filter((child) => child.localName === "tc").map(paragraphsOf));
      tables.push({ id, ...(box ? { box } : {}), rows, groupPath });
      addShape(element, "table", transform, groupPath);
      return;
    }
    const chart = firstDescendant(element, "chart");
    if (chart) {
      const relationship = relationships.get(relationshipAttr(chart, "id") ?? "");
      addShape(element, "chart", transform, groupPath, relationship?.target);
      return;
    }
    const relIds = firstDescendant(element, "relIds");
    if (relIds) {
      const dataRelationship = relationships.get(relationshipAttr(relIds, "dm") ?? "");
      const labels: string[] = [];
      const edges: Array<{ from: string; to: string }> = [];
      if (dataRelationship && files[dataRelationship.target]) {
        const diagramDocument = parseXml(files[dataRelationship.target], dataRelationship.target);
        for (const point of descendants(diagramDocument, "pt")) {
          const label = paragraphsOf(point);
          if (label) labels.push(label);
        }
        for (const connection of descendants(diagramDocument, "cxn")) {
          const from = attr(connection, "srcId");
          const to = attr(connection, "destId");
          if (from && to) edges.push({ from, to });
        }
      } else warnings.push(`Diagram ${id} has no readable data relationship.`);
      diagrams.push({ id, ...(box ? { box } : {}), labels, edges, groupPath });
      addShape(element, "diagram", transform, groupPath, dataRelationship?.target);
      return;
    }
    warnings.push(`Unsupported graphic frame ${id}.`);
  }

  function visit(container: Node, transform: Transform, groupPath: string[]) {
    for (const element of childElements(container)) {
      if (element.localName === "grpSp") {
        const id = objectId(element, `group-${sequence + 1}`);
        const name = objectName(element) ?? id;
        addShape(element, "group", transform, groupPath);
        const properties = directChild(element, "grpSpPr");
        visit(element, groupTransform(xfrmValues(properties ?? element), transform), [...groupPath, name]);
      } else if (element.localName === "sp") {
        addShape(element, "shape", transform, groupPath);
      } else if (element.localName === "cxnSp") {
        addShape(element, "connector", transform, groupPath);
      } else if (element.localName === "pic") {
        const blip = firstDescendant(element, "blip");
        const relationship = relationships.get(relationshipAttr(blip, "embed") ?? relationshipAttr(blip, "link") ?? "");
        addShape(element, "image", transform, groupPath, relationship?.target);
        if (!relationship) warnings.push(`Image ${objectId(element, "unknown")} has no readable relationship.`);
        else if (!mediaMimeType(relationship.target)) warnings.push(`Embedded image ${relationship.target} uses an unsupported asset type.`);
      } else if (element.localName === "graphicFrame") {
        parseGraphicFrame(element, transform, groupPath);
      } else if (["oleObj", "contentPart", "video", "audio"].includes(element.localName ?? "")) {
        warnings.push(`Unsupported slide element: ${element.localName}.`);
      }
    }
  }

  const shapeTree = firstDescendant(document, "spTree");
  if (shapeTree) visit(shapeTree, IDENTITY, []);
  else warnings.push("Slide has no shape tree.");

  const explicitTitle = descendants(document, "sp").find((shape) => {
    const placeholder = firstDescendant(shape, "ph");
    return ["title", "ctrTitle"].includes(attr(placeholder, "type") ?? "");
  });
  const fallbackTitle = [...textBlocks]
    .filter((block) => block.text.length <= 120)
    .sort((left, right) => (right.fontSize ?? 0) - (left.fontSize ?? 0) || (left.box?.y ?? 99) - (right.box?.y ?? 99))[0];
  const titleParts = fallbackTitle
    ? textBlocks.filter((block) => block !== fallbackTitle
      && block.text.length <= 80
      && (block.fontSize ?? 0) >= (fallbackTitle.fontSize ?? 0) * 0.65
      && Math.abs((block.box?.y ?? 99) - (fallbackTitle.box?.y ?? 0)) <= 0.8)
      .concat(fallbackTitle)
      .sort((left, right) => (left.box?.x ?? 0) - (right.box?.x ?? 0))
      .map((block) => block.text)
    : [];
  const title = explicitTitle ? paragraphsOf(explicitTitle) : titleParts.join("") || fallbackTitle?.text;

  const notesRelationship = [...relationships.values()].find((relationship) => relationship.type.endsWith("/notesSlide"));
  const notes = notesRelationship && files[notesRelationship.target]
    ? paragraphsOf(parseXml(files[notesRelationship.target], notesRelationship.target))
    : undefined;
  const text = textBlocks.map((block) => block.text).filter(Boolean).join("\n");
  return {
    slideNumber,
    partName,
    ...(title ? { title } : {}),
    text,
    textBlocks,
    shapes,
    tables,
    diagrams,
    ...(notes ? { notes } : {}),
    warnings,
  };
}

export function analyzePptxEvidence(bytes: Uint8Array): PptxEvidence {
  const files = unzipSync(bytes);
  const presentationPart = "ppt/presentation.xml";
  const presentation = parseXml(files[presentationPart], presentationPart);
  const relationships = parseRelationships(files, presentationPart);
  const slideParts = descendants(presentation, "sldId").map((slideId) => {
    const relationshipId = relationshipAttr(slideId, "id");
    return relationshipId ? relationships.get(relationshipId)?.target : undefined;
  }).filter((part): part is string => Boolean(part));
  if (slideParts.length === 0) throw new Error("PPTX presentation contains no ordered slide relationships.");
  const sizeElement = firstDescendant(presentation, "sldSz");
  const width = toNumber(attr(sizeElement, "cx"));
  const height = toNumber(attr(sizeElement, "cy"));
  return {
    slideCount: slideParts.length,
    ...(width !== undefined && height !== undefined ? { size: { width: width / EMU_PER_INCH, height: height / EMU_PER_INCH } } : {}),
    slides: slideParts.map((partName, index) => evidenceForSlide(files, partName, index + 1)),
  };
}

function mediaMimeType(partName: string): PptxEmbeddedAsset["mimeType"] | undefined {
  const extension = partName.slice(partName.lastIndexOf(".")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return undefined;
}

export function extractPptxEmbeddedAssets(bytes: Uint8Array, evidence: PptxEvidence = analyzePptxEvidence(bytes)): PptxEmbeddedAsset[] {
  const files = unzipSync(bytes);
  const slideNumbersByPart = new Map<string, Set<number>>();
  for (const slide of evidence.slides) {
    for (const image of slide.shapes.filter((shape) => shape.kind === "image" && shape.relationshipTarget)) {
      const partName = image.relationshipTarget!;
      const numbers = slideNumbersByPart.get(partName) ?? new Set<number>();
      numbers.add(slide.slideNumber);
      slideNumbersByPart.set(partName, numbers);
    }
  }
  return [...slideNumbersByPart.entries()].flatMap(([partName, slideNumbers]) => {
    const assetBytes = files[partName];
    const mimeType = mediaMimeType(partName);
    if (!assetBytes || !mimeType) return [];
    const name = partName.slice(partName.lastIndexOf("/") + 1);
    const dimensions = measureImageDimensions({ name, mimeType, bytes: assetBytes });
    return [{
      partName,
      name,
      mimeType,
      bytes: assetBytes,
      slideNumbers: [...slideNumbers].sort((left, right) => left - right),
      ...(dimensions.width === undefined ? {} : { width: dimensions.width }),
      ...(dimensions.height === undefined ? {} : { height: dimensions.height }),
    }];
  });
}
