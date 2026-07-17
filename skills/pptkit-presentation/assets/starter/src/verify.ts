import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectPptxPackage } from "presentation-workflow";

export { inspectPptxPackage, inspectStructure } from "presentation-workflow";

async function main() {
  const file = path.resolve(process.argv[2] ?? "output/deck.pptx");
  const result = inspectPptxPackage(new Uint8Array(await readFile(file)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(async (error) => {
    await writeFile("output/verify-error.txt", `${error instanceof Error ? error.stack : String(error)}\n`).catch(() => undefined);
    throw error;
  });
}
