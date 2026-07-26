---
name: pptkit-presentation
description: Create polished, structured, editable PowerPoint presentations with PPTKit from a topic, pasted text, PPTX, Markdown, TXT, PDF, DOCX, CSV, XLSX, or image assets. Use when the user asks to make, generate, design, revise, preview, or export a PPT, PPTX, slide deck, presentation, pitch deck, report deck, or training deck, including requests such as “create a presentation”, “turn this report into slides”, or “create an editable PowerPoint”.
---

# PPTKit Presentation

Create a structured deck session, preview it in the browser, and generate an editable `.pptx` only after the user explicitly chooses export. Prefer the browser workflow; keep the Node project workflow as a compatibility and strict-rendering fallback.

## Fast path and reference routing

Read `SKILL.md` once, then route references by phase. Do not reopen a reference, browser `documentation()`, resolved preview URL, or runtime capability already read successfully in the same task or revision.

| Phase | Read once | Continue when |
| --- | --- | --- |
| Intake and outline | [workflow.md](references/workflow.md) | Missing decisions are grouped and the outline gate is resolved. |
| Runtime selection | [runtime-routing.md](references/runtime-routing.md) | Browser or Node is recorded from concrete capability evidence. |
| Browser execution | [browser-workflow.md](references/browser-workflow.md) | The selected browser is bound and the bridge capability is cached. |
| Node execution | [node-workflow.md](references/node-workflow.md) | Browser routing failed concretely or strict local rendering is required. |
| Authoring | [design-system.md](references/design-system.md) | The approved brief and source evidence are ready. |
| QA and delivery | [quality.md](references/quality.md) | Full-deck checks and the adversarial review are complete. |
| Compatibility | [compatibility.md](references/compatibility.md) | Only when changing dependencies, URLs, protocols, storage, or publishing. |

## Run the workflow

1. Inspect the request and every supplied source before asking questions. Extract its text, tables, charts, diagrams, flow, and information architecture when present. For an existing PPTX, use structured per-slide evidence; a rendered slide is review evidence, never default slide content. Read [workflow.md](references/workflow.md).
2. Ask only for decisions that cannot be inferred. Combine the missing purpose/audience, theme, and scope/material decisions into one native form, grouped by section and with recommended defaults. Use the host's native question/form tool (in Codex, `request_user_input`) whenever available.
3. Show the three style previews in `assets/previews/` in the same intake message unless the user already chose a theme. Recommend exactly one theme.
4. Build the normalized brief and slide-by-slide outline. Record each slide's role, composition intent, density, visual intent, visual evidence, and source IDs. Persist `composition`, `density`, and `visualIntent` only when they express a deliberate, recipe-compatible constraint; otherwise omit them and let the planner choose. They are runtime inputs, not commentary. For decks of eight or more slides, plan at least two content-appropriate visual anchors unless the user explicitly requests a uniformly restrained treatment. Keep the detailed outline separate from the short decision summary.
5. Require exactly one confirmation outcome: **Approve and generate**, **Change the plan**, or **Cancel**. Do not create artifacts, open a preview, install dependencies, or generate PPTX bytes before approval. Skip this gate only for a complete specification that explicitly requests generation without confirmation.
6. After approval, choose the runtime:
   - Read [runtime-routing.md](references/runtime-routing.md) and complete its state machine. Runtime selection is a recorded decision, not an inference from which tools happen to be visible.
   - In Codex, discover the Browser instructions and the `node_repl js` tool even when browser controls are not directly visible. Initialize the Browser runtime, explicitly try the `iab` browser first, and, if that real attempt fails, try external Chrome through `agent.browsers.get("extension")` when the Chrome skill is available. Read each selected browser's complete `documentation()` before controlling it, then reuse that binding and documentation for revisions in the same task. Do not infer unavailability from the initial tool list or silently choose Node.
   - Use [browser-workflow.md](references/browser-workflow.md) when either Codex browser can open the official or configured preview URL, supports `pptkit-transfer`, and the user did not require unattended local output or Office/LibreOffice rendering. Require HTTPS except for an explicitly supplied loopback development URL. Chrome uses the same DOM bridge, transfer protocol, IndexedDB storage, and export flow as the in-app browser.
   - After authoring an asset-free session, use `transferPptkitSession()` as the default one-call path from validated `deck-session.json` to a ready SVG preview. Do not manually repeat its preflight, transfer-surface, submission, or polling steps.
   - Use [node-workflow.md](references/node-workflow.md) otherwise. In Codex, browser-unavailable fallback evidence must include separate concrete `iab` and Chrome results through the initializer's `--iab-evidence` and `--chrome-evidence` arguments; a free-form summary or initially hidden control is insufficient. Do not pause for a browser-choice question. State the fallback reason, pass the required routing evidence to the guarded initializer, and, after initialization, mention that enabling the in-app Browser next time provides a better PPT review experience. If the initializer rejects the evidence, stop; do not bypass or modify the guard.
7. Read each routed reference at most once per task: [design-system.md](references/design-system.md) before authoring and [quality.md](references/quality.md) before delivery. Use `deck-session.json` as the browser source of truth and stable slide IDs across revisions.
8. Treat validation errors, missing required assets, out-of-bounds elements, risky overlaps, malformed packages, and unexpected exporter warnings as failures.
9. Deliver the browser preview first and do not download automatically. After preview, export only when the user clicks **Generate & download PPTX** or explicitly asks the agent to export/download it. Mention every remaining warning and the SVG-versus-Office fidelity boundary.

## Keep these contracts

- Use `DeckSession`. Every `DeckSpec` requires `design.theme`, `design.seed`, and `design.variation`; call `authorDeck()` when authoring outside the preview application.
- Use `assetId` references in `ImagePlan`; never leak temporary filesystem paths into the browser-neutral deck spec.
- Images may support cover, section, statement, image, KPI, and closing roles. Use `image-background` only when the image can tolerate a full-bleed crop and the overlaid copy remains readable.
- Use one of `clean-business`, `swiss-grid`, or `editorial-story` and the ten supported slide roles.
- Treat the three previews as design languages, not fixed final templates. Use `DeckSpec.design.seed` for reproducible variation and use only `design.theme.overrides` color/font fields when brand adaptation is required.
- Use native PPTKit text, shapes, connectors, images, and tables. Editable shape-based charts are not native data-bound PowerPoint charts.
- Set `brief.mode` to `restyle` when revising an existing deck, map `SourceRef.slideNumbers`, and review `restyleAudit`. A title plus a rendered source-slide image is not an acceptable reconstruction.
- Keep source material local. Browser sessions and assets use the unified chunk protocol and IndexedDB-backed `blob:` URLs; Node projects copy assets into `assets/`.
- Give every newly approved task a unique session ID and keep it stable only for revisions within that task. Open the hash-free preview URL for a new task; use a session-specific hash URL only to revise or restore that task.
- Use only PPTKit public exports. Do not import `dist` files or private implementation paths.
- Do not claim template fill, lossless round-trip, animation, editable SmartArt, audio/video, browser editing, cross-device preview links, or pixel-identical PowerPoint preview.
- Do not copy templates, code, or assets from other presentation skills.

## Control quality

- Prefer one message per slide; preserve citations and source IDs in `sourceRefs`, which are provenance metadata and are not visible slide footers.
- Never place internal source IDs, input filenames, local paths, template/style names, or workflow instructions in visible slide copy. If a visible citation is explicitly required, author a human-readable citation as content and keep the internal ID in `sourceRefs`.
- Split content instead of shrinking below the theme minimum. Treat 18–22 pt as ordinary body copy, 15–18 pt as detail/table copy, and 9–11 pt as metadata only.
- Use theme-specific compositions and vary narrative rhythm. Do not solve empty space with filler, decorative numbering, repeated rounded cards, or arbitrary icons.
- Treat `visualIntent` as a commitment about the first visual focus: `content-led`, `image-led`, `color-led`, `data-led`, or `type-led`. Do not label a slide image-led when imagery remains a thumbnail.
- Treat optional layout intents as constraints. Unless the outline deliberately requires a specific compatible treatment, omit `composition`, `density`, and `visualIntent` and let the planner select from role, content, rhythm, theme, and seed.
- Do not populate `visualIntent` on every slide by default. In particular, table recipes are `data-led`; agenda, comparison, and process recipes are `content-led`. If no compatible treatment is intentionally required, omit `visualIntent`.
- Treat `incompatible-composition` as an authoring error. Review `layoutDecisions` in the build report; do not hide or manually rewrite an unexpected seeded choice after export.
- Review `visualAudit` in the build report. Resolve weak image/color treatments, long low-intensity runs, and missing visual anchors instead of dismissing them as subjective styling.
- Rebuild and re-preview after each material revision; keep the current slide selected by stable slide ID.
- Treat SVG renderer warnings as review evidence, not as proof of Office fidelity.
- Treat whole-slide preview use, oversized source-slide crops, missing source mapping, weak text retention, and `rasterized-slide-risk` as restyle defects. They remain report warnings so a package can be inspected, but must be disclosed and revised unless the user explicitly accepts them.
- Perform the final adversarial review in [quality.md](references/quality.md).

## Compatibility

Read [compatibility.md](references/compatibility.md) before changing dependency versions, the preview URL, or publishing the skill.
