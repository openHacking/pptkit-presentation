# Compatibility and release

## Runtime matrix

| Component | v1 contract |
| --- | --- |
| Browser | modern HTTPS browser with IndexedDB, Blob, URL, fetch, typed arrays, structuredClone, Web Crypto, and storage estimation |
| Node.js fallback | `>=20` |
| `@pptkit/core` | exact `0.1.8` in the preview app and starter |
| `@pptkit/pptx-exporter` | exact `0.1.8` in the preview app and starter |
| `presentation-workflow` | exact `0.1.2` in the preview app and starter |
| TypeScript | exact version in the starter manifest |
| PowerPoint/LibreOffice | manual compatibility review required for public release |

Keep the three PPTKit engine dependencies aligned at the exact validated engine version. Version `presentation-workflow` independently, and update the HTTPS preview application and Node starter together only after the workspace build, typecheck, lint, tests, package dry-run, and representative browser/Node deck fixtures pass.

## Installation

Install the skill with:

```bash
npx skills add openHacking/pptkit-presentation --skill pptkit-presentation -g
```

Skill installation does not install project dependencies globally or modify the user's environment. Browser mode uses `https://openhacking.github.io/pptkit-presentation/` by default, so a normal installation requires no preview configuration. A user- or host-supplied URL takes precedence, followed by `PPTKIT_PREVIEW_URL`, for private deployments, staging, or local development. `init-project.mjs` creates an isolated project and installs pinned dependencies only when the Node fallback is selected and supplies a valid runtime-routing receipt. This guarded CLI requirement is intentional; older unguarded initializer commands must be updated with the documented fallback fields.

## Publishing boundary

The public installation path requires the matching PPTKit versions to exist on npm. Do not publish the skill as generally available while its pinned PPTKit packages are unavailable. npm publication requires maintainer credentials and explicit release approval.

## Licensing

The skill implementation and visual assets must be original PPTKit work. External presentation skills may inform workflow research only; do not copy their source, templates, previews, or proprietary exporters.
