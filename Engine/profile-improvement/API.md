# Profile Improvement API

Engine ID: `profile-improvement`. Contract: `1.0.0`. All requests use `ContractClient` or the public CLI. No resume-specific endpoint was added to Infra.

## Start

```json
{
  "engineId": "profile-improvement",
  "clientRequestId": "one-stable-user-submission-id",
  "input": {
    "resume": {"name": "resume.docx", "data": "BASE64_DOCX"},
    "targets": "后端开发；测试开发",
    "jobDescription": "Optional user-provided requirements",
    "engine": "pi",
    "model": "optional-configured-model-id"
  }
}
```

Call `workflow.start` with this object. `resume` and `targets` are required; the rest of input is optional. Source DOCX is at most 4 MiB; base64 stays below the public workflow's 8 MiB input bound. One to three targets are separated by semicolons/newlines. Up to 12,000 JD characters. Unknown fields reject. Do not embed an API key or system command in input.

`workflow.start` acceptance is not completion. `workflow.get {id}` returns status, revision, the current phase and public task/worker progress. File manifests appear only at `completed`. `workflow.list {engineId}` returns `{jobs}` for the caller's workflow scope.

## Continue / stop

`workflow.resume {id,expectedRevision,clientRequestId}` resumes a failed/interrupted workflow. Reuse the same request key if transport outcome is unknown. Reload current revision on conflict. Completed tasks and uncertain accepted sends keep their original identities. Employee creation is reconciled using its public role/profession marker and immutable employee ID; display-name changes are allowed, while deleted/replaced/elevated identities are rejected. Successful JSON-repair results are reused. Invalid model results can be explicitly retried under a new internal attempt; this does not duplicate unrelated work.

`workflow.cancel {id}` stops this workflow. Engine cancellation interrupts only its recorded employee/current message pair; it does not terminate another task that happens to be on that employee. A lost send receipt can only be recovered from the exact public user message. Every pending employee is checked even if another cancellation check fails; unconfirmed failures stay visible. Closing the UI or stopping a CLI watcher does not cancel Core work.

`workflow.respond` is not used: this Engine has no clarification questionnaire. Start a new workflow for a different resume, target or JD.

## Final Word

A final file contains `name`, `mediaType`, `description`, decoded `bytes`, `sha256` and `encoding:"base64"`. Filenames are stable ASCII basenames such as `resume-01-backend-engineer.docx`; the user-provided target name is retained in description and the UI. Files are never a generic new template or an HTML file with a DOCX extension.

Call `workflow.file {id,name}`. Require base64 encoding, decode and compare byte length plus SHA-256 to the manifest before saving. Browser and CLI use the same `readWord()` implementation. CLI downloads use exclusive file creation and reject collisions; only final DOCX files are written into the selected output directory.

Public `summary.variants` provides target, before/after text, source evidence IDs, human-readable reason, reviewer result, template verification and same-renderer page/line checks. It contains no raw resume archive or private model thinking. Source resume and recoverable analysis remain in Infra's private workflow storage and employee histories; no zero-retention claim is made.

## Required capabilities

| Purpose | Contract operations |
| --- | --- |
| Durable job and final artifacts | workflow.start/list/get/resume/cancel/file |
| Engine readiness, no inference | engine.check |
| Dedicated team/employee identities | group.list/add, card.create, session.list/status |
| Native employee work and exact result | session.send/transcript |
| Guarded cancellation | session.interrupt with expectedMessageId |
| Explicit user navigation to employee | view.open, view.layer |

UI and CLI never call `engine.configure` or install model programs; users manage their own Infra setup. Test setup uses public administrator CLI to configure disposable fixture environments only. Employees are ordinary `Employee` roles and receive no elevated Company or group role.

## Errors and validation

- `RESUME_FORMAT`, `DOCX_INVALID`, `DOCX_UNSAFE`, `DOCX_TRACKED_CHANGES`: source format unsupported or cannot be safely preserved; correct the original DOCX.
- `ENGINE_NOT_READY`, `INITIALIZATION_FAILED`: fix the selected engine in Infra, then continue without swapping the model provider.
- `LAYOUT_TOOLS_MISSING`: install LibreOffice/Poppler on the execution host before work starts.
- `PATCH_FACT`, `PATCH_EVIDENCE`, `PATCH_PROTECTED`: model proposal violates source facts/identity; one structured repair attempt is allowed.
- `QUALITY_GATE_FAILED`: reviewer or layout check did not pass after three rounds; no intermediate Word is released.
- `AGENT_TIMEOUT`: exact task reference is preserved for inspection/continuation; it is not automatically resubmitted with another identity.
- Contract authorization, transport and revision errors remain visible. No shell fallback, operator impersonation, direct database read or hidden provider request is used.
