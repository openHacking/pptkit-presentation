import type {
  DeckSpec,
  DesignVariation,
  LayoutDecision,
  SlideDensity,
  SlidePlan,
  StructuralIssue,
} from "../contracts.js";
import { recipesFor } from "./registry.js";

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function inferDensity(plan: SlidePlan): SlideDensity {
  if (plan.density) return plan.density;
  const count = Math.max(
    plan.items?.length ?? 0,
    plan.steps?.length ?? 0,
    plan.kpis?.length ?? 0,
    plan.table?.rows.length ?? 0,
    plan.chart?.categories.length ?? 0,
  );
  if (count >= 6 || (plan.message?.length ?? 0) > 180) return "dense";
  if (count >= 3 || (plan.message?.length ?? 0) > 80) return "balanced";
  return "airy";
}

function candidateIndex(seed: string, slide: SlidePlan, variation: DesignVariation, count: number): number {
  if (count <= 1 || variation === "restrained") return 0;
  const candidateCount = variation === "balanced" ? Math.min(2, count) : count;
  return hash(`${seed}:${slide.id}:${slide.role}`) % candidateCount;
}

export function planDeckLayout(spec: DeckSpec): LayoutDecision[] {
  const seed = spec.design.seed;
  const variation = spec.design.variation;
  const decisions: LayoutDecision[] = [];
  for (const slide of spec.slides) {
    const density = inferDensity(slide);
    let candidates = recipesFor(slide, spec.design.theme.id, density);
    if (slide.composition) candidates = candidates.filter((candidate) => candidate.composition === slide.composition);
    if (!candidates.length) {
      const intent = slide.composition ? ` composition ${slide.composition}` : "";
      throw new Error(`No layout recipe supports ${slide.role} slide ${slide.id} with${intent} density ${density}.`);
    }

    const recent = decisions.slice(-2).map((decision) => decision.composition);
    const nonRepeating = candidates.filter((candidate) => !recent.every((composition) => composition === candidate.composition));
    if (!slide.composition && nonRepeating.length) candidates = nonRepeating;
    const chosen = candidates[candidateIndex(seed, slide, variation, candidates.length)]!;
    decisions.push({
      slideId: slide.id,
      composition: chosen.composition,
      density,
      recipeId: chosen.id,
      reason: slide.composition
        ? `Explicit ${slide.composition} composition matched ${chosen.id}.`
        : `Selected ${chosen.id} from role, content, ${density} density, adjacent rhythm, theme, and seed.`,
    });
  }
  return decisions;
}

export function validateLayoutPlan(spec: DeckSpec): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  for (const slide of spec.slides) {
    const density = inferDensity(slide);
    const candidates = recipesFor(slide, spec.design.theme.id, density);
    if (slide.composition && !candidates.some((candidate) => candidate.composition === slide.composition)) {
      issues.push({
        severity: "error",
        code: "incompatible-composition",
        message: `${slide.role} slide cannot use ${slide.composition} with its current content and ${density} density.`,
        slideId: slide.id,
      });
    } else if (!candidates.length) {
      issues.push({ severity: "error", code: "missing-layout-recipe", message: `No layout recipe supports this ${slide.role} slide.`, slideId: slide.id });
    }
  }

  if (issues.some((issue) => issue.severity === "error")) return issues;

  const decisions = planDeckLayout(spec);
  for (let index = 2; index < decisions.length; index += 1) {
    const current = decisions[index]!;
    if (current.composition === decisions[index - 1]!.composition && current.composition === decisions[index - 2]!.composition) {
      issues.push({ severity: "warning", code: "repeated-composition", message: `Three consecutive slides use ${current.composition}; revise an explicit composition or content shape.`, slideId: current.slideId });
    }
  }
  if (decisions.length >= 8 && new Set(decisions.map((decision) => decision.composition)).size < 4) {
    issues.push({ severity: "warning", code: "low-layout-diversity", message: "A deck of eight or more slides should normally use at least four content-appropriate compositions." });
  }
  return issues;
}
