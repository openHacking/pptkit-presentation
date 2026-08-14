/**
 * Skill provider for the pptkit-presentation Agent Skill.
 *
 * Serves the skill bundled with this package (`skill/pptkit-presentation`)
 * into DSH's `ctx.skills` registry so the model-facing catalog and `skill`
 * tool surface it exactly like a locally installed Agent Skill. The
 * `resourceBase` directory keeps `<SKILL_DIR>/scripts/init-project.mjs` and
 * `assets/previews/*` resolvable from loaded skill bodies.
 *
 * The provider is immutable and ignores its registration control; discovery
 * and loading are synchronous reads of local files.
 *
 * @module dsh-plugin-pptkit-presentation/skill-provider
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from "@deepseek-ai/dsh-skill";

export const SKILL_NAME = "pptkit-presentation";
export const PROVIDER_NAME = "pptkit-bundle";
export const BUNDLE_RANK = 250;

export interface PptkitSkillProviderOptions {
  /** Absolute path to the installed plugin package root. */
  packageDir: string;
  /** Optional explicit skill directory override. */
  skillDir?: string;
}

export type PptkitSkillLocator = { readonly path: string };

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/**
 * Parse the Agent Skill frontmatter required by DSH: `name` and `description`
 * as scalar `key: value` lines delimited by `---`. Returns null when the
 * frontmatter or either required field is absent.
 */
export function parseSkillFrontmatter(content: string): ParsedSkill | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (match === null) return null;
  const frontmatter = match[1];
  const body = match[2];
  if (frontmatter === undefined || body === undefined) return null;
  const fields = new Map<string, string>();
  for (const line of frontmatter.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key !== "" && value !== "") fields.set(key, value);
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (name === undefined || description === undefined) return null;
  return { name, description, body };
}

/**
 * Resolve the skill directory in order: explicit `skillDir` option, the
 * `PPTKIT_SKILL_DIR` environment variable, then the skill bundled with this
 * package. Returns null when no candidate contains `SKILL.md`.
 */
export function resolveSkillDir(options: PptkitSkillProviderOptions): string | null {
  const candidates = [
    options.skillDir,
    process.env.PPTKIT_SKILL_DIR,
    join(options.packageDir, "skill", SKILL_NAME),
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === "") continue;
    const dir = resolve(candidate);
    if (existsSync(join(dir, "SKILL.md"))) return dir;
  }
  return null;
}

/** Read and parse the skill at a directory, or null when unloadable. */
export function readSkill(dir: string): ParsedSkill | null {
  const skillFile = join(dir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  return parseSkillFrontmatter(readFileSync(skillFile, "utf8"));
}

function summaryFor(dir: string, parsed: ParsedSkill): Omit<SkillCandidate, "rank" | "locator"> {
  return {
    name: parsed.name,
    description: parsed.description,
    invocation: { modelInvocable: true, userInvocable: true },
    source: "bundled",
    provider: PROVIDER_NAME,
    resourceBase: { kind: "directory", path: dir },
  };
}

/**
 * Create the immutable skill provider for this bundle. Rank 250 sits between
 * DSH's project roots (100/200) and custom/user roots (300-500): a checked-out
 * project copy of the skill intentionally wins over the bundle, while the
 * bundle wins over user-level copies.
 */
export function createPptkitProvider(options: PptkitSkillProviderOptions): SkillProvider {
  return {
    name: PROVIDER_NAME,
    async list(): Promise<readonly SkillCandidate[]> {
      const dir = resolveSkillDir(options);
      if (dir === null) return [];
      const parsed = readSkill(dir);
      if (parsed === null) return [];
      return [
        {
          ...summaryFor(dir, parsed),
          rank: BUNDLE_RANK,
          locator: { path: join(dir, "SKILL.md") } satisfies PptkitSkillLocator,
        },
      ];
    },
    async get(
      candidate: SkillCandidate,
      _options: SkillLookupOptions,
    ): Promise<SkillDefinition | undefined> {
      const locator = candidate.locator as PptkitSkillLocator;
      const dir = dirname(locator.path);
      const parsed = readSkill(dir);
      if (parsed === null) return undefined;
      return {
        ...summaryFor(dir, parsed),
        content: parsed.body,
        path: locator.path,
      };
    },
  };
}
