# Architecture

PPTKit Presentation is a consumer product built on the separately published PPTKit engine.

```text
Agent Skill / Preview / Node adapter
                 |
                 v
        presentation-workflow
                 |
                 v
       published PPTKit packages
```

`presentation-workflow` owns portable deck sessions, themes, deterministic authoring recipes, source evidence, package inspection, and quality reports. It has no filesystem, process, browser UI, or network behavior.

`apps/preview` owns browser UI, IndexedDB persistence, chunk transfer, SVG review, and explicit browser export. The Node starter owns local paths, source copying, filesystem output, and optional Office/LibreOffice rendering.

Dependencies flow toward published PPTKit contracts. This repository must never import a neighboring PPTKit checkout, generated `dist` internals, or private source paths.
