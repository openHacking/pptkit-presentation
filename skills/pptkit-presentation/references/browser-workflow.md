# Browser workflow

Use this workflow only after the confirmation gate.

## Preconditions

- Resolve the HTTPS preview application in this order:
  1. A URL explicitly supplied by the user or host for the current task.
  2. `PPTKIT_PREVIEW_URL`, when available.
  3. The official PPTKit preview application at `https://openhacking.github.io/pptkit-presentation/`.
- Require the resolved application to support `DeckSessionV2` with `schemaVersion: 2`. Never invent another deployment URL.
- Require modern browser support for `fetch`, `Blob`, `URL`, typed arrays, `structuredClone`, Web Crypto, storage estimation, and IndexedDB.
- Require the read-only `[data-testid="pptkit-preview-bridge"]` DOM bridge to report `pptkit-transfer-v1`. Its JSON is authored by the preview page in the page's native context and includes `protocol`, `maxChunkBytes`, required `apis`, and resumable transfer `state`. Do not infer page API availability from globals visible to the Browser tool's isolated read-only evaluation sandbox. Fall back only when the resolved URL is unreachable or incompatible, the DOM bridge reports IndexedDB or another required API unavailable, a real chunk transfer fails, or strict Office/LibreOffice rendering is required. File size alone is never a fallback reason.

## Create the session

Create these artifacts without initializing a Node project:

```text
project/
├── deck-brief.md
├── deck-session.json
└── content/sources.json
```

Use this top-level shape:

```json
{
  "schemaVersion": 2,
  "id": "stable-deck-slug",
  "revision": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "deck": { "brief": {}, "slides": [] },
  "sources": [],
  "assets": []
}
```

Use stable source, asset, and slide IDs. Every `SessionAsset` contains `id`, `name`, `mimeType`, `byteLength`, and `sha256`; never include `dataUrl` or filesystem paths.

Create a unique session ID for every newly approved task; do not reuse a title-derived ID from another conversation. Preserve that ID across revisions within the task. The hash-free preview URL is always a clean new-task entry point, while `#<sessionId>` is the dedicated restore URL for one task.

## Transfer the session and assets

Use `scripts/transfer-payload.mjs` from this skill through Codex's managed JavaScript runtime. This is part of the Browser workflow and does not require Node to be installed in the user's project.

1. Prepare every referenced asset first and copy the helper's `byteLength` and `sha256` into its `SessionAsset` manifest entry; this preparation does not send bytes.
2. Serialize the completed manifest to `deck-session.json`, then prepare it as a `session` payload with `application/json`, using the session ID as `payloadId`.
3. Parse the JSON text of the unique `[data-testid="pptkit-preview-bridge"]` node. Before sending a chunk, open the progressive transfer surface through `[data-testid="pptkit-transfer-toggle"]` when its `aria-expanded` value is not `true`, then send only the chunk indexes listed in `state.transfers[].missing` through the stable `pptkit-transfer-input` and `pptkit-transfer-submit` controls. Re-read the bridge after every submitted chunk. The payload form closes when the session and declared assets are complete; a compact connection trigger remains available for later revisions without occupying review-layout space. The legacy `window.__pptkitPreviewBridge` exists for ordinary page automation compatibility, but Codex Browser must use the DOM bridge.
4. Confirm the completed session ID before sending assets.
5. Send each prepared asset with its session ID, asset ID, and declared MIME type; send only missing chunks and verify `completed` after every asset.
6. Treat quota, hash, MIME, manifest, or transfer-state errors as real Browser failures. Record the exact bridge error before considering Node.

Do not call a mutable console API, paste a complete session, use a native file picker, or place Base64/data URLs in `deck-session.json`.

## Open and verify

1. Open the resolved HTTPS URL with the host's browser capability. For a new task, explicitly navigate to the hash-free base URL even when reusing an existing tab; use the dedicated `#<sessionId>` URL only for a revision or requested restore.
2. In Codex, discover the Browser instructions and `node_repl js` even when controls are not directly visible. Initialize the runtime, bind `iab` explicitly, emit and read its complete `documentation()`, make it visible for the user-facing preview, and open or reuse the resolved URL. Do not give up solely because the initial tool list omits browser controls.
3. If the `iab` setup, selection, or navigation attempt actually fails, preserve its exact step and error, follow `bootstrap-troubleshooting` when directed, then check for the Chrome skill instead of falling back to Node. When available, bind external Chrome through `agent.browsers.get("extension")`, emit and read its complete `documentation()`, and open the same URL. Follow `chrome-troubleshooting` for extension setup or communication failures. If Chrome succeeds, tell the user briefly that the workflow switched from the in-app Browser to external Chrome.
4. Treat a successful open or focus operation in either browser as proof that the preview channel is available. Both browsers must use the unique `[data-testid="pptkit-preview-bridge"]` DOM node, `pptkit-transfer-v1`, IndexedDB storage, and the same explicit export flow. Do not create a Chrome-only transport or use a separate browser automation server.
5. Only fall back for browser unavailability after both Codex channels have concrete results. Do not ask the user to choose or call `request_user_input`: automatically enter the Node workflow, preserve the resolved preview URL as a direct review link, and provide the documented better-review reminder after Node initialization.
6. Transfer the complete session and referenced assets through `pptkit-transfer-v1`.
7. Confirm the title, theme, revision, slide count, one SVG per slide, IndexedDB save status, completed transfer states from the DOM bridge, and the complete findings list.
8. Inspect every slide in the stage or thumbnail gallery. Treat blocking findings as failures and renderer warnings as required review items.
9. Keep the preview tab as a deliverable tab so the user can review it before export. In Codex, finalize the browser session with this tab marked `deliverable`; do not clean it up as an intermediate research tab.

Do not download automatically. Export is allowed when the user clicks **Generate & download PPTX** or explicitly asks the agent to trigger the export/download after preview.

Completed sessions and their assets remain local for 30 days from the session's last update. Incomplete transfers remain resumable for 24 hours. The preview removes failed transfers immediately and provides controls to delete the current presentation or all PPTKit preview data stored by the site.

## Revise

Translate feedback into the brief or slide plan, increment `revision`, refresh `updatedAt`, and import the full session again. Preserve semantic slide IDs so the application keeps the same slide selected and reports changed pages.

## Browser source extraction

Inspect TXT/Markdown, PDF, DOCX, PPTX, CSV/XLS/XLSX, PNG/JPEG/GIF, and SVG sources with host-native file tools and place normalized evidence in `sources`. For every format, inspect diagrams, charts, flow, grouping, and information architecture when present instead of relying only on extracted text. Transfer supported PNG/JPEG/GIF/SVG assets through the unified chunk protocol; the preview stores them in IndexedDB without uploading them.

For PPTX restyle work, populate `ExtractedSource.pptx`, set `brief.mode` to `restyle`, and map source pages with `SourceRef.slideNumbers`. Mark rendered slides as `source-slide-preview`; they are inspection-only. Mark a necessary diagram-only crop as `source-slide-crop` with its source page and crop rectangle. The browser export records the same `restyleAudit` as Node.

## Export

When the user clicks **Generate & download PPTX**, or explicitly asks the agent to export/download, the application generates bytes, inspects ZIP/XML parts, downloads `build-report.json`, and downloads the PPTX only when package checks pass. Browser preview does not replace a final PowerPoint or LibreOffice review.
