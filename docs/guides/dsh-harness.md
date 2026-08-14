# Running PPTKit Presentation in DeepSeek Harness

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) is a runnable agent harness where everything — models, tools, sandboxes, session storage, UI, and the agent loop itself — is a plugin. This repository supports DSH through the `dsh-plugin-pptkit-presentation` bundle and the skill's `dsh-harness.md` reference.

DSH has no in-app browser tool, so the browser preview workflow is unavailable there. The skill routes to the **Node workflow** (recorded as `host-no-browser` routing evidence) and delivers the generated `.pptx` and build reports as chat attachments.

## Install

### Prerequisite: the `dsh` CLI

The bundle commands below need the `dsh` CLI from the npm package
[`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh). It is not
installed by this repository and is not present by default. Check with
`command -v dsh`; if it prints nothing:

```bash
npm install -g @deepseek-ai/dsh        # adds dsh to PATH
# or skip the global install and prefix every command below with npx:
#   npx -y @deepseek-ai/dsh plugin --profile web add ...
```

`dsh plugin` forwards to `pnpm` inside the profile directory
(`$DSH_HOME/profiles/<name>`, `$DSH_HOME` defaults to `~/.dsh`), so `pnpm`
must also be on `PATH`. The profile is initialized on first use. After adding
the plugin, **restart DSH**: the running process does not hot-reload profile
bundles, so the new skill appears in the catalog only after a restart.

### Bundle (recommended)

The bundle lives in `packages/dsh-plugin-pptkit-presentation`. Build it once (it mirrors the source-of-truth skill into the package), then install into a DSH profile:

```bash
pnpm --filter dsh-plugin-pptkit-presentation build

# local checkout
dsh plugin --profile web add "file:$PWD/packages/dsh-plugin-pptkit-presentation"

# from GitHub (prepare build must be allowed — add the key pnpm prints to the
# profile's pnpm-workspace.yaml allowBuilds, then re-run)
dsh plugin --profile web add "openHacking/pptkit-presentation#path:/packages/dsh-plugin-pptkit-presentation"

# from npm after publishing
dsh plugin --profile web add dsh-plugin-pptkit-presentation
```

The `web` profile boots the browser UI; `headless` runs unattended sessions. The bundle's patch row joins `dsh.profile.bundles` and the `pptkit-presentation` skill appears in the model-facing skill catalog, so a DSH session can be asked directly to create a deck.

### Native copy (zero-plugin fallback)

DSH's filesystem skill provider discovers `SKILL.md` bundles under `$DSH_HOME/skills` (default `~/.dsh/skills`) and project `.dsh/skills`. Copy the skill there:

```bash
node scripts/install-dsh.mjs                 # -> $DSH_HOME/skills/pptkit-presentation
node scripts/install-dsh.mjs --project      # -> ./.dsh/skills/pptkit-presentation
```

## Use

Ask the same way you would in any agent:

> Use PPTKit to turn this quarterly report into an editable 10-slide presentation for our executive review.

The skill groups missing decisions into one native form (`ask_user_question` in DSH), shows the theme previews, requires an explicit **Approve and generate** gate, and then:

1. Reads `references/dsh-harness.md` and records the Node routing receipt (`host-no-browser`, `--browser-check not-required`, `--browser-step host-capability`).
2. Runs `node <SKILL_DIR>/scripts/init-project.mjs` to create the isolated Node project.
3. Extracts sources (`npm run extract`), authors `deck-brief.md` and `src/deck-spec.ts`, and builds `output/deck.pptx` (`npm run build`).
4. Delivers `output/deck.pptx`, `output/build-report.json`, `runtime-decision.json`, `deck-brief.md`, `src/deck-spec.ts`, `content/sources.json`, and `content/assets.json` as chat attachments.

Export happens only when you explicitly ask for the PPTX download; the skill never uploads source material.

## Config

The bundle accepts an optional `skillDir` (set in the profile's `cordis.patch.yml` override for the `pptkit-presentation` row, or as the `PPTKIT_SKILL_DIR` environment variable). Resolution order: `skillDir` → `PPTKIT_SKILL_DIR` → the skill bundled with the package. The default is the bundled skill, which keeps its own scripts, references, and assets together.

## Development

- Regenerate the bundle's skill mirror: `pnpm --filter dsh-plugin-pptkit-presentation build`. The mirror is a build artifact; `scripts/check-plugin.mjs` (part of `pnpm lint`) fails when it drifts from `skills/pptkit-presentation`.
- Exercise the uncommitted skill in DSH by pointing the bundle at this checkout: set `skillDir` (or `PPTKIT_SKILL_DIR`) to `skills/pptkit-presentation`, or run `node scripts/install-dsh.mjs --project`.
- Test with an isolated home: `DSH_HOME=$(mktemp -d) dsh plugin --profile test add "file:$PWD/packages/dsh-plugin-pptkit-presentation"` — boot that profile and confirm the skill appears in the catalog.
- Keep DSH changes additive: the Codex browser-routing guard and the guarded initializer's evidence rules must stay intact (enforced by `scripts/pptkit-skill.test.mjs`).
