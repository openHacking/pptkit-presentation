#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function findCommand(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

const major = Number(process.versions.node.split(".")[0]);
const report = {
  node: { version: process.versions.node, supported: major >= 20 },
  npm: findCommand(["npm"]),
  libreoffice: findCommand(["soffice", "libreoffice"]),
  pdftoppm: findCommand(["pdftoppm"]),
  montage: findCommand(["magick", "montage"]),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.node.supported || report.npm === null) process.exitCode = 1;
