# Deep Research Workspace

Workspace owns research intake, history, navigation, execution controls **presentation**, source/report drillback, and user-local editing preferences. `../Page.tsx` is the thin Contract-aware composer; it does not replace the Workflow runtime.

| Area | Module |
| --- | --- |
| Start, controls, review and visible progress | `ResearchIntake.tsx`, `ResearchJobHeader.tsx`, `ResearchProgressBand.tsx`, `ResearchExecutionControls.tsx` |
| History, revision-safe paging and saved view | `ResearchHistory.tsx`, `useResearchHistory.ts`, `viewPreference.ts` |
| Study tabs, inspector and linked navigation | `ResearchTabs.tsx`, `ResearchTaskInspector.tsx`, `useResearchLocation.ts` |
| Evidence-aware discoveries and comparison | `ResearchFindings.tsx`, `ResearchComparisonPanel.tsx`, `citationLocator.ts` |
| Live state and editor preferences | `useWorkflowUpdates.ts`, `useResearchStudio.ts` |
| Shared visual primitives | `Icon.tsx`, `status.ts`, `style.css` |

Boundaries:
- Workflow state and authorization remain with Host/Contract. Use `watchWorkflow` as an invalidation hint and `get(ifRevision)` as truth, plus polling fallback. Activity previews cannot indicate task completion.
- Graph owns DAG/knowledge canvas, Retrieval owns source browser/material parsing, Knowledge owns semantic projection, Deliverables owns charts/report output. Workspace only wires public projections and callbacks; no duplicate domain logic.
- Cite only concrete known excerpts/locators. Inline Markdown links fall back to source navigation when exact claim-to-locator matching is uncertain.
- Browser-local boards, matrices and view preferences are **per study** and not cross-device persistent. The old storage keys remain compatible.
- User-selected background PDF/DOCX files are context only; their contents are not independently verified evidence.
- Existing reading position, keyboard interactions and responsive layouts must survive changes.

Verification from repository root:

```sh
./node_modules/.bin/tsc --noEmit
node --test Engine/deep-research/workspace/test/*.test.mjs
node Engine/deep-research/workspace/test/ui.mjs
node Engine/deep-research/workspace/test/history-ui.mjs
node Engine/deep-research/workspace/test/intake-ui.mjs
node Engine/deep-research/workspace/test/findings-ui.mjs
node Engine/deep-research/workspace/test/citation-browser.mjs
node Engine/deep-research/workspace/test/knowledge-page-ui.mjs
node Engine/deep-research/workspace/test/studio-ui.mjs
node Engine/deep-research/workspace/test/progress-ui.mjs
node Engine/deep-research/workspace/test/execution-ui.mjs
node Engine/deep-research/test/ui.mjs
```

Browser fixtures run in headless system Chrome with deterministic data and without live Agent dispatch. The root browser suite also tests Graph internals; Graph-owned regressions must be resolved by its owner through `share_chat/`.
