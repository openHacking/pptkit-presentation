#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = path.join(repoRoot, "apps", "preview");
const skillRoot = path.join(repoRoot, "skills", "pptkit-presentation");
const markerPath = path.join(repoRoot, ".pptkit-local-preview.json");
const previewUrl = "http://127.0.0.1:5173/";

function writeMarker() {
  writeFileSync(markerPath, `${JSON.stringify({
    previewUrl,
    skillPath: skillRoot,
    startedAt: new Date().toISOString(),
    pid: process.pid,
  }, null, 2)}\n`);
}

function removeMarker() {
  rmSync(markerPath, { force: true });
}

try {
  writeMarker();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

process.stdout.write(
  [
    "",
    "PPTKit local skill development is ready.",
    `Preview: ${previewUrl}`,
    `Skill:   ${skillRoot}`,
    "",
    "Open a new Codex task in this repository while the server is running.",
    "Repository instructions will route that task to this skill and preview instead of the published copies.",
    "",
  ].join("\n"),
);

const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: previewRoot,
  env: process.env,
  stdio: "inherit",
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  removeMarker();
  if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

child.on("error", (error) => {
  removeMarker();
  process.stderr.write(`Failed to start the preview server: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  removeMarker();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
