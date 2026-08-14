# dsh-plugin-pptkit-presentation

DeepSeek Harness plugin bundle for [PPTKit Presentation](../../README.md). When
installed into a DSH profile, this package registers the `pptkit-presentation`
Agent Skill with DSH's `ctx.skills` registry, so a DeepSeek Harness session
can author, generate, and export editable PowerPoint decks using the skill's
Node workflow.

## Install

Run the plugin build first (it mirrors the repository's source-of-truth skill
into this package):

```bash
pnpm --filter dsh-plugin-pptkit-presentation build
```

Then install the bundle into a DSH profile (`web` for the browser UI,
`headless` for unattended runs):

```bash
# from this repository
dsh plugin --profile web add "file:$PWD/packages/dsh-plugin-pptkit-presentation"

# from GitHub (pnpm subdirectory spec; the prepare build must be allowed — add
# the key pnpm prints to the profile's pnpm-workspace.yaml allowBuilds, then
# re-run)
dsh plugin --profile web add "openHacking/pptkit-presentation#path:/packages/dsh-plugin-pptkit-presentation"

# from npm after publishing
dsh plugin --profile web add dsh-plugin-pptkit-presentation
```

The bundle patch row appears in the profile's `dsh.profile.bundles` and the
`pptkit-presentation` skill appears in the model-facing skill catalog.

## Zero-plugin fallback

If you prefer not to install a bundle, DSH's native filesystem skill provider
discovers skills under `$DSH_HOME/skills` (default `~/.dsh/skills`). Copy the
skill there:

```bash
node scripts/install-dsh.mjs
```

See [docs/guides/dsh-harness.md](../../docs/guides/dsh-harness.md) for details.

## Config

| Field | Meaning |
| --- | --- |
| `skillDir` | Absolute path to a `pptkit-presentation` skill directory override. Defaults to `PPTKIT_SKILL_DIR`, then the skill bundled with this package. |

## How it works

`cordis.patch.yml` inserts one row naming this package. The plugin's
`apply()` registers a skill provider (provider name `pptkit-bundle`, rank
250) that serves the bundled skill directory with a directory `resourceBase`,
so `<SKILL_DIR>/scripts/init-project.mjs` and `assets/previews/*` resolve the
same way they do for a locally installed Agent Skill.

## Development

- The `skill/` directory is a generated mirror of
  `skills/pptkit-presentation`; regenerate with
  `pnpm --filter dsh-plugin-pptkit-presentation build`. Never edit it
  directly — `scripts/check-plugin.mjs` (root `pnpm lint`) fails when it
  drifts from the source.
- `pnpm --filter dsh-plugin-pptkit-presentation test` builds and runs the
  provider tests.
- The plugin has no runtime dependency on DSH packages: it talks to
  `ctx.skills` structurally and imports only `@deepseek-ai/schemastery` for
  its config schema.
