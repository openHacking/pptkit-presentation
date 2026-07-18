import assert from "node:assert/strict";
import test from "node:test";

import { bumpVersion, parseArgs, validateVersion } from "./release.mjs";

test("bumpVersion increments semantic release types", () => {
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
});

test("release inputs reject unsupported values", () => {
  assert.equal(validateVersion("1.2.3"), true);
  assert.equal(validateVersion("v1.2.3"), false);
  assert.throws(() => bumpVersion("1.2.3", "prerelease"), /Unsupported release type/);
  assert.throws(() => bumpVersion("1.2", "patch"), /Unsupported version format/);
  assert.deepEqual(parseArgs([]), { dryRun: false });
  assert.deepEqual(parseArgs(["--dry-run"]), { dryRun: true });
  assert.throws(() => parseArgs(["--force"]), /Usage/);
});
