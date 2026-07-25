import {
  normalizePresentation,
  type NormalizedElement,
  type NormalizedPresentation,
  type PresentationDocument,
} from "@pptkit/core";

import type {
  DeckSpec,
  LayoutDecision,
  StructuralIssue,
  VisualAudit,
  VisualSlideAudit,
} from "./contracts.js";

function visitElements(elements: readonly NormalizedElement[], visit: (element: NormalizedElement) => void) {
  for (const element of elements) {
    visit(element);
    if (element.type === "group") visitElements(element.children, visit);
  }
}

function clippedArea(element: NormalizedElement, width: number, height: number) {
  const left = Math.max(0, element.box.x);
  const top = Math.max(0, element.box.y);
  const right = Math.min(width, element.box.x + element.box.width);
  const bottom = Math.min(height, element.box.y + element.box.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function roundCoverage(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

export function auditVisualRhythm(
  spec: DeckSpec,
  input: PresentationDocument | NormalizedPresentation,
  decisions: readonly LayoutDecision[],
): VisualAudit {
  const document = "irVersion" in input ? input : normalizePresentation(input);
  const slideArea = document.size.width * document.size.height;
  const decisionBySlide = new Map(decisions.map((decision) => [decision.slideId, decision]));
  const planBySlide = new Map(spec.slides.map((slide) => [slide.id, slide]));
  const issues: StructuralIssue[] = [];
  const slideAudits: VisualSlideAudit[] = [];

  for (const slide of document.slides) {
    const decision = decisionBySlide.get(slide.id);
    if (!decision) continue;
    const plan = planBySlide.get(slide.id);
    let imageArea = 0;
    let colorFieldArea = 0;
    visitElements(slide.elements, (element) => {
      if (element.hidden) return;
      const area = clippedArea(element, document.size.width, document.size.height);
      if (element.type === "image") imageArea += area;
      if (element.type === "shape" && element.name === "Visual color field") colorFieldArea += area;
    });
    const imageCoverage = roundCoverage(imageArea / slideArea);
    const colorFieldCoverage = roundCoverage(colorFieldArea / slideArea);
    const isVisualAnchor = decision.visualWeight === "peak"
      || imageCoverage >= 0.45
      || colorFieldCoverage >= 0.35
      || (decision.visualIntent === "type-led" && decision.composition === "hero")
      || decision.visualIntent === "data-led";
    slideAudits.push({
      slideId: slide.id,
      visualIntent: decision.visualIntent,
      visualWeight: decision.visualWeight,
      imageCoverage,
      colorFieldCoverage,
      isVisualAnchor,
    });
    if (plan?.visualIntent === "image-led" && imageCoverage < 0.3) {
      issues.push({
        severity: "warning",
        code: "weak-image-led-slide",
        message: "The slide is image-led but imagery occupies less than 30% of the canvas; enlarge it or choose a content-led treatment.",
        slideId: slide.id,
      });
    }
    if (plan?.visualIntent === "color-led" && colorFieldCoverage < 0.3) {
      issues.push({
        severity: "warning",
        code: "weak-color-led-slide",
        message: "The slide is color-led but its deliberate color field occupies less than 30% of the canvas.",
        slideId: slide.id,
      });
    }
  }

  let maximumQuietRun = 0;
  let quietRun = 0;
  for (const slide of slideAudits) {
    const quiet = !slide.isVisualAnchor
      && slide.visualIntent === "content-led"
      && slide.imageCoverage < 0.2
      && slide.colorFieldCoverage < 0.2;
    quietRun = quiet ? quietRun + 1 : 0;
    maximumQuietRun = Math.max(maximumQuietRun, quietRun);
  }
  if (maximumQuietRun >= 4) {
    issues.push({
      severity: "warning",
      code: "flat-visual-run",
      message: `${maximumQuietRun} consecutive slides use low-intensity content-led treatments; introduce a content-appropriate visual transition or anchor.`,
    });
  }

  const visualAnchorSlideIds = slideAudits.filter((slide) => slide.isVisualAnchor).map((slide) => slide.slideId);
  const expectedAnchors = spec.slides.length >= 8 ? 2 : 0;
  if (visualAnchorSlideIds.length < expectedAnchors) {
    issues.push({
      severity: "warning",
      code: "low-visual-anchor-count",
      message: `This ${spec.slides.length}-slide deck has ${visualAnchorSlideIds.length} strong visual anchor${visualAnchorSlideIds.length === 1 ? "" : "s"}; plan at least ${expectedAnchors} content-appropriate anchors.`,
    });
  }

  const referencedImages = spec.slides.filter((slide) => slide.image);
  if (referencedImages.length > 0 && Math.max(...slideAudits.map((slide) => slide.imageCoverage), 0) < 0.25) {
    issues.push({
      severity: "warning",
      code: "underused-imagery",
      message: "The deck references image assets, but no image occupies at least 25% of a slide.",
    });
  }

  return {
    status: "checked",
    slideAudits,
    visualAnchorSlideIds,
    maximumQuietRun,
    issues,
  };
}
