import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { zipSync } from "fflate";

import { normalizePresentation } from "@pptkit/core";

import {
  authorDeck,
  analyzePptxEvidence,
  auditRestyleTransformation,
  extractPptxEmbeddedAssets,
  extractSource,
  inspectPptxPackage,
  inspectStructure,
  measureImageDimensions,
  parseDeckSession,
  planDeckLayout,
  validateDeckSpec,
} from "../dist/index.js";
import { RECIPE_REGISTRY } from "../dist/authoring/registry.js";

function deck(themeId = "clean-business") {
  return {
    design: { theme: { id: themeId }, seed: "browser-workflow", variation: "balanced" },
    brief: {
      title: "Browser workflow",
      audience: "Reviewers",
      purpose: "Exercise the portable runtime",
      language: "en-US",
      slideCountRange: [3, 3],
      imagePolicy: "Embedded assets",
      constraints: [],
    },
    slides: [
      { id: "cover", role: "cover", title: "Browser-first decks", subtitle: "Preview before download" },
      { id: "process", role: "process", title: "Review loop", steps: ["Import", "Preview", "Revise", "Download"] },
      { id: "closing", role: "closing", title: "Ready", message: "Generate only when approved." },
    ],
  };
}

function allRolesDeck(themeId = "clean-business") {
  return {
    design: { theme: { id: themeId }, seed: "all-roles", variation: "balanced" },
    brief: {
      title: "Design system fixture",
      audience: "Reviewers",
      purpose: "Exercise every deterministic role recipe",
      language: "en-US",
      slideCountRange: [10, 10],
      imagePolicy: "No images",
      constraints: [],
    },
    slides: [
      { id: "cover", role: "cover", title: "A clearer presentation system", subtitle: "Hierarchy, rhythm, and provenance" },
      { id: "agenda", role: "agenda", title: "The argument", items: ["Frame the decision", "Show the evidence", "Make the next move clear"] },
      { id: "section", role: "section", title: "01 / Direction", message: "A design system should make the message easier to see." },
      { id: "statement", role: "statement", title: "The core judgment", message: "Structure turns evidence into action.", items: ["One message", "One reading path", "One deliberate composition"] },
      { id: "image", role: "image", title: "Evidence belongs in the layout", message: "Images support the argument.", items: ["Preserve aspect ratio", "Use a stable slot"] },
      { id: "kpi", role: "kpi", title: "Signals that matter", kpis: [{ value: "+18%", label: "Activation", detail: "Quarter over quarter" }, { value: "72%", label: "Retention" }, { value: "3.4×", label: "Velocity" }] },
      { id: "comparison", role: "comparison", title: "Two approaches", comparison: { left: { heading: "Before", items: ["Repeated cards", "Weak hierarchy"] }, right: { heading: "After", items: ["Theme-specific structure", "Readable scale"] } } },
      { id: "process", role: "process", title: "A deliberate workflow", steps: ["Frame", "Outline", "Compose", "Review"] },
      { id: "table", role: "table", title: "Delivery ledger", table: { headers: ["Artifact", "Role"], rows: [["Brief", "Locks the purpose"], ["Outline", "Locks the argument"], ["Preview", "Reveals layout issues"]] } },
      { id: "closing", role: "closing", title: "Make the next decision obvious.", message: "Review the evidence, then act." },
    ],
  };
}

function saasHuntDeck() {
  const sourceRefs = [{ id: "src-01-slides", label: "slides.md" }];
  return {
    design: { theme: { id: "swiss-grid" }, seed: "saas-hunt", variation: "balanced" },
    brief: {
      title: "SaaS Hunt", audience: "Founders and product teams",
      purpose: "Explain continuous product discovery", language: "en-US",
      slideCountRange: [6, 6], imagePolicy: "No images", constraints: [],
    },
    slides: [
      { id: "cover", role: "cover", title: "SaaS Hunt", subtitle: "Launch and grow your SaaS earlier", sourceRefs },
      { id: "why", role: "agenda", title: "Why SaaS Hunt?", items: ["Gain visibility before launch", "Build an audience early", "Generate long-term organic traffic", "Help users discover innovative SaaS products"], sourceRefs },
      { id: "platform", role: "statement", title: "A platform for discovery before and after release", message: "SaaS Hunt helps people launch, discover, and promote SaaS products through one continuous discovery loop.", sourceRefs },
      { id: "features", role: "table", title: "Core features", table: { headers: ["Feature", "Role"], rows: [["Product Launch Pages", "Present the launch story"], ["Coming Soon Listings", "Collect interest early"], ["Product Categories", "Create browsing paths"], ["Search & Discovery", "Find relevant SaaS quickly"], ["Product Showcase", "Keep products visible"]] }, sourceRefs },
      { id: "difference", role: "comparison", title: "How it differs", comparison: { left: { heading: "Product Hunt", items: ["Launch-day momentum", "Short visibility spike"] }, right: { heading: "SaaS Hunt", items: ["Continuous discovery", "Long-term visibility"] } }, sourceRefs },
      { id: "close", role: "closing", title: "Build momentum before launch, not after.", message: "saashunt.pro", sourceRefs },
    ],
  };
}

function presentationOf(spec, resolveAsset) {
  return authorDeck(spec, resolveAsset).presentation;
}

function pptxEvidenceFixture() {
  const xml = (value) => new TextEncoder().encode(value);
  const entries = {
    "ppt/presentation.xml": xml(`<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`),
    "ppt/slides/slide1.xml": xml(`<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Second file"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Second file in package</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`),
    "ppt/slides/slide2.xml": xml(`<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="200000"/><a:ext cx="4000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="3200" b="1"/><a:t>Architecture evidence</a:t></a:r></a:p></p:txBody></p:sp><p:grpSp><p:nvGrpSpPr><p:cNvPr id="3" name="Capability group"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="4000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="2000000" cy="1000000"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="4" name="Node"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="250000"/><a:ext cx="1000000" cy="500000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Inventory node</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp><p:cxnSp><p:nvCxnSpPr><p:cNvPr id="5" name="Flow"/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="2000000" y="2000000"/><a:ext cx="1000000" cy="0"/></a:xfrm></p:spPr></p:cxnSp><p:pic><p:nvPicPr><p:cNvPr id="6" name="Photo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill><p:spPr><a:xfrm><a:off x="7000000" y="1000000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm></p:spPr></p:pic><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table"/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="4000000"/><a:ext cx="4000000" cy="1000000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Area</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Owner</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="SmartArt"/></p:nvGraphicFramePr><p:xfrm><a:off x="6000000" y="3500000"/><a:ext cx="4000000" cy="1500000"/></p:xfrm><a:graphic><a:graphicData><dgm:relIds r:dm="rIdDiagram"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`),
    "ppt/slides/_rels/slide2.xml.rels": xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rIdDiagram" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/><Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`),
    "ppt/diagrams/data1.xml": xml(`<?xml version="1.0"?><dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="a"><dgm:t><a:p><a:r><a:t>Order</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="b"><dgm:t><a:p><a:r><a:t>Delivery</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn srcId="a" destId="b"/></dgm:cxnLst></dgm:dataModel>`),
    "ppt/notesSlides/notesSlide1.xml": xml(`<?xml version="1.0"?><p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Presenter note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`),
    "ppt/media/image1.png": new Uint8Array(24),
  };
  return zipSync(entries);
}

test("authors the same portable deck across every theme", () => {
  for (const theme of ["clean-business", "swiss-grid", "editorial-story"]) {
    const spec = deck(theme);
    assert.deepEqual(validateDeckSpec(spec), []);
    const presentation = presentationOf(spec);
    assert.equal(presentation.slides.length, 3);
    assert.equal(presentation.metadata.title, "Browser workflow");
  }
});

test("registers multiple stable recipes for every semantic role", () => {
  for (const role of ["cover", "agenda", "section", "statement", "image", "kpi", "comparison", "process", "table", "closing"]) {
    const recipes = RECIPE_REGISTRY.filter((candidate) => candidate.role === role);
    assert.ok(recipes.length >= 2, `${role} should expose at least two internal recipes`);
    assert.equal(new Set(recipes.map((candidate) => candidate.id)).size, recipes.length);
  }
  for (const role of ["statement", "image", "process", "table"]) {
    assert.ok(RECIPE_REGISTRY.filter((candidate) => candidate.role === role).length >= 3, `${role} should expose at least three recipes`);
  }
});

test("plans deterministic, explainable layouts from seed and explicit intent", () => {
  const spec = allRolesDeck("clean-business");
  spec.design = { ...spec.design, seed: "stable-seed", variation: "expressive" };
  assert.deepEqual(planDeckLayout(spec), planDeckLayout(structuredClone(spec)));
  const statement = spec.slides.find((slide) => slide.id === "statement");
  statement.composition = "split";
  const decision = planDeckLayout(spec).find((candidate) => candidate.slideId === "statement");
  assert.equal(decision.composition, "split");
  assert.match(decision.reason, /Explicit split/);

  const recipeIds = new Set();
  for (let index = 0; index < 24; index += 1) {
    const varied = deck();
    varied.design = { ...varied.design, seed: `seed-${index}`, variation: "expressive" };
    recipeIds.add(planDeckLayout(varied)[0].recipeId);
  }
  assert.ok(recipeIds.size > 1, "different seeds should explore compatible cover recipes");
  const coverRecipeIds = new Set(RECIPE_REGISTRY.filter((candidate) => candidate.role === "cover").map((candidate) => candidate.id));
  for (const recipeId of recipeIds) assert.ok(coverRecipeIds.has(recipeId));
});

test("rejects incompatible compositions and unsafe theme overrides", () => {
  const spec = deck();
  spec.slides[1].composition = "image-hero";
  spec.design = { ...spec.design, theme: { ...spec.design.theme, overrides: { colors: { text: "777777", background: "888888" }, fonts: { heading: "" } } } };
  const issues = validateDeckSpec(spec);
  assert.ok(issues.some((issue) => issue.code === "incompatible-composition"));
  assert.throws(
    () => authorDeck(spec),
    /No layout recipe supports process slide process with composition image-hero density balanced/,
  );
  assert.ok(issues.some((issue) => issue.code === "theme-contrast"));
  assert.ok(issues.some((issue) => issue.code === "invalid-theme-font"));
});

test("authors every role without structural failures across every theme", () => {
  for (const theme of ["clean-business", "swiss-grid", "editorial-story"]) {
    const spec = allRolesDeck(theme);
    assert.deepEqual(validateDeckSpec(spec), []);
    const presentation = presentationOf(spec);
    assert.deepEqual(inspectStructure(presentation), []);
    assert.equal(presentation.slides.length, 10);
  }
});

test("authors every registered recipe without geometry errors across themes", () => {
  for (const theme of ["clean-business", "swiss-grid", "editorial-story"]) {
    const source = allRolesDeck(theme);
    for (const recipe of RECIPE_REGISTRY) {
      const base = source.slides.find((slide) => slide.role === recipe.role);
      const slide = structuredClone(base);
      slide.composition = recipe.composition;
      slide.density = "balanced";
      if (recipe.id === "image-hero") slide.items = undefined;
      if (recipe.role === "image") slide.image = { assetId: "fixture", alt: "Fixture", width: 1200, height: 675 };
      if (recipe.id === "table-split-chart") {
        slide.table = undefined;
        slide.chart = { type: "bar", categories: ["A", "B", "C"], series: [{ name: "Value", values: [1, 2, 3] }] };
      }
      const spec = { ...source, brief: { ...source.brief, slideCountRange: [1, 1] }, slides: [slide], design: { ...source.design, seed: recipe.id } };
      assert.deepEqual(validateDeckSpec(spec, new Set(["fixture"])).filter((issue) => issue.severity === "error"), [], `${theme}/${recipe.id}`);
      assert.equal(planDeckLayout(spec)[0].recipeId, recipe.id, `${theme}/${recipe.id}`);
      const presentation = presentationOf(spec, () => ({
        source: { type: "url", value: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'/%3E" },
        mimeType: "image/svg+xml",
      }));
      assert.deepEqual(inspectStructure(presentation).filter((issue) => issue.severity === "error"), [], `${theme}/${recipe.id}`);
    }
  }
});

test("renders the closing title exactly once across every theme", () => {
  for (const theme of ["clean-business", "swiss-grid", "editorial-story"]) {
    const spec = deck(theme);
    const normalized = normalizePresentation(presentationOf(spec));
    const closing = normalized.slides.at(-1);
    const titleElements = closing.elements.filter(
      (element) => element.type === "text" && element.plainText === "Ready",
    );

    assert.deepEqual(titleElements.map((element) => element.name), ["Closing message"]);
  }
});

test("keeps provenance in speaker notes and out of visible slide text", () => {
  const spec = deck("swiss-grid");
  spec.slides[1].notes = "Presenter context.";
  spec.slides[1].sourceRefs = [{ id: "src-01-slides", label: "slides.md" }];
  const normalized = normalizePresentation(presentationOf(spec));
  const visible = normalized.slides[1].elements
    .filter((element) => element.type === "text")
    .map((element) => element.plainText)
    .join("\n");
  const notes = normalized.slides[1].notes.flatMap((paragraph) => paragraph.runs.map((run) => run.text)).join("\n");
  assert.doesNotMatch(visible, /Sources:|src-01-slides|slides\.md/);
  assert.match(notes, /Presenter context/);
  assert.match(notes, /Source references \(provenance only/);
  assert.match(notes, /src-01-slides/);
  assert.match(notes, /slides\.md/);
});

test("uses presentation-scale font floors for ordinary visible copy", () => {
  const normalized = normalizePresentation(presentationOf(allRolesDeck("clean-business")));
  for (const slide of normalized.slides) {
    for (const element of slide.elements) {
      if (element.type === "text" && !element.name.startsWith("Metadata")) {
        for (const paragraph of element.content) {
          for (const run of paragraph.runs) assert.ok(run.style.fontSize >= 15, `${slide.id}/${element.name} uses ${run.style.fontSize} pt`);
        }
      }
      if (element.type === "table") {
        for (const row of element.rows) for (const cell of row.cells) for (const paragraph of cell.content) for (const run of paragraph.runs) {
          assert.ok(run.style.fontSize >= 15, `${slide.id}/table uses ${run.style.fontSize} pt`);
        }
      }
    }
  }
});

test("inherits PowerPoint list indentation instead of overriding it in the workflow", () => {
  const normalized = normalizePresentation(presentationOf(allRolesDeck("clean-business")));
  const bulletParagraphs = normalized.slides
    .flatMap((slide) => slide.elements)
    .filter((element) => element.type === "text")
    .flatMap((element) => element.content)
    .filter((paragraph) => paragraph.style.bullet.type === "bullet");
  assert.ok(bulletParagraphs.length > 0);
  for (const paragraph of bulletParagraphs) {
    assert.equal(paragraph.style.indent, 27);
    assert.equal(paragraph.style.hanging, 27);
  }
});

test("keeps Clean Business geometry square and restrained", () => {
  const normalized = normalizePresentation(presentationOf(allRolesDeck("clean-business")));
  const roundedShapes = normalized.slides
    .flatMap((slide) => slide.elements)
    .filter((element) => element.type === "shape" && element.shape === "roundRect");
  assert.deepEqual(roundedShapes, []);
});

test("keeps chart categories at the 15 pt data-detail floor", () => {
  const spec = deck("clean-business");
  spec.slides[1] = {
    id: "chart",
    role: "table",
    title: "Adoption trend",
    chart: { type: "bar", categories: ["Q1", "Q2", "Q3"], series: [{ name: "Teams", values: [12, 18, 27] }] },
  };
  const normalized = normalizePresentation(presentationOf(spec));
  const labels = normalized.slides[1].elements.filter((element) => element.name === "Chart category");
  assert.equal(labels.length, 3);
  for (const label of labels) for (const paragraph of label.content) for (const run of paragraph.runs) {
    assert.ok(run.style.fontSize >= 15);
  }
  assert.deepEqual(inspectStructure(normalized), []);
});

test("warns instead of silently shrinking dense or internal workflow copy", () => {
  const spec = deck();
  spec.slides[1].title = "A very long title ".repeat(8);
  spec.slides[1].items = ["src-01-report: report.md", "Input slides.md", "A paragraph-like item ".repeat(8)];
  const issues = validateDeckSpec(spec);
  assert.ok(issues.some((issue) => issue.code === "title-density"));
  assert.ok(issues.some((issue) => issue.code === "item-density"));
  assert.ok(issues.some((issue) => issue.code === "internal-metadata-visible"));
});

test("allows a human-readable URL citation without treating it as an internal filename", () => {
  const spec = deck();
  spec.slides[1].items = ["Research note: https://example.com/report.pdf"];
  assert.ok(!validateDeckSpec(spec).some((issue) => issue.code === "internal-metadata-visible"));
});

test("uses the deterministic image-hero composition when an image has no support list", () => {
  const spec = deck("editorial-story");
  spec.slides[1] = {
    id: "image",
    role: "image",
    title: "Evidence, given room to lead",
    message: "One image. One editorial judgment.",
    image: { assetId: "hero", alt: "Abstract editorial composition" },
  };
  assert.deepEqual(validateDeckSpec(spec, new Set(["hero"])), []);
  const presentation = normalizePresentation(presentationOf(spec, () => ({
    source: { type: "url", value: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'/%3E" },
    mimeType: "image/svg+xml",
  })));
  assert.ok(presentation.slides[1].elements.some((element) => element.name === "Image hero message"));
  assert.deepEqual(inspectStructure(presentation), []);
});

test("regresses the SaaS Hunt case without visible source footers or weak structure", () => {
  const spec = saasHuntDeck();
  assert.deepEqual(validateDeckSpec(spec), []);
  const normalized = normalizePresentation(presentationOf(spec));
  assert.deepEqual(inspectStructure(normalized), []);
  assert.equal(normalized.slides.length, 6);
  for (const [index, slide] of normalized.slides.entries()) {
    const visible = slide.elements.flatMap((element) => element.type === "text" ? [element.plainText] : []).join("\n");
    assert.doesNotMatch(visible, /Sources:|src-01-slides|slides\.md/);
    assert.match(slide.notes.flatMap((paragraph) => paragraph.runs.map((run) => run.text)).join("\n"), /src-01-slides/);
    if (index > 0) assert.ok(slide.elements.length >= 6, `${slide.id} should use a composed layout`);
  }
});

test("extracts text bytes without filesystem APIs", async () => {
  const source = await extractSource({ name: "brief.md", mimeType: "text/markdown", bytes: new TextEncoder().encode("# Evidence") }, 0);
  assert.equal(source.id, "src-01-brief");
  assert.equal(source.content, "# Evidence");
});

test("extracts PPTX content through the same source parser contract", async () => {
  const input = { name: "reference.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: new Uint8Array([1, 2, 3]) };
  const source = await extractSource(input, 0, { pptx: async () => ({ content: "Slide 1\nKeep this message" }) });
  assert.equal(source.content, "Slide 1\nKeep this message");
  assert.deepEqual(source.warnings, []);
});

test("analyzes PPTX evidence in presentation order with groups, tables, diagrams, images, and notes", () => {
  const evidence = analyzePptxEvidence(pptxEvidenceFixture());
  assert.equal(evidence.slideCount, 2);
  assert.deepEqual(evidence.size, { width: 13.333333333333334, height: 7.5 });
  assert.equal(evidence.slides[0].partName, "ppt/slides/slide2.xml");
  assert.equal(evidence.slides[0].title, "Architecture evidence");
  assert.equal(evidence.slides[0].shapes.filter((shape) => shape.kind === "group").length, 1);
  assert.equal(evidence.slides[0].shapes.filter((shape) => shape.kind === "connector").length, 1);
  assert.equal(evidence.slides[0].shapes.find((shape) => shape.name === "Node").box.x, 2.1872265966754156);
  assert.deepEqual(evidence.slides[0].tables[0].rows, [["Area", "Owner"]]);
  assert.deepEqual(evidence.slides[0].diagrams[0].labels, ["Order", "Delivery"]);
  assert.deepEqual(evidence.slides[0].diagrams[0].edges, [{ from: "a", to: "b" }]);
  assert.equal(evidence.slides[0].shapes.find((shape) => shape.kind === "image").relationshipTarget, "ppt/media/image1.png");
  assert.match(evidence.slides[0].notes, /Presenter note/);
  const embedded = extractPptxEmbeddedAssets(pptxEvidenceFixture(), evidence);
  assert.deepEqual(embedded.map((asset) => ({ partName: asset.partName, slideNumbers: asset.slideNumbers })), [{ partName: "ppt/media/image1.png", slideNumbers: [1] }]);
});

test("audits restyle mapping, text retention, asset provenance, and rasterized slide risk without blocking create decks", () => {
  const sourcePptx = analyzePptxEvidence(pptxEvidenceFixture());
  const source = { id: "src-01-reference", name: "reference.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", type: "document", pptx: sourcePptx, warnings: [] };
  const good = deck();
  good.brief.mode = "restyle";
  good.slides = [
    { id: "architecture", role: "statement", title: "Architecture evidence", message: "Inventory node connects Order and Delivery. Area ownership remains explicit.", sourceRefs: [{ id: source.id, slideNumbers: [1] }] },
    { id: "package-order", role: "statement", title: "Second file in package", message: "The source presentation order is preserved as evidence.", sourceRefs: [{ id: source.id, slideNumbers: [2] }] },
    { id: "close", role: "closing", title: "Ready", message: "Review the editable reconstruction." },
  ];
  good.brief.slideCountRange = [3, 3];
  const goodAudit = auditRestyleTransformation(good, [source]);
  assert.equal(goodAudit.sourceCoverage, 1);
  assert.equal(goodAudit.rasterizedSlideRiskIds.length, 0);
  assert.doesNotMatch(goodAudit.issues.map((issue) => issue.code).join(" "), /unreferenced|rasterized|asset/);

  const bad = structuredClone(good);
  bad.slides[0] = { id: "screenshot", role: "image", title: "Architecture evidence", image: { assetId: "slide-preview.png", alt: "Whole source slide" }, sourceRefs: [{ id: source.id, slideNumbers: [1] }] };
  const complexSource = structuredClone(sourcePptx);
  complexSource.slides[0].shapes = Array.from({ length: 12 }, (_, index) => ({ id: `shape-${index}`, kind: "shape", groupPath: [] }));
  complexSource.slides[0].text = "Architecture evidence Inventory node Order Delivery Area Owner and additional detailed source content that must remain editable in the output.";
  const outputEvidence = { slideCount: 3, size: sourcePptx.size, slides: [
    { slideNumber: 1, partName: "ppt/slides/slide1.xml", title: "Architecture evidence", text: "Architecture evidence", textBlocks: [], shapes: [{ id: "image", kind: "image", box: { x: 1, y: 1, width: 8, height: 4.5 }, groupPath: [] }], tables: [], diagrams: [], warnings: [] },
    { slideNumber: 2, partName: "ppt/slides/slide2.xml", text: "Second file in package", textBlocks: [], shapes: [], tables: [], diagrams: [], warnings: [] },
    { slideNumber: 3, partName: "ppt/slides/slide3.xml", text: "Ready", textBlocks: [], shapes: [], tables: [], diagrams: [], warnings: [] },
  ] };
  const asset = { id: "slide-preview.png", name: "slide-preview.png", mimeType: "image/png", byteLength: 10, sha256: "a".repeat(64), origin: { kind: "source-slide-preview", sourceId: source.id, slideNumber: 1 } };
  const badAudit = auditRestyleTransformation(bad, [{ ...source, pptx: complexSource }], [asset], outputEvidence);
  assert.ok(badAudit.rasterizedSlideRiskIds.includes("screenshot"));
  assert.match(badAudit.issues.map((issue) => issue.code).join(" "), /rasterized-slide-risk/);
  assert.match(badAudit.issues.map((issue) => issue.code).join(" "), /source-slide-preview-used/);
  assert.equal(auditRestyleTransformation(deck(), [source], [asset], outputEvidence).status, "not-applicable");
});

test("measures browser-neutral PNG, GIF, and SVG bytes", () => {
  const png = new Uint8Array(24);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 360);
  assert.deepEqual(measureImageDimensions({ name: "image.png", mimeType: "image/png", bytes: png }), { width: 640, height: 360 });
  const gif = new Uint8Array(10);
  new DataView(gif.buffer).setUint16(6, 320, true);
  new DataView(gif.buffer).setUint16(8, 180, true);
  assert.deepEqual(measureImageDimensions({ name: "image.gif", mimeType: "image/gif", bytes: gif }), { width: 320, height: 180 });
  const svg = new TextEncoder().encode('<svg viewBox="0 0 1200 675"></svg>');
  assert.deepEqual(measureImageDimensions({ name: "image.svg", mimeType: "image/svg+xml", bytes: svg }), { width: 1200, height: 675 });
});

test("validates session schema and external asset metadata", () => {
  const now = new Date().toISOString();
  const session = { schemaVersion: 2, id: "session-1", revision: 1, createdAt: now, updatedAt: now, deck: deck(), sources: [], assets: [] };
  assert.equal(parseDeckSession(session).id, "session-1");
  assert.throws(() => parseDeckSession({ ...session, schemaVersion: 1 }), /Unsupported/);
  assert.throws(() => parseDeckSession({ ...session, assets: [{ id: "asset", name: "asset.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }] }), /must not contain inline dataUrl/);
  assert.throws(() => parseDeckSession({ ...session, assets: [{ id: "asset", name: "asset.mp4", mimeType: "video/mp4", byteLength: 1, sha256: "a".repeat(64) }] }), /Unsupported session asset MIME type/);
  assert.throws(() => parseDeckSession({ ...session, assets: [{ id: "asset", name: "asset.png", mimeType: "image/png", byteLength: 0, sha256: "a".repeat(64) }] }), /positive byteLength/);
  assert.throws(() => parseDeckSession({ ...session, assets: [{ id: "asset", name: "asset.png", mimeType: "image/png", byteLength: 1, sha256: "invalid" }] }), /valid SHA-256/);
  assert.throws(() => parseDeckSession({ ...session, assets: [{ id: "asset", name: "crop.png", mimeType: "image/png", byteLength: 1, sha256: "a".repeat(64), origin: { kind: "source-slide-crop", sourceId: "src-01", slideNumber: 1 } }] }), /positive crop rectangle/);
  const imageDeck = deck();
  imageDeck.slides.push({ id: "missing-image", role: "image", title: "Missing", image: { assetId: "missing", alt: "Missing" } });
  assert.throws(() => parseDeckSession({ ...session, deck: imageDeck }), /references undeclared asset/);
});

test("package inspection reports invalid bytes instead of throwing", () => {
  const result = inspectPptxPackage(new Uint8Array([1, 2, 3]));
  assert.equal(result.status, "checked");
  assert.equal(result.valid, false);
});

test("compiled runtime has no Node runtime imports", async () => {
  for (const file of ["author.js", "extraction.js", "session.js", "verify.js", "index.js"]) {
    const source = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:^|["'])node:/);
    assert.doesNotMatch(source, /\bprocess(?:\.|\[)/);
  }
});
