# PPTKit authoring boundary

Use the bundled runtime for ordinary decks. Extend it only when a requested behavior cannot be expressed by the existing `SlidePlan` contract.

## Public imports

```ts
import {
  createPresentation,
  normalizePresentation,
  validatePresentation,
} from "@pptkit/core";
import { writePptx } from "@pptkit/pptx-exporter/node";
```

Never import package `dist` files or private source paths.

## Supported native elements

- Rich text boxes and shape text
- Images registered as assets with optional source dimensions
- Rectangles, rounded rectangles, ellipses, triangles, diamonds, arrows, and chevrons
- Connectors with editable strokes and arrows
- Groups and native editable tables
- Themes, layouts, placeholders, notes, actions, metadata, and accessibility

## Known v1 limits

- No PPTX parser or existing-template fill
- No browser/SVG preview renderer
- No native data-bound charts or SmartArt
- No environment-backed text measurement, automatic pagination, or general constraint solver
- No animation, audio, or video authoring

Use the starter's deterministic grids and conservative density rules instead of hiding these limits. Put reusable presentation recipes inside the skill runtime, not inside Core.
