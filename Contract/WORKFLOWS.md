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
compatibleVersions?: string[]
```

`create`, `describe`, `respond`, `retry` and `amend` are synchronous state transformations; they must not dispatch native tasks or mutate Infra. The Engine may record explicit revision metadata such as timestamps. `run` performs work and calls `checkpoint(state)` before dispatching consequential operations and after their results are identified. Return `waiting` for a human clarification checkpoint. Throw on a real failure; never manufacture a completed result. Only a successful `completed` return publishes artifacts.

The runtime is trusted, installed Node code, not a sandbox for arbitrary third-party modules. It may use Node built-ins and its own dependencies, but must not read or mutate Infra databases, import Infra internals, change process-wide configuration or rely on the current working directory. Use `context.client.invoke` for all Infra capabilities. Generate temporary domain files in an Engine-owned temporary directory and remove them in `finally`; transient local paths are not durable workflow state.

## API

| Command | Input | Result |
| --- | --- | --- |
| `workflow.start` | `engineId`, `input`, `clientRequestId` | Durable job ID and public projection. Same request ID and input return the original job. |
| `workflow.list` | Optional `engineId` | Up to 100 latest caller-owned jobs; unreadable persisted records are reported separately in `errors` to the user. |
| `workflow.get` | `id`, optional non-negative integer `ifRevision` | Status, revision, Engine-defined public summary and approved final-file manifest; unchanged revisions return only an identity/revision tuple. |
| `workflow.respond` | `id`, `expectedRevision`, `answer`, `clientRequestId` | Applies an answer only to the current waiting checkpoint and resumes execution. |
| `workflow.resume` | `id`, `expectedRevision`, `clientRequestId` | Explicitly resumes a failed or fully paused job using its saved state. |
| `workflow.pause` | `id` | Pauses a supporting Engine, stops only its owned native tasks and preserves its checkpoint. |
| `workflow.amend` | `id`, `expectedRevision`, `update`, `clientRequestId` | Applies an Engine-validated revision to a fully paused job without launching it. |
| `workflow.cancel` | `id` | Cancels this job and invokes its exact-task cleanup. |
| `workflow.file` | `id`, `name` | One manifest-listed final file with content, encoding, MIME type, byte length and SHA-256. |

All are available through `ContractClient.invoke` and the existing CLI. `get`, `list` and `file` are read operations; the rest are writes. Schemas and native CLI spellings are generated from `Infra/src/shared/workflow-schema.ts`.

Example:

```sh
node Infra/src/cli/aexus workflow start --engine-id deep-research --input '{"topic":"Research question"}' --client-request-id request-001 --json
node Infra/src/cli/aexus workflow get WORKFLOW_ID --json
node Infra/src/cli/aexus workflow respond WORKFLOW_ID --expected-revision 2 --answer '{"values":{}}' --client-request-id answer-001 --json
node Infra/src/cli/aexus workflow pause WORKFLOW_ID --json
node Infra/src/cli/aexus workflow amend WORKFLOW_ID --expected-revision 8 --update '{"note":"Narrow the research question"}' --client-request-id revision-001 --json
node Infra/src/cli/aexus workflow resume WORKFLOW_ID --expected-revision 9 --client-request-id resume-001 --json
node Infra/src/cli/aexus workflow file WORKFLOW_ID --name research-report.html --json
```

Preserve a request ID while retrying an uncertain transport response. A different input with the same ID is rejected. Answer/retry requests also use an expected revision, so a delayed answer cannot accidentally confirm the next question round. Readers never advance the task or acknowledge native messages.

## Identity and restart behavior

Core persists the original authenticated principal and, for Agent callers, the credential identity used for authorization. Runtime calls are forwarded through the versioned Contract and the existing Core dispatcher as that original caller. They cannot substitute a user identity, request undeclared runtime capabilities, invoke recursive workflows or bypass native approvals. Credential revocation and role boundaries are rechecked on each delegated request.

State is stored separately from source under the configured Core data directory. The UI may close or switch layers while Core continues. Waiting, paused and terminal jobs remain idle on restart; running jobs resume from their checkpoints. A changed Engine version refuses continuation unless the installed runtime explicitly lists the stored version in `compatibleVersions`. Compatibility is an Engine-maintained, tested allowlist, not an inferred migration. An unreadable individual workflow is quarantined from execution and reported without overwriting its file or preventing other Core features from starting.

The Engine must reconcile a native task using its persisted request ID and actual receipt/transcript. A lost connection, accepted message, stopped process or stream end is not proof of task completion. Interrupted work may require explicit retry. Cancellation must compare the current native task ID before interrupting a worker, so unrelated tasks cannot be stopped.

## Pause and owner revisions

Owner mutations (`pause`, `amend`, `respond`, `resume`, `cancel`) are serialized per job. Read requests remain non-blocking. Pause persists the paused state before aborting the run; a separate non-aborted cleanup context allows the Engine to verify that only its own native tasks stopped. `controlPending: true` means cleanup is incomplete and changing/resuming the job is prohibited. Retry `workflow.pause` to finish cleanup. An unsupported Engine rejects pause without changing its state.

Revisions require a fully paused job, current revision and stable request ID. Repeating the same revision request is idempotent; a different payload under the same ID is rejected. An Engine must invalidate obsolete downstream results and preserve truthful provenance. Completed delivery cannot be revised or paused; start another job instead. Applying a revision never starts a model call. Resuming is a separate explicit operation.

## Final artifacts

`WorkflowArtifact` contains `name`, `description`, `mediaType`, `content` and optional `encoding: 'utf8' | 'base64'`. The default is UTF-8 text. Base64 is validated and decoded before writing; byte length and hashes always describe the real decoded file. `workflow.file` returns the corresponding encoding so both browser and CLI clients can decode consistently.

Current limits are 8 MiB of JSON input, 1–12 final files, at most 8 MiB per decoded file and 20 MiB total. Domain Engines should impose smaller task-appropriate limits before upload. Filenames use a bounded safe ASCII basename and must be unique.

Files are first written into a private staging directory and then atomically exposed as one final delivery. Only a completed job's manifest entries can be read; intermediate state, draft directories and arbitrary paths are never downloadable. Every read verifies the stored SHA-256. A pre-existing different final delivery is rejected rather than overwritten.

The final directory has only the artifacts selected by the Engine. Runtime journals and metadata are outside it. Each Engine is responsible for avoiding redundant exports and for verifying that every delivered file serves the user's task.

## Conditional status reads

The optional renderer-only `ContractClient.watchWorkflow(id,onChanged)` listens to the existing, presentation-scoped `workflow:changed` event, coalescing live progress without introducing a new business command or permitting Engine runtimes to subscribe to private data. The callback is only an invalidation hint: clients must call the authorized `workflow.get({id,ifRevision})` and retain revision ordering. Consumers must unsubscribe when leaving a job; a slower conditional poll remains necessary for reconnects, missed events and older Contract clients. The event carries only workflow identity, engine scope, status and revision, never Agent transcripts or raw task results. `ContractClient.invoke` and CLI commands retain their v1 signatures.

`workflow.get({id, ifRevision})` returns `{id, engineId, revision, unchanged: true}` when the current revision equals `ifRevision`. Otherwise it returns the normal `WorkflowView`. Omit `ifRevision` to always receive the full public view. `WorkflowRead` is the union of `WorkflowView` and `WorkflowUnchanged`; consumers must narrow with `unchanged` before reading `summary` or `files`.

Authentication, Engine ownership and parameter validation run before conditional responses. No material text, prompts, transcript or result cache is included in the unchanged tuple. Reading never increments the revision or starts model work. Clients retain the previous view on an unchanged response and guard against stale reads arriving after navigation.
