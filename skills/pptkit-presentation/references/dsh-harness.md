# DeepSeek Harness host

Read this reference when the hosting agent is DeepSeek Harness (DSH), whether the skill was installed as the `dsh-plugin-pptkit-presentation` bundle or copied into a DSH skill root. It is the routing-gate branch for hosts without a browser tool and the delivery guide for the Node workflow on that host.

## Host capability

DeepSeek Harness has no in-app browser tool and no Chrome extension channel. The browser preview application cannot be opened or driven from a DSH session, so **browser execution is unavailable on this host**. Do not claim an `iab` or Chrome attempt; there is no such channel to check.

## Runtime routing

After the outline gate is approved, record the Node routing receipt and continue with [node-workflow.md](node-workflow.md):

- `--fallback-reason host-no-browser`;
- `--browser-check not-required`;
- `--browser-step host-capability`;
- `--fallback-evidence`: a concrete statement naming the host and its tool surface, for example `DeepSeek Harness web profile: no browser tool in the agent tool set`; and
- `--preview-url`: the resolved preview URL. The default preview application at `https://openhacking.github.io/pptkit-presentation/` is the official review surface for browser-capable hosts; in DSH it appears only in the routing receipt because no browser exists to open it.

Omit `--iab-evidence` and `--chrome-evidence`; `host-no-browser` is a `not-required` decision. Never fabricate browser-channel evidence to reach the Node workflow.

## Tools

DSH exposes a browser-neutral tool set. Use it as follows:

| DSH tool | Skill use |
| --- | --- |
| `ask_user_question` | The grouped intake/decision form for missing purpose, audience, theme, and scope decisions, with recommended defaults. |
| `read`, `write`, `edit`, `grep`, `glob` | Read references, author `deck-brief.md` and `src/deck-spec.ts`, inspect `content/sources.json` and `content/assets.json`. |
| `bash` | Run the Node starter commands (`npm run extract`, `npm run build`, `npm run render`) inside the generated project. |
| `read_image` | Review rasterized renders under `output/rendered/` when LibreOffice/Poppler rendering is available. It does not render SVG; convert or describe SVG previews instead. |

## Theme previews

Show the three style previews in `assets/previews/` as required by the intake step. In DSH, attach the SVG files to the intake message when the host supports file attachments, or describe the three visual languages in prose; do not claim to have rendered them when `read_image` cannot open SVG.

## Node workflow and delivery

Follow [node-workflow.md](node-workflow.md) end to end. Deliver the artifacts as conversation attachments:

- `runtime-decision.json`
- `output/deck.pptx`
- `output/build-report.json` (including `layoutDecisions` and any `restyleAudit`)
- `deck-brief.md`
- `src/deck-spec.ts`
- `content/sources.json` and `content/assets.json`
- optional `output/rendered/` with its contact sheet

Keep source material local. The Node adapter is the only layer allowed to resolve filesystem paths; export happens only after the user explicitly requests it. There is no browser preview to keep open, so the browser delivery steps in [browser-workflow.md](browser-workflow.md) do not apply.

## Install and update

The skill runs in DSH through either the bundle or a native skill copy:

- **Bundle (recommended):** install `dsh-plugin-pptkit-presentation` into the `web` or `headless` profile with `dsh plugin --profile <name> add <spec>`. The bundle registers the skill with DSH's `ctx.skills` registry; `dsh plugin` forwards pnpm, so updates flow through pnpm.
- **Native copy:** copy `skills/pptkit-presentation` from the repository `openHacking/pptkit-presentation` into `$DSH_HOME/skills/` (default `~/.dsh/skills`) — the repository helper is `node scripts/install-dsh.mjs`. DSH's filesystem skill provider discovers `SKILL.md` bundles there.

The bundle resolves the skill directory from `config.skillDir`, then `PPTKIT_SKILL_DIR`, then the skill bundled with the package. It has no runtime dependency on the `presentation-workflow` package; the generated Node project installs `presentation-workflow` and the `@pptkit/*` engine packages from npm at build time, exactly as it does on every other host.

## Local development

To exercise the uncommitted skill in DSH, point the bundle at the repository copy with `skillDir` (or `PPTKIT_SKILL_DIR`) set to this repository's `skills/pptkit-presentation`, or run `node scripts/install-dsh.mjs --project` to install into the current workspace's `.dsh/skills`. Regenerate the bundle's skill mirror with `pnpm --filter dsh-plugin-pptkit-presentation build`; the mirror is a build artifact and must not be edited directly.
