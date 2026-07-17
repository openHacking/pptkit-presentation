import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "node_modules"]);

function clean(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "output") rmSync(entryPath, { recursive: true, force: true });
      else clean(entryPath);
    } else if (entry.name.endsWith(".tsbuildinfo") || entry.name.endsWith(".tgz")) {
      rmSync(entryPath, { force: true });
    }
  }
}

if (existsSync(root)) clean(root);
