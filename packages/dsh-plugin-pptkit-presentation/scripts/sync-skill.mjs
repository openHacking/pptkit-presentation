#!/usr/bin/env node
/**
 * Mirror the source-of-truth Agent Skill (../../skills/pptkit-presentation)
 * into this package's ./skill directory so the published package ships the
 * complete skill (SKILL.md, references, scripts, assets), and record a sha256
 * manifest used by scripts/check-plugin.mjs to detect drift.
 *
 * The mirror is a generated build artifact: never edit it directly. Regenerate
 * with `pnpm --filter dsh-plugin-pptkit-presentation build`.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(packageDir, "..", "..", "skills", "pptkit-presentation");
const target = path.join(packageDir, "skill", "pptkit-presentation");

if (!existsSync(path.join(source, "SKILL.md"))) {
  console.error(`sync-skill: source skill not found at ${source}`);
  process.exit(1);
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, {
  recursive: true,
  filter: (src) => !src.split(path.sep).includes("node_modules"),
});

const manifest = { files: {} };
for (const file of walk(target)) {
  const relative = path.relative(target, file).split(path.sep).join("/");
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  manifest.files[relative] = hash;
}
const manifestFile = path.join(packageDir, "skill", "manifest.json");
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`sync-skill: mirrored ${Object.keys(manifest.files).length} files -> ${target}`);
