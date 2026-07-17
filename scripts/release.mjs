import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(root, "packages", "presentation-workflow");
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const dryRun = process.argv.slice(2).includes("--dry-run");
const npmEnv = { ...process.env, npm_config_cache: path.join(root, ".npm-cache") };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? 1}`);
}

const lookup = spawnSync("npm", ["view", `${manifest.name}@${manifest.version}`, "version", "--json", "--fetch-timeout=10000", "--fetch-retries=0"], { cwd: root, encoding: "utf8", env: npmEnv });
if (lookup.status === 0) throw new Error(`${manifest.name}@${manifest.version} already exists on npm`);
if (!/E404|notarget|404 Not Found/i.test(`${lookup.stdout}\n${lookup.stderr}`)) throw new Error(`Unable to verify npm availability:\n${lookup.stderr}`);

run("pnpm", ["build"]);
run("pnpm", ["typecheck"]);
run("pnpm", ["lint"]);
run("pnpm", ["test"]);
run("npm", ["pack", "--dry-run", "--json"], { cwd: packageRoot, env: npmEnv });

if (dryRun) console.log(`Release dry run passed for ${manifest.name}@${manifest.version}.`);
else run("npm", ["publish", "--access", "public"], { cwd: packageRoot, env: npmEnv });
