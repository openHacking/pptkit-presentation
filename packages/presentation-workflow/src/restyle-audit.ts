import type {
  DeckSpec,
  ExtractedSource,
  PptxEvidence,
  RestyleAudit,
  SessionAsset,
  SlidePlan,
  SourceSlideEvidence,
  StructuralIssue,
} from "./contracts.js";

function visibleText(slide: SlidePlan): string {
  return [
    slide.title,
    slide.subtitle,
    slide.message,
    ...(slide.items ?? []),
    ...(slide.steps ?? []),
    ...(slide.kpis ?? []).flatMap((item) => [item.value, item.label, item.detail]),
    slide.comparison?.left.heading,
    ...(slide.comparison?.left.items ?? []),
    slide.comparison?.right.heading,
    ...(slide.comparison?.right.items ?? []),
    ...(slide.table?.headers ?? []),
    ...(slide.table?.rows.flat() ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
}

function tokens(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
  const result = new Set<string>();
  for (const word of normalized.match(/[a-z0-9][a-z0-9._+/-]*/g) ?? []) {
    if (word.length > 1 || /\d/.test(word)) result.add(word);
  }
  const cjk = Array.from(normalized).filter((character) => /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character));
  for (let index = 0; index < cjk.length - 1; index += 1) result.add(`${cjk[index]}${cjk[index + 1]}`);
  if (cjk.length === 1) result.add(cjk[0]!);
  return result;
}

function retainedTokens(source: Set<string>, output: Set<string>) {
  let retained = 0;
  for (const token of source) if (output.has(token)) retained += 1;
  return retained;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function sourceSlides(sources: ExtractedSource[]) {
  return sources.flatMap((source) => (source.pptx?.slides ?? []).map((slide) => ({ source, slide })));
}

function outputSlideMap(spec: DeckSpec, outputEvidence: PptxEvidence | undefined) {
  const map = new Map<string, SourceSlideEvidence>();
  if (!outputEvidence) return map;
  spec.slides.forEach((slide, index) => {
    const evidence = outputEvidence.slides[index];
    if (evidence) map.set(slide.id, evidence);
  });
  return map;
}

function isRasterizedRisk(source: SourceSlideEvidence, output: SourceSlideEvidence, sourceSize: PptxEvidence["size"]): boolean {
  const images = output.shapes.filter((shape) => shape.kind === "image");
  if (images.length !== 1 || output.shapes.length > 8) return false;
  if (source.shapes.length < 8 && source.text.length < 80) return false;
  if (output.text.length > Math.max(40, source.text.length * 0.15)) return false;
  const imageBox = images[0]?.box;
  if (!imageBox || !sourceSize || imageBox.height <= 0 || sourceSize.height <= 0) return false;
  const imageAspect = imageBox.width / imageBox.height;
  const sourceAspect = sourceSize.width / sourceSize.height;
  return Math.abs(imageAspect / sourceAspect - 1) <= 0.03;
}

export function auditRestyleTransformation(
  spec: DeckSpec,
  sources: ExtractedSource[],
  assets: SessionAsset[] = [],
  outputEvidence?: PptxEvidence,
): RestyleAudit {
  if (spec.brief.mode !== "restyle") {
    return {
      status: "not-applicable",
      sourceSlideCount: 0,
      referencedSourceSlideCount: 0,
      sourceCoverage: 1,
      aggregateTextRetention: 1,
      unreferencedSourceSlides: [],
      rasterizedSlideRiskIds: [],
      assetIssueIds: [],
      slideAudits: [],
      issues: [],
    };
  }

  const issues: StructuralIssue[] = [];
  const allSourceSlides = sourceSlides(sources);
  const validSourceSlideKeys = new Set(allSourceSlides.map(({ source, slide }) => `${source.id}:${slide.slideNumber}`));
  const outputById = outputSlideMap(spec, outputEvidence);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const mappedOutputs = new Map<string, SlidePlan[]>();
  if (allSourceSlides.length === 0) {
    issues.push({ severity: "warning", code: "missing-restyle-source-evidence", message: "Restyle mode requires at least one PPTX source with structured per-slide evidence." });
  }
  for (const outputSlide of spec.slides) {
    for (const reference of outputSlide.sourceRefs ?? []) {
      for (const slideNumber of reference.slideNumbers ?? []) {
        const key = `${reference.id}:${slideNumber}`;
        if (!validSourceSlideKeys.has(key)) {
          issues.push({ severity: "warning", code: "invalid-source-slide-reference", message: `Output slide ${outputSlide.id} references unavailable source slide ${reference.id}:${slideNumber}.`, slideId: outputSlide.id });
        }
        const existing = mappedOutputs.get(key) ?? [];
        existing.push(outputSlide);
        mappedOutputs.set(key, existing);
      }
    }
  }

  let aggregateSourceTokens = 0;
  let aggregateRetainedTokens = 0;
  const unreferencedSourceSlides: Array<{ sourceId: string; slideNumber: number }> = [];
  const rasterizedSlideRiskIds = new Set<string>();
  const slideAudits = allSourceSlides.map(({ source, slide }) => {
    const key = `${source.id}:${slide.slideNumber}`;
    const outputs = mappedOutputs.get(key) ?? [];
    if (outputs.length === 0) unreferencedSourceSlides.push({ sourceId: source.id, slideNumber: slide.slideNumber });
    const sourceTokenSet = tokens(slide.text);
    const outputTokenSet = tokens(outputs.map(visibleText).join("\n"));
    const retained = retainedTokens(sourceTokenSet, outputTokenSet);
    aggregateSourceTokens += sourceTokenSet.size;
    aggregateRetainedTokens += retained;
    const textRetention = ratio(retained, sourceTokenSet.size);
    const warnings: string[] = [];
    if (sourceTokenSet.size >= 12 && textRetention < 0.25) {
      const message = `Source slide ${slide.slideNumber} retains only ${Math.round(textRetention * 100)}% of its informative text tokens.`;
      warnings.push(message);
      issues.push({ severity: "warning", code: "low-source-text-retention", message, ...(outputs[0] ? { slideId: outputs[0].id } : {}) });
    }
    for (const output of outputs) {
      const outputSlide = outputById.get(output.id);
      if (outputSlide && isRasterizedRisk(slide, outputSlide, source.pptx?.size)) {
        rasterizedSlideRiskIds.add(output.id);
        const message = `Output slide ${output.id} appears to replace complex source slide ${slide.slideNumber} with a single slide-as-image asset.`;
        warnings.push(message);
        issues.push({ severity: "warning", code: "rasterized-slide-risk", message, slideId: output.id });
      }
    }
    return {
      sourceId: source.id,
      slideNumber: slide.slideNumber,
      mappedOutputSlideIds: outputs.map((output) => output.id),
      textRetention,
      warnings,
    };
  });

  const aggregateTextRetention = ratio(aggregateRetainedTokens, aggregateSourceTokens);
  if (aggregateSourceTokens >= 12 && aggregateTextRetention < 0.5) {
    issues.push({ severity: "warning", code: "low-aggregate-text-retention", message: `The restyled deck retains only ${Math.round(aggregateTextRetention * 100)}% of informative source text tokens.` });
  }
  if (unreferencedSourceSlides.length > 0) {
    issues.push({ severity: "warning", code: "unreferenced-source-slides", message: `${unreferencedSourceSlides.length} source slides are not mapped to any output slide.` });
  }

  const assetIssueIds = new Set<string>();
  for (const slide of spec.slides) {
    if (!slide.image) continue;
    const asset = assetById.get(slide.image.assetId);
    if (!asset?.origin) {
      assetIssueIds.add(slide.image.assetId);
      issues.push({ severity: "warning", code: "unclassified-restyle-asset", message: `Restyle image ${slide.image.assetId} has no source provenance.`, slideId: slide.id });
      continue;
    }
    if (asset.origin.kind === "source-slide-preview") {
      assetIssueIds.add(asset.id);
      issues.push({ severity: "warning", code: "source-slide-preview-used", message: `Slide ${slide.id} uses a whole-slide preview as presentation content.`, slideId: slide.id });
    }
    if (asset.origin.kind === "source-slide-crop" && asset.origin.crop && asset.origin.sourceId) {
      const sourceSize = sources.find((source) => source.id === asset.origin?.sourceId)?.pptx?.size;
      if (sourceSize) {
        const cropArea = asset.origin.crop.width * asset.origin.crop.height;
        const slideArea = sourceSize.width * sourceSize.height;
        if (slideArea > 0 && cropArea / slideArea >= 0.8) {
          assetIssueIds.add(asset.id);
          issues.push({ severity: "warning", code: "oversized-source-slide-crop", message: `Crop ${asset.id} covers at least 80% of its source slide and is effectively a whole-slide screenshot.`, slideId: slide.id });
        }
      }
    }
  }

  const referencedSourceSlideCount = allSourceSlides.length - unreferencedSourceSlides.length;
  return {
    status: "checked",
    sourceSlideCount: allSourceSlides.length,
    referencedSourceSlideCount,
    sourceCoverage: ratio(referencedSourceSlideCount, allSourceSlides.length),
    aggregateTextRetention,
    unreferencedSourceSlides,
    rasterizedSlideRiskIds: [...rasterizedSlideRiskIds],
    assetIssueIds: [...assetIssueIds],
    slideAudits,
    issues,
  };
}
