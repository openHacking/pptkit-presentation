# PPTKit Presentation

PPTKit Presentation turns topics, documents, spreadsheets, images, and existing presentations into polished, editable PowerPoint files. It combines a reusable presentation workflow, a local-first browser review application, and the `pptkit-presentation` Agent Skill.

## Install the skill

In a skill-enabled agent such as Codex, ask:

```text
Install the `pptkit-presentation` skill from the GitHub repository `openHacking/pptkit-presentation`.
```

Or install it from the command line:

```bash
npx skills add openHacking/pptkit-presentation --skill pptkit-presentation -g
```

Then ask the agent to create a presentation, for example: “Use PPTKit to turn this quarterly report into an editable 10-slide PPTX.”

The default review application is available at <https://openhacking.github.io/pptkit-presentation/>. Deck data and assets remain local to the browser.

## Packages and applications

| Path | Responsibility |
| --- | --- |
| `packages/presentation-workflow` | Published `presentation-workflow` package with portable deck sessions, deterministic authoring recipes, source extraction, and quality checks. |
| `apps/preview` | Local-first browser review and explicit PPTX export application. |
| `skills/pptkit-presentation` | Cross-agent workflow, references, previews, and isolated Node fallback starter. |

The underlying presentation engine remains in [openHacking/pptkit](https://github.com/openHacking/pptkit). This repository consumes only its published public APIs.

## Development

PPTKit Presentation requires Node.js 20 or newer and pnpm 10.13.1.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm run pack:check
```

See the [presentation skill guide](docs/guides/presentation-skill.md), [`presentation-workflow` API](docs/api/presentation-workflow.md), and [repository architecture](docs/architecture/README.md).

## License

MIT
