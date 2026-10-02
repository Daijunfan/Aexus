# Plan: shared scheduling database and Agent API

Plan is the third application view. Table, Board, Timeline, Calendar, Planner, List, Gallery, Chart, Feed and Form are projections of the existing Core `schedule.*` records, not another scheduler or another set of employee conversations. The desktop, browser, operator CLI and authenticated employee CLI use the same Core authorization. Creating or switching a database view never starts an engine.

## Discover before acting

```sh
agents plan schema --json
agents schedule schema --json
agents view list --json
agents view select plan --json
agents plan query --json
```

`plan.schema` returns layouts, record properties, status/priority enums, authorized target identities, the scheduler input schema and mutation API names. `schedule.schema.inputSchema` and `api.describe schedule.create` provide the complete JSON contract. All API responses use `{ok:true,data}` or `{ok:false,error}`; the CLI exits nonzero on failure. Model replies are not evidence a schedule was saved: read back its ID, target, rule, time zone and nextAt.

## Self-wake and controlled delegation

```sh
# Authenticated Agent: resume your own work in 30 minutes.
agents schedule create --name 'Continue investigation' --employee self --after-seconds 1800 --prompt 'Continue the investigation and report the result.' --client-request-id investigation-followup-v1 --json
# User, Manager or Governor: choose a target within your real control scope.
agents schedule create --name 'Sunday review' --employee EMPLOYEE_ID --time 17:00 --days 7 --timezone Asia/Shanghai --prompt 'Review the project and report blockers and next steps.' --priority high --tags '["review"]' --json
agents schedule preview JOB_ID --count 5 --json
```

Every employee can schedule itself. `self` resolves from the authenticated Agent ID, never a name, directory or caller-supplied identity. A user must provide an explicit employee ID. Managers and Governors can schedule others within the same control scope as their existing management APIs. Ordinary employees gain no authority over other employees. Non-global callers list/edit their own authored jobs; user/Governor visibility follows existing scheduler rules.

Self scheduling carries a Core-created, self-target-only delegation. This does not open direct `session.send` authority for Employees or let callers supply delegation fields. Roles and credential revocation are rechecked before a run starts and after asynchronous startup. A removed employee or revoked authority disables affected future work. Governor targets still require `action.viewId` / `--view` with a stable Company subview ID.
## When to run

Exactly one of `rule` and `afterSeconds` is required when creating a schedule. Relative time is resolved on the Core host at acceptance, not after the current task completes.

| Input | Meaning |
| --- | --- |
| `afterSeconds:1800` | One-time delay; integer 1–31,536,000 seconds |
| `rule:{kind:"once",at:"2026-12-06T17:00:00+08:00"}` | One absolute instant; UTC offset or Z is required |
| `rule:{kind:"interval",everySeconds:3600,anchor?:"ISO"}` | Repeating interval; default first run is one interval after acceptance |
| `rule:{kind:"weekly",time:"17:00",days:[7],timezone:"Asia/Shanghai"}` | Every Sunday at 17:00 in that IANA time zone; weekdays use 1=Monday through 7=Sunday |
| `rule:{kind:"weekly",time:"09:00",days:[1,2,3,4,5,6,7],timezone:"Asia/Shanghai"}` | Every day at 09:00 local wall time |
| `rule:{kind:"monthly",time:"17:00",day:"last",timezone:"Asia/Shanghai"}` | Last day of each month; numeric day 1–31 is also supported |

A numeric monthly day missing from a month is skipped, not clamped to a different date. Leap years are calendar-aware. DST gaps shift forward; repeated wall times use the earlier offset once. `schedule.preview` uses exactly the runtime calculation. A daily calendar rule differs from an interval of 86,400 seconds across DST.

```sh
agents schedule create --name 'Month-end report' --employee self --time 17:00 --month-day last --timezone Asia/Shanghai --prompt 'Write the month-end report.' --json
agents schedule create --name 'Check three times' --employee self --every-seconds 3600 --max-occurrences 3 --prompt 'Check the task status and report changes.' --json
```

`maxOccurrences` is optional (1–1,000,000 or null). It counts claimed scheduled occurrences, including missed/busy skips; manual runs do not consume it. `occurrences` is Core-owned. Once the limit is reached, nextAt becomes null; increase/clear the limit before resuming. Editing a job preserves its consumed count. `until` is an exclusive absolute end instant; when both limits exist, the earlier condition stops future scheduling.

`window:{start,end,timezone,days?}` limits scheduled execution to a local work window. It may cross midnight, belongs to its starting weekday and excludes its end. `window:null` clears it. `timeoutSeconds` defaults to 1800; `graceSeconds` defaults to 60. Both accept integers 1–86,400. A task is stopped when its permitted window, timeout or until ends. Invalid dates, zones, ranges and enabled schedules with no future occurrence fail before persistence.

## Create and edit safely

`action` contains `{type:"agent",employeeId,prompt,engine?,model?,effort?,thinking?,viewId?}`. Core infers/pins the employee's actual engine. Prompt is sent to the existing employee conversation. Notes are planning metadata and are not injected as a task. Optional model/effort/thinking overrides apply only to the scheduled run and original employee preferences are restored.
```json
{
  "cmd": "schedule.create",
  "args": {
    "clientRequestId": "sunday-review-v1",
    "spec": {
      "name": "Sunday review",
      "action": {"type":"agent","employeeId":"self","prompt":"Review the week and report next steps."},
      "rule": {"kind":"weekly","time":"17:00","days":[7],"timezone":"Asia/Shanghai"},
      "plan": {"priority":"high","tags":["review"],"notes":"Publish a concise outcome; keep full work in the employee conversation."},
      "maxOccurrences": 8,
      "enabled": true
    }
  }
}
```

`clientRequestId` / `--client-request-id` is an optional 1–160 character caller-owned creation key. Identical retries return the same saved job across service restarts. Reusing the key with different input fails rather than silently changing or creating work. An absent key keeps legacy create behavior. Do not retry a timed-out **manual run** blindly; inspect history first, as create idempotency does not apply to run requests.

Create returns the canonical ScheduledJob including `id,action,rule,nextAt,enabled,revision,occurrences,createdAt,updatedAt,plan?`. Read-only provenance and delegation are Core-owned. Use `schedule.update {id,patch,expectedRevision?}` to reject stale edits. The patch is top-level: action/rule/window/plan are complete replacement objects when supplied. Omit optional objects to retain them; null clears window/until/maxOccurrences. Active jobs must finish or have their active run cancelled before updating.

`plan` metadata has `priority:low|normal|high|urgent` (normal default), up to 20 unique `tags` (1–40 characters each), and `notes` (up to 16,000 characters). Job names are 1–160 characters; prompts are 1–64,000. Metadata cannot grant permissions or forge a run status. UI state is derived from the canonical job and latest retained run: scheduled, running, paused, completed, attention. Completed means the schedule has no future occurrence; it does not certify a business result.

```sh
agents schedule update JOB_ID --patch '{"plan":{"priority":"urgent","tags":["release"],"notes":"Wait for approval."}}' --expected-revision 1 --json
agents schedule pause JOB_ID --json
agents schedule resume JOB_ID --json
agents schedule run JOB_ID --json
agents schedule history JOB_ID --limit 30 --json
agents schedule cancel RUN_ID --json
```
Pausing stops future triggers, not active work. Resume starts from the next future occurrence without replaying paused work. Run explicitly launches now (potential model usage), ignores calendar/window but keeps timeout and authority, and does not consume the next occurrence. Cancel stops one run. Delete disables the job, waits for cancellation, then removes the job while keeping run history, employee data and working files.

## Database query and saved views

```sh
agents plan query --filter '{"employee":"self","priorities":["high","urgent"],"tags":["review"]}' --sort nextAt --direction asc --limit 50 --json
agents plan query --filter '{"team":"Engineering","states":["paused","attention"],"search":"report"}' --json
agents plan views --json
agents plan view-create --spec '{"name":"Review board","layout":"board","groupBy":"priority","filter":{"tags":["review"]},"sort":"nextAt","direction":"asc"}' --json
agents plan view-update VIEW_ID --patch '{"name":"Weekly reviews","layout":"table"}' --expected-revision 1 --json
agents view open plan --plan-view VIEW_ID --json
agents plan view-delete VIEW_ID --json
```

`plan.query {filter?,sort?,direction?,offset?,limit?}` returns `{rows,total,offset,hasMore,counts,facets}`. `facets.tags` contains the unique tags from all schedules visible to the caller, before presentation filters or pagination; it never bypasses scheduler authorization. Rows are canonical jobs plus `status`, an identity-only `employee` relation and `lastRun?`. Filters support search, employee ID/self, Team, states, priorities and tags (all requested tags must match). Multiple filters combine; no filter expands authorization. Sort supports nextAt/name/updatedAt/priority, asc/desc; tie-breaking uses stable job IDs. Offset is nonnegative, limit is 1–500 (default 100). Counts describe the complete filtered set; rows are paginated. No full transcripts are loaded for the database.

`plan.views` includes immutable Table, Board, Timeline, Calendar, Planner, List, Gallery, Chart, Feed and Form presets, plus saved views available to the caller. A saved view stores name, layout, groupBy (status/employee/priority), filter, sort, direction and optional display options. Saved views are caller-owned; the user can manage all, Agents manage only their own. Saving a self filter resolves it to the author's stable employee ID. Deleting a view never deletes schedules. Views share data, not permission grants; operators may still see different records from limited Agents using the same filtering criteria.

## Calendar

```sh
agents plan calendar --from '2026-10-01T00:00:00+08:00' --to '2026-11-01T00:00:00+08:00' --timezone Asia/Shanghai --filter '{"team":"Engineering"}' --json
```

The range is [from,to), with explicit UTC offsets, greater than zero and at most 93 days. `plan.calendar` returns `events[{id,jobId,name,employeeId,at,date,status,runId?}]`, timezone, normalized bounds and truncated. Future events are enabled occurrences; historical events are actual retained runs, never reconstructed claims that old work happened. `date` is the selected calendar zone's YYYY-MM-DD day.

Calendar output is bounded: default 500/max 2000 events, up to 100 future dates per schedule, and up to 1000 records from the scheduler's retained execution history. `truncated:true` warns about a limited high-frequency result. Finite quotas are projected from the saved schedule's remaining occurrences, including those before the requested range: scrolling to a later month never replenishes the quota. A result containing exactly all 100 remaining occurrences does not produce a false truncation warning. Narrow the filter or use schedule.preview for precise next dates. Paused tasks stay in Table/Board/List but do not imply future execution in Calendar.

## Persistence, safety and compatibility

Schedules remain in `schedules.json` v1 with additive optional fields. Existing jobs, identities, workspaces, model settings, native histories and permissions are not migrated to a second store. Saved presentation definitions live in `plan-views.json`; transient UI state remains client-specific. `schedule:changed` and `plan:changed` notify views, without polling every transcript or rewriting employee state. Plan's role-specific API handbook is generated for existing employees at the normal bootstrap points.
The Core process must remain running and the computer awake. `agents serve` works without a desktop window. This feature does not install a login service, power on a host or wake macOS from sleep. Busy employees are skipped rather than interrupting manual work. Late runs beyond grace are skipped; a backlog is never replayed in a burst. A run claim is persisted before external execution, and a restart marks unfinished runs interrupted rather than replaying them. This is not a claim of exactly-once external side effects: inspect the employee's actual history/files after an uncertain failure.

Calendar calculations reuse the existing Temporal-based scheduler. Plan borrows database presentation patterns from MiniNotion but does not replace that plugin's document data or reminders. Existing `schedule.*`, `view.*`, message/group APIs, shared read receipts and management bindings remain available.

## Portrait framing

Messaging and planning use dedicated static portraits derived from the original character assets, not a moving canvas pose squeezed into a small box. Human characters focus on head/shoulders; animal and robot silhouettes retain their recognizable features. The source artwork, palette tinting, selectable character IDs and all canvas animation frames remain intact. `scripts/build-avatar-portraits.mjs` regenerates these 256-pixel images during the existing preview build step.

Application view navigation (`view.list/select/open`) remains user-only. Agents use the business `plan.*` and `schedule.*` APIs without needing a visible interface.

## Safe edits and previewing a draft

`schedule.preview {id,patch?,after?,count?}` accepts an optional non-persisted edit to a saved schedule. `patch` uses the same complete action/rule/window/plan replacement objects as update. The original consumed occurrence count is retained. Use `spec` alone for a new hypothetical schedule; `id` and `spec` are mutually exclusive, and a patch requires an ID.

```sh
agents schedule preview JOB_ID --patch '{"rule":{"kind":"weekly","time":"09:15","days":[1],"timezone":"Asia/Tokyo"}}' --count 3 --json
```

Updating notes, tags, priority, name or prompt without changing the canonical timing preserves `nextAt` and does not replay a completed one-shot. The same applies to form edits: unchanged absolute instants retain their seconds/milliseconds, and a recurrence's end cutoff is displayed in that recurrence's timezone. Actual calendar changes continue to validate future dates and remaining limits. An empty preview is explicitly shown in the editor.

Table exposes the actual **Last run** outcome alongside scheduling state. Board includes planning notes and recurrence timezone. Employee labels include the Team to distinguish identical names. A complete authorized tag facet, Clear filters and automatic pagination correction keep larger databases navigable.

Calendar offers a display-timezone selector. Crowded days show three entries and a **+N more** button opening a **Day agenda**, with full titles, employees, times and recorded/upcoming status. Changing display timezone never changes the schedule. Forecasts assume a continuously running Core; they do not claim historical execution. Extremely distant finite previews beyond 10,000 calendar/window steps fail explicitly and should be narrowed.

Detailed reproducible workflows and acceptance criteria: [Plan and MiniNotion scenarios](docs/PLAN_SCENARIOS.md).


## Complete layout catalog and read-model APIs

Plan now covers every database layout ID in the source-versioned MiniNotion plugin. `plan.timeline` supplies estimated and actual run spans, `plan.analytics` aggregates full authorized record sets, and `plan.feed` supplies actual execution activity with cursor pagination. `plan.durationMinutes` / `--duration-minutes` is optional planning metadata, independent of timeout and actual run duration. Saved `options` preserve timezone, timeline scale, planner mode and chart choices. Form submits through `schedule.create`; future one-time timeline moves require confirmation and `expectedRevision`.

The full layout mapping, schemas, examples, architectural decisions and step-by-step interactive casebook are in [Plan view parity](docs/PLAN_VIEW_PARITY.md). Automated regressions lock the observed failures after the interactive exploration, rather than standing in for it.

## Editing and independent appearance

Plan uses its own `Preferences.viewAppearance.plan`, with a white database surface by
default. Company and Messages colors do not change it. Configure it in the Plan tab at
the top of Application settings, or with `agents settings set --view plan --theme white`.

Click any non-control cell in a task row, its name, or a task card/occurrence to open the
same authorized schedule editor. Table rows also support Enter and Space. Editors and
confirmation sheets render above the application chrome; Escape closes the active sheet
and Cmd/Ctrl+Enter saves a valid draft. A double-click does not dismiss the editor with
its second click. Asynchronous responses from earlier task selections cannot replace a
newer editor.

Schedule and saved-view conflicts keep the draft and show errors inside their dialog.
Load latest is explicit; background query refreshes do not hide those errors. Incomplete
timezone input clears its stale preview instead of crashing the editor. Creating a
schedule reuses its request identity when retrying unchanged content after a lost response.

Editing and previews do not run a task. Active runs remain protected by Core; Run now
executes the saved schedule and explicitly excludes unsaved edits. Existing timing,
occurrence counts, history, permissions and employee identities stay in the scheduler.
