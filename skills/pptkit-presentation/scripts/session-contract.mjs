const THEMES = new Set(["clean-business", "swiss-grid", "editorial-story"]);
const VARIATIONS = new Set(["restrained", "balanced", "expressive"]);
const ROLES = new Set(["cover", "agenda", "section", "statement", "image", "kpi", "comparison", "process", "table", "closing"]);
const SOURCE_TYPES = new Set(["text", "document", "table", "image"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/svg+xml"]);
const COMPOSITIONS = new Set(["hero", "split", "ledger", "grid", "divided", "timeline", "image-split", "image-hero", "image-background", "color-field"]);
const DENSITIES = new Set(["airy", "balanced", "dense"]);
const VISUAL_INTENTS = new Set(["content-led", "image-led", "color-led", "data-led", "type-led"]);
const SHA256 = /^[a-f0-9]{64}$/i;
const ALL_DENSITIES = ["airy", "balanced", "dense"];

const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
function requiredString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} requires a non-empty string.`);
}

const wantsImageBackground = (slide) => Boolean(slide.image && (slide.composition === "image-background" || slide.visualIntent === "image-led"));
const wantsColorField = (slide) => slide.composition === "color-field" || slide.visualIntent === "color-led";
const wantsImageSplit = (slide) => Boolean(slide.image && (slide.composition === "image-split" || slide.visualIntent === "image-led"));
const supportsImageSplit = (slide) => Boolean(slide.items?.length && (slide.image || slide.visualIntent !== "image-led"));
const recipe = (role, composition, visualIntent = "content-led", supports = () => true, densities = ALL_DENSITIES) => ({
  role, composition, visualIntent, supports, densities,
});
const LAYOUT_RECIPES = [
  recipe("cover", "hero", "type-led"),
  recipe("cover", "split"),
  recipe("cover", "image-background", "image-led", wantsImageBackground, ["airy", "balanced"]),
  recipe("cover", "color-field", "color-led", wantsColorField, ["airy", "balanced"]),
  recipe("agenda", "ledger", "content-led", (slide) => Boolean(slide.items?.length)),
  recipe("agenda", "grid", "content-led", (slide) => (slide.items?.length ?? 0) >= 2),
  recipe("section", "hero", "type-led"),
  recipe("section", "divided", "color-led"),
  recipe("section", "image-background", "image-led", wantsImageBackground, ["airy", "balanced"]),
  recipe("section", "color-field", "color-led", wantsColorField, ["airy", "balanced"]),
  recipe("statement", "hero", "type-led", (slide) => Boolean(slide.message)),
  recipe("statement", "split", "content-led", (slide) => Boolean(slide.message && slide.items?.length)),
  recipe("statement", "divided", "content-led", (slide) => Boolean(slide.message)),
  recipe("statement", "image-background", "image-led", (slide) => Boolean(slide.message && wantsImageBackground(slide)), ["airy", "balanced"]),
  recipe("statement", "color-field", "color-led", (slide) => Boolean(slide.message && wantsColorField(slide)), ["airy", "balanced"]),
  recipe("image", "image-hero", "image-led", (slide) => Boolean(slide.image && !slide.items?.length), ["airy", "balanced"]),
  recipe("image", "image-split", "image-led", supportsImageSplit),
  recipe("image", "split", "image-led", (slide) => Boolean(slide.image && slide.items?.length)),
  recipe("image", "image-background", "image-led", wantsImageBackground, ["airy", "balanced"]),
  recipe("kpi", "grid", "data-led", (slide) => Boolean(slide.kpis?.length)),
  recipe("kpi", "ledger", "data-led", (slide) => Boolean(slide.kpis?.length)),
  recipe("kpi", "color-field", "color-led", (slide) => Boolean(slide.kpis?.length && wantsColorField(slide)), ["airy", "balanced"]),
  recipe("kpi", "image-split", "image-led", (slide) => Boolean(slide.kpis?.length && wantsImageSplit(slide)), ["airy", "balanced"]),
  recipe("comparison", "divided", "content-led", (slide) => Boolean(slide.comparison)),
  recipe("comparison", "split", "content-led", (slide) => Boolean(slide.comparison)),
  recipe("process", "timeline", "content-led", (slide) => Boolean(slide.steps?.length)),
  recipe("process", "grid", "content-led", (slide) => Boolean(slide.steps?.length)),
  recipe("process", "ledger", "content-led", (slide) => Boolean(slide.steps?.length)),
  recipe("process", "divided", "content-led", (slide) => (slide.steps?.length ?? 0) >= 2),
  recipe("table", "ledger", "data-led", (slide) => Boolean(slide.table && slide.table.headers.length === 2)),
  recipe("table", "grid", "data-led", (slide) => Boolean(slide.table)),
  recipe("table", "split", "data-led", (slide) => Boolean(slide.chart)),
  recipe("closing", "hero", "type-led"),
  recipe("closing", "split"),
  recipe("closing", "image-background", "image-led", wantsImageBackground, ["airy", "balanced"]),
  recipe("closing", "color-field", "color-led", wantsColorField, ["airy", "balanced"]),
];

function inferDensity(slide) {
  if (slide.density) return slide.density;
  const count = Math.max(
    slide.items?.length ?? 0,
    slide.steps?.length ?? 0,
    slide.kpis?.length ?? 0,
    slide.table?.rows.length ?? 0,
    slide.chart?.categories.length ?? 0,
  );
  if (count >= 6 || (slide.message?.length ?? 0) > 180) return "dense";
  if (count >= 3 || (slide.message?.length ?? 0) > 80) return "balanced";
  return "airy";
}

function layoutRepairHint(slide) {
  if (slide.role === "statement" && slide.composition === "split" && !slide.items?.length) {
    return " Statement + split requires message and at least one items entry. Add supporting items, or omit composition so the planner can choose a compatible layout.";
  }
  if (slide.role === "agenda" && slide.composition === "grid" && (slide.items?.length ?? 0) < 2) {
    return " Agenda + grid requires at least two items. Add items, or omit composition so the planner can choose a compatible layout.";
  }
  if (slide.role === "process" && slide.composition === "divided" && (slide.steps?.length ?? 0) < 2) {
    return " Process + divided requires at least two steps. Add steps, or omit composition so the planner can choose a compatible layout.";
  }
  if (slide.role === "table" && slide.composition === "ledger" && slide.table?.headers.length !== 2) {
    return " Table + ledger requires exactly two headers. Use two columns, choose grid, or omit composition so the planner can choose a compatible layout.";
  }
  if (slide.role === "table" && slide.composition === "split" && !slide.chart) {
    return " Table + split requires chart data. Add chart data, choose grid/ledger, or omit composition so the planner can choose a compatible layout.";
  }
  if (slide.visualIntent === "image-led" && !slide.image) {
    return " image-led requires a declared image asset. Add image, or omit visualIntent so the planner can choose a compatible treatment.";
  }
  return slide.composition || slide.visualIntent
    ? " Add the content required by that explicit intent, or omit composition/visualIntent so the planner can choose a compatible layout."
    : "";
}

function validateLayout(slide) {
  const density = inferDensity(slide);
  const candidates = LAYOUT_RECIPES.filter((candidate) =>
    candidate.role === slide.role
    && candidate.densities.includes(density)
    && candidate.supports(slide)
    && (!slide.composition || candidate.composition === slide.composition)
    && (!slide.visualIntent || candidate.visualIntent === slide.visualIntent));
  if (candidates.length > 0) return;
  const composition = slide.composition ? ` composition ${slide.composition}` : "";
  const visualIntent = slide.visualIntent ? ` visual intent ${slide.visualIntent}` : "";
  throw new Error(`No layout recipe supports ${slide.role} slide ${slide.id} with${composition}${visualIntent} density ${density}.${layoutRepairHint(slide)}`);
}

function validateSlide(slide, index, sourceIds, assetIds) {
  const path = `deck.slides[${index}]`;
  if (!record(slide)) throw new Error(`${path} must be an object.`);
  requiredString(slide.id, `${path}.id`);
  requiredString(slide.title, `${path}.title`);
  if (!ROLES.has(slide.role)) throw new Error(`${path}.role is unsupported: ${String(slide.role)}.`);
  if (slide.composition !== undefined && !COMPOSITIONS.has(slide.composition)) throw new Error(`${path}.composition is unsupported: ${String(slide.composition)}.`);
  if (slide.density !== undefined && !DENSITIES.has(slide.density)) throw new Error(`${path}.density is unsupported: ${String(slide.density)}.`);
  if (slide.visualIntent !== undefined && !VISUAL_INTENTS.has(slide.visualIntent)) throw new Error(`${path}.visualIntent is unsupported: ${String(slide.visualIntent)}.`);
  if (slide.items !== undefined && !strings(slide.items)) throw new Error(`${path}.items must be an array of strings.`);
  if (slide.steps !== undefined) {
    if (slide.role !== "process") throw new Error(`${path}.steps is only supported for the process role.`);
    if (!Array.isArray(slide.steps)) throw new Error(`${path}.steps must be an array of process step objects.`);
    if (slide.steps.length < 2 || slide.steps.length > 6) throw new Error(`${path}.steps must contain between 2 and 6 process steps.`);
    slide.steps.forEach((step, stepIndex) => {
      if (!record(step)) throw new Error(`${path}.steps[${stepIndex}] must be a process step object.`);
      requiredString(step.title, `${path}.steps[${stepIndex}].title`);
      if (step.detail !== undefined && typeof step.detail !== "string") throw new Error(`${path}.steps[${stepIndex}].detail must be a string.`);
    });
  }
  if (slide.role === "agenda" && (!strings(slide.items) || slide.items.length === 0)) throw new Error(`${path}.items is required for role agenda.`);
  if (slide.role === "statement" && (typeof slide.message !== "string" || !slide.message.trim())) throw new Error(`${path}.message is required for role statement.`);
  if (slide.role === "process" && !Array.isArray(slide.steps)) throw new Error(`${path}.steps is required for the process role.`);
  if (slide.role === "kpi" && (!Array.isArray(slide.kpis) || slide.kpis.length === 0)) throw new Error(`${path}.kpis is required for role kpi.`);
  for (const [kpiIndex, kpi] of (slide.kpis ?? []).entries()) {
    if (!record(kpi)) throw new Error(`${path}.kpis[${kpiIndex}] must be an object.`);
    requiredString(kpi.value, `${path}.kpis[${kpiIndex}].value`);
    requiredString(kpi.label, `${path}.kpis[${kpiIndex}].label`);
  }
  if (slide.role === "comparison" && !record(slide.comparison)) throw new Error(`${path}.comparison is required for role comparison.`);
  if (slide.comparison !== undefined) for (const side of ["left", "right"]) {
    const column = slide.comparison?.[side];
    if (!record(column)) throw new Error(`${path}.comparison.${side} must be an object.`);
    requiredString(column.heading, `${path}.comparison.${side}.heading`);
    if (!strings(column.items)) throw new Error(`${path}.comparison.${side}.items must be an array of strings.`);
  }
  if (slide.role === "table" && slide.table === undefined && slide.chart === undefined) throw new Error(`${path} requires table or chart data for role table.`);
  if (slide.table !== undefined && (!record(slide.table) || !strings(slide.table.headers) || slide.table.headers.length === 0 || !Array.isArray(slide.table.rows) || !slide.table.rows.every(strings))) throw new Error(`${path}.table requires headers and rows made only of strings.`);
  if (slide.chart !== undefined && (!record(slide.chart) || !strings(slide.chart.categories) || !Array.isArray(slide.chart.series))) throw new Error(`${path}.chart requires categories and series arrays.`);
  for (const [seriesIndex, series] of (slide.chart?.series ?? []).entries()) {
    if (!record(series)) throw new Error(`${path}.chart.series[${seriesIndex}] must be an object.`);
    requiredString(series.name, `${path}.chart.series[${seriesIndex}].name`);
    if (!Array.isArray(series.values) || series.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${path}.chart.series[${seriesIndex}].values must be an array of finite numbers.`);
  }
  if (slide.image !== undefined) {
    if (!record(slide.image)) throw new Error(`${path}.image must be an object.`);
    requiredString(slide.image.assetId, `${path}.image.assetId`);
    requiredString(slide.image.alt, `${path}.image.alt`);
    if (!assetIds.has(slide.image.assetId)) throw new Error(`${path}.image.assetId references undeclared asset ${String(slide.image.assetId)}.`);
  }
  for (const [referenceIndex, reference] of (slide.sourceRefs ?? []).entries()) {
    if (!record(reference)) throw new Error(`${path}.sourceRefs[${referenceIndex}] must be an object.`);
    requiredString(reference.id, `${path}.sourceRefs[${referenceIndex}].id`);
    if (!sourceIds.has(reference.id)) throw new Error(`${path}.sourceRefs[${referenceIndex}].id references undeclared source ${String(reference.id)}.`);
  }
}

export function validateDeckSession(value) {
  if (!record(value)) throw new Error("Deck session must be an object.");
  requiredString(value.id, "id");
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("revision must be a positive integer.");
  requiredString(value.createdAt, "createdAt");
  requiredString(value.updatedAt, "updatedAt");
  if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error("createdAt must be an ISO-8601 timestamp.");
  if (!Number.isFinite(Date.parse(value.updatedAt))) throw new Error("updatedAt must be an ISO-8601 timestamp.");
  if (!record(value.deck) || !record(value.deck.brief) || !record(value.deck.design)) throw new Error("Deck session requires deck.brief and deck.design.");
  for (const field of ["title", "audience", "purpose", "language", "imagePolicy"]) requiredString(value.deck.brief[field], `deck.brief.${field}`);
  if (!Array.isArray(value.deck.brief.slideCountRange) || value.deck.brief.slideCountRange.length !== 2 || value.deck.brief.slideCountRange.some((count) => !Number.isSafeInteger(count) || count < 1) || value.deck.brief.slideCountRange[0] > value.deck.brief.slideCountRange[1]) throw new Error("deck.brief.slideCountRange must contain two ascending positive integers.");
  if (!strings(value.deck.brief.constraints)) throw new Error("deck.brief.constraints must be an array of strings.");
  if (!THEMES.has(value.deck.design.theme?.id)) throw new Error(`Unsupported theme: ${String(value.deck.design.theme?.id)}.`);
  requiredString(value.deck.design.seed, "deck.design.seed");
  if (!VARIATIONS.has(value.deck.design.variation)) throw new Error(`Unsupported design variation: ${String(value.deck.design.variation)}.`);
  if (!Array.isArray(value.sources) || !Array.isArray(value.assets) || !Array.isArray(value.deck.slides)) throw new Error("Deck session requires sources, assets, and deck.slides arrays.");
  const sourceIds = new Set();
  value.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    if (!record(source)) throw new Error(`${path} must be an object.`);
    requiredString(source.id, `${path}.id`); requiredString(source.name, `${path}.name`); requiredString(source.mimeType, `${path}.mimeType`);
    if (!SOURCE_TYPES.has(source.type)) throw new Error(`${path}.type is unsupported.`);
    if (!strings(source.warnings)) throw new Error(`${path}.warnings must be an array of strings.`);
    if (sourceIds.has(source.id)) throw new Error(`Duplicate source id: ${source.id}.`);
    sourceIds.add(source.id);
  });
  const assetIds = new Set();
  value.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!record(asset)) throw new Error(`${path} must be an object.`);
    requiredString(asset.id, `${path}.id`); requiredString(asset.name, `${path}.name`);
    if (!IMAGE_MIME_TYPES.has(asset.mimeType)) throw new Error(`${path}.mimeType is unsupported.`);
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1) throw new Error(`${path}.byteLength must be positive.`);
    if (!SHA256.test(asset.sha256 ?? "")) throw new Error(`${path}.sha256 must be a SHA-256 digest.`);
    if (assetIds.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}.`);
    assetIds.add(asset.id);
  });
  const slideIds = new Set();
  value.deck.slides.forEach((slide, index) => {
    validateSlide(slide, index, sourceIds, assetIds);
    if (slideIds.has(slide.id)) throw new Error(`Duplicate slide id: ${slide.id}.`);
    slideIds.add(slide.id);
  });
  value.deck.slides.forEach(validateLayout);
  return value;
}
