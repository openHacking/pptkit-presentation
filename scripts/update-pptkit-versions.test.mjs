import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { assertAlignedVersions, collectUpdates, parseArgs, root, validateVersion } from "./update-pptkit-versions.mjs";

test("update arguments support normal and dry-run modes", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false });
  assert.deepEqual(parseArgs(["--dry-run"]), { dryRun: true });
  assert.throws(() => parseArgs(["--latest"]), /Usage/);
});

test("PPTKit versions must be stable semantic versions", () => {
  assert.equal(validateVersion("1.2.3"), true);
  assert.equal(validateVersion("1.2.3-beta.1"), false);
  assert.equal(validateVersion("v1.2.3"), false);
});

test("latest PPTKit package versions must be aligned", () => {
  const aligned = {
    "@pptkit/core": "1.2.3",
    "@pptkit/pptx-exporter": "1.2.3",
    "@pptkit/svg-renderer": "1.2.3",
  };
  assert.equal(assertAlignedVersions(aligned), "1.2.3");
  assert.throws(
    () => assertAlignedVersions({ ...aligned, "@pptkit/svg-renderer": "1.2.4" }),
    /not aligned/,
  );
  assert.throws(() => assertAlignedVersions({ ...aligned, "@pptkit/core": "latest" }), /unsupported latest version/);
});

test("version updates cover every declared target", () => {
  const nextVersion = "9.9.9";
  const updates = collectUpdates(nextVersion);
  const byBasename = Object.fromEntries(
    [...updates].map(([filePath, contents]) => [path.relative(root, filePath), contents]),
  );

  assert.equal(updates.size, 6);
  const preview = JSON.parse(byBasename["apps/preview/package.json"]);
  const workflow = JSON.parse(byBasename["packages/presentation-workflow/package.json"]);
  const starter = JSON.parse(byBasename["skills/pptkit-presentation/assets/starter/package.json"]);
  assert.equal(preview.dependencies["@pptkit/core"], nextVersion);
  assert.equal(preview.dependencies["@pptkit/pptx-exporter"], nextVersion);
  assert.equal(preview.dependencies["@pptkit/svg-renderer"], nextVersion);
  assert.equal(workflow.dependencies["@pptkit/core"], nextVersion);
  assert.equal(starter.dependencies["@pptkit/core"], nextVersion);
  assert.equal(starter.dependencies["@pptkit/pptx-exporter"], nextVersion);
  assert.match(byBasename["packages/presentation-workflow/README.md"], /@pptkit\/core@9\.9\.9/);
  assert.match(byBasename["scripts/check-versions.mjs"], /const engineVersion = "9\.9\.9";/);
  assert.match(byBasename["skills/pptkit-presentation/references/compatibility.md"], /@pptkit\/svg-renderer.*9\.9\.9/);
});
