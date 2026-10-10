# Durable Engine workflows

`workflow.*` is the shared execution substrate for an installed Engine. It does not contain research, resume-editing or other domain rules. The Engine owns its input, clarification questions, checkpoints, review rules and final artifact content.

## Manifest and runtime

Add optional `"runtime": "runtime.mjs"` to `engine.json`. Page and CLI entrypoints remain `Page.tsx` and `cli.mjs`. Runtime discovery only checks the manifest and file existence; module execution begins when the caller explicitly starts or resumes a workflow.

A runtime exports the methods described in `Contract/workflow.ts`:

```ts
create(input): State
describe(state): PublicSummary
respond(state, answer): State
run(state, {id, client, signal, checkpoint}): Promise<{
  status: 'waiting' | 'completed',
  state: State,
  artifacts?: WorkflowArtifact[]
}>
retry?(state): State
cancel?(state, context): Promise<void>
pause?(state, context): Promise<void>
amend?(state, update): State
prepare?(input, {signal}): Promise<PreparedInput>
fork?(completedParentState, input): FreshState
export?(completedState, format, {signal}): Promise<WorkflowArtifact>
compatibleVersions?: string[]
```

`create`, `describe`, `respond`, `retry` and `amend` are synchronous state transformations; they must not dispatch native tasks or mutate Infra. The Engine may record explicit revision metadata such as timestamps. `run` performs work and calls `checkpoint(state)` before dispatching consequential operations and after their results are identified. Return `waiting` for a human clarification checkpoint. Throw on a real failure; never manufacture a completed result. Only a successful `completed` return publishes artifacts.

The runtime is trusted, installed Node code, not a sandbox for arbitrary third-party modules. It may use Node built-ins and its own dependencies, but must not read or mutate Infra databases, import Infra internals, change process-wide configuration or rely on the current working directory. Use `context.client.invoke` for all Infra capabilities. Generate temporary domain files in an Engine-owned temporary directory and remove them in `finally`; transient local paths are not durable workflow state.

## API

| Command | Input | Result |
| --- | --- | --- |
| `workflow.prepare` | `engineId`, `input` | Normalize explicitly supplied document bytes through an Engine hook. No job, employee or model call. |
| `workflow.fork` | `id`, `expectedRevision`, `input`, `clientRequestId` | Create a distinct follow-up from a completed caller-owned parent. Core stamps parent identity/revision; original is unchanged. |
| `workflow.export` | `id`, `format` | Render a supported alternate final artifact from an approved completed job, returning verified bytes, encoding and SHA-256 without mutating its original delivery. |
| `workflow.start` | `engineId`, `input`, `clientRequestId` | Durable job ID and public projection. Same request ID and input return the original job. |
| `workflow.list` | Optional `engineId`, `offset` (≥0), `limit` (1–100), `brief` (boolean) | Paginated caller-owned jobs, `total` and `hasMore`. The default preserves the complete public summaries; `brief:true` returns only bounded `title` / `topic` / `phase` strings plus workflow identity, status and revision, omitting file manifests and large source/graph data. Read one selected job with `workflow.get` for details. Unreadable records are reported separately in `errors`. |
| `workflow.get` | `id`, optional non-negative integer `ifRevision` | Status, revision, Engine-defined public summary and approved final-file manifest; unchanged revisions return only an identity/revision tuple. |
| `workflow.events` | `id`, optional `afterRevision` and `limit` (1–100) | Owner-scoped, bounded history of persisted status, phase, progress and source/step counts. Omit the cursor for the latest entries; supply `afterRevision` to read oldest retained entries after that revision first and advance the cursor without skipping a page. Never contains task prompts, full sources or native transcripts. Historical workflows return an empty array until their next checkpoint. |
| `workflow.respond` | `id`, `expectedRevision`, `answer`, `clientRequestId` | Applies an answer only to the current waiting checkpoint and resumes execution. |
| `workflow.resume` | `id`, `expectedRevision`, `clientRequestId` | Explicitly resumes a failed or fully paused job using its saved state. |
| `workflow.pause` | `id` | Pauses a supporting Engine, stops only its owned native tasks and preserves its checkpoint. |
| `workflow.amend` | `id`, `expectedRevision`, `update`, `clientRequestId` | Applies an Engine-validated revision to a fully paused job without launching it. |
| `workflow.cancel` | `id` | Stops a workflow and reconciles owned native work before confirming cancellation; retired Deep Research tasks use Infra-only receipt matching. Uncertain cleanup stays `controlPending: true` for explicit retry across Engines and restarts. |
| `workflow.delete` | `id` | Deep Research only: stop and confirm owned Agent turns, then archive task state/delivery to `workflow-deleted/<id>` and remove it from the active list. Idempotent and owner-/Engine-scoped; unrelated Agent identities and workspaces stay intact. |
| `workflow.file` | `id`, `name` | One manifest-listed final file with content, encoding, MIME type, byte length and SHA-256. |

All are available through `ContractClient.invoke` and the existing CLI. `get`, `list`, `file`, `prepare` and `export` are read/data operations; the rest are writes. Data transforms retain existing user-workflow authorization; a read effect does not make them public or grant Agent access. Schemas and native CLI spellings are generated from `Infra/src/shared/workflow-schema.ts`.

Example:

```sh
node Infra/src/cli/aexus workflow list --engine-id deep-research --json
node Infra/src/cli/aexus workflow get WORKFLOW_ID --json
node Infra/src/cli/aexus workflow cancel WORKFLOW_ID --json
node Infra/src/cli/aexus workflow delete WORKFLOW_ID --json
```

Preserve a request ID while retrying an uncertain transport response. A different input with the same ID is rejected. Answer/retry requests also use an expected revision, so a delayed answer cannot accidentally confirm the next question round. Readers never advance the task or acknowledge native messages.

## Identity and restart behavior

Core persists the original authenticated principal and, for Agent callers, the credential identity used for authorization. Runtime calls are forwarded through the versioned Contract and the existing Core dispatcher as that original caller. They cannot substitute a user identity, request undeclared runtime capabilities, invoke recursive workflows or bypass native approvals. Credential revocation and role boundaries are rechecked on each delegated request.

Deep Research 2.x runs an evidence-driven, dynamically planned DAG through the current runtime. Running current-version jobs resume from their persisted checkpoints and reconcile accepted native receipts; waiting and paused jobs remain idle. Retired 1.x records, or records whose research runtime is no longer installed, can still be read, stopped and archived through Infra. A running retired record is stopped on restart and its exact owned turns reconciled without restarting inference. Archived records remain under `workflow-deleted`; deletion is explicit.

State is stored separately from source under the configured Core data directory. The UI may close or switch layers while Core continues. Waiting, paused and terminal jobs remain idle on restart; running jobs resume from their checkpoints. A changed Engine version refuses continuation unless the installed runtime explicitly lists the stored version in `compatibleVersions`. Compatibility is an Engine-maintained, tested allowlist, not an inferred migration. An unreadable individual workflow is quarantined from execution and reported without overwriting its file or preventing other Core features from starting.

The Engine must reconcile a native task using its persisted request ID and actual receipt/transcript. A lost connection, accepted message, stopped process or stream end is not proof of task completion. Interrupted work may require explicit retry. Cancellation must compare the current native task ID before interrupting a worker, so unrelated tasks cannot be stopped. All Engines retain a retryable `controlPending` state until their cancellation cleanup confirms success; requesting Stop again resumes that reconciliation without restarting the workflow.

## Pause and owner revisions

Owner mutations (`pause`, `amend`, `respond`, `resume`, `cancel`, `delete`) are serialized per job. Read requests remain non-blocking. Pause persists the paused state before aborting the run; a separate non-aborted cleanup context allows the Engine to verify that only its own native tasks stopped. `controlPending: true` means cleanup is incomplete and changing/resuming the job is prohibited. Retry `workflow.pause` to finish cleanup. An unsupported Engine rejects pause without changing its state.

Revisions require a fully paused job, current revision and stable request ID. Repeating the same revision request is idempotent; a different payload under the same ID is rejected. An Engine must invalidate obsolete downstream results and preserve truthful provenance. Completed delivery cannot be revised or paused; start another job instead. Applying a revision never starts a model call. Resuming is a separate explicit operation.

## Final artifacts

`WorkflowArtifact` contains `name`, `description`, `mediaType`, `content` and optional `encoding: 'utf8' | 'base64'`. The default is UTF-8 text. Base64 is validated and decoded before writing; byte length and hashes always describe the real decoded file. `workflow.file` returns the corresponding encoding so both browser and CLI clients can decode consistently.

Current limits are 8 MiB of JSON input, 1–12 final files, at most 8 MiB per decoded file and 20 MiB total. Domain Engines should impose smaller task-appropriate limits before upload. Filenames use a bounded safe ASCII basename and must be unique.

Files are first written into a private staging directory and then atomically exposed as one final delivery. Only a completed job's manifest entries can be read; intermediate state, draft directories and arbitrary paths are never downloadable. Every read verifies the stored SHA-256. A pre-existing different final delivery is rejected rather than overwritten.

The final directory has only the artifacts selected by the Engine. Runtime journals and metadata are outside it. Each Engine is responsible for avoiding redundant exports and for verifying that every delivered file serves the user's task.

## Conditional status reads

The optional renderer-only `ContractClient.watchWorkflow(id,onChanged)` listens to the existing, presentation-scoped `workflow:changed` event, coalescing live progress without introducing a new business command or permitting Engine runtimes to subscribe to private data. The callback is only an invalidation hint: clients must call the authorized `workflow.get({id,ifRevision})` and retain revision ordering. Consumers must unsubscribe when leaving a job; a slower conditional poll remains necessary for reconnects, missed events and older Contract clients. The event carries only workflow identity, engine scope, status and revision, never Agent transcripts or raw task results. `ContractClient.invoke` and CLI commands retain their v1 signatures.

`workflow.get({id, ifRevision})` returns `{id, engineId, revision, unchanged: true}` when the current revision equals `ifRevision`. Otherwise it returns the normal `WorkflowView`. Omit `ifRevision` to always receive the full public view. `WorkflowRead` is the union of `WorkflowView` and `WorkflowUnchanged`; consumers must narrow with `unchanged` before reading `summary` or `files`. For archive menus, use `workflow.list({brief:true})` so source excerpts and the full DAG do not transit the network on each refresh. The small list projection does not replace `workflow.get` when opening a specific job.

Authentication, Engine ownership and parameter validation run before conditional responses. No material text, prompts, transcript or result cache is included in the unchanged tuple. Reading never increments the revision or starts model work. Clients retain the previous view on an unchanged response and guard against stale reads arriving after navigation.

## Explicit document preparation and alternate formats

An optional `prepare` hook receives only the caller-provided JSON input and an abort signal. It may decode and extract supplied bytes, but does not receive an Infra client, create a job, discover arbitrary local files, call models or change permissions. Browser clients send selected file bytes; a client-local path is never a Core path. Engine-specific parsing limits and provenance are part of its own documented contract. Preparation metadata supplied later by a caller remains untrusted input, not a cryptographic attestation or independently verified evidence.

An optional `export` hook receives a clone of a completed job's private state, the requested format and an abort signal. It renders an alternate representation from approved content without further research. The original status, revision, directory and file manifest remain unchanged. Core validates the returned artifact name, description, MIME, encoding and decoded size (1 byte–8 MiB), then returns a content hash. The result is not saved as a new authoritative report. Browser/CLI clients must decode binary output before checking size and SHA-256.

Core permits at most two simultaneous explicit data operations and aborts them after 30 seconds. Trusted Engine hooks must honor aborts and bound parsing work. These limits govern optional data hooks, not the Deep Research native employee lifecycle. The current Deep Research runtime does not implement `prepare` or alternate `export` hooks; its approved report is delivered through manifest-listed HTML, Markdown, CSV and JSON files.

## Immutable follow-ups

`workflow.fork` accepts only a completed, caller-owned parent at its current revision. It is serialized with parent controls. Core binds the request key to operation, parent ID/revision and exact input; retries return the original child, while a different payload under the same key is rejected. Core creates the new ID and stamps `parent:{id,revision,engineVersion}`. The Engine cannot forge this field through its input.

The optional synchronous `fork` hook receives a clone and produces fresh initial state, without Infra calls. Parent and child IDs survive restart. Each supporting Engine defines context reuse and initial approval behavior; creation cannot bypass native tool approval. Deep Research carries the prior completed report and cited URLs as historical background only: the child starts with no copied workers, tasks, verified sources or findings, and requires a new plan approval unless its input explicitly sets `autoApprove:true`.

```sh
node Infra/src/cli/aexus workflow prepare --engine-id SUPPORTING_ENGINE --input '{"files":[{"name":"brief.txt","encoding":"base64","content":"SGVsbG8="}]}' --json
node Infra/src/cli/aexus workflow export WORKFLOW_ID --format docx --json
node Infra/src/cli/aexus workflow fork WORKFLOW_ID --expected-revision 12 --input '{"topic":"Investigate new counterevidence"}' --client-request-id follow-up-001 --json
```
