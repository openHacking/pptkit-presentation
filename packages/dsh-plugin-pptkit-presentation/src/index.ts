/**
 * dsh-plugin-pptkit-presentation — DeepSeek Harness plugin bundle.
 *
 * Registers a `ctx.skills` provider that serves the `pptkit-presentation`
 * Agent Skill bundled with this package. Install into a DSH profile with:
 *
 *   dsh plugin --profile web add <this-package>
 *
 * @module dsh-plugin-pptkit-presentation
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type { SkillProviderControl } from "@deepseek-ai/dsh-skill";
import Schema from "@deepseek-ai/schemastery";
import { createPptkitProvider, type PptkitSkillProviderOptions } from "./skill-provider.js";

export const name = "dsh-plugin-pptkit-presentation";
export const inject = ["skills"] as const;

export const Config = Schema.object({
  // Object properties are optional by default in schemastery; a missing
  // skillDir falls back to PPTKIT_SKILL_DIR, then the bundled skill.
  skillDir: Schema.string().description(
    "Absolute path override for the pptkit-presentation skill directory. " +
      "Omit to use the skill bundled with this package.",
  ),
});

export function apply(ctx: Context, config: { skillDir?: string }): () => void {
  // Built output lives in <package>/dist; the bundled skill mirror and
  // cordis.patch.yml live one level up in the installed package.
  const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const options: PptkitSkillProviderOptions = { packageDir };
  if (config.skillDir !== undefined) options.skillDir = config.skillDir;
  return ctx.skills.registerProvider((_control: SkillProviderControl) =>
    createPptkitProvider(options),
  );
}
