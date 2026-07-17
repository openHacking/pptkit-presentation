import type { CompositionIntent, SlideDensity, SlidePlan, SlideRole, ThemeId } from "../contracts.js";

export interface RecipeDefinition {
  id: string;
  role: SlideRole;
  composition: CompositionIntent;
  densities: readonly SlideDensity[];
  themes: readonly ThemeId[];
  supports(plan: SlidePlan): boolean;
}

const ALL_THEMES = ["clean-business", "swiss-grid", "editorial-story"] as const;
const ALL_DENSITIES = ["airy", "balanced", "dense"] as const;
const noRequirement = () => true;

function recipe(
  role: SlideRole,
  id: string,
  composition: CompositionIntent,
  supports: (plan: SlidePlan) => boolean = noRequirement,
  densities: readonly SlideDensity[] = ALL_DENSITIES,
): RecipeDefinition {
  return { id, role, composition, supports, densities, themes: ALL_THEMES };
}

export const RECIPE_REGISTRY: readonly RecipeDefinition[] = [
  recipe("cover", "cover-hero", "hero"),
  recipe("cover", "cover-split", "split"),
  recipe("agenda", "agenda-ledger", "ledger", (plan) => Boolean(plan.items?.length)),
  recipe("agenda", "agenda-grid", "grid", (plan) => (plan.items?.length ?? 0) >= 2),
  recipe("section", "section-hero", "hero"),
  recipe("section", "section-divided", "divided"),
  recipe("statement", "statement-hero", "hero", (plan) => Boolean(plan.message)),
  recipe("statement", "statement-split", "split", (plan) => Boolean(plan.message && plan.items?.length)),
  recipe("statement", "statement-divided", "divided", (plan) => Boolean(plan.message)),
  recipe("image", "image-hero", "image-hero", (plan) => Boolean(plan.image && !plan.items?.length), ["airy", "balanced"]),
  recipe("image", "image-split", "image-split", (plan) => Boolean(plan.items?.length)),
  recipe("image", "image-evidence-split", "split", (plan) => Boolean(plan.image && plan.items?.length)),
  recipe("kpi", "kpi-grid", "grid", (plan) => Boolean(plan.kpis?.length)),
  recipe("kpi", "kpi-ledger", "ledger", (plan) => Boolean(plan.kpis?.length)),
  recipe("comparison", "comparison-divided", "divided", (plan) => Boolean(plan.comparison)),
  recipe("comparison", "comparison-split", "split", (plan) => Boolean(plan.comparison)),
  recipe("process", "process-timeline", "timeline", (plan) => Boolean(plan.steps?.length)),
  recipe("process", "process-ledger", "ledger", (plan) => Boolean(plan.steps?.length)),
  recipe("process", "process-divided", "divided", (plan) => (plan.steps?.length ?? 0) >= 2),
  recipe("table", "table-ledger", "ledger", (plan) => Boolean(plan.table && plan.table.headers.length === 2)),
  recipe("table", "table-grid", "grid", (plan) => Boolean(plan.table)),
  recipe("table", "table-split-chart", "split", (plan) => Boolean(plan.chart)),
  recipe("closing", "closing-hero", "hero"),
  recipe("closing", "closing-split", "split"),
];

export function recipesFor(plan: SlidePlan, themeId: ThemeId, density: SlideDensity): RecipeDefinition[] {
  return RECIPE_REGISTRY.filter((candidate) =>
    candidate.role === plan.role
    && candidate.themes.includes(themeId)
    && candidate.densities.includes(density)
    && candidate.supports(plan));
}
