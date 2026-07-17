# `presentation-workflow`

`presentation-workflow` provides the browser-neutral contracts and deterministic recipes used by the browser-first presentation skill and its Node fallback.

## Deck sessions

`DeckSessionV2` is the portable source of truth for browser review:

```ts
import type { DeckSessionV2 } from "presentation-workflow";

const session: DeckSessionV2 = {
  schemaVersion: 2,
  id: "quarterly-review",
  revision: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deck: {
    brief,
    design: { theme: { id: "clean-business" }, seed: "quarterly-review", variation: "balanced" },
    slides,
  },
  sources: [],
  assets: [],
};
```

Images use stable `assetId` values. `authorDeck(deck, resolver)` asks the runtime adapter to resolve each ID into a browser URL or Node path and returns `{ presentation, layoutDecisions }`, so callers author and report one identical planning pass.

`sourceRefs` are provenance metadata. The authoring runtime merges them into speaker notes and never creates an automatic visible source footer. A visible citation must be authored explicitly as human-readable slide content.

The three stable theme IDs use distinct deterministic layout recipes rather than a shared geometry with different colors. Role, content length, item count, image presence, and slide position determine the composition; no random layout selection is used. Clean Business uses square geometry, open columns, and rules instead of rounded UI-card panels. Workflow-authored bullets inherit Core's PowerPoint-compatible list indentation rather than applying a theme-local override.

`SlidePlan.composition` and `SlidePlan.density` optionally carry the outline's design intent into authoring. When they are absent, `planDeckLayout()` selects a compatible recipe from the deck as a whole, using content shape, adjacent rhythm, theme, and `DeckSpec.design.seed`. The same spec and seed always produce the same `LayoutDecision[]`; incompatible explicit compositions are validation errors rather than silent fallbacks.

`DeckSpec.design.theme.overrides` may replace brand colors and heading/body fonts. Geometry and arbitrary font sizes are intentionally not overrideable. Overrides must use six-digit RGB values, non-empty font names, and preserve readable text/background contrast.

## Source extraction

`extractSource` and `extractSources` accept `{ name, mimeType, bytes }`. Runtime adapters provide PDF, DOCX, PPTX, workbook, and image parsers. Plain text parsing, source IDs, result normalization, and failure reporting remain shared.

`analyzePptxEvidence(bytes)` is a limited, browser-neutral source-analysis API for presentation workflows. It resolves presentation slide order and summarizes slide size, text blocks, shapes, nested groups, connectors, tables, images, diagrams, and notes. It does not return Canonical IR and does not claim lossless PPTX import or round-trip support. `extractPptxEmbeddedAssets()` returns supported embedded image payloads with the slide numbers that reference them.

For existing-deck revisions, set `DeckBrief.mode` to `restyle` and use `SourceRef.slideNumbers` to map output slides back to source slides. Session assets may record `origin` as user material, embedded source media, a source-slide preview, or a cropped source-slide region.

`blobToSourceInput` is a convenience adapter for browser `File`/`Blob` values.

## Validation and package inspection

- `validateDeckSpec` checks semantic role requirements, IDs, role and text density, internal-metadata leakage, and asset availability.
- `planDeckLayout` returns explainable layout decisions, while deck validation also reports incompatible intent, repeated compositions, and insufficient long-deck diversity.
- `inspectStructure` checks resolved slide bounds and risky overlaps.
- `inspectPptxPackage(bytes)` checks required ZIP/XML parts directly from `Uint8Array` in either runtime.
- `parseDeckSession` validates schema version, external asset metadata, supported image MIME types, unique asset IDs, and slide asset references. Session assets contain byte length and SHA-256 metadata and never inline data URLs.
- `auditRestyleTransformation` reports source-page coverage, text retention, asset provenance problems, oversized crops, and complex source slides that appear to have been replaced by a single slide-shaped image. It warns below 25% per-slide or 50% aggregate informative-token retention and when a source crop covers at least 80% of the original slide. These findings are warnings and are stored in `BuildReport.restyleAudit`.

The package has no filesystem, process, IndexedDB, DOM, UI, or network behavior.
