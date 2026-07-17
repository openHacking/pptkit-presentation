# Contributing

Keep the workflow package browser-neutral, keep runtime side effects in the preview application or Node starter, and consume PPTKit only through published public exports.

Before submitting changes, run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm run pack:check
```

Every behavior change needs focused tests. Update compatibility documentation whenever package versions, the skill installation source, or the preview URL changes.
