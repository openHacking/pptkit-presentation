import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(root, "packages", "presentation-workflow");
const manifestPath = path.join(packageRoot, "package.json");
const starterManifestPath = path.join(root, "skills", "pptkit-presentation", "assets", "starter", "package.json");
const compatibilityPath = path.join(root, "skills", "pptkit-presentation", "references", "compatibility.md");
const npmEnv = { ...process.env, npm_config_cache: path.join(root, ".npm-cache") };

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function bumpVersion(version, releaseType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unsupported version format: ${version}`);

  const [major, minor, patch] = match.slice(1).map(Number);
  if (releaseType === "patch") return `${major}.${minor}.${patch + 1}`;
  if (releaseType === "minor") return `${major}.${minor + 1}.0`;
  if (releaseType === "major") return `${major + 1}.0.0`;
  throw new Error(`Unsupported release type: ${releaseType}`);
}

export function validateVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export function parseArgs(args) {
  if (args.length === 0) return { dryRun: false };
  if (args.length === 1 && args[0] === "--dry-run") return { dryRun: true };
  throw new Error("Usage: pnpm release:npm [--dry-run]");
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
}

function assertTargetVersionAvailable(packageName, version) {
  const result = spawnSync(
    "npm",
    ["view", `${packageName}@${version}`, "version", "--json", "--fetch-timeout=10000", "--fetch-retries=0"],
    { cwd: root, encoding: "utf8", env: npmEnv, timeout: 15000 },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.status === 0) throw new Error(`${packageName}@${version} already exists on npm`);
  if (result.error || result.signal || !/E404|notarget|404 Not Found/i.test(output)) {
    throw new Error(`Unable to verify ${packageName}@${version} on npm. Check npm login and registry connectivity.`);
  }
}

async function chooseVersion(currentVersion, rl) {
  console.log(`Current version: ${currentVersion}`);
  console.log("Select release type:");
  console.log("1. patch");
  console.log("2. minor");
  console.log("3. major");
  console.log("4. custom");

  const choice = (await rl.question("Enter choice [1-4]: ")).trim();
  if (choice === "1") return bumpVersion(currentVersion, "patch");
  if (choice === "2") return bumpVersion(currentVersion, "minor");
  if (choice === "3") return bumpVersion(currentVersion, "major");
  if (choice === "4") {
    const customVersion = (await rl.question("Enter custom version (x.y.z): ")).trim();
    if (!validateVersion(customVersion)) throw new Error(`Invalid custom version: ${customVersion}`);
    return customVersion;
  }
  throw new Error(`Invalid choice: ${choice}`);
}

function updateVersionReferences(manifest, nextVersion) {
  const starterManifest = readJson(starterManifestPath);
  const compatibility = readFileSync(compatibilityPath, "utf8");
  const currentVersionReference = `| \`presentation-workflow\` | exact \`${manifest.version}\` in the preview app and starter |`;
  const nextVersionReference = `| \`presentation-workflow\` | exact \`${nextVersion}\` in the preview app and starter |`;
  if (!compatibility.includes(currentVersionReference)) {
    throw new Error(`Could not find presentation-workflow@${manifest.version} in compatibility.md`);
  }

  writeJson(manifestPath, { ...manifest, version: nextVersion });
  writeJson(starterManifestPath, {
    ...starterManifest,
    dependencies: { ...starterManifest.dependencies, "presentation-workflow": nextVersion },
  });
  writeFileSync(compatibilityPath, compatibility.replace(currentVersionReference, nextVersionReference));
}

export async function main(args = process.argv.slice(2)) {
  const { dryRun } = parseArgs(args);
  const manifest = readJson(manifestPath);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const nextVersion = await chooseVersion(manifest.version, rl);
    console.log(`\n${manifest.name}: ${manifest.version} -> ${nextVersion}`);
    assertTargetVersionAvailable(manifest.name, nextVersion);

    console.log("\nRunning validation...");
    run("pnpm", ["build"]);
    run("pnpm", ["typecheck"]);
    run("pnpm", ["lint"]);
    run("pnpm", ["test"]);
    run("npm", ["pack", "--dry-run", "--json"], { cwd: packageRoot, env: npmEnv });

    if (dryRun) {
      console.log(`\nRelease dry run passed for ${manifest.name}@${nextVersion}. No files were changed.`);
      return;
    }

    const shouldContinue = (await rl.question("\nContinue with version update and publish? [y/N]: ")).trim().toLowerCase();
    if (shouldContinue !== "y" && shouldContinue !== "yes") {
      console.log("Cancelled.");
      return;
    }

    updateVersionReferences(manifest, nextVersion);
    console.log("\nPublishing package to npm...");
    try {
      run("npm", ["publish", "--access", "public"], { cwd: packageRoot, env: npmEnv });
    } catch (error) {
      throw new Error(
        `npm publish failed after version files were updated. Review npm and git diff before retrying. ${error.message}`,
      );
    }
    console.log(`\nPublished ${manifest.name}@${nextVersion}.`);
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nRelease failed: ${error.message}`);
    process.exitCode = 1;
  });
}
