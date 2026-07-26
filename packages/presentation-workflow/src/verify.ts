import {
  normalizePresentation,
  type NormalizedElement,
  type NormalizedPresentation,
  type PresentationDocument,
} from "@pptkit/core";
import { unzipSync } from "fflate";

import type { PackageCheck, StructuralIssue } from "./contracts.js";

function visitElements(elements: NormalizedElement[], visit: (element: NormalizedElement) => void) {
  for (const element of elements) {
    visit(element);
    if (element.type === "group") visitElements(element.children, visit);
  }
}

function overlapArea(a: NormalizedElement["box"], b: NormalizedElement["box"]) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

export function inspectStructure(input: PresentationDocument | NormalizedPresentation): StructuralIssue[] {
  const document = "irVersion" in input ? input : normalizePresentation(input);
  const issues: StructuralIssue[] = [];
  for (const slide of document.slides) {
    const visible: NormalizedElement[] = [];
    const content: NormalizedElement[] = [];
    visitElements(slide.elements, (element) => {
      if (element.hidden) return;
      const { x, y, width, height } = element.box;
      if (x < -0.01 || y < -0.01 || x + width > document.size.width + 0.01 || y + height > document.size.height + 0.01) {
        issues.push({ severity: "error", code: "out-of-bounds", message: `Element ${element.name} exceeds the ${document.size.width}×${document.size.height} slide.`, slideId: slide.id, elementId: element.id });
      }
      if (element.type !== "connector" && !element.accessibility.decorative) visible.push(element);
      if (element.type !== "connector" && !element.accessibility.decorative && !element.name.startsWith("Metadata") && element.name !== "Slide title") content.push(element);
    });
    for (let left = 0; left < visible.length; left += 1) {
      for (let right = left + 1; right < visible.length; right += 1) {
        const a = visible[left]!;
        const b = visible[right]!;
        const overlap = overlapArea(a.box, b.box);
        const smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height);
        if (smaller > 0 && overlap / smaller > 0.35) {
          issues.push({ severity: "error", code: "high-overlap", message: `${a.name} substantially overlaps ${b.name}; adjust the layout and inspect the rendered slide.`, slideId: slide.id, elementId: b.id });
        }
      }
    }
    if (content.length >= 1) {
      const left = Math.min(...content.map((element) => element.box.x));
      const top = Math.min(...content.map((element) => element.box.y));
      const right = Math.max(...content.map((element) => element.box.x + element.box.width));
      const bottom = Math.max(...content.map((element) => element.box.y + element.box.height));
      const occupancy = ((right - left) * (bottom - top)) / (document.size.width * document.size.height);
      if (occupancy < 0.12) {
        issues.push({ severity: "warning", code: "content-island", message: "Visible content occupies a small isolated region; inspect the rendered slide before accepting the whitespace.", slideId: slide.id });
      }
    }
  }
  return issues;
}

export function inspectPptxPackage(bytes: Uint8Array): PackageCheck {
  const issues: string[] = [];
  try {
    const files = unzipSync(bytes);
    const names = Object.keys(files);
    for (const required of ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"]) {
      if (!names.includes(required)) issues.push(`Missing required package part: ${required}`);
    }
    const slideParts = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    for (const name of names.filter((entry) => entry.endsWith(".xml") || entry.endsWith(".rels"))) {
      const text = new TextDecoder().decode(files[name]);
      if (!text.includes("<") || !text.includes(">")) issues.push(`Malformed XML-shaped part: ${name}`);
    }
    return { status: "checked", valid: issues.length === 0, parts: names.length, slideParts: slideParts.length, issues };
  } catch (error) {
    issues.push(`PPTX package could not be opened: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "checked", valid: false, parts: 0, slideParts: 0, issues };
  }
}

export const NOT_RUN_PACKAGE_CHECK: PackageCheck = {
  status: "not-run", valid: false, parts: 0, slideParts: 0, issues: [],
};
