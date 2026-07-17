import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BuildReport } from "./contracts.js";

function command(candidates: string[]) {
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function run(binary: string, args: string[]) {
  const result = spawnSync(binary, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`${binary} failed with status ${result.status ?? "unknown"}`);
}

const reportPath = path.resolve("output/build-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8")) as BuildReport;
if (!report.output) throw new Error("Build report does not contain a Node output path.");
const pptxOutput = report.output;
const rendered = path.resolve("output/rendered");
await mkdir(rendered, { recursive: true });

const office = command(["soffice", "libreoffice"]);
if (!office) {
  report.renderStatus = "skipped";
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write("LibreOffice not found. Structural build remains valid; review output/deck.pptx manually.\n");
  process.exit(0);
}

try {
  run(office, ["--headless", "--convert-to", "pdf", "--outdir", rendered, pptxOutput]);
} catch (error) {
  report.renderStatus = "skipped";
  const message = `LibreOffice was detected but could not render the deck: ${error instanceof Error ? error.message : String(error)}`;
  await writeFile(path.join(rendered, "render-warning.txt"), `${message}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${message}. Review output/deck.pptx manually.\n`);
  process.exit(0);
}
const pdf = path.join(rendered, `${path.basename(pptxOutput, path.extname(pptxOutput))}.pdf`);
const pdftoppm = command(["pdftoppm"]);
if (!pdftoppm) {
  report.renderStatus = "partial";
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Rendered PDF: ${pdf}. Install Poppler to create slide PNGs.\n`);
  process.exit(0);
}

try {
  run(pdftoppm, ["-png", "-r", "144", pdf, path.join(rendered, "slide")]);
} catch (error) {
  report.renderStatus = "partial";
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`PDF rendered, but page PNG generation failed: ${error instanceof Error ? error.message : String(error)}.\n`);
  process.exit(0);
}
const pngs = (await readdir(rendered)).filter((name) => /^slide-.*\.png$/.test(name)).sort().map((name) => path.join(rendered, name));
const magick = command(["magick"]);
const montage = magick ? { binary: magick, prefix: ["montage"] } : command(["montage"]) ? { binary: "montage", prefix: [] } : null;
if (montage && pngs.length > 0) {
  try {
    run(montage.binary, [...montage.prefix, ...pngs, "-thumbnail", "480x", "-tile", "3x", "-geometry", "+12+12", path.join(rendered, "contact-sheet.png")]);
  } catch {
    report.renderStatus = "partial";
  }
}

if (report.renderStatus !== "partial") report.renderStatus = montage ? "rendered" : "partial";
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ rendered, pages: pngs.length, contactSheet: montage ? path.join(rendered, "contact-sheet.png") : null }, null, 2)}\n`);
