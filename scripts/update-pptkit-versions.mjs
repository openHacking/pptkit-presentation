import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const packageNames = ["@pptkit/core", "@pptkit/pptx-exporter", "@pptkit/svg-renderer"];
const previewManifestPath = path.join(root, "apps", "preview", "package.json");
const workflowManifestPath = path.join(root, "packages", "presentation-workflow", "package.json");
const workflowReadmePath = path.join(root, "packages", "presentation-workflow", "README.md");
const versionCheckPath = path.join(root, "scripts", "check-versions.mjs");
const starterManifestPath = path.join(root, "skills", "pptkit-presentation", "assets", "starter", "package.json");
const compatibilityPath = path.join(root, "skills", "pptkit-presentation", "references", "compatibility.md");
const lockfilePath = path.join(root, "pnpm-lock.yaml");
const npmEnv = { ...process.env, npm_config_cache: path.join(root, ".npm-cache") };
const compatibilityLocations = {
  "@pptkit/core": "in the preview app and starter",
  "@pptkit/pptx-exporter": "in the preview app and starter",
  "@pptkit/svg-renderer": "in the preview app",
};

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function validateVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export function parseArgs(args) {
  if (args.length === 0) return { dryRun: false };
  if (args.length === 1 && args[0] === "--dry-run") return { dryRun: true };
  throw new Error("Usage: pnpm update:pptkit [--dry-run]");
}

export function assertAlignedVersions(versions) {
  const entries = Object.entries(versions);
  for (const [packageName, version] of entries) {
    if (!validateVersion(version)) throw new Error(`${packageName} returned unsupported latest version: ${version}`);
  }

  const distinctVersions = new Set(entries.map(([, version]) => version));
  if (distinctVersions.size !== 1) {
    const details = entries.map(([packageName, version]) => `${packageName}@${version}`).join(", ");
    throw new Error(`Latest PPTKit package versions are not aligned: ${details}`);
  }
  return entries[0][1];
}

function fetchLatestVersion(packageName) {
  const result = spawnSync(
    "npm",
    ["view", packageName, "dist-tags.latest", "--json", "--fetch-timeout=10000", "--fetch-retries=0"],
    { cwd: root, encoding: "utf8", env: npmEnv, timeout: 15000 },
  );
  if (result.status !== 0 || result.error || result.signal) {
    const detail = (result.stderr || result.error?.message || "unknown npm error").trim();
    throw new Error(`Unable to read ${packageName} latest version from npm: ${detail}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm returned invalid version data for ${packageName}: ${result.stdout.trim()}`);
  }
}

function replaceExactlyOnce(text, current, replacement, label) {
  const first = text.indexOf(current);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (text.indexOf(current, first + current.length) !== -1) throw new Error(`Found multiple ${label} references`);
  return `${text.slice(0, first)}${replacement}${text.slice(first + current.length)}`;
}

export function collectUpdates(nextVersion) {
  const preview = readJson(previewManifestPath);
  const workflow = readJson(workflowManifestPath);
  const starter = readJson(starterManifestPath);
  const versionCheck = readFileSync(versionCheckPath, "utf8");
  const engineVersionMatch = versionCheck.match(/^const engineVersion = "(\d+\.\d+\.\d+)";$/m);
  if (!engineVersionMatch) throw new Error("Could not find engineVersion in scripts/check-versions.mjs");
  const currentVersion = engineVersionMatch[1];

  for (const [label, manifest, dependencies] of [
    ["preview", preview, packageNames],
    ["workflow", workflow, ["@pptkit/core"]],
    ["starter", starter, ["@pptkit/core", "@pptkit/pptx-exporter"]],
  ]) {
    for (const dependency of dependencies) {
      if (manifest.dependencies?.[dependency] !== currentVersion) {
        throw new Error(`${label} does not pin ${dependency}@${currentVersion}`);
      }
      manifest.dependencies[dependency] = nextVersion;
    }
  }

  let workflowReadme = readFileSync(workflowReadmePath, "utf8");
  workflowReadme = replaceExactlyOnce(
    workflowReadme,
    `@pptkit/core@${currentVersion}`,
    `@pptkit/core@${nextVersion}`,
    `workflow README @pptkit/core@${currentVersion}`,
  );

  const nextVersionCheck = replaceExactlyOnce(
    versionCheck,
    `const engineVersion = "${currentVersion}";`,
    `const engineVersion = "${nextVersion}";`,
    `engineVersion ${currentVersion}`,
  );

  let compatibility = readFileSync(compatibilityPath, "utf8");
  for (const packageName of packageNames) {
    const location = compatibilityLocations[packageName];
    compatibility = replaceExactlyOnce(
      compatibility,
      `| \`${packageName}\` | exact \`${currentVersion}\` ${location} |`,
      `| \`${packageName}\` | exact \`${nextVersion}\` ${location} |`,
      `compatibility row for ${packageName}@${currentVersion}`,
    );
  }

  return new Map([
    [previewManifestPath, formatJson(preview)],
    [workflowManifestPath, formatJson(workflow)],
    [workflowReadmePath, workflowReadme],
    [versionCheckPath, nextVersionCheck],
    [starterManifestPath, formatJson(starter)],
    [compatibilityPath, compatibility],
  ]);
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", env: npmEnv });
}

function applyUpdates(updates) {
  const backups = new Map([...updates.keys()].map((filePath) => [filePath, readFileSync(filePath, "utf8")]));
  backups.set(lockfilePath, readFileSync(lockfilePath, "utf8"));

  try {
    for (const [filePath, contents] of updates) writeFileSync(filePath, contents);
    run("pnpm", ["install", "--lockfile-only"]);
    run("pnpm", ["--filter", "dsh-plugin-pptkit-presentation", "build"]);
  } catch (error) {
    for (const [filePath, contents] of backups) writeFileSync(filePath, contents);
    try {
      run("pnpm", ["--filter", "dsh-plugin-pptkit-presentation", "build"]);
    } catch {
      // Preserve the original failure. The source files and lockfile are restored.
    }
    throw error;
  }
}

export function main(args = process.argv.slice(2)) {
  const { dryRun } = parseArgs(args);
  const versions = Object.fromEntries(packageNames.map((packageName) => [packageName, fetchLatestVersion(packageName)]));
  const nextVersion = assertAlignedVersions(versions);
  const updates = collectUpdates(nextVersion);
  const currentVersion = readJson(workflowManifestPath).dependencies["@pptkit/core"];

  console.log(`PPTKit engine: ${currentVersion} -> ${nextVersion}`);
  if (currentVersion === nextVersion) {
    console.log("PPTKit dependencies are already current.");
    return;
  }
  if (dryRun) {
    console.log("Dry run complete. No files were changed.");
    return;
  }

  applyUpdates(updates);
  console.log("Updated PPTKit dependencies, pnpm lockfile, and generated DSH skill mirror.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`\nPPTKit dependency update failed: ${error.message}`);
    process.exitCode = 1;
  }
}
