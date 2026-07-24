import type { CompositionIntent, SlideDensity, SlidePlan, SlideRole, ThemeId, VisualIntent, VisualWeight } from "../contracts.js";

export interface RecipeDefinition {
  id: string;
  role: SlideRole;
  composition: CompositionIntent;
  densities: readonly SlideDensity[];
  themes: readonly ThemeId[];
  visualIntent: VisualIntent;
  visualWeight: VisualWeight;
  supports(plan: SlidePlan): boolean;
}

const ALL_THEMES = ["clean-business", "swiss-grid", "editorial-story"] as const;
const ALL_DENSITIES = ["airy", "balanced", "dense"] as const;
const noRequirement = () => true;
const wantsImageBackground = (plan: SlidePlan) => Boolean(plan.image && (plan.composition === "image-background" || plan.visualIntent === "image-led"));
const wantsColorField = (plan: SlidePlan) => plan.composition === "color-field" || plan.visualIntent === "color-led";
const wantsImageSplit = (plan: SlidePlan) => Boolean(plan.image && (plan.composition === "image-split" || plan.visualIntent === "image-led"));
const supportsImageSplit = (plan: SlidePlan) => Boolean(plan.items?.length && (plan.image || plan.visualIntent !== "image-led"));

function recipe(
  role: SlideRole,
  id: string,
  composition: CompositionIntent,
  supports: (plan: SlidePlan) => boolean = noRequirement,
  densities: readonly SlideDensity[] = ALL_DENSITIES,
  visualIntent: VisualIntent = "content-led",
  visualWeight: VisualWeight = "standard",
): RecipeDefinition {
  return { id, role, composition, supports, densities, themes: ALL_THEMES, visualIntent, visualWeight };
}

export const RECIPE_REGISTRY: readonly RecipeDefinition[] = [
  recipe("cover", "cover-hero", "hero", noRequirement, ALL_DENSITIES, "type-led"),
  recipe("cover", "cover-split", "split", noRequirement, ALL_DENSITIES, "content-led"),
  recipe("cover", "cover-image-background", "image-background", wantsImageBackground, ["airy", "balanced"], "image-led", "peak"),
  recipe("cover", "cover-color-field", "color-field", wantsColorField, ["airy", "balanced"], "color-led", "peak"),
  recipe("agenda", "agenda-ledger", "ledger", (plan) => Boolean(plan.items?.length)),
  recipe("agenda", "agenda-grid", "grid", (plan) => (plan.items?.length ?? 0) >= 2),
  recipe("section", "section-hero", "hero", noRequirement, ALL_DENSITIES, "type-led"),
  recipe("section", "section-divided", "divided", noRequirement, ALL_DENSITIES, "color-led"),
  recipe("section", "section-image-background", "image-background", wantsImageBackground, ["airy", "balanced"], "image-led", "peak"),
  recipe("section", "section-color-field", "color-field", wantsColorField, ["airy", "balanced"], "color-led", "peak"),
  recipe("statement", "statement-hero", "hero", (plan) => Boolean(plan.message), ALL_DENSITIES, "type-led"),
  recipe("statement", "statement-split", "split", (plan) => Boolean(plan.message && plan.items?.length)),
  recipe("statement", "statement-divided", "divided", (plan) => Boolean(plan.message)),
  recipe("statement", "statement-image-background", "image-background", (plan) => Boolean(plan.message && wantsImageBackground(plan)), ["airy", "balanced"], "image-led", "peak"),
  recipe("statement", "statement-color-field", "color-field", (plan) => Boolean(plan.message && wantsColorField(plan)), ["airy", "balanced"], "color-led", "peak"),
  recipe("image", "image-hero", "image-hero", (plan) => Boolean(plan.image && !plan.items?.length), ["airy", "balanced"], "image-led"),
  recipe("image", "image-split", "image-split", supportsImageSplit, ALL_DENSITIES, "image-led"),
  recipe("image", "image-evidence-split", "split", (plan) => Boolean(plan.image && plan.items?.length), ALL_DENSITIES, "image-led"),
  recipe("image", "image-background", "image-background", wantsImageBackground, ["airy", "balanced"], "image-led", "peak"),
  recipe("kpi", "kpi-grid", "grid", (plan) => Boolean(plan.kpis?.length), ALL_DENSITIES, "data-led"),
  recipe("kpi", "kpi-ledger", "ledger", (plan) => Boolean(plan.kpis?.length), ALL_DENSITIES, "data-led"),
  recipe("kpi", "kpi-color-field", "color-field", (plan) => Boolean(plan.kpis?.length && wantsColorField(plan)), ["airy", "balanced"], "color-led", "peak"),
  recipe("kpi", "kpi-image-split", "image-split", (plan) => Boolean(plan.kpis?.length && wantsImageSplit(plan)), ["airy", "balanced"], "image-led", "peak"),
  recipe("comparison", "comparison-divided", "divided", (plan) => Boolean(plan.comparison)),
  recipe("comparison", "comparison-split", "split", (plan) => Boolean(plan.comparison)),
  recipe("process", "process-timeline", "timeline", (plan) => Boolean(plan.steps?.length)),
  recipe("process", "process-ledger", "ledger", (plan) => Boolean(plan.steps?.length)),
  recipe("process", "process-divided", "divided", (plan) => (plan.steps?.length ?? 0) >= 2),
  recipe("table", "table-ledger", "ledger", (plan) => Boolean(plan.table && plan.table.headers.length === 2), ALL_DENSITIES, "data-led"),
  recipe("table", "table-grid", "grid", (plan) => Boolean(plan.table), ALL_DENSITIES, "data-led"),
  recipe("table", "table-split-chart", "split", (plan) => Boolean(plan.chart), ALL_DENSITIES, "data-led"),
  recipe("closing", "closing-hero", "hero", noRequirement, ALL_DENSITIES, "type-led"),
  recipe("closing", "closing-split", "split"),
  recipe("closing", "closing-image-background", "image-background", wantsImageBackground, ["airy", "balanced"], "image-led", "peak"),
  recipe("closing", "closing-color-field", "color-field", wantsColorField, ["airy", "balanced"], "color-led", "peak"),
];

export function recipesFor(plan: SlidePlan, themeId: ThemeId, density: SlideDensity): RecipeDefinition[] {
  return RECIPE_REGISTRY.filter((candidate) =>
    candidate.role === plan.role
    && candidate.themes.includes(themeId)
    && candidate.densities.includes(density)
    && candidate.supports(plan));
}
