import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const workflow = readJson("packages/presentation-workflow/package.json");
const preview = readJson("apps/preview/package.json");
const starter = readJson("skills/pptkit-presentation/assets/starter/package.json");
const issues = [];
const engineVersion = "0.1.9";

if (workflow.name !== "presentation-workflow") issues.push("workflow package name must be presentation-workflow");
if (!/^\d+\.\d+\.\d+$/.test(workflow.version)) issues.push("workflow package version must use x.y.z format");
if (starter.dependencies?.["presentation-workflow"] !== workflow.version) issues.push("starter workflow version must match the published package");
if (preview.dependencies?.["presentation-workflow"] !== "workspace:*") issues.push("preview must consume the workspace workflow package");

for (const [label, manifest, dependencies] of [
  ["workflow", workflow, ["@pptkit/core"]],
  ["preview", preview, ["@pptkit/core", "@pptkit/pptx-exporter", "@pptkit/svg-renderer"]],
  ["starter", starter, ["@pptkit/core", "@pptkit/pptx-exporter"]],
]) {
  for (const dependency of dependencies) {
    if (manifest.dependencies?.[dependency] !== engineVersion) issues.push(`${label} must pin ${dependency}@${engineVersion}`);
  }
}

const textFiles = [
  "README.md",
  "docs/guides/presentation-skill.md",
  "docs/api/presentation-workflow.md",
  "skills/pptkit-presentation/SKILL.md",
  ...readdirSync(path.join(root, "skills", "pptkit-presentation", "references")).filter((name) => name.endsWith(".md")).map((name) => `skills/pptkit-presentation/references/${name}`),
];
const combined = textFiles.map((relative) => readFileSync(path.join(root, relative), "utf8")).join("\n");
const staleReferences = [
  ["@pptkit", "presentation-workflow"].join("/"),
  ["https://openhacking.github.io", "pptkit", ""].join("/"),
  ["openHacking/pptkit", "--skill", "pptkit-presentation"].join(" "),
];
for (const stale of staleReferences) {
  if (combined.includes(stale)) issues.push(`stale product reference: ${stale}`);
}
for (const required of ["presentation-workflow", "openHacking/pptkit-presentation", "https://openhacking.github.io/pptkit-presentation/"]) {
  if (!combined.includes(required)) issues.push(`missing product reference: ${required}`);
}

if (issues.length > 0) {
  console.error("Version and reference check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Versions and product references are consistent.");
}
