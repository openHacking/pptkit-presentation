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
| `process` | Explain 2–6 ordered steps | `steps` |
| `table` | Present structured data | `table`, optional `chart` |
| `closing` | Close with action or takeaway | `message`, optional `items` |

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
