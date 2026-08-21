# Design system and slide roles

## Design intent

Design the argument, not a decorated document. Every slide needs one dominant message, one deliberate reading path, and a composition that earns its structure. Empty space is useful when it frames meaning; it is a defect when content is simply stranded in a small box.

Do not copy external templates, code, assets, or signature compositions. Use references only to learn general principles such as clear hierarchy, visible style selection, subject-specific choices, and disciplined review.

## Typography and rhythm

The 960×540 canvas uses this presentation-scale hierarchy:

| Level | Range | Use |
| --- | --- | --- |
| Display | 46–60 pt | covers, closings, section anchors |
| Title | 34–40 pt | ordinary slide titles |
| Lead | 24–30 pt | primary arguments and framing |
| Body | 18–22 pt | ordinary spoken/read copy |
| Detail | 15–18 pt | tables, annotations, supporting evidence |
| Metadata | 9–11 pt | page numbers, eyebrows, genuine captions only |

- Use `0.92–1.0` line spacing for display/title text, `1.08–1.18` for body text, and 4–8 pt paragraph spacing.
- Tighten large headings and keep body tracking neutral. Build hierarchy from size, weight, line spacing, width, and contrast together.
- Keep ordinary prose to a comfortable measure. A wide text box does not require a full-width sentence.
- Auto-fit may protect against small rendering differences but must not scale below 90%. Shorten or split content instead.
- Keep table copy at or above 15 pt. If that does not fit, use a ledger/list, reduce visible rows, or split the slide.

## Themes

### clean-business

Use a quiet light canvas, deep navy text, restrained blue accents, strong information axes, thin dividers, and square geometry. Prefer open columns and data bands over rounded UI-card panels. Use for executive reviews, product plans, project updates, and pitches.

### swiss-grid

Use a warm-white canvas, strict modular grids, black text, one red accent, square geometry, large numeric anchors, hairlines, and compact real metadata. Asymmetry should come from the grid and content hierarchy, not arbitrary offsets. Use for technical systems, product launches, data stories, and engineering content.

### editorial-story

Use warm paper, charcoal text, terracotta accents, serif display type, narrow reading measures, pull quotes, and asymmetric image/text compositions. Prefer rules, columns, and tonal surfaces over UI-like cards. Use for research, essays, cultural topics, and narrative reports.

Never mix themes within one deck. Across a deck, alternate composition and density while preserving the chosen theme's identity.

## Composition language

The ten public roles remain semantic. Composition is an optional public intent and recipe IDs remain internal. The authoring runtime selects deterministic theme-specific geometry from explicit composition, content shape, density, adjacent rhythm, theme, and seed:

- `hero`: one dominant statement, used for cover/section/closing transitions.
- `split`: argument plus counterpoint, evidence, action, or image.
- `ledger` / `editorial-list`: short structured rows; preferred for two-column tables and concise feature lists.
- `grid`: genuinely equal KPIs or concepts.
- `divided`: two positions separated by a meaningful rule or field change.
- `timeline`: ordered process where sequence matters.
- `image-split` / `image-hero`: imagery as evidence, not decoration.

Composition names are not a global compatibility list. Use this role map when an explicit composition is necessary; otherwise omit `composition` and let the planner choose:

| Role | Supported compositions |
| --- | --- |
| `cover` | `hero`, `split` |
| `agenda` | `ledger`, `grid` |
| `section` | `hero`, `divided` |
| `statement` | `hero`, `split`, `divided` |
| `image` | `image-hero`, `image-split`, `split` |
| `kpi` | `grid`, `ledger` |
| `comparison` | `divided`, `split` |
| `process` | `timeline`, `grid`, `ledger`, `divided` |
| `table` | `ledger` (exactly 2 headers), `grid`, `split` (chart data) |
| `closing` | `hero`, `split` |

**Default authoring rule:** omit `composition` and `density` unless the outline deliberately requires that exact treatment. An optional intent is a constraint, not a style suggestion. The planner already selects a deterministic compatible recipe from role, content shape, density, adjacent rhythm, theme, and seed.

When an explicit composition is necessary, satisfy these content prerequisites before writing `deck-session.json`:

| Role | Explicit composition | Required content shape |
| --- | --- | --- |
| `cover` | `hero`, `split` | title; subtitle optional |
| `agenda` | `ledger` | at least 1 `items` entry |
| `agenda` | `grid` | at least 2 `items` entries |
| `section` | `hero`, `divided` | title; message optional |
| `statement` | `hero`, `divided` | non-empty `message` |
| `statement` | `split` | non-empty `message` and at least 1 `items` entry |
| `image` | `image-hero` | declared `image` and no `items` |
| `image` | `image-split`, `split` | declared `image` and at least 1 `items` entry |
| `kpi` | `grid`, `ledger` | at least 1 `kpis` entry |
| `comparison` | `divided`, `split` | complete `comparison.left` and `comparison.right` |
| `process` | `timeline`, `grid`, `ledger` | 2–6 `steps` objects |
| `process` | `divided` | at least 2 `steps` objects |
| `table` | `ledger` | `table` with exactly 2 headers |
| `table` | `grid` | valid `table` |
| `table` | `split` | valid `chart` |
| `closing` | `hero`, `split` | title; message optional |

Do not treat a composition name as having the same content contract across roles. In particular, `statement + split` requires supporting `items`, while `cover + split` and `closing + split` do not. If a requested treatment is not essential, omit the optional intent instead of guessing its prerequisites.

The map describes semantic support, not a promise that every content shape fits every density. `process + grid` is an ordered modular grid for 2–6 steps; it is appropriate for a sequence of connected surfaces or stages. `agenda + grid` is for orientation among genuinely equal topics. A table remains a table when rows and columns carry structured data; do not convert it to `process` merely to obtain a grid.

Do not use numbering unless order, navigation, or comparison needs it. Do not place every idea in a card. Do not repeat the same main composition on three consecutive slides.

Theme tokens are safety rails, not a page template. Brand adaptation may override the six theme colors and heading/body fonts, but must preserve contrast and the typography floors. Never expose arbitrary coordinates, margins, radii, or per-element sizes through the deck spec.

## Ten roles

| Role | Use | Required plan fields |
| --- | --- | --- |
| `cover` | Open with title and framing | `title`, optional `subtitle` |
| `agenda` | Orient the audience | `items` |
| `section` | Mark a narrative transition | `title`, optional `message` |
| `statement` | Land one argument or quote | `message` |
| `image` | Pair evidence or product imagery with a point | `image`, optional `items` |
| `kpi` | Show 1–4 metrics | `kpis` |
| `comparison` | Compare two positions | `comparison` |
| `process` | Explain 2–6 ordered steps | `steps: [{ title, detail? }]` |
| `table` | Present structured data | `table`, optional `chart` |
| `closing` | Close with action or takeaway | `message`, optional `items` |

Use the exact `SlidePlan` field shapes below. Do not substitute older or display-oriented names:

- `sourceRefs`: `[{ "id": "source-id", "slideNumbers": [1] }]`; use `id`, never `sourceId`.
- `comparison`: `{ "left": { "heading": "Before", "items": ["..."] }, "right": { "heading": "After", "items": ["..."] } }`; both sides require `heading` and `items`.
- `table`: `{ "headers": ["Column A", "Column B"], "rows": [["A1", "B1"]] }`; use `headers`, never `columns`.
- `chart`: optional on `table` roles; `chart.type` supports `"bar"`, `"line"`, or `"pie"`. Pie charts require exactly one series.
- `kpis`: `[{ "value": "72%", "label": "Retention", "detail": "Optional detail" }]`.
- `image`: `{ "assetId": "declared-asset-id", "alt": "Description", "fit": "contain" }`.
- `steps`: `[{ "title": "Prepare", "detail": "Optional supporting explanation" }, { "title": "Review" }]`; use 2–6 objects and never string entries.

Do not fill `composition` mechanically. Omit it unless the narrative requires a specific treatment and the role/content shape supports it. Use the role map above as the allow-list, not the union of all composition names. A table `ledger` requires exactly two headers, a table `split` requires chart data, and an ordinary table can use `grid`.

Every `ExtractedSource` uses `id`, `name`, `mimeType`, `type`, and `warnings`; text sources put extracted text in `content`. Fields such as `kind` and `slideCount` are not part of `DeckSession`. Before transfer, parse the completed file with `parseDeckSession()` or prepare it with `preparePptkitTransfer()`; both perform schema and layout-recipe validation. A JSON syntax check alone is insufficient.

Minimal valid role shapes (all also require `id`, `role`, and `title`):

```json
[
  { "id": "cover", "role": "cover", "title": "Title" },
  { "id": "agenda", "role": "agenda", "title": "Agenda", "items": ["Topic"] },
  { "id": "section", "role": "section", "title": "Section" },
  { "id": "statement", "role": "statement", "title": "Point", "message": "The main point" },
  { "id": "image", "role": "image", "title": "Evidence", "image": { "assetId": "declared-image", "alt": "Evidence" } },
  { "id": "kpi", "role": "kpi", "title": "Metrics", "kpis": [{ "value": "42%", "label": "Growth" }] },
  { "id": "comparison", "role": "comparison", "title": "Compare", "comparison": { "left": { "heading": "Before", "items": [] }, "right": { "heading": "After", "items": [] } } },
  { "id": "process", "role": "process", "title": "Process", "steps": [{ "title": "Prepare" }, { "title": "Review" }] },
  { "id": "table", "role": "table", "title": "Data", "table": { "headers": ["A"], "rows": [["B"]] } },
  { "id": "closing", "role": "closing", "title": "Next step" }
]
```

## Density and provenance

- Keep at most six agenda/process items, four KPIs, two comparison columns, and eight visible table rows.
- A title above the safe measure, a long primary message, or a paragraph-like bullet is a signal to edit or split the slide.
- `sourceRefs` are provenance metadata. They belong in the session and speaker notes, never in an automatic visible `Sources:` footer.
- Do not show `src-01-*`, source filenames, filesystem paths, template names, style option names, or generation commentary.
- If the user explicitly requests on-slide citations, write concise human-readable citations from authoritative publication/author/title/URL data. Keep internal IDs separately in `sourceRefs`.

## Images

- Reference PNG, JPEG, GIF, or SVG images by stable `assetId`. Browser sessions resolve transferred IndexedDB `blob:` assets; Node fallback projects copy files into `assets/`.
- Provide width and height from `content/sources.json` so `contain` and `cover` are deterministic.
- Use `cover` for photographic crops and `contain` for screenshots, diagrams, and UI evidence.
- Preserve genuine UI screenshots, scans, and user-supplied evidence images when redrawing would change their meaning. A rendered source slide is not a screenshot asset: in restyle work, extract and reconstruct its text and information structure instead.
- If a complex source diagram needs raster fallback, crop only the diagram region and pair it with native explanatory copy. Record the crop provenance; using 80% or more of the source slide triggers an oversized-crop warning.
- Align image slots to the composition grid. Repeated images in one group must share height, crop behavior, and visual weight.
