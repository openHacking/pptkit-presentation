# Runtime routing gate

Use this gate only after the user has approved generation. It owns the Browser-versus-Node decision and must finish before either workflow creates artifacts.

## State machine

1. Resolve the preview URL from the user or host, `PPTKIT_PREVIEW_URL`, or `https://openhacking.github.io/pptkit-presentation/`, in that order.
2. Check whether the request itself makes browser preview unsuitable:
   - the user requires unattended local output; or
   - the user requires Office/LibreOffice rendering.
3. If none applies, load the in-app Browser skill, initialize its runtime, explicitly select `iab`, and try to open the resolved URL. An abbreviated tool list is not a failed check.
4. If the page opens, read the JSON text from the unique `[data-testid="pptkit-preview-bridge"]` DOM node. Verify that it reports `protocol: "pptkit-transfer-v1"`, a positive `maxChunkBytes`, and `true` for every entry in `apis`, then continue with `browser-workflow.md`. Do not probe `globalThis`, `window`, or browser APIs from the Browser tool's read-only evaluation sandbox: that sandbox is not the preview page's native global context and may report page APIs as unavailable. File size is not a Node routing condition.
5. If setup, selection, navigation, compatibility, required browser API verification, or a real transfer actually fails, record the exact failed step and returned error. Then continue with `node-workflow.md`.

Do not read or execute `node-workflow.md` while the decision is unresolved. Do not claim a browser failure without a tool result. A timeout or tool error is evidence; the absence of an initially visible control is not.

## Auditable Node decision

The guarded Node initializer requires all of these values and writes them to `runtime-decision.json` in the generated project:

- `fallback-reason`: one of `browser-setup-failed`, `preview-navigation-failed`, `preview-incompatible`, `browser-api-unavailable`, `browser-transfer-failed`, `unattended-local-output`, or `strict-office-rendering`;
- `browser-check`: `failed` for an attempted browser check or `not-required` for a measured/requested suitability condition;
- `browser-step`: `setup`, `selection`, `navigation`, `compatibility`, `api-check`, `transfer`, or `user-requirement`, consistent with the reason;
- `fallback-evidence`: the concrete browser/bridge failure result or user requirement; and
- `preview-url`: the resolved HTTPS URL, defaulting to the official preview application.

The initializer rejects missing, contradictory, or vague routing evidence before it creates the output directory. Never weaken, patch around, or fabricate this receipt to make initialization proceed.
