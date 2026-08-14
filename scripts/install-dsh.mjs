#!/usr/bin/env node
/**
 * Install the pptkit-presentation Agent Skill into a DeepSeek Harness skill
 * root that the native filesystem skill provider discovers:
 *
 *   $DSH_HOME/skills/pptkit-presentation   (user scope, default ~/.dsh)
 *   <cwd>/.dsh/skills/pptkit-presentation  (project scope, --project)
 *
 * Idempotent: refuses to overwrite an existing copy unless --force is given.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(repoRoot, "skills", "pptkit-presentation");

function usage(message) {
  if (message) process.stderr.write(message + "\n\n");
  process.stderr.write(
    "Usage: node scripts/install-dsh.mjs [--project] [--force] [--help]\n" +
      "  --project  install into <cwd>/.dsh/skills instead of $DSH_HOME/skills\n" +
      "  --force    replace an existing installed copy\n",
  );
  process.exit(message ? 2 : 0);
}

const args = process.argv.slice(2);
let scope = "user";
let force = false;
for (const arg of args) {
  if (arg === "--project") scope = "project";
  else if (arg === "--force") force = true;
  else if (arg === "--help") usage();
  else usage(`Unknown argument: ${arg}`);
}

if (!existsSync(path.join(skillDir, "SKILL.md"))) {
  console.error(`install-dsh: skill not found at ${skillDir}`);
  process.exit(1);
}

const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
const targetRoot = scope === "project" ? path.resolve(".dsh", "skills") : path.join(dshHome, "skills");
const target = path.join(targetRoot, "pptkit-presentation");

if (existsSync(target)) {
  if (!force) {
    console.error(`install-dsh: ${target} already exists; use --force to replace it`);
    process.exit(1);
  }
  rmSync(target, { recursive: true, force: true });
}
cpSync(skillDir, target, { recursive: true });
console.log(`install-dsh: installed pptkit-presentation skill -> ${target}`);
console.log("Start a new DSH session (or wait for the skill watcher) for the catalog to include it.");
