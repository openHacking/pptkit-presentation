import type {
  Box,
  PresentationDocument,
  PresentationSlide,
  TextParagraphInput,
} from "@pptkit/core";

import type { AssetResolver, ImagePlan } from "../contracts.js";
import { getTypography, type ThemeTokens } from "../themes.js";

export function solid(color: string, opacity?: number) {
  return { type: "solid" as const, color, ...(opacity === undefined ? {} : { opacity }) };
}

export interface TextOptions {
  size?: number;
  color?: string;
  bold?: boolean;
  bullet?: boolean;
  align?: "left" | "center" | "right";
  font?: string;
  lineSpacing?: number;
  spaceAfter?: number;
  verticalAlign?: "top" | "middle" | "bottom";
  name?: string;
  autoFit?: "none" | "shrink";
}

export function paragraph(
  text: string,
  tokens: ThemeTokens,
  options: TextOptions = {},
): TextParagraphInput {
  const typography = getTypography(tokens.id);
  return {
    style: {
      align: options.align ?? "left",
      lineSpacing: options.lineSpacing ?? typography.bodyLineSpacing,
      spaceAfter: options.spaceAfter ?? (options.bullet ? typography.paragraphGap : 0),
      bullet: options.bullet ? { type: "bullet", character: "•" } : { type: "none" },
    },
    runs: [{
      text,
      style: {
        fontFamily: options.font ?? tokens.bodyFont,
        fontSize: options.size ?? tokens.bodySize,
        color: options.color ?? tokens.text,
        bold: options.bold ?? false,
      },
    }],
  };
}

export function addText(
  slide: PresentationSlide,
  tokens: ThemeTokens,
  content: string | string[],
  box: Box,
  options: TextOptions = {},
) {
  const typography = getTypography(tokens.id);
  slide.addElement({
    type: "text",
    ...(options.name ? { name: options.name } : {}),
    content: (Array.isArray(content) ? content : [content]).map((text) => paragraph(text, tokens, options)),
    box,
    frame: {
      margin: 0,
      verticalAlign: options.verticalAlign ?? "top",
      autoFit: options.autoFit === "none"
        ? { mode: "none" }
        : { mode: "shrink", fontScale: typography.minimumAutoFitScale },
    },
  });
}

export function addRect(
  slide: PresentationSlide,
  tokens: ThemeTokens,
  box: Box,
  options: { fill?: string; fillOpacity?: number; stroke?: string; strokeOpacity?: number; strokeWidth?: number; radius?: boolean } = {},
) {
  slide.addElement({
    type: "shape",
    shape: options.radius === false || tokens.radius === 0 ? "rect" : "roundRect",
    box,
    style: {
      fill: solid(options.fill ?? tokens.surface, options.fillOpacity),
      stroke: {
        paint: solid(options.stroke ?? tokens.text, options.strokeOpacity ?? 0.1),
        width: options.strokeWidth ?? 1,
      },
    },
    accessibility: { decorative: true },
  });
}

export function addRule(
  slide: PresentationSlide,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  width = 1,
  opacity = 1,
) {
  slide.addElement({
    type: "connector",
    start,
    end,
    style: { paint: solid(color, opacity), width },
    accessibility: { decorative: true },
  });
}

export function addImage(
  document: PresentationDocument,
  slide: PresentationSlide,
  plan: ImagePlan,
  box: Box,
  resolveAsset: AssetResolver,
) {
  const resolved = resolveAsset(plan.assetId);
  if (!resolved) return;
  const asset = document.registerAsset({
    kind: "image",
    source: resolved.source,
    mimeType: resolved.mimeType,
    ...(plan.width === undefined ? {} : { width: plan.width }),
    ...(plan.height === undefined ? {} : { height: plan.height }),
    accessibility: { description: plan.alt },
    dedupeKey: resolved.dedupeKey ?? plan.assetId,
  });
  slide.addElement({
    type: "image",
    assetId: asset.id,
    box,
    fit: plan.fit ?? "cover",
    accessibility: { description: plan.alt },
  });
}
