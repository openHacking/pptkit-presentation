import { createPresentation, type PresentationDocument } from "@pptkit/core";

import { planDeckLayout, validateLayoutPlan } from "./authoring/planner.js";
import { renderSlide } from "./authoring/recipes.js";
import type {
  AssetResolver,
  DeckSpec,
  LayoutDecision,
  SlidePlan,
  StructuralIssue,
} from "./contracts.js";
import { resolveTheme, SLIDE } from "./themes.js";

function visibleStrings(plan: SlidePlan): string[] {
  return [
    plan.title,
    plan.subtitle,
    plan.message,
    ...(plan.items ?? []),
    ...(plan.steps ?? []),
    ...(plan.kpis ?? []).flatMap((kpi) => [kpi.value, kpi.label, kpi.detail]),
    plan.comparison?.left.heading,
    ...(plan.comparison?.left.items ?? []),
    plan.comparison?.right.heading,
    ...(plan.comparison?.right.items ?? []),
    ...(plan.table?.headers ?? []),
    ...(plan.table?.rows.flat() ?? []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function weightedLength(value: string): number {
  return Array.from(value).reduce((length, character) => length + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character) ? 2 : 1), 0);
}

function containsInternalMetadata(value: string): boolean {
  if (/\bSources?:\s|\bsrc-\d{2}-/i.test(value)) return true;
  const proseWithoutUrls = value.replace(/\bhttps?:\/\/\S+/gi, "");
  return /(?:^|\s|[\\/])[^\s\\/]+\.(?:md|txt|pdf|docx|pptx|xlsx)\b/i.test(proseWithoutUrls);
}

function sourceNotes(plan: SlidePlan): string | undefined {
  const refs = plan.sourceRefs ?? [];
  if (!plan.notes?.trim() && refs.length === 0) return undefined;
  const sections: string[] = [];
  if (plan.notes?.trim()) sections.push(plan.notes.trim());
  if (refs.length > 0) {
    sections.push([
      "Source references (provenance only — not slide content):",
      ...refs.map((source) => `- ${source.id}${source.label ? ` — ${source.label}` : ""}`),
    ].join("\n"));
  }
  return sections.join("\n\n");
}

function addDensityIssues(plan: SlidePlan, issues: StructuralIssue[]) {
  const titleWeight = weightedLength(plan.title);
  if (titleWeight > 82) {
    issues.push({
      severity: "warning",
      code: "title-density",
      message: "The title is too long for the presentation-scale title treatment; shorten it or split the slide.",
      slideId: plan.id,
    });
  }
  if (plan.message && weightedLength(plan.message) > 250) {
    issues.push({
      severity: "warning",
      code: "message-density",
      message: "The primary message exceeds the safe reading measure; edit it down or continue it on another slide.",
      slideId: plan.id,
    });
  }
  const denseItem = [...(plan.items ?? []), ...(plan.steps ?? [])].find((item) => weightedLength(item) > 120);
  if (denseItem) {
    issues.push({
      severity: "warning",
      code: "item-density",
      message: "At least one list or process item is too long for the role layout; shorten it or split the slide.",
      slideId: plan.id,
    });
  }
  const denseCell = plan.table?.rows.flat().find((cell) => weightedLength(cell) > 110);
  if (denseCell) {
    issues.push({
      severity: "warning",
      code: "table-cell-density",
      message: "At least one table cell is too long for a readable 15 pt minimum; reduce the copy or use a narrative slide.",
      slideId: plan.id,
    });
  }
}

const HEX_COLOR = /^[A-F0-9]{6}$/i;

function colorLuminance(color: string): number {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function addThemeOverrideIssues(spec: DeckSpec, issues: StructuralIssue[]) {
  const overrides = spec.design.theme.overrides;
  if (!overrides) return;
  for (const [role, color] of Object.entries(overrides.colors ?? {})) {
    if (!HEX_COLOR.test(color)) issues.push({ severity: "error", code: "invalid-theme-color", message: `Theme override ${role} must be a six-digit RGB hex value without #.` });
  }
  for (const [role, font] of Object.entries(overrides.fonts ?? {})) {
    if (!font.trim()) issues.push({ severity: "error", code: "invalid-theme-font", message: `Theme override ${role} font must not be empty.` });
  }
  const theme = resolveTheme(spec.design.theme.id, overrides);
  if (HEX_COLOR.test(theme.text) && HEX_COLOR.test(theme.background)) {
    const light = Math.max(colorLuminance(theme.text), colorLuminance(theme.background));
    const dark = Math.min(colorLuminance(theme.text), colorLuminance(theme.background));
    if ((light + 0.05) / (dark + 0.05) < 4.5) {
      issues.push({ severity: "error", code: "theme-contrast", message: "Theme text and background overrides must preserve at least 4.5:1 contrast." });
    }
  }
}

export function validateDeckSpec(spec: DeckSpec, availableAssetIds: ReadonlySet<string> = new Set()): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  addThemeOverrideIssues(spec, issues);
  if (spec.slides.length < spec.brief.slideCountRange[0] || spec.slides.length > spec.brief.slideCountRange[1]) {
    issues.push({ severity: "warning", code: "slide-count-range", message: `Slide count ${spec.slides.length} is outside ${spec.brief.slideCountRange.join("–")}.` });
  }
  const ids = new Set<string>();
  for (const slide of spec.slides) {
    if (ids.has(slide.id)) issues.push({ severity: "error", code: "duplicate-slide-id", message: `Duplicate slide id: ${slide.id}`, slideId: slide.id });
    ids.add(slide.id);
    if (!slide.title.trim()) issues.push({ severity: "error", code: "missing-title", message: "Every slide requires a title.", slideId: slide.id });
    if (slide.role === "kpi" && !slide.kpis?.length) issues.push({ severity: "error", code: "missing-kpis", message: "KPI slide requires kpis.", slideId: slide.id });
    if (slide.role === "comparison" && !slide.comparison) issues.push({ severity: "error", code: "missing-comparison", message: "Comparison slide requires comparison content.", slideId: slide.id });
    if (slide.role === "process" && !slide.steps?.length) issues.push({ severity: "error", code: "missing-steps", message: "Process slide requires steps.", slideId: slide.id });
    if (slide.role === "table" && !slide.table && !slide.chart) issues.push({ severity: "error", code: "missing-data", message: "Table slide requires table or chart data.", slideId: slide.id });
    if (slide.chart && (slide.chart.series.length > 2 || slide.chart.categories.length > 8)) issues.push({ severity: "warning", code: "chart-density", message: "Charts render at most two series and eight categories.", slideId: slide.id });
    if ((slide.items?.length ?? 0) > 6 || (slide.steps?.length ?? 0) > 6 || (slide.kpis?.length ?? 0) > 4 || (slide.table?.rows.length ?? 0) > 8) {
      issues.push({ severity: "warning", code: "role-density", message: "The selected role contains more items than its readable layout supports; split the slide instead of truncating it.", slideId: slide.id });
    }
    if (slide.image && !availableAssetIds.has(slide.image.assetId)) issues.push({ severity: "error", code: "missing-asset", message: `Image asset ${slide.image.assetId} is not available.`, slideId: slide.id });
    if (slide.image && ((slide.image.width !== undefined && slide.image.width <= 0) || (slide.image.height !== undefined && slide.image.height <= 0))) {
      issues.push({ severity: "error", code: "invalid-image-dimensions", message: "Image width and height metadata must be positive.", slideId: slide.id });
    }
    if (slide.image?.fit === "stretch") issues.push({ severity: "warning", code: "image-stretch", message: "Stretch may distort evidence; prefer contain or cover unless distortion is intentional.", slideId: slide.id });
    if (slide.sourceRefs?.some((reference) => reference.slideNumbers?.some((number) => !Number.isSafeInteger(number) || number <= 0))) {
      issues.push({ severity: "error", code: "invalid-source-slide-number", message: "Source slide numbers must be positive integers.", slideId: slide.id });
    }
    if (visibleStrings(slide).some(containsInternalMetadata)) {
      issues.push({
        severity: "warning",
        code: "internal-metadata-visible",
        message: "Visible slide copy appears to contain an internal source ID, file path, or workflow label; keep provenance in sourceRefs/notes and use a human-readable citation only when requested.",
        slideId: slide.id,
      });
    }
    addDensityIssues(slide, issues);
  }
  issues.push(...validateLayoutPlan(spec));
  return issues;
}

export interface AuthoredDeck {
  presentation: PresentationDocument;
  layoutDecisions: LayoutDecision[];
}

export function authorDeck(spec: DeckSpec, resolveAsset: AssetResolver = () => undefined): AuthoredDeck {
  const tokens = resolveTheme(spec.design.theme.id, spec.design.theme.overrides);
  const layoutDecisions = planDeckLayout(spec);
  const presentation = createPresentation({
    metadata: {
      title: spec.brief.title,
      author: spec.brief.author ?? "PPTKit",
      language: spec.brief.language,
      subject: spec.brief.purpose,
    },
    size: SLIDE,
    theme: {
      name: tokens.name,
      colors: {
        background1: tokens.background,
        background2: tokens.surface,
        text1: tokens.text,
        text2: tokens.muted,
        accent1: tokens.accent,
        accent2: tokens.accent2,
      },
      fonts: { heading: tokens.headingFont, body: tokens.bodyFont },
    },
  });
  spec.slides.forEach((slide, index) => {
    const decision = layoutDecisions.find((candidate) => candidate.slideId === slide.id);
    if (!decision) throw new Error(`No compatible layout recipe for slide ${slide.id}.`);
    renderSlide(presentation, slide, tokens, index + 1, resolveAsset, decision, sourceNotes(slide));
  });
  return { presentation, layoutDecisions };
}
