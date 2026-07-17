# PPTKit Presentation Contribution Guidelines

This repository owns the end-user presentation product built on PPTKit.

- Keep `presentation-workflow` browser-neutral and free of filesystem, process, UI framework, and network concerns.
- Keep the Agent Skill self-contained; its Node starter belongs only under `skills/pptkit-presentation/assets/starter`.
- Import PPTKit packages only through published public entry points and exact validated versions.
- Preserve `DeckSessionV2`, stable slide IDs, the transfer protocol, and existing storage compatibility unless a migration is explicitly designed.
- Keep source material local and require explicit user action before PPTX export.
- Run build, typecheck, lint, tests, skill validation, and package inspection before release.
- Perform an adversarial review for compatibility, failure behavior, unnecessary complexity, and likely regressions.
