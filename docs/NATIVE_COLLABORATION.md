# CloudHosts native collaboration

Company, Messages and Plan share one persistent CloudHosts Agent ID per member. The Agent's original host/work directory and interactive terminal identity remain unchanged.

## Engine transport

| Engine | Collaboration execution | Exact identity | Existing interactive session |
| --- | --- | --- | --- |
| Codex | app-server JSON-RPC | Existing Codex thread | Original TUI attached |
| Claude Code | Headless stream-json | Separate stable Claude resume UUID | Unmodified |
| Pi | Native JSON RPC and scoped extension | Separate stable Pi session ID | Unmodified |
| Cline | Native ACP | Separate stable Cline ACP session ID | Unmodified |

Claude/Pi/Cline companions require their engine CLI on the controller-local host. Remote PTY operation continues independently. Cline was not installed on the development Mac at verification time, so its structured adapter was verified with a deterministic ACP fixture. User-account-backed live model execution for the non-Codex engines is a separate acceptance check.

## Runtime

Durable recipient claims exist in the SQLite Messages ledger; Company delegations are tracked in the same database; Plan keeps its native run journal. All three now use `src/agent-task-service.cjs` for one native submission contract: stable Agent, engine, host, work directory and exact session; authorization is rechecked after asynchronous preparation. The same workspace-level occupancy reservation prevents overlapping automated turns from Company, Messages and Plan. A restart never silently repeats an uncertain model submission. If the original exact turn ID already has a durable terminal journal event, Core reconciles its receipt and public result without a new model action; otherwise the delivery remains review-only. Pi provider errors, cancellations and exhausted automatic retries are saved as failures, not false successful replies.

New groups automatically publish the final native answer of an exactly assigned successful group turn. Groups made before this option existed retain private-answer behavior until the owner explicitly enables Auto-publish. A native `cloud_group_reply` tool call still takes precedence and is never duplicated by the completion handler. Group management allows an atomic Owner handoff while removing the previous Owner.

The three primary Agent tools are `cloud_docs` (identity and API/document discovery), `cloud_api` (typed, authorized business calls) and `cloud_reply` (a shared-task-scoped publication). Four earlier narrow tools remain as compatibility facades over the same Core. Team management uses action+scope policies; ordinary peers sharing a Team can join an authorized group without acquiring manager authority. Core validates the exact assigned turn, agent, group and role. Pi/Cline permissions are surfaced as explicit operator approvals; Codex retains app-server approvals. Claude's noninteractive Ask mode rejects unapproved ordinary tool writes, while explicitly allowed collaboration tools may run. Full mode uses the user's explicitly selected full permission mode.

## Attachments and live updates

Messages uploads use the existing File Station. Core snapshots each selected attachment's Station ID, size and SHA-256, transfers a unique verified copy into each recipient's original work directory, then includes only its verified host/path in that recipient's group context. Changed or missing files fail before model submission. Up to eight files per message, 50 MiB each. Fileboard and its file operations are not changed.

Messages history is paged from its SQLite ledger, searchable by message text, author and attachment filename, and remains readable after group archiving. The interface preserves previously loaded pages through live updates and detects gaps created by large message bursts.

The authenticated local SSE feed emits entity IDs and lifecycle hints, without message text or file contents. Messages, Company and Plan refresh while visible, synchronize when returning to foreground and retain polling fallback.

## Tests

Mock native Claude stream-json, Pi JSON RPC and Cline ACP tests cover exact identities, tool permissions, turn completion and no PTY injection. Offline installed Pi 0.87.1 was also probed with an exact session ID using get_state, without a model request. Integration tests cover group receipt recovery, attachment byte/hash checks, HTTP event authorization and native WebKit UI. On 2026-10-13 the local isolated suite passed 188/188 tests and the hidden-window WebKit user journey passed 50/50 checks. Neither substitutes for live charged model, remote SSH or multi-host acceptance testing.

## Plan query and saved views

Ten built-in Aexus layout identifiers, owner-restricted saved views, optimistic view revisions and scoped Plan query facets are available. `plan.query` filters by Team, Agent (`self`), channel, state, priority, tags, and search, with sort/pagination. Tags and urgent priority are persisted on actual Plan jobs, so saved filters use real records. A saved view cannot edit a native run or schedule. More advanced Aexus recurrence triggers, chart rendering choices and all 323 business command parity remain outstanding; inspect `AEXUS_MIGRATION_LEDGER.json` for per-command dispositions.
