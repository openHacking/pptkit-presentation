import type { DeckSession } from "./contracts.js";
import { planDeckLayout } from "./authoring/planner.js";
const SUPPORTED_ASSET_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/svg+xml"]);
const SHA256 = /^[a-f0-9]{64}$/i;
const COMPOSITIONS = new Set(["hero", "split", "ledger", "grid", "divided", "timeline", "image-split", "image-hero"]);
const DENSITIES = new Set(["airy", "balanced", "dense"]);
const VARIATIONS = new Set(["restrained", "balanced", "expressive"]);
const THEMES = new Set(["clean-business", "swiss-grid", "editorial-story"]);
const DECK_MODES = new Set(["create", "restyle"]);
const ASSET_ORIGINS = new Set(["user", "source-embedded", "source-slide-preview", "source-slide-crop"]);
const SLIDE_ROLES = new Set(["cover", "agenda", "section", "statement", "image", "kpi", "comparison", "process", "table", "closing"]);
const SOURCE_TYPES = new Set(["text", "document", "table", "image"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} requires a non-empty string.`);
}

function validateSlidePlan(slide: unknown, index: number, assetIds: ReadonlySet<string>, sourceIds: ReadonlySet<string>) {
  const path = `deck.slides[${index}]`;
  if (!isRecord(slide)) throw new Error(`${path} must be an object.`);
  requireString(slide.id, `${path}.id`);
  requireString(slide.title, `${path}.title`);
  if (typeof slide.role !== "string" || !SLIDE_ROLES.has(slide.role)) throw new Error(`${path}.role is unsupported: ${String(slide.role)}.`);
  if (slide.composition !== undefined && (typeof slide.composition !== "string" || !COMPOSITIONS.has(slide.composition))) throw new Error(`${path}.composition is unsupported: ${String(slide.composition)}.`);
  if (slide.density !== undefined && (typeof slide.density !== "string" || !DENSITIES.has(slide.density))) throw new Error(`${path}.density is unsupported: ${String(slide.density)}.`);
  if (slide.visualIntent !== undefined) throw new Error(`${path}.visualIntent is no longer supported.`);
  if (slide.items !== undefined && !isStringArray(slide.items)) throw new Error(`${path}.items must be an array of strings.`);
  if (slide.role === "agenda" && (!isStringArray(slide.items) || slide.items.length === 0)) throw new Error(`${path}.items is required for role agenda.`);
  if (slide.role === "statement" && (typeof slide.message !== "string" || !slide.message.trim())) throw new Error(`${path}.message is required for role statement.`);
  if (slide.steps !== undefined) {
    if (slide.role !== "process") throw new Error(`${path}.steps is only supported for the process role.`);
    if (!Array.isArray(slide.steps)) throw new Error(`${path}.steps must be an array of process step objects.`);
    if (slide.steps.length < 2 || slide.steps.length > 6) throw new Error(`${path}.steps must contain between 2 and 6 process steps.`);
    for (let stepIndex = 0; stepIndex < slide.steps.length; stepIndex += 1) {
      const step = slide.steps[stepIndex];
      if (!isRecord(step)) throw new Error(`${path}.steps[${stepIndex}] must be a process step object.`);
      requireString(step.title, `${path}.steps[${stepIndex}].title`);
      if (step.detail !== undefined && typeof step.detail !== "string") throw new Error(`${path}.steps[${stepIndex}].detail must be a string.`);
    }
  }
  if (slide.role === "process" && !Array.isArray(slide.steps)) throw new Error(`${path}.steps is required for the process role.`);
  if (slide.role === "kpi") {
    if (!Array.isArray(slide.kpis) || slide.kpis.length === 0) throw new Error(`${path}.kpis is required for role kpi.`);
    for (let kpiIndex = 0; kpiIndex < slide.kpis.length; kpiIndex += 1) {
      const kpi = slide.kpis[kpiIndex];
      if (!isRecord(kpi)) throw new Error(`${path}.kpis[${kpiIndex}] must be an object.`);
      requireString(kpi.value, `${path}.kpis[${kpiIndex}].value`);
      requireString(kpi.label, `${path}.kpis[${kpiIndex}].label`);
    }
  }
  if (slide.role === "comparison") {
    if (!isRecord(slide.comparison)) throw new Error(`${path}.comparison is required for role comparison.`);
    for (const side of ["left", "right"] as const) {
      const column = slide.comparison[side];
      if (!isRecord(column)) throw new Error(`${path}.comparison.${side} must be an object.`);
      requireString(column.heading, `${path}.comparison.${side}.heading`);
      if (!isStringArray(column.items)) throw new Error(`${path}.comparison.${side}.items must be an array of strings.`);
    }
  }
  if (slide.role === "table" && slide.table === undefined && slide.chart === undefined) throw new Error(`${path} requires table or chart data for role table.`);
  if (slide.table !== undefined) {
    if (!isRecord(slide.table) || !isStringArray(slide.table.headers) || slide.table.headers.length === 0) throw new Error(`${path}.table.headers must be a non-empty array of strings; use headers, not columns.`);
    if (!Array.isArray(slide.table.rows) || !slide.table.rows.every(isStringArray)) throw new Error(`${path}.table.rows must be an array of string arrays.`);
  }
  if (slide.chart !== undefined) {
    if (!isRecord(slide.chart) || !isStringArray(slide.chart.categories) || !Array.isArray(slide.chart.series)) throw new Error(`${path}.chart requires categories and series arrays.`);
    for (let seriesIndex = 0; seriesIndex < slide.chart.series.length; seriesIndex += 1) {
      const series = slide.chart.series[seriesIndex];
      if (!isRecord(series)) throw new Error(`${path}.chart.series[${seriesIndex}] must be an object.`);
      requireString(series.name, `${path}.chart.series[${seriesIndex}].name`);
      if (!Array.isArray(series.values) || series.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${path}.chart.series[${seriesIndex}].values must be an array of finite numbers.`);
    }
  }
  if (slide.image !== undefined) {
    if (!isRecord(slide.image)) throw new Error(`${path}.image must be an object.`);
    requireString(slide.image.assetId, `${path}.image.assetId`);
    requireString(slide.image.alt, `${path}.image.alt`);
    if (!assetIds.has(slide.image.assetId as string)) throw new Error(`Slide ${String(slide.id)} references undeclared asset ${String(slide.image.assetId)}.`);
  }
  if (slide.sourceRefs !== undefined) {
    if (!Array.isArray(slide.sourceRefs)) throw new Error(`${path}.sourceRefs must be an array.`);
    for (let referenceIndex = 0; referenceIndex < slide.sourceRefs.length; referenceIndex += 1) {
      const reference = slide.sourceRefs[referenceIndex];
      if (!isRecord(reference)) throw new Error(`${path}.sourceRefs[${referenceIndex}] must be an object.`);
      requireString(reference.id, `${path}.sourceRefs[${referenceIndex}].id; use id, not sourceId`);
      if (!sourceIds.has(reference.id as string)) throw new Error(`${path}.sourceRefs[${referenceIndex}].id references undeclared source ${String(reference.id)}.`);
      if (reference.slideNumbers !== undefined && (!Array.isArray(reference.slideNumbers) || reference.slideNumbers.some((number) => !Number.isSafeInteger(number) || (number as number) <= 0))) throw new Error(`${path}.sourceRefs[${referenceIndex}].slideNumbers must contain positive integers.`);
    }
  }
}

export function parseDeckSession(value: string | unknown): DeckSession {
  const input: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!input || typeof input !== "object") throw new Error("Deck session must be an object.");
  const candidate = input as Partial<DeckSession>;
  requireString(candidate.id, "id");
  if (!Number.isSafeInteger(candidate.revision) || (candidate.revision as number) < 1) throw new Error("revision must be a positive integer.");
  requireString(candidate.createdAt, "createdAt");
  requireString(candidate.updatedAt, "updatedAt");
  if (!Number.isFinite(Date.parse(candidate.createdAt as string))) throw new Error("createdAt must be an ISO-8601 timestamp.");
  if (!Number.isFinite(Date.parse(candidate.updatedAt as string))) throw new Error("updatedAt must be an ISO-8601 timestamp.");
  if (!candidate.deck || !Array.isArray(candidate.sources) || !Array.isArray(candidate.assets)) throw new Error("Deck session is missing required fields.");
  if (!candidate.deck.design || !candidate.deck.design.seed?.trim()) throw new Error("Deck session requires a non-empty design seed.");
  if (!candidate.deck.brief || !Array.isArray(candidate.deck.brief.slideCountRange)) throw new Error("Deck session requires a brief with slideCountRange.");
  for (const field of ["title", "audience", "purpose", "language", "imagePolicy"] as const) requireString(candidate.deck.brief[field], `deck.brief.${field}`);
  if (candidate.deck.brief.slideCountRange.length !== 2 || candidate.deck.brief.slideCountRange.some((count) => !Number.isSafeInteger(count) || count < 1) || candidate.deck.brief.slideCountRange[0] > candidate.deck.brief.slideCountRange[1]) throw new Error("deck.brief.slideCountRange must contain two ascending positive integers.");
  if (!isStringArray(candidate.deck.brief.constraints)) throw new Error("deck.brief.constraints must be an array of strings.");
  if (candidate.deck.brief.mode && !DECK_MODES.has(candidate.deck.brief.mode)) throw new Error(`Unsupported deck mode: ${String(candidate.deck.brief.mode)}.`);
  if (!THEMES.has(candidate.deck.design.theme?.id)) throw new Error(`Unsupported theme: ${String(candidate.deck.design.theme?.id)}.`);
  if (!VARIATIONS.has(candidate.deck.design.variation)) throw new Error(`Unsupported design variation: ${String(candidate.deck.design.variation)}.`);
  const sourceIds = new Set<string>();
  for (let sourceIndex = 0; sourceIndex < candidate.sources.length; sourceIndex += 1) {
    const source = candidate.sources[sourceIndex] as unknown;
    const path = `sources[${sourceIndex}]`;
    if (!isRecord(source)) throw new Error(`${path} must be an object.`);
    requireString(source.id, `${path}.id`);
    requireString(source.name, `${path}.name`);
    if (!SOURCE_TYPES.has(source.type as string)) throw new Error(`${path}.type must be text, document, table, or image; use type, not kind.`);
    requireString(source.mimeType, `${path}.mimeType`);
    if (!isStringArray(source.warnings)) throw new Error(`${path}.warnings must be an array of strings.`);
    if (sourceIds.has(source.id as string)) throw new Error(`Duplicate source id: ${String(source.id)}.`);
    sourceIds.add(source.id as string);
  }
  const assetIds = new Set<string>();
  for (const asset of candidate.assets) {
    if (!asset?.id || !asset.name || !asset.mimeType) throw new Error("Every session asset requires id, name, and mimeType.");
    if ("dataUrl" in asset) throw new Error(`Session asset ${asset.name} must not contain inline dataUrl content.`);
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength <= 0) throw new Error(`Session asset ${asset.name} requires a positive byteLength.`);
    if (!SHA256.test(asset.sha256)) throw new Error(`Session asset ${asset.name} requires a valid SHA-256 digest.`);
    if (!SUPPORTED_ASSET_MIME_TYPES.has(asset.mimeType)) throw new Error(`Unsupported session asset MIME type: ${asset.mimeType}.`);
    if (assetIds.has(asset.id)) throw new Error(`Duplicate session asset id: ${asset.id}.`);
    if (asset.origin) {
      if (!ASSET_ORIGINS.has(asset.origin.kind)) throw new Error(`Unsupported asset origin: ${String(asset.origin.kind)}.`);
      const originSlides = asset.origin.slideNumbers ?? (asset.origin.slideNumber ? [asset.origin.slideNumber] : []);
      if (originSlides.some((number) => !Number.isSafeInteger(number) || number <= 0)) throw new Error(`Asset ${asset.name} has an invalid origin slide number.`);
      if (asset.origin.kind !== "user" && (!asset.origin.sourceId || originSlides.length === 0)) {
        throw new Error(`Asset ${asset.name} requires sourceId and at least one positive slide number for origin ${asset.origin.kind}.`);
      }
      if (asset.origin.kind === "source-slide-crop") {
        const crop = asset.origin.crop;
        if (!asset.origin.slideNumber || !crop || crop.width <= 0 || crop.height <= 0) throw new Error(`Cropped asset ${asset.name} requires one source slide and a positive crop rectangle.`);
      }
    }
    assetIds.add(asset.id);
  }
  if (!Array.isArray(candidate.deck.slides)) throw new Error("Deck session slides must be an array.");
  const slideIds = new Set<string>();
  candidate.deck.slides.forEach((slide, index) => {
    validateSlidePlan(slide, index, assetIds, sourceIds);
    const slideId = slide.id;
    if (slideIds.has(slideId)) throw new Error(`Duplicate slide id: ${slideId}.`);
    slideIds.add(slideId);
  });
  planDeckLayout(candidate.deck);
  return candidate as DeckSession;
}

export function serializeDeckSession(session: DeckSession) {
  parseDeckSession(session);
  return JSON.stringify(session, null, 2);
}
