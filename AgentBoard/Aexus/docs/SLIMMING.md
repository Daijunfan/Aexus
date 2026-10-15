# Core consolidation and read-path performance

## Compatibility boundary

The public 275-command API, CLI spellings, role policies, employee/Team/workspace IDs,
engine-native identities and canonical history formats are retained. No production
migration is required. Installation and deployment are separate maintainer operations.

## Module ownership

- `shared/api-registry.ts`, its domain schemas and `shared/cli-contract.ts` own command
  declarations. `scripts/sync-manager-docs.mjs` compiles the portable input table for
  120 conventional CLI routes. Special streaming, file and confirmation flows remain
  explicit. CLI metadata is excluded from public API descriptions.
- `main/server.ts` authenticates and performs cross-resource preflight. Engine and
  group commands delegate to `main/commands/engine.ts` and `main/commands/chat.ts`.
  Moving a handler does not bypass authorization, initialization or reply validation.
- `main/engines/state.ts` supplies common live-state defaults. Adapters retain their
  protocol-specific capabilities and emit through `EngineHost` callbacks, not Core
  registry Maps. `engines/session-support.ts` and `plugins/workspace-provision.ts`
  are dependency leaves; adapters cannot import the session runtime as a value.
- `main/delivery.ts` owns recipient dispatch and monotonic delivery transitions.
  Group and channel modules still own membership, publication, work/awareness,
  acknowledgments, allowed attachments and persistence. Group fan-out remains three
  concurrent preparations; channel delivery remains sequential.
- `main/single-flight.ts` coalesces concurrent identical operations. It is not a retry
  policy: private-send and forwarding records still decide accepted, failed,
  interrupted and uncertain outcomes, and never infer successful execution from
  a missing response.
- `components/useCatalog.ts` owns list loading and subscriptions for inbox, groups
  and channels. `shared/message-drafts.ts` and `useMessenger.prepareSend` share
  request identity and the durable pre-send check. They do not merge private and
  shared histories or make group reading acknowledge a private reply.

## Message read model

`messenger.search` and `messenger.gallery` use a lazy, Core-owned worker thread.
`message-index-client.ts` sends public source projections and query scopes;
`message-index-worker.ts` owns the SQLite connection. The worker cannot invoke an
engine, post messages, issue credentials or decide authorization.

The disposable index is `APP_HOME/cache/message-index.sqlite`, including its WAL/SHM
companions. It contains public message text, author references, attachment metadata
and image cursors. It excludes thinking/tool blocks, image bytes and external news
bodies. News search and expiry continue to use the canonical channel store.

Source revisions are actual history file identities or weak reducer revision tokens.
Live tokens include a process epoch. Repeated searches reuse the projection across
Core restarts; changed histories update only changed indexed rows. Public-body hashes
avoid rewriting text when only recipient receipts changed. Current labels and personal
preferences are applied separately. Source deletion invalidates its derived entries.

FTS5 trigram lookup narrows longer queries, followed by exact literal substring
matching. Short Unicode strings and embedded NUL use an exact fallback. Ordering
retains the existing timestamp and locale comparison rules. Gallery pagination
preserves source/message/path cursors, initial boundaries, hidden-anchor behavior,
album ordering and exact page sizes. No task or read receipt is produced by a query.

Scopes and hidden/saved/pinned flags are set per query. Core rechecks authorization
and personal visibility after worker IO; an in-flight hide cannot return a stale
visible result. Concurrent preference changes get one refreshed query, then an
explicit retry error rather than an unbounded retry loop. Worker shutdown drains
accepted queries and rejects new queries while closing.

The index is derived, mode 0600, and never follows a symlink. Only its own corrupt
or obsolete cache is rebuilt; corrupt canonical source histories still fail explicitly.
A cache rebuild makes the first search slower and consumes disk space. Heavy indexing
runs off the main event loop; this is a responsiveness tradeoff, not a claim that cold
indexing is free. The worker starts on demand, not during application initialization.

The desktop and standalone server builds both include `out/main/message-index-worker.js`.
A server package must ship it alongside its daemon. The existing Node SQLite dependency
is used; no new package or external search service is installed.

## Event and presentation contracts

`store:changed` retains its existing payload and adds `changes` with base/current
revision, changed field names, employee IDs, and authority/member/inbox categories.
Web clients receive the revision and these hints. Legacy events without hints retain
conservative refresh behavior.

Authorization-affecting changes revalidate schedules, delegated work and management
activity. Position, appearance and exact-reply reading updates do not trigger that
work. Unknown future employee execution fields default to authority invalidation.
Credentials still revoke through the existing explicit paths.

The top-level renderer fetches execution state only for execution events or authority
changes. Schedule, draft and channel notifications are handled by their own subscribers.
Plan/inbox/group lists ignore irrelevant canvas-only edits, while names and membership
remain shared. The UI remains CLI-driven; event hints do not authorize a mutation.

Message rows retain stable measurement callbacks across receipt updates. Action gutters
keep the same maximum bubble width as headers, preventing a width/height feedback loop.
Unmeasured off-screen action bars cannot widen a resized transcript. Active menus and
focused controls retain their ownership. Escape belongs to the active dialog/menu and
cannot also close its underlying employee conversation.

Inline media retains the last decoded position before releasing its preview. Empty-source
teardown events cannot overwrite it with zero; a generation check releases late preview
grants after scrolling, unmounting or logout without reattaching a revoked source. These
lifecycle checks share the existing player and permission APIs.

The query worker resolves runtime paths through `shared/core-paths.ts`, without loading
command metadata or Markdown dependencies. `protocol.ts` keeps its original exports.
An isolated Electron/ASAR test loads the real worker with no external package dependency
and verifies query, shutdown, persistence and reopening.

## Verification

Run after building the desktop and worker entries:

```sh
npm run typecheck
npm run build
npm run test:slimming
npm test
npm run test:release-ui
npm run test:release-engines
node test/message-index-package-test.mjs
```

The added tests cover literal query parity, SQLite rebuilds, worker scopes and lifecycle,
concurrent hiding/role revocation, receipt ordering, shared draft identity, unknown future
execution fields, and real authenticated Web/CLI event routing. UI regressions exercise
actual controls and source visibility; they do not label a queued request as completed.

Measurements and before/after source snapshots for this work are in
`artifacts/slimming-final/`. Benchmarks include cold indexing, warmed search/gallery,
main-event-loop heartbeat delay, retained heap, process RSS and derivative disk size.
They are macOS measurements, not native Windows/Linux certification or whole-app FPS.
