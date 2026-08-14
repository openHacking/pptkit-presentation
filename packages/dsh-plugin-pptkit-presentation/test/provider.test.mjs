import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLE_RANK,
  PROVIDER_NAME,
  SKILL_NAME,
  createPptkitProvider,
  parseSkillFrontmatter,
  resolveSkillDir,
} from "../dist/skill-provider.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSkillDir = path.resolve(packageDir, "..", "..", "skills", "pptkit-presentation");

test("source skill frontmatter parses with required fields", () => {
  const content = readFileSync(path.join(sourceSkillDir, "SKILL.md"), "utf8");
  const parsed = parseSkillFrontmatter(content);
  assert.ok(parsed, "SKILL.md must have parseable frontmatter");
  assert.equal(parsed.name, SKILL_NAME);
  assert.ok(parsed.description.length > 0, "description must not be empty");
  assert.match(parsed.body, /^# PPTKit Presentation/m);
  assert.doesNotMatch(parsed.body, /^---/m, "frontmatter must be stripped from the body");
});

test("provider list() returns the bundled candidate with a directory resource base", async () => {
  const provider = createPptkitProvider({ packageDir, skillDir: sourceSkillDir });
  const candidates = await provider.list();
  assert.equal(candidates.length, 1);
  const candidate = candidates[0];
  assert.equal(candidate.name, SKILL_NAME);
  assert.equal(candidate.provider, PROVIDER_NAME);
  assert.equal(candidate.rank, BUNDLE_RANK);
  assert.equal(candidate.source, "bundled");
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
  assert.deepEqual(candidate.resourceBase, { kind: "directory", path: sourceSkillDir });
});

test("provider get() loads the full body through the locator", async () => {
  const provider = createPptkitProvider({ packageDir, skillDir: sourceSkillDir });
  const [candidate] = await provider.list();
  const definition = await provider.get(candidate, {});
  assert.ok(definition);
  assert.equal(definition.name, SKILL_NAME);
  assert.equal(definition.content, parseSkillFrontmatter(readFileSync(path.join(sourceSkillDir, "SKILL.md"), "utf8")).body);
  assert.equal(definition.path, path.join(sourceSkillDir, "SKILL.md"));
});

test("provider reports an empty catalog when no skill directory resolves", async () => {
  // A missing skillDir falls back to the bundled mirror, so exercise a
  // packageDir with no bundled skill and no overrides.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pptkit-plugin-"));
  try {
    const provider = createPptkitProvider({ packageDir: tmp });
    assert.deepEqual(await provider.list(), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveSkillDir honors PPTKIT_SKILL_DIR then the bundled mirror", () => {
  const previous = process.env.PPTKIT_SKILL_DIR;
  try {
    delete process.env.PPTKIT_SKILL_DIR;
    assert.equal(resolveSkillDir({ packageDir, skillDir: sourceSkillDir }), sourceSkillDir);
    assert.equal(resolveSkillDir({ packageDir }), path.join(packageDir, "skill", SKILL_NAME));
    process.env.PPTKIT_SKILL_DIR = sourceSkillDir;
    assert.equal(resolveSkillDir({ packageDir }), sourceSkillDir);
  } finally {
    if (previous === undefined) delete process.env.PPTKIT_SKILL_DIR;
    else process.env.PPTKIT_SKILL_DIR = previous;
  }
});

test("invalid frontmatter makes the skill unloadable", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pptkit-plugin-"));
  try {
    writeFileSync(path.join(dir, "SKILL.md"), "# no frontmatter\n");
    const provider = createPptkitProvider({ packageDir, skillDir: dir });
    return provider.list().then((candidates) => {
      assert.deepEqual(candidates, []);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
