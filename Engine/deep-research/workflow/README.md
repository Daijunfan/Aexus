# Research workflow

This directory owns research execution decisions. `../runtime.mjs` remains the stable Engine manifest entrypoint and only re-exports the hooks defined in `runtime.mjs` here.

- `runtime.mjs` runs the evidence-driven DAG, checkpoints before native dispatch, and preserves plans, task IDs, results, and failure/recovery behavior.
- `scheduler.mjs` is a pure, non-I/O reservation step. It selects ready nodes using the existing DAG semantics, prioritizes persisted native task ownership, and reserves distinct idle workers before concurrent execution. New tasks cannot hold a slot while waiting for an employee reserved by an earlier task.
- `source-budget.mjs` reserves distinct source URLs before parallel acquisition, shares same-URL admission, enforces scoped URLs, and does not persist transient reservations. Existing sources may still receive additional independently checked excerpts; budget-skipped candidates are counted in their actual node summary.
- `../retrieval/source-cache.mjs` supplies the shared bounded read cache (32 entries / 24 MiB / 90-second TTL). Workflow scopes it to one run and retains explicitly selected page responses from pre-reading through later proof checking; it does not maintain a second cache implementation. Errors/aborts never become verified evidence.
- `progress.mjs` exposes dependency-ready, waiting-for-dependencies, and real native-approval counts in `summary.progress.queue`; queue counters do not estimate time or imply that a worker is free.
- `replan.mjs` preserves distinct parallel search/review revision reasons within a bounded prompt size. Runtime replay rebuilds candidate excerpts from retained proofs when older native replies are unavailable.
- `verification-context.mjs` links validated findings to explicitly declared study dimensions and an unambiguous independently read content hash, final URL and fetch time. A repeated quote across conflicting page versions remains unresolved until provenance is explicit; the same selectors survive into report evidence and Knowledge projections.
- Native verification, synthesis, writing, and review prompts receive only their scoped evidence rather than the full URL catalog; discovery searches retain the catalog for deduplication. Ready descendants advance before unrelated root backlog, without preempting resumed native work.
- Once verification, synthesis or writing is recorded in canonical evidence/graph/report state, its redundant native task payload is pruned while status, receipts, and interrupted-task recovery remain intact. Search/scout raw replies and review verdicts remain available for evidence recovery and display.
- An independent review cannot use a recorded report author. Missing retained employees or reviewers produce explicit failures rather than fictitious progress.
- The stable `../agents.mjs` transport performs native session calls through the Contract. `../graph.mjs` currently owns persisted plan DAG validation and revision compatibility; UI canvas layout is separate.

Run deterministic regression tests from the repository root:

```sh
node --test Engine/deep-research/workflow/*.test.mjs Engine/deep-research/test/workflow.test.mjs Infra/src/test/deep-research-host-test.mjs
```

No production employee, billing account, or user workflow is needed for these tests. Future changes must preserve persisted request/receipt IDs and avoid assuming accepted sends are completed tasks.
