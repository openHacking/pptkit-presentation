import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowSource = path.join(root, "packages", "presentation-workflow", "src");
const issues = [];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

for (const file of sourceFiles(workflowSource)) {
  const value = readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (/from ["']node:|from ["'](?:node:)?(?:fs|http|https|zlib)|\bprocess(?:\.|\[)/.test(value)) {
    issues.push(`${relative}: workflow contains Node or process concerns`);
  }
  for (const match of value.matchAll(/from ["'](@pptkit\/[a-z0-9-]+)["']/gi)) {
    if (match[1] !== "@pptkit/core") issues.push(`${relative}: workflow imports disallowed package ${match[1]}`);
  }
  if (/from ["']@pptkit\/[a-z0-9-]+\//i.test(value)) issues.push(`${relative}: workflow deep-imports a PPTKit package`);
}

for (const required of ["AGENTS.md", "LICENSE", "skills/pptkit-presentation/SKILL.md"]) {
  if (!existsSync(path.join(root, required))) issues.push(`missing required file: ${required}`);
}

if (issues.length > 0) {
  console.error("Boundary check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Boundary check passed.");
}
