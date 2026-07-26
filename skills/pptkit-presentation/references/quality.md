# Quality gates

## Required automated checks

In browser mode, require a successful session import and SVG render. In Node mode, run `npm run build`. Require:

- no PPTKit validation errors
- no element outside the slide boundary
- no unexpected pairwise overlap classified as high risk
- no missing required image
- no exporter warning unless explicitly accepted and reported
- before export: one preview SVG per planned slide and no blocking session/layout/asset issue
- before export: review the build report's `layoutDecisions` and a whole-deck contact sheet in addition to individual slides
- for restyle work: review source-page coverage, text-retention warnings, asset provenance, oversized crops, and rasterized-slide risks
- after the user requests export: a readable ZIP containing content types, presentation, slide, and relationship parts
- after export: XML-shaped package parts with matching slide count

Warnings are deliverables, not console noise. Keep them in browser findings and `build-report.json`, or in the Node `output/build-report.json`.

## Optional rendering

The SVG browser preview is the default review surface and is not pixel-identical to Office. In Node fallback, run `npm run render` when strict application rendering is requested. The script checks for LibreOffice, `pdftoppm`, and ImageMagick `montage`:

- LibreOffice converts the PPTX to PDF.
- Poppler renders page PNGs.
- ImageMagick creates `contact-sheet.png` when available.

If any capability is absent, record `skipped` or `partial`; do not fail an otherwise structurally valid build. Ask the user to open the deck manually in PowerPoint or LibreOffice.

## Visual review

Inspect every rendered slide for:

- clipped or unexpectedly wrapped text
- low contrast or unreadable captions
- ordinary copy below 18 pt or table/detail copy below 15 pt
- collisions and accidental tangencies
- inconsistent margins, alignment, or page rhythm
- repeated main compositions, stranded text blocks, or filler used to occupy empty space
- stretched/cropped evidence and substituted fonts
- unsupported glyphs or missing media
- visible internal source IDs, filenames, paths, template names, or workflow commentary

Use the contact sheet to judge sequence-level rhythm. Geometry checks can identify repeated recipes or isolated content, but a `content-island` warning requires visual judgment: intentional negative space is valid; stranded copy is not.

## Adversarial review

Attack at least these failure modes before delivery:

1. Dependency or PPTKit version drift prevents a clean project install.
2. Long translated text overflows a layout that worked in another language.
3. Temporary, remote, or renamed image paths disappear at export time.
4. Font substitution changes wrapping or hierarchy across PowerPoint and LibreOffice.
5. IndexedDB, browser API, HTTPS URL, or asset-size failures leave a session that appears saved or complete.
6. A host without structured forms skips a required product decision.
7. Provenance disappears when the visible source footer is removed, or leaks back into visible copy through a source label.
8. A layout passes geometry checks but still creates weak hierarchy, excessive whitespace, or three repeated compositions in sequence.
9. A restyle deck appears polished but replaces editable source pages with rendered thumbnails, loses unmapped source slides, or hides poor text retention inside images.

Fix the underlying source or layout. Do not dismiss a failure because a `.pptx` file exists.
