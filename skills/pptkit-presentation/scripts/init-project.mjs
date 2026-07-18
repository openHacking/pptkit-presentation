#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const starterRoot = path.join(skillRoot, "assets", "starter");
const themeIds = new Set(["clean-business", "swiss-grid", "editorial-story"]);
const previewUrlDefault = "https://openhacking.github.io/pptkit-presentation/";
const fallbackRules = new Map([
  ["browser-setup-failed", { browserCheck: "failed", steps: new Set(["setup", "selection"]) }],
  ["preview-navigation-failed", { browserCheck: "failed", steps: new Set(["navigation"]) }],
  ["preview-incompatible", { browserCheck: "failed", steps: new Set(["compatibility"]) }],
  ["browser-api-unavailable", { browserCheck: "failed", steps: new Set(["api-check"]) }],
  ["browser-transfer-failed", { browserCheck: "failed", steps: new Set(["transfer"]) }],
  ["unattended-local-output", { browserCheck: "not-required", steps: new Set(["user-requirement"]) }],
  ["strict-office-rendering", { browserCheck: "not-required", steps: new Set(["user-requirement"]) }],
]);
const browserEvidencePattern = /^(setup|selection|navigation|compatibility|api-check|transfer):\s+\S.{8,}$/i;
const invalidBrowserEvidencePattern = /\b(not attempted|not visible|initial(?:ly)? visible|initial tool list)\b/i;

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: init-project.mjs --output <directory> --fallback-reason <reason> --fallback-evidence <text> " +
      "--browser-check <failed|not-required> --browser-step <step> [--preview-url <https-url>] " +
      "[--iab-evidence <step-and-result> --chrome-evidence <step-and-result>] " +
      "[--title <slug>] [--theme <id>] [--no-install]\n",
  );
  process.exit(2);
}

function parseArgs(args) {
  const options = { title: "pptkit-deck", theme: "clean-business", install: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-install") options.install = false;
    else if (
      arg === "--output" ||
      arg === "--title" ||
      arg === "--theme" ||
      arg === "--fallback-reason" ||
      arg === "--fallback-evidence" ||
      arg === "--iab-evidence" ||
      arg === "--chrome-evidence" ||
      arg === "--browser-check" ||
      arg === "--browser-step" ||
      arg === "--preview-url"
    ) {
      const value = args[index + 1];
      if (!value) usage(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
      index += 1;
    } else usage(`Unknown argument: ${arg}`);
  }
  if (!options.output) usage("--output is required");
  if (!themeIds.has(options.theme)) usage(`Unknown theme: ${options.theme}`);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.title)) usage("--title must be a filesystem-safe slug");
  const fallbackRule = fallbackRules.get(options["fallback-reason"]);
  if (!fallbackRule) usage(`Unknown or missing --fallback-reason. Choose one of: ${[...fallbackRules.keys()].join(", ")}`);
  if (options["browser-check"] !== fallbackRule.browserCheck) {
    usage(`--fallback-reason ${options["fallback-reason"]} requires --browser-check ${fallbackRule.browserCheck}`);
  }
  if (!fallbackRule.steps.has(options["browser-step"])) {
    usage(`--fallback-reason ${options["fallback-reason"]} is incompatible with --browser-step ${options["browser-step"] ?? "<missing>"}`);
  }
  if (!options["fallback-evidence"] || options["fallback-evidence"].trim().length < 12) {
    usage("--fallback-evidence must contain a concrete browser failure result or user requirement");
  }
  if (fallbackRule.browserCheck === "failed") {
    for (const channel of ["iab", "chrome"]) {
      const evidence = options[`${channel}-evidence`];
      if (!evidence || !browserEvidencePattern.test(evidence.trim()) || invalidBrowserEvidencePattern.test(evidence)) {
        usage(`--${channel}-evidence must use <step>: <concrete result> and prove that the ${channel} channel was checked`);
      }
    }
  }
  const previewUrl = options["preview-url"] ?? previewUrlDefault;
  let parsedPreviewUrl;
  try {
    parsedPreviewUrl = new URL(previewUrl);
  } catch {
    usage("--preview-url must be a valid HTTPS URL");
  }
  if (parsedPreviewUrl.protocol !== "https:") usage("--preview-url must be a valid HTTPS URL");
  options["preview-url"] = parsedPreviewUrl.href;
  return options;
}

const options = parseArgs(process.argv.slice(2));
const output = path.resolve(options.output);
if (existsSync(output)) usage(`Output already exists: ${output}`);

mkdirSync(path.dirname(output), { recursive: true });
cpSync(starterRoot, output, { recursive: true, errorOnExist: true });

const manifestPath = path.join(output, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.name = options.title.toLowerCase();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const specPath = path.join(output, "src", "deck-spec.ts");
const spec = readFileSync(specPath, "utf8")
  .replace('theme: { id: "clean-business" }', `theme: { id: "${options.theme}" }`)
  .replace('seed: "untitled-pptkit-deck"', `seed: ${JSON.stringify(options.title)}`)
  .replace('title: "Untitled PPTKit Deck"', `title: ${JSON.stringify(options.title.replace(/[-_]+/g, " "))}`);
writeFileSync(specPath, spec);

const runtimeDecision = {
  selectedRuntime: "node",
  reason: options["fallback-reason"],
  resolvedPreviewUrl: options["preview-url"],
  browserCheck: {
    status: options["browser-check"],
    step: options["browser-step"],
    evidence: options["fallback-evidence"].trim(),
    ...(options["browser-check"] === "failed"
      ? {
          channels: {
            iab: options["iab-evidence"].trim(),
            chrome: options["chrome-evidence"].trim(),
          },
        }
      : {}),
  },
};
writeFileSync(path.join(output, "runtime-decision.json"), `${JSON.stringify(runtimeDecision, null, 2)}\n`);

if (options.install) {
  const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: output,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    process.stderr.write("Project files were created, but npm install failed. Fix registry/network access and run npm install in the project.\n");
    process.exitCode = result.status ?? 1;
  }
}

process.stdout.write(`${JSON.stringify({ output, theme: options.theme, installed: options.install, runtimeDecision }, null, 2)}\n`);
