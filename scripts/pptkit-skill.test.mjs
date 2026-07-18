import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(repoRoot, "skills", "pptkit-presentation");
const initScript = path.join(skillRoot, "scripts", "init-project.mjs");
const tsxLoader = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const testFallbackArgs = [
  "--fallback-reason",
  "unattended-local-output",
  "--browser-check",
  "not-required",
  "--browser-step",
  "user-requirement",
  "--fallback-evidence",
  "Automated test requires isolated local output",
];

test("presentation skill requires progressive native interaction and an approval gate", () => {
  const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const workflow = readFileSync(path.join(skillRoot, "references", "workflow.md"), "utf8");
  const browserWorkflow = readFileSync(path.join(skillRoot, "references", "browser-workflow.md"), "utf8");
  const nodeWorkflow = readFileSync(path.join(skillRoot, "references", "node-workflow.md"), "utf8");
  const runtimeRouting = readFileSync(path.join(skillRoot, "references", "runtime-routing.md"), "utf8");
  const transferHelper = readFileSync(path.join(skillRoot, "scripts", "transfer-payload.mjs"), "utf8");
  const designSystem = readFileSync(path.join(skillRoot, "references", "design-system.md"), "utf8");
  const quality = readFileSync(path.join(skillRoot, "references", "quality.md"), "utf8");
  const guide = readFileSync(path.join(repoRoot, "docs", "guides", "presentation-skill.md"), "utf8");

  assert.match(skill, /one at a time in this order: purpose and audience, theme, then page count and asset strategy/i);
  assert.match(skill, /request_user_input/i);
  assert.match(skill, /Approve and generate.*Change the plan.*Cancel/is);
  assert.match(skill, /Do not create artifacts, open a preview, install dependencies, or generate PPTX bytes before/i);
  assert.match(workflow, /every supplied source.*text.*tables.*diagrams.*information architecture/is);
  assert.match(workflow, /DeckBrief\.mode.*restyle/is);
  assert.match(workflow, /Never accept a title plus a whole-slide thumbnail/i);
  assert.match(browserWorkflow, /source-slide-preview.*inspection-only/is);
  assert.match(nodeWorkflow, /content\/assets\.json/i);
  assert.match(skill, /rasterized-slide-risk/i);
  assert.match(designSystem, /rendered source slide is not a screenshot asset/i);
  assert.match(browserWorkflow, /TXT\/Markdown, PDF, DOCX, PPTX, CSV\/XLS\/XLSX/is);
  assert.match(nodeWorkflow, /officeparser@7\.1\.0/i);
  assert.match(skill, /Prefer the browser workflow/i);
  assert.match(skill, /node_repl js/);
  assert.match(skill, /explicitly try the `iab` browser first/i);
  assert.match(skill, /agent\.browsers\.get\("extension"\)/i);
  assert.match(skill, /complete `documentation\(\)`/i);
  assert.match(skill, /Do not infer unavailability from the initial tool list/i);
  assert.match(skill, /runtime-routing\.md/);
  assert.match(skill, /guarded initializer/i);
  assert.match(skill, /Generate & download PPTX/i);
  assert.match(workflow, /# Interaction capability/);
  assert.match(workflow, /Choose one option for <decision>:/);
  assert.match(workflow, /custom in-chat plugin form/i);
  assert.match(workflow, /Treat every outcome except \*\*Approve and generate\*\* as a stop/);
  assert.match(browserWorkflow, /PPTKIT_PREVIEW_URL/);
  assert.match(browserWorkflow, /https:\/\/openhacking\.github\.io\/pptkit-presentation\//);
  assert.match(browserWorkflow, /explicitly supplied[\s\S]*PPTKIT_PREVIEW_URL[\s\S]*official PPTKit preview application/i);
  assert.match(browserWorkflow, /resolved URL is unreachable or incompatible/i);
  assert.match(browserWorkflow, /Do not give up solely because the initial tool list omits browser controls/i);
  assert.match(browserWorkflow, /successful open or focus operation in either browser as proof/i);
  assert.match(browserWorkflow, /`iab`[\s\S]*Chrome[\s\S]*Node workflow/i);
  assert.match(browserWorkflow, /agent\.browsers\.get\("extension"\)/i);
  assert.match(browserWorkflow, /bootstrap-troubleshooting/i);
  assert.match(browserWorkflow, /chrome-troubleshooting/i);
  assert.match(browserWorkflow, /same explicit export flow/i);
  assert.match(browserWorkflow, /Do not create a Chrome-only transport/i);
  assert.match(browserWorkflow, /Do not ask the user to choose or call `request_user_input`/i);
  assert.match(browserWorkflow, /marked `deliverable`/i);
  assert.match(browserWorkflow, /hash-free base URL/i);
  assert.match(browserWorkflow, /unique session ID for every newly approved task/i);
  assert.match(browserWorkflow, /remain resumable for 24 hours/i);
  assert.match(browserWorkflow, /remain local for 30 days/i);
  assert.match(browserWorkflow, /Do not download automatically/);
  assert.match(browserWorkflow, /explicitly asks the agent to trigger the export\/download/);
  assert.match(browserWorkflow, /IndexedDB/);
  assert.match(browserWorkflow, /pptkit-transfer/);
  assert.match(browserWorkflow, /data-testid="pptkit-preview-bridge"/);
  assert.match(browserWorkflow, /data-testid="pptkit-transfer-toggle"/);
  assert.match(browserWorkflow, /aria-expanded/);
  assert.match(browserWorkflow, /isolated read-only evaluation sandbox/i);
  assert.match(runtimeRouting, /Do not probe `globalThis`, `window`, or browser APIs/i);
  assert.match(browserWorkflow, /never include `dataUrl`/i);
  assert.match(runtimeRouting, /File size is not a Node routing condition/i);
  assert.doesNotMatch(runtimeRouting, /asset-transfer-limit|asset-limit/);
  assert.match(runtimeRouting, /browser-transfer-failed/);
  assert.match(transferHelper, /DEFAULT_CHUNK_BYTES = 512 \* 1024/);
  assert.match(nodeWorkflow, /State the fallback reason/i);
  assert.match(nodeWorkflow, /runtime-decision\.json/i);
  assert.match(runtimeRouting, /Do not read or execute `node-workflow\.md` while the decision is unresolved/i);
  assert.match(runtimeRouting, /Do not claim a browser failure without a tool result/i);
  assert.match(runtimeRouting, /continue to step 4 instead of Node/i);
  assert.match(runtimeRouting, /both Codex browser channels are unavailable[\s\S]*automatically continue with `node-workflow\.md`/i);
  assert.match(runtimeRouting, /do not call `request_user_input` or ask the user to choose a runtime/i);
  assert.match(runtimeRouting, /iab: <step and error>; chrome:/i);
  assert.match(runtimeRouting, /`iab-evidence` and `chrome-evidence`/i);
  assert.match(nodeWorkflow, /--iab-evidence <IAB_STEP_AND_RESULT>/i);
  assert.match(nodeWorkflow, /--chrome-evidence <CHROME_STEP_AND_RESULT>/i);
  assert.match(nodeWorkflow, /enable it next time for a better PPT review experience/i);
  assert.match(designSystem, /sourceRefs.*provenance metadata/is);
  assert.match(designSystem, /use `id`, never `sourceId`/i);
  assert.match(designSystem, /use `headers`, never `columns`/i);
  assert.match(designSystem, /both sides require `heading` and `items`/i);
  assert.match(designSystem, /parseDeckSession\(\)/);
  assert.match(designSystem, /46–60 pt/);
  assert.match(designSystem, /hero.*split.*ledger.*timeline/is);
  assert.match(quality, /visible internal source IDs/i);
  assert.match(guide, /customers do not need to configure a preview URL/i);
  assert.match(guide, /does not treat an abbreviated initial tool list as evidence that no browser exists/i);
  assert.match(guide, /no runtime-choice question interrupts generation/i);
  assert.match(guide, /does not claim it can open Codex settings or trigger a system enablement dialog/i);
  assert.match(guide, /one at a time/i);
  assert.match(guide, /Approve and generate.*Change the plan.*Cancel/is);
});

test("theme previews remain single-slide 16:9 compositions", () => {
  const previews = path.join(skillRoot, "assets", "previews");

  for (const themeId of ["clean-business", "swiss-grid", "editorial-story"]) {
    const svg = readFileSync(path.join(previews, `${themeId}.svg`), "utf8");

    assert.match(svg, /<svg\b[^>]*\bwidth="1200"[^>]*\bheight="675"[^>]*\bviewBox="0 0 1200 675"/i, `${themeId} must use the 16:9 preview canvas`);
    assert.match(svg, /<svg\b[^>]*\bdata-preview-layout="single-slide"/i, `${themeId} must declare a single-slide composition`);
    assert.match(svg, /<desc\b[^>]*>[^<]*single 16:9[^<]*<\/desc>/i, `${themeId} must describe the preview as one 16:9 slide`);
    assert.doesNotMatch(svg, /width="336"\s+height="492"|Three representative slides/i, `${themeId} must not use the compressed portrait montage`);
  }
});

test("transfer helper creates deterministic resumable envelopes without leaking the file path", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-transfer-helper-"));
  const file = path.join(root, "session.json");
  try {
    const now = "2026-07-18T00:00:00.000Z";
    writeFileSync(file, JSON.stringify({
      id: "transfer-test", revision: 1, createdAt: now, updatedAt: now,
      deck: {
        brief: { title: "Transfer", audience: "QA", purpose: "Test transfer", language: "en-US", slideCountRange: [1, 1], imagePolicy: "None", constraints: [] },
        design: { theme: { id: "clean-business" }, seed: "transfer-test", variation: "balanced" },
        slides: [{ id: "cover", role: "cover", title: "Transfer" }],
      },
      sources: [], assets: [],
    }));
    const { preparePptkitTransfer } = await import(pathToFileURL(path.join(skillRoot, "scripts", "transfer-payload.mjs")).href);
    await assert.rejects(() => preparePptkitTransfer({ file, kind: "session", payloadId: "wrong-id", mimeType: "application/json", chunkBytes: 8 }), /does not match session\.id/);
    const prepared = await preparePptkitTransfer({ file, kind: "session", payloadId: "transfer-test", mimeType: "application/json", chunkBytes: 8 });
    assert.ok(prepared.chunkCount > 1);
    const envelope = JSON.parse(await prepared.envelope(0));
    assert.equal(envelope.protocol, "pptkit-transfer");
    assert.equal(envelope.chunkByteLength, 8);
    assert.equal(envelope.dataBase64.length > 0, true);
    assert.doesNotMatch(JSON.stringify(envelope), new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transfer helper rejects invalid sessions before creating envelopes", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-transfer-invalid-"));
  const file = path.join(root, "session.json");
  try {
    writeFileSync(file, JSON.stringify({ id: "invalid", deck: { slides: [{ role: "process", steps: ["Old shape"] }] } }));
    const { preparePptkitTransfer } = await import(pathToFileURL(path.join(skillRoot, "scripts", "transfer-payload.mjs")).href);
    await assert.rejects(() => preparePptkitTransfer({ file, kind: "session", payloadId: "invalid", mimeType: "application/json" }), /Session validation failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill and workflow session validators agree on structured process steps", async () => {
  const { validateDeckSession } = await import(pathToFileURL(path.join(skillRoot, "scripts", "session-contract.mjs")).href);
  const { parseDeckSession } = await import(pathToFileURL(path.join(repoRoot, "packages", "presentation-workflow", "dist", "index.js")).href);
  const valid = JSON.parse(readFileSync(path.join(repoRoot, "apps", "preview", "test", "fixtures", "manual-deck-session.json"), "utf8"));
  assert.equal(validateDeckSession(valid).id, valid.id);
  assert.equal(parseDeckSession(valid).id, valid.id);
  const invalid = structuredClone(valid);
  invalid.deck.slides[1].steps = ["Old string shape", "Still invalid"];
  assert.throws(() => validateDeckSession(invalid), /deck\.slides\[1\]\.steps\[0\].*object/);
  assert.throws(() => parseDeckSession(invalid), /deck\.slides\[1\]\.steps\[0\].*object/);
});

function linkDirectory(target, link) {
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}

function wireWorkspace(project) {
  linkDirectory(realpathSync(path.join(repoRoot, "packages", "presentation-workflow", "node_modules", "@pptkit", "core")), path.join(project, "node_modules", "@pptkit", "core"));
  linkDirectory(realpathSync(path.join(repoRoot, "apps", "preview", "node_modules", "@pptkit", "pptx-exporter")), path.join(project, "node_modules", "@pptkit", "pptx-exporter"));
  linkDirectory(path.join(repoRoot, "packages", "presentation-workflow"), path.join(project, "node_modules", "presentation-workflow"));
  linkDirectory(realpathSync(path.join(repoRoot, "packages", "presentation-workflow", "node_modules", "fflate")), path.join(project, "node_modules", "fflate"));
  linkDirectory(realpathSync(path.join(repoRoot, "node_modules", "mammoth")), path.join(project, "node_modules", "mammoth"));
  linkDirectory(realpathSync(path.join(repoRoot, "node_modules", "officeparser")), path.join(project, "node_modules", "officeparser"));
  linkDirectory(realpathSync(path.join(repoRoot, "node_modules", "pdfjs-dist")), path.join(project, "node_modules", "pdfjs-dist"));
  linkDirectory(realpathSync(path.join(repoRoot, "node_modules", "xlsx")), path.join(project, "node_modules", "xlsx"));
  linkDirectory(realpathSync(path.join(repoRoot, "node_modules", "@types", "node")), path.join(project, "node_modules", "@types", "node"));
}

function runTypeScript(project, entry, args = [], env = process.env) {
  return spawnSync(process.execPath, ["--import", tsxLoader, entry, ...args], { cwd: project, encoding: "utf8", env });
}

function fixtureSpec(themeId) {
  return `import type { DeckSpec } from "./contracts.js";

export const deckSpec: DeckSpec = {
  design: { theme: { id: ${JSON.stringify(themeId)} }, seed: "pptkit-skill-fixture", variation: "balanced" },
  brief: {
    title: "PPTKit Skill Fixture",
    audience: "Cross-functional teams",
    purpose: "Validate the editable presentation generation workflow",
    language: "en-US",
    slideCountRange: [12, 12],
    imagePolicy: "Local assets only",
    constraints: ["No unsupported warnings"],
    author: "PPTKit",
  },
  slides: [
    { id: "cover", role: "cover", title: "From source material to editable PPTX", subtitle: "A complete, local, testable workflow" },
    { id: "agenda", role: "agenda", title: "The path ahead", items: ["Clarify the goal", "Organize evidence", "Author the slides", "Validate delivery"] },
    { id: "section", role: "section", title: "01 / Why", message: "Clarify the problem before choosing the format." },
    { id: "statement", role: "statement", title: "Core judgment", message: "Structured content and controlled layouts turn generation quality into a verifiable engineering result.", items: ["Local assets", "Native objects", "Explicit diagnostics"], sourceRefs: [{ id: "src-01-report" }] },
    { id: "image", role: "image", title: "Visual evidence", message: "Images fill controlled slots instead of determining the page structure.", items: ["Preserve aspect ratio", "Choose contain or cover", "Provide alt text"], image: { assetId: "fixture.svg", alt: "Theme fixture", width: 1200, height: 675, fit: "cover" } },
    { id: "kpi", role: "kpi", title: "Key metrics", kpis: [{ value: "+18%", label: "Activation", detail: "Quarter over quarter" }, { value: "72%", label: "Retention" }, { value: "3.4×", label: "Velocity" }] },
    { id: "comparison", role: "comparison", title: "Two paths", comparison: { left: { heading: "Before", items: ["Repeated coordinates", "Implicit defaults", "Hard to inspect"] }, right: { heading: "After", items: ["Semantic plan", "Theme tokens", "Automated report"] } } },
    { id: "process", role: "process", title: "The workflow", steps: [{ title: "Intake" }, { title: "Outline" }, { title: "Author" }, { title: "Validate" }, { title: "Export" }] },
    { id: "table", role: "table", title: "Delivery matrix", table: { headers: ["Artifact", "Owner", "Status"], rows: [["Brief", "Agent", "Ready"], ["PPTX", "PPTKit", "Ready"], ["Review", "User", "Open"]] } },
    { id: "bar", role: "table", title: "Quarterly adoption", chart: { type: "bar", categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Team A", values: [22, 35, 48, 70] }, { name: "Team B", values: [18, 30, 44, 58] }] } },
    { id: "line", role: "table", title: "Delivery speed", chart: { type: "line", categories: ["Jan", "Feb", "Mar", "Apr", "May"], series: [{ name: "Cycle time", values: [8, 7, 5, 4, 3] }] } },
    { id: "closing", role: "closing", title: "Next step", message: "Run the same workflow with real source material.", items: ["Open the PPTX", "Check fonts and wrapping", "Continue editing"] },
  ],
};
`;
}

test("initializer creates an isolated starter and applies theme", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-skill-init-"));
  const project = path.join(root, "deck");
  try {
    const result = spawnSync(process.execPath, [initScript, "--output", project, "--title", "demo-deck", "--theme", "editorial-story", "--no-install", ...testFallbackArgs], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(path.join(project, "package.json"), "utf8")).name, "demo-deck");
    assert.match(readFileSync(path.join(project, "src", "deck-spec.ts"), "utf8"), /theme: \{ id: "editorial-story" \}/);
    assert.ok(existsSync(path.join(project, "deck-brief.md")));
    assert.deepEqual(JSON.parse(readFileSync(path.join(project, "runtime-decision.json"), "utf8")), {
      selectedRuntime: "node",
      reason: "unattended-local-output",
      resolvedPreviewUrl: "https://openhacking.github.io/pptkit-presentation/",
      browserCheck: {
        status: "not-required",
        step: "user-requirement",
        evidence: "Automated test requires isolated local output",
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("initializer rejects missing or contradictory runtime-routing evidence before creating output", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-skill-routing-"));
  try {
    const missingOutput = path.join(root, "missing");
    const missing = spawnSync(process.execPath, [initScript, "--output", missingOutput, "--no-install"], { encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /fallback-reason/i);
    assert.equal(existsSync(missingOutput), false);

    const contradictoryOutput = path.join(root, "contradictory");
    const contradictory = spawnSync(
      process.execPath,
      [
        initScript,
        "--output",
        contradictoryOutput,
        "--no-install",
        "--fallback-reason",
        "browser-setup-failed",
        "--browser-check",
        "not-required",
        "--browser-step",
        "setup",
        "--fallback-evidence",
        "No browser control was visible initially",
      ],
      { encoding: "utf8" },
    );
    assert.equal(contradictory.status, 2);
    assert.match(contradictory.stderr, /requires --browser-check failed/i);
    assert.equal(existsSync(contradictoryOutput), false);

    const singleChannelOutput = path.join(root, "single-channel");
    const singleChannel = spawnSync(
      process.execPath,
      [
        initScript,
        "--output",
        singleChannelOutput,
        "--no-install",
        "--fallback-reason",
        "preview-navigation-failed",
        "--browser-check",
        "failed",
        "--browser-step",
        "navigation",
        "--fallback-evidence",
        "iab navigation timed out; Chrome was not attempted",
        "--iab-evidence",
        "navigation: open timed out after 30 seconds",
      ],
      { encoding: "utf8" },
    );
    assert.equal(singleChannel.status, 2);
    assert.match(singleChannel.stderr, /--chrome-evidence/i);
    assert.equal(existsSync(singleChannelOutput), false);

    const skippedChromeOutput = path.join(root, "skipped-chrome");
    const skippedChrome = spawnSync(
      process.execPath,
      [
        initScript,
        "--output",
        skippedChromeOutput,
        "--no-install",
        "--fallback-reason",
        "preview-navigation-failed",
        "--browser-check",
        "failed",
        "--browser-step",
        "navigation",
        "--fallback-evidence",
        "Both browser channels were summarized as unavailable",
        "--iab-evidence",
        "navigation: open timed out after 30 seconds",
        "--chrome-evidence",
        "selection: Chrome was not attempted because it was not visible",
      ],
      { encoding: "utf8" },
    );
    assert.equal(skippedChrome.status, 2);
    assert.match(skippedChrome.stderr, /prove that the chrome channel was checked/i);
    assert.equal(existsSync(skippedChromeOutput), false);

    const dualChannelOutput = path.join(root, "dual-channel");
    const dualChannel = spawnSync(
      process.execPath,
      [
        initScript,
        "--output",
        dualChannelOutput,
        "--no-install",
        "--fallback-reason",
        "preview-navigation-failed",
        "--browser-check",
        "failed",
        "--browser-step",
        "navigation",
        "--fallback-evidence",
        "Both browser channels failed while opening the preview URL",
        "--iab-evidence",
        "navigation: open timed out after 30 seconds",
        "--chrome-evidence",
        "navigation: extension returned connection unavailable",
      ],
      { encoding: "utf8" },
    );
    assert.equal(dualChannel.status, 0, dualChannel.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dualChannelOutput, "runtime-decision.json"), "utf8")).browserCheck.channels, {
      iab: "navigation: open timed out after 30 seconds",
      chrome: "navigation: extension returned connection unavailable",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("text source extraction preserves provenance without optional parsers", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-skill-extract-"));
  const project = path.join(root, "deck");
  try {
    assert.equal(spawnSync(process.execPath, [initScript, "--output", project, "--no-install", ...testFallbackArgs], { encoding: "utf8" }).status, 0);
    wireWorkspace(project);
    const source = path.join(root, "report.txt");
    writeFileSync(source, "Revenue increased 18%.\nRetention is the next focus.\n");
    const result = runTypeScript(project, "src/extract-sources.ts", [source]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const extracted = JSON.parse(readFileSync(path.join(project, "content", "sources.json"), "utf8"));
    assert.equal(extracted.sources[0].type, "text");
    assert.match(extracted.sources[0].content, /Revenue increased 18%/);
    assert.match(extracted.sources[0].id, /^src-01-report$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt PPTX extraction reports failure without modifying source bytes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-skill-corrupt-pptx-"));
  const project = path.join(root, "deck");
  try {
    assert.equal(spawnSync(process.execPath, [initScript, "--output", project, "--no-install", ...testFallbackArgs], { encoding: "utf8" }).status, 0);
    wireWorkspace(project);
    const source = path.join(root, "corrupt.pptx");
    const bytes = Buffer.from("not-a-pptx-package");
    writeFileSync(source, bytes);
    const result = runTypeScript(project, "src/extract-sources.ts", [source], { ...process.env, PATH: "" });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const extracted = JSON.parse(readFileSync(path.join(project, "content", "sources.json"), "utf8")).sources[0];
    assert.match(extracted.warnings.join(" "), /Extraction failed:/i);
    assert.ok(readFileSync(source).equals(bytes));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const themeId of ["clean-business", "swiss-grid", "editorial-story"]) {
  test(`end-to-end fixture builds all roles with ${themeId}`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), `pptkit-skill-${themeId}-`));
    const project = path.join(root, "deck");
    try {
      const initialized = spawnSync(process.execPath, [initScript, "--output", project, "--theme", themeId, "--no-install", ...testFallbackArgs], { encoding: "utf8" });
      assert.equal(initialized.status, 0, initialized.stderr);
      wireWorkspace(project);
      copyFileSync(path.join(skillRoot, "assets", "previews", `${themeId}.svg`), path.join(project, "assets", "fixture.svg"));
      writeFileSync(path.join(project, "src", "deck-spec.ts"), fixtureSpec(themeId));
      if (themeId === "clean-business") {
        const typecheck = spawnSync(process.execPath, [path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "--noEmit"], { cwd: project, encoding: "utf8" });
        assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
      }
      const result = runTypeScript(project, "src/build.ts");
      const reportText = existsSync(path.join(project, "output", "build-report.json")) ? readFileSync(path.join(project, "output", "build-report.json"), "utf8") : "no report";
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${reportText}`);
      const report = JSON.parse(readFileSync(path.join(project, "output", "build-report.json"), "utf8"));
      assert.equal(report.slideCount, 12);
      assert.deepEqual(report.diagnostics, []);
      assert.deepEqual(report.exportWarnings, []);
      assert.deepEqual(report.structuralIssues, []);
      assert.equal(report.layoutDecisions.length, report.slideCount);
      assert.ok(report.layoutDecisions.every((decision) => decision.recipeId && decision.reason));
      assert.equal(report.packageChecks.valid, true);
      assert.equal(report.packageChecks.slideParts, 12);
      assert.ok(existsSync(path.join(project, "output", "deck.pptx")));
      if (themeId === "clean-business") {
        const sourcePptx = path.join(project, "output", "deck.pptx");
        const sourceBytes = readFileSync(sourcePptx);
        const extractedResult = runTypeScript(project, "src/extract-sources.ts", [sourcePptx], { ...process.env, PATH: "" });
        assert.equal(extractedResult.status, 0, `${extractedResult.stdout}\n${extractedResult.stderr}`);
        const extracted = JSON.parse(readFileSync(path.join(project, "content", "sources.json"), "utf8")).sources[0];
        assert.match(extracted.content, /From source material to editable PPTX|Core judgment/);
        assert.match(extracted.content, /Delivery matrix|src-01-report/);
        assert.deepEqual(extracted.warnings, []);
        assert.ok(readFileSync(sourcePptx).equals(sourceBytes));
        const rendered = runTypeScript(project, "src/render.ts", [], { ...process.env, PATH: "" });
        assert.equal(rendered.status, 0, `${rendered.stdout}\n${rendered.stderr}`);
        const renderReport = JSON.parse(readFileSync(path.join(project, "output", "build-report.json"), "utf8"));
        assert.equal(renderReport.renderStatus, "skipped");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("missing image is reported before export", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pptkit-skill-missing-image-"));
  const project = path.join(root, "deck");
  try {
    assert.equal(spawnSync(process.execPath, [initScript, "--output", project, "--no-install", ...testFallbackArgs], { encoding: "utf8" }).status, 0);
    wireWorkspace(project);
    writeFileSync(path.join(project, "src", "deck-spec.ts"), `import type { DeckSpec } from "./contracts.js";
export const deckSpec: DeckSpec = {
  design: { theme: { id: "clean-business" }, seed: "missing-asset", variation: "balanced" },
  brief: { title: "Missing asset", audience: "QA", purpose: "Failure test", language: "en-US", slideCountRange: [1, 1], imagePolicy: "Local", constraints: [] },
  slides: [{ id: "image", role: "image", title: "Missing image", image: { assetId: "does-not-exist.png", alt: "Missing fixture", width: 100, height: 100 } }],
};
`);
    const result = runTypeScript(project, "src/build.ts");
    assert.equal(result.status, 1);
    const report = JSON.parse(readFileSync(path.join(project, "output", "build-report.json"), "utf8"));
    assert.deepEqual(report.exportWarnings, []);
    assert.ok(report.structuralIssues.some((issue) => issue.severity === "error" && issue.code === "missing-asset"));
    assert.equal(report.exportStatus, "not-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
