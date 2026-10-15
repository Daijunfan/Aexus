# CloudHosts × Aexus integration progress — 2026-10-13

> 本文件保留较早的逐 API 重写迁移记录。当前视图已经使用独立的原版 Aexus Core；新的工作状态以 [Agent / Role Board 拆分验收](AGENT_ROLE_SPLIT.md) 为准。

## Source of truth

- Product and runtime owner: **CloudHosts 2.9.20**, one Core and its existing host/SSH/File Station/native Agent stores.
- Read-only migration reference: **Aexus 0.66.2**, not linked as a runtime dependency.
- Aexus non-Guardian command inventory: **323 entries**, enumerated in [AEXUS_MIGRATION_LEDGER.json](AEXUS_MIGRATION_LEDGER.json). At the last sync **53 mapped-partial**, **270 pending**, **0 demonstrated full behavioral parity**. Treat mapped-partial as semantic overlap only. No Guardian-specific UI, API, polling or process should be imported.
- Single machine-readable CloudHosts Agent catalog: `src/api-contracts.cjs` currently advertises **29 strict Agent-callable contracts**, alongside operator-only/legacy declarations. `src/agent-api.cjs` verifies the actual authenticated Agent context; `src/collaboration-mcp.cjs` exposes the generic tools `cloud_docs`, `cloud_api`, `cloud_reply` and compatibility facades.
- Preserve native engine history. Codex uses its bound thread; Claude/Pi/Cline companions currently use **separate** persistent collaboration sessions. No implicit native history merging has occurred.

## Implemented and tested this iteration

1. **Company management policy** — new `src/company-policy.cjs` has action-specific, role-and-scope decisions for read, delegate, schedule, configure and team membership changes. `src/company.cjs` and `src/agent-api.cjs` enforce these decisions; ordinary shared-team discussion membership is distinct from management permission. Agent identity returns allowed target IDs per action. Management grants change when team membership or role changes, and plan dispatch rechecks original creator authority.
2. **Shared native Task submission contract** — new `src/agent-task-service.cjs` is called from Company, group Messages and Plan dispatch. It checks exact native identity, engine, source, host/workspace, authorization before and after asynchronous task preparation, then requires an actual turn receipt. Exact-turn completion and output helpers are shared. Durable source-specific queues, cancellation and publication remain separately implemented; a unified durable Run store has **not** been completed.
3. **Plan saved views** — new `src/plan-views.cjs` supports Aexus layout IDs table, board, timeline, calendar, plan, list, gallery, chart, feed, form. Saved views persist independently with owner visibility, strict metadata and optimistic revisions. `plan.schema`, `plan.views`, `plan.view-create`, `plan.view-update`, `plan.view-delete` are typed Agent/Core operations; the native view editor saves, selects, filters, updates and deletes them. A view never creates or replays a scheduled job.
4. **Plan data-query parity subset** — `plan.query` now returns scoped status/counts, true run status, Agent/Team metadata, tag facets, and filter/sort/pagination. Plan jobs persist distinct tags and an urgent priority. The Agent query applies its visibility rule **before** aggregations so cross-agent private data is not returned via facets.
5. **Versioned reference and migration accounting** — `scripts/sync-api-docs.cjs` and `scripts/sync-aexus-ledger.cjs` regenerate the document and ledger from the real registered Core contracts; hash/version tests reject stale copies. The packaged Core and docs come from CloudHosts, with no runtime dependency on Aexus.
6. **Truthful native-session UI** — Plan now explains that a Codex thread and Claude/Pi/Cline companion branch are separate. No user session was silently forked or rewritten.

## Verified on isolated local data

- `npm run build` — passed, with build/content fingerprint.
- `npm test` — **188 / 188** Node tests passed (including Company role scope, saved views, Plan query, shared Task service, storage and CLI regressions).
- `sh tests/run-workspace-native-webkit.sh` — **50 / 50** offscreen WKWebView checks passed, including Plan saved-view create/update/delete and the Messages/Company journey.
- `python3 build.py` — staged macOS bundle at `artifacts/云主机.app`, `codesign --verify --deep --strict` passed. Embedded API docs/contract files have exactly the same SHA-256 as the source. Running the **packaged Node/Core** headlessly in an isolated data home passed the `api.info` / `plan.schema` / Plan view round-trip smoke test.
- No real SSH jobs, model requests, production data migrations, application installation or background changes to another Toolbox tool were attempted as part of this iteration.

## Outstanding work — do not describe as done

- **Complete Company**: rich relationship canvas, scope/grant persistence and admin workflows across all Aexus commands, plus end-to-end tests.
- **Complete Messages**: direct chats, replies/mentions, channels/articles/collectors, forwarding, search, reactions/bookmarks/categories, membership and publication parity; enforce group permissions independently of Company.
- **Complete Plan scheduler**: Aexus full recurrence/event triggers, work window/deadline limits, cancellation/resume, revision conflict and true ten-layout presentation, including chart presentation options.
- **Unify durable Task/Run lifecycle**: replace source-specific engine execution loops while retaining their domain delivery rules; approval, interrupt, recovery, result notification and parent-task resumption must share one reliable transactional service.
- **Native sessions**: optional same-session collaboration for engines where the underlying protocols truly permit exact attach; make independent branches explicit when not possible, and verify Claude/Pi/Cline with account-backed sessions.
- **Plugins and files**: verified MiniNotion/Margin Reader live connectors with no duplicate writer, asset/resource ownership, scoped Agent documentation and full plugin lifecycle; additional API schemas/examples and executable docs tests.
- **Multi-client**: Web, CLI and native UI coverage beyond present surfaces, plus live multi-host SSH and Windows end-to-end interoperability.
- **Guardian exclusion**: continue auditing the final registered commands, backend processes, packaged files and startup path while preserving authentication and approvals.

Follow the migration ledger for every remaining Aexus command. Do not mark any command fully migrated until permissions, storage, UI, docs, execution, compatibility and tests have real parity.
