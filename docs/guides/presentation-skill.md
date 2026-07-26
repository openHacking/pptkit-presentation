# Generate and Preview a Deck with the Presentation Skill

The `pptkit-presentation` skill turns source material into a versioned deck session, opens an SVG review experience in a browser, and generates an editable PPTX only when the user requests a download. A Node project remains available as a fallback for unattended filesystem output and LibreOffice/PowerPoint-oriented validation.

## Install or update

In a skill-enabled agent such as Codex, install the skill by sending:

```text
Install the `pptkit-presentation` skill from the GitHub repository `openHacking/pptkit-presentation`.
```

To update the installed skill from the same repository, send:

```text
Update the `pptkit-presentation` skill from the GitHub repository `openHacking/pptkit-presentation`.
```

If the agent does not support skill installation in chat, install it globally with:

```bash
npx skills add openHacking/pptkit-presentation --skill pptkit-presentation -g
```

Update installed skills with:

```bash
npx skills update
```

The installed skill uses `https://openhacking.github.io/pptkit-presentation/` as its default HTTPS review application, so customers do not need to configure a preview URL. For a private deployment, staging environment, or local development, supply a URL for the current task or set `PPTKIT_PREVIEW_URL`; either overrides the official default. In Codex, the skill discovers the Browser controls and `node_repl js`, tries the in-app `iab` browser first, and then tries external Chrome through `agent.browsers.get("extension")` when the Chrome skill is available. It reads the selected browser's complete documentation before control and does not treat an abbreviated initial tool list as evidence that no browser exists. Chrome uses the same preview bridge, transfer protocol, local storage, and export flow. Only concrete results from both Codex browser channels permit an automatic browser-unavailable fallback to Node; no runtime-choice question interrupts generation.

For repository development, run `pnpm --filter presentation-preview dev`. The command starts the preview at `http://127.0.0.1:5173/` and writes a temporary `.pptkit-local-preview.json` marker containing the repository skill path and local URL. The root `AGENTS.md` routes new Codex tasks to those local inputs without modifying the globally installed skill. Open a new task in the repository while the server is running; existing tasks do not hot-reload repository instructions or skill definitions. HTTP is accepted only for explicit loopback development, while remote preview deployments still require HTTPS.

## Ask for a deck

Attach or name the relevant files and describe the audience and outcome:

```text
Use PPTKit to turn this quarterly report into an editable 10-slide presentation for our executive review.
```

The skill inspects available material, asks only for missing decisions in one grouped native form, shows the theme previews in that same interaction, and proposes a slide-by-slide outline with a composition intent and density check for every page. Those values are persisted in `deck-session.json`; if composition is omitted, the seeded planner makes and reports a deterministic choice. It does not create artifacts until the user selects **Approve and generate**. **Change the plan** returns to the affected decision, while **Cancel** stops without artifacts.

The generated deck keeps source IDs and filenames out of visible slide copy. `sourceRefs` remain available as provenance and are written to speaker notes; visible citations are included only when the user requests a human-readable citation treatment. Composition intents are role-specific: agents should use the compatibility map in the skill's design-system reference and omit optional composition or visual-intent fields when no deliberate compatible treatment is needed.

## Browser-first review

After approval, browser mode creates `deck-brief.md`, `deck-session.json`, and `content/sources.json`.

The agent transfers `DeckSession` JSON bytes and every referenced asset through the same resumable `pptkit-transfer` protocol. The page renders one standalone SVG per slide, shows blocking issues and warnings, stores the session and assets in IndexedDB, and keeps the review tab open. It does not upload deck data and does not generate PPTX bytes during preview.

Each newly approved task receives a unique session ID. The hash-free preview URL always opens a clean workspace; a `#<sessionId>` URL restores only that task. Revisions within the same task retain the ID, while a new conversation never inherits the previous task's preview, assets, or transfer errors.

Completed sessions and assets are retained locally for 30 days from the last session update, and incomplete transfers remain resumable for 24 hours. Failed transfers are not persisted. The transfer panel can delete the current presentation or, after confirmation, all PPTKit preview data stored by the site.

Users can revise the deck in chat without losing their place: revisions retain stable slide IDs, increment the session revision, re-import the complete session, and report changed pages.

All runtimes use the same theme-specific recipe registry and deck-level planner. Clean Business emphasizes information axes and rules, Swiss Grid uses modular asymmetry and numeric anchors, and Editorial Story uses narrow measures and narrative image/text compositions. Theme previews communicate these visual languages rather than promising one fixed page template.

After preview, the explicit **Generate & download PPTX** action—clicked by the user or triggered by the agent after an explicit user request—generates bytes in the browser, verifies ZIP/XML package structure, and downloads only the PPTX when package checks pass. Diagnostics remain available in the preview findings instead of being downloaded as a separate report. Browser SVG preview is a QA surface, not a pixel-identical PowerPoint renderer.

## Source material support

The agent treats TXT/Markdown, PDF, DOCX, PPTX, CSV/XLS/XLSX, PNG/JPEG/GIF, and SVG files uniformly as source material. It extracts available text and structured data, and inspects charts, diagrams, flow direction, grouping, and information architecture whenever those visual structures are present in any source format. Evidence and binary assets remain local and are transferred to IndexedDB only when the approved browser session needs them.

When revising an existing PPTX, the workflow records structured per-slide evidence and maps source slide numbers to the reconstructed output. Rendered source slides remain preview-only; embedded media and deliberately cropped diagram regions carry explicit provenance. Browser and Node builds report source coverage, text-retention, and rasterization-risk warnings instead of silently treating a title plus a whole-slide screenshot as a finished reconstruction.

Sessions never contain `dataUrl` assets. File size alone does not select Node; browser storage quota and verified transfer results determine whether Browser mode can continue.

The preview exposes a hidden, read-only `[data-testid="pptkit-preview-bridge"]` DOM integration surface. Its JSON contains the protocol name, maximum chunk size, API availability measured by the page itself, and resumable transfer progress. Codex Browser reads this DOM contract because its isolated read-only evaluation sandbox is intentionally not the page's native global context. The legacy `window.__pptkitPreviewBridge` remains available for ordinary browser automation. State changes are accepted only after opening the progressive `[data-testid="pptkit-transfer-toggle"]` surface and using the stable `pptkit-transfer-input` and `pptkit-transfer-submit` DOM controls. This keeps browser automation auditable without leaving a human-oriented payload form in the finished review UI.

## Node fallback

The skill initializes its isolated TypeScript starter when both available Codex browser channels are unavailable, the unified transfer protocol actually fails, unattended local output is required, or the user requests LibreOffice/PowerPoint-oriented rendering. Runtime routing is a guarded decision: the initializer refuses to create a project unless the caller supplies a valid reason, matching browser-check status and step, and concrete evidence. For Codex setup, selection, or navigation failures, the existing fallback evidence string contains labeled `iab` and Chrome results. After automatic fallback, the agent explains that the Node workflow is in use and that enabling the in-app Browser next time provides a better PPT review experience; it does not claim it can open Codex settings or trigger a system enablement dialog.

```bash
node skills/pptkit-presentation/scripts/init-project.mjs \
  --output /tmp/my-pptkit-deck \
  --title my-pptkit-deck \
  --theme clean-business \
  --fallback-reason strict-office-rendering \
  --browser-check not-required \
  --browser-step user-requirement \
  --fallback-evidence "The user explicitly requested LibreOffice rendering"
```

The Node adapter converts paths to the same portable asset contract, while deck authoring, validation, structure inspection, and byte-level package inspection come from `presentation-workflow`.

The initializer records the accepted routing receipt in `runtime-decision.json`. The fallback also delivers `output/deck.pptx`, `output/build-report.json`, `deck-brief.md`, `src/deck-spec.ts`, `content/sources.json`, and optional rendered pages.
