import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "dist", "node_modules"]);
const issues = [];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : markdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

for (const file of markdownFiles(root)) {
  const markdown = readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().split("#", 1)[0];
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (target === "" || /^(?:https?:|mailto:|data:)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    const finalPath = existsSync(resolved) && statSync(resolved).isDirectory() ? path.join(resolved, "README.md") : resolved;
    if (!existsSync(finalPath)) issues.push(`${path.relative(root, file)}: broken local link ${target}`);
  }
}

if (issues.length > 0) {
  console.error("Documentation check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Documentation links passed.");
}
