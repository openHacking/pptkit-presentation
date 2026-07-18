# Runtime routing gate

Use this gate only after the user has approved generation. It owns the Browser-versus-Node decision and must finish before either workflow creates artifacts.

## State machine

1. Resolve the preview URL from the user or host, `PPTKIT_PREVIEW_URL`, or `https://openhacking.github.io/pptkit-presentation/`, in that order.
2. Check whether the request itself makes browser preview unsuitable:
   - the user requires unattended local output; or
   - the user requires Office/LibreOffice rendering.
3. If none applies, load the Codex Browser instructions and `node_repl js`, initialize the Browser runtime, explicitly select `iab`, emit and read its complete `documentation()`, and try to open the resolved URL. An abbreviated tool list is not a failed check. If setup, selection, or navigation fails, record the exact `iab` step and returned error, read `bootstrap-troubleshooting` when required by the Browser instructions, and continue to step 4 instead of Node.
4. After a real `iab` failure, check whether the Chrome skill is available. If it is, bind external Chrome with `agent.browsers.get("extension")`, emit and read its complete `documentation()`, and try the same resolved URL. Follow `chrome-troubleshooting` for extension setup, installation, or communication failures. If the Chrome skill is absent, record that concrete discovery result as the Chrome attempt; PPTKit does not install or enable the extension. Tell the user briefly when Chrome succeeds and is being used instead of the in-app Browser.
5. If either browser opens the page, read the JSON text from the unique `[data-testid="pptkit-preview-bridge"]` DOM node. Verify that it reports `protocol: "pptkit-transfer-v1"`, a positive `maxChunkBytes`, and `true` for every entry in `apis`, then continue with `browser-workflow.md`. Chrome uses exactly the same DOM bridge, `pptkit-transfer-v1`, IndexedDB storage, and export flow. Do not probe `globalThis`, `window`, or browser APIs from the Browser tool's read-only evaluation sandbox: that sandbox is not the preview page's native global context and may report page APIs as unavailable. File size is not a Node routing condition.
6. If both Codex browser channels are unavailable, automatically continue with `node-workflow.md`; do not call `request_user_input` or ask the user to choose a runtime. If compatibility, required browser API verification, or a real transfer fails after one browser has opened the page, record the exact failed step and returned error, then continue with Node. After Node initialization succeeds, tell the user: **This presentation is using the Node workflow. If your Codex supports the in-app Browser, enable it next time for a better PPT review experience.**

Do not read or execute `node-workflow.md` while the decision is unresolved. In Codex, an `iab` failure alone does not resolve it: external Chrome must succeed or produce a concrete unavailable/failure result. Do not claim a browser failure without a tool result. A timeout or tool error is evidence; the absence of an initially visible control is not.

## Auditable Node decision

The guarded Node initializer requires all of these values and writes them to `runtime-decision.json` in the generated project:

- `fallback-reason`: one of `browser-setup-failed`, `preview-navigation-failed`, `preview-incompatible`, `browser-api-unavailable`, `browser-transfer-failed`, `unattended-local-output`, or `strict-office-rendering`;
- `browser-check`: `failed` for an attempted browser check or `not-required` for a measured/requested suitability condition;
- `browser-step`: `setup`, `selection`, `navigation`, `compatibility`, `api-check`, `transfer`, or `user-requirement`, consistent with the reason;
- `fallback-evidence`: the concrete browser/bridge failure result or user requirement. For Codex setup, selection, or navigation fallback, keep the existing string field and include both labeled results, for example `iab: <step and error>; chrome: <unavailable result, step and error>`; and
- `iab-evidence` and `chrome-evidence`: required as separate `<step>: <concrete result>` fields for every `browser-check: failed` decision. A missing control in the initial tool list, `not visible`, or `not attempted` is rejected as evidence. These structured fields prevent a free-form summary from silently skipping external Chrome; and
- `preview-url`: the resolved HTTPS URL, defaulting to the official preview application.

The initializer rejects missing, contradictory, or vague routing evidence before it creates the output directory. Never weaken, patch around, or fabricate this receipt to make initialization proceed.
