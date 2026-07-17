# Node fallback workflow

Use this workflow only after `runtime-routing.md` has selected Node. State the fallback reason and evidence to the user before initialization.

1. Initialize an isolated project:

   ```bash
   node <SKILL_DIR>/scripts/init-project.mjs \
     --output <PROJECT_DIR> \
     --title <SLUG> \
     --theme <THEME_ID> \
     --fallback-reason <REASON> \
     --browser-check <failed|not-required> \
     --browser-step <STEP> \
     --fallback-evidence <CONCRETE_EVIDENCE> \
     --preview-url <RESOLVED_HTTPS_URL>
   ```

   Use `--no-install` only when dependencies are unavailable or when preparing files without execution. The initializer writes `runtime-decision.json` and refuses missing or contradictory routing evidence before creating the project. Never modify the bundled starter or bypass the routing guard.
2. Copy source files into `<PROJECT_DIR>/sources/`, run `npm run extract -- <paths...>`, and read `content/sources.json` plus `content/assets.json`. PPTX extraction combines `officeparser@7.1.0` text compatibility with PPTKit's OOXML evidence analyzer, preserving slide order, geometry summaries, groups, connectors, tables, diagrams, notes, and embedded-image provenance. The other adapters use PDF.js, Mammoth, SheetJS, and byte-level image measurement.
3. Write `deck-brief.md` and edit `src/deck-spec.ts`. Reference copied images by `assetId`, relative to the project's `assets/` directory.
4. Run `npm run build`. The shared workflow runtime validates the deck, inspects layout, generates bytes through the Node asset adapter, writes `output/deck.pptx`, checks the package from `Uint8Array`, and records `restyleAudit` when `brief.mode` is `restyle`.
5. Run `npm run render` when LibreOffice/Poppler review is required. Missing render tools produce a reported skip, not a false success.
6. Deliver `runtime-decision.json`, `output/deck.pptx`, `output/build-report.json` (including `layoutDecisions` and any `restyleAudit`), `deck-brief.md`, `src/deck-spec.ts`, `content/sources.json`, `content/assets.json`, and optional `output/rendered/` with its contact sheet.

Keep local assets inside `assets/`; the Node adapter is the only layer allowed to resolve filesystem paths.
