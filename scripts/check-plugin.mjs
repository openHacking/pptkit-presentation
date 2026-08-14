#!/usr/bin/env node
/**
 * Structural and drift checks for the DSH plugin bundle
 * (packages/dsh-plugin-pptkit-presentation). Run as part of `pnpm lint` after
 * `pnpm build` so the generated skill mirror and dist output exist.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(root, "packages", "dsh-plugin-pptkit-presentation");
const sourceSkillDir = path.join(root, "skills", "pptkit-presentation");
const issues = [];

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walkFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));

if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") {
  issues.push("plugin package.json must declare dsh.bundle.patch = ./cordis.patch.yml");
}
for (const required of ["dist", "skill"]) {
  if (!(manifest.files ?? []).includes(required)) {
    issues.push(`plugin package.json files must include ${required}`);
  }
}

const patch = readFileSync(path.join(packageDir, "cordis.patch.yml"), "utf8");
if (!patch.includes(`name: ${manifest.name}`)) {
  issues.push(`cordis.patch.yml must reference the package name ${manifest.name}`);
}

const mirrorManifestFile = path.join(packageDir, "skill", "manifest.json");
if (!existsSync(mirrorManifestFile)) {
  issues.push("plugin skill mirror missing — run `pnpm --filter dsh-plugin-pptkit-presentation build`");
} else {
  const recorded = JSON.parse(readFileSync(mirrorManifestFile, "utf8")).files ?? {};
  const actual = Object.fromEntries(
    walkFiles(sourceSkillDir).map((file) => [
      path.relative(sourceSkillDir, file).split(path.sep).join("/"),
      hashFile(file),
    ]),
  );
  const recordedEntries = Object.entries(recorded).sort();
  const actualEntries = Object.entries(actual).sort();
  if (JSON.stringify(recordedEntries) !== JSON.stringify(actualEntries)) {
    issues.push(
      "plugin skill mirror is out of sync with skills/pptkit-presentation — run `pnpm --filter dsh-plugin-pptkit-presentation build`",
    );
  }
  if (!existsSync(path.join(packageDir, "skill", "pptkit-presentation", "SKILL.md"))) {
    issues.push("plugin skill mirror is missing SKILL.md — run `pnpm --filter dsh-plugin-pptkit-presentation build`");
  }
}

const skillText = readFileSync(path.join(sourceSkillDir, "SKILL.md"), "utf8");
if (!/^name:\s*pptkit-presentation\s*$/m.test(skillText)) {
  issues.push("skill frontmatter name must be pptkit-presentation");
}
if (!/^description:\s*\S/m.test(skillText)) {
  issues.push("skill frontmatter must declare a description");
}

const distEntry = path.join(packageDir, "dist", "index.js");
if (!existsSync(distEntry)) {
  issues.push("plugin dist missing — run `pnpm --filter dsh-plugin-pptkit-presentation build`");
} else {
  const mod = await import(pathToFileURL(distEntry).href);
  for (const key of ["name", "inject", "Config", "apply"]) {
    if (!(key in mod)) issues.push(`plugin dist must export ${key}`);
  }
}

if (issues.length > 0) {
  console.error("Plugin check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Plugin check passed.");
}
