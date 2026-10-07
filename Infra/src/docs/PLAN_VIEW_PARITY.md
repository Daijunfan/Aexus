# Plan database layouts: parity, API design and interactive review

## Scope and reference

The reference is this repository's source-versioned MiniNotion plugin, `Infra/Plugins/mini-notion/src/database/viewTypes.ts`, not an assumed external product version. Its ten layout IDs are `table`, `board`, `timeline`, `calendar`, `plan`, `list`, `gallery`, `chart`, `feed`, and `form`. Plan now implements all ten. A regression compares the actual source catalogs so adding another MiniNotion layout cannot silently leave Plan behind.

This is layout-type parity for an employee scheduling database. It does not claim that every general-purpose Notion database feature, formula, relation, dependency editor or anonymous form is implemented. Schedule identities, engine conversations, authorization and execution remain the existing Core's responsibility.

| Layout | Actual Plan behavior | Data source |
| --- | --- | --- |
| Table | Schedule fields, employee, recurrence, next date and actual last outcome | `plan.query` |
| Board | Group by state, employee or priority; explicit page-count warning on large sets | `plan.query` |
| Timeline | Day/week/month axis; estimate spans, instantaneous markers and actual run attempts; revision-safe one-time moves | `plan.timeline`, `schedule.update` |
| Calendar | Monthly dates and dense-day agenda; display timezone does not change execution | `plan.calendar` |
| Planner (`plan`) | Day, week and seven-day agenda; crossing-midnight work is shown as continuing | `plan.timeline` |
| List | Compact task rows opening the same editor | `plan.query` |
| Gallery | Character-led cards with task prompt, notes, tags and date | `plan.query` |
| Chart | Columns, horizontal bars, categorical line and donut; schedules and actual runs counted separately | `plan.analytics` |
| Feed | Recorded execution activity, outcome filtering and cursor pagination; removed schedules retain their audit | `plan.feed` |
| Form | Real authenticated schedule creation with preview, validation, exact target, retry protection and saved-ID confirmation | `schedule.create`, `schedule.preview` |

## Architecture findings and decisions

### 1. A timestamp is not a work duration

The original schedule described when to send a prompt, with an execution timeout. Neither that timeout nor a default 30-minute block is evidence of planned work duration. Drawing either as a timeline bar would mislead the user.

`plan.durationMinutes` is therefore optional **planning metadata**, accepting an integer from 1 to 43,200. A future task without it is an instant, not a fabricated span. Recorded attempts use their actual `startedAt`/`finishedAt`; ongoing attempts show elapsed time. Recorded duration includes the scheduler/engine attempt and is not a certification of productive business work. The estimate does not reserve an employee, change scheduling conflicts, stop execution or change its timeout.

### 2. Paginated records cannot supply complete analytics

The original list query returns a page of rows. Summing that page would report 100 tasks when a portfolio contains 108. `plan.analytics` aggregates the complete authorized matching record set in Core. It explicitly distinguishes counts of schedules from counts of retained actual runs. Future occurrence forecasts do not become successful executions.

Employee grouping uses stable IDs and labels the Team. Removed jobs have unknown current priority instead of silently acquiring a default priority. Team and priority groupings of historical runs refer to current linked records; the API does not invent historical snapshots that were never stored. The chart visually groups excess categories into Other after 20 entries; the API still returns the complete bucket breakdown.

### 3. Activity is a separate read model, not copied conversations

Feed reads actual run audits. It never mirrors full employee transcripts or fabricates posts from future dates. Stable `(startedAt,id)` cursor pagination prevents new arrivals from shifting earlier pages. The frontend refresh replaces its loaded result window: append-only merging left cancelled runs visible under a Running-only filter.

Deleted schedule attempts remain in Feed when authorized. Filters requiring current schedule state/tags/priority exclude deleted jobs, whose current metadata does not exist. Opening an employee conversation uses the existing workbench. Reading Feed does not acknowledge unseen private messages.

### 4. Presentation state needs its own lifecycle

The original form vanished on every subview switch. The inline Form stays mounted when switching Plan database layouts, preserving an unfinished prompt and date. It is distinct from a modal editor for an existing job; hidden forms must not capture that modal's focus. This is in-memory subview retention, not a guarantee across an application restart or leaving Plan entirely.

Saved views persist display timezone, timeline scale, planner mode and chart choices in `options`. They do not move schedules. Deleting a saved view never deletes tasks. Existing saved view IDs and fields remain valid.

### 5. Temporal projections need one interval convention

Timeline and Planner share the Core's projection rather than independently guessing date ranges. Spans use half-open intervals `[start,end)`; a span ending exactly at midnight is excluded from the following day. Durationless instants on the boundary remain visible. The axis is computed in the selected IANA timezone and has 23 or 25 hour slots on DST transition days. Repeated local hours include different offset labels.

A timeline drag is a proposal. Only a future one-time occurrence is draggable; a confirmation writes its `rule.at` through `schedule.update` with `expectedRevision`. A concurrent edit rejects the move without overwriting the newer work. Recurring dates open the recurrence editor; moving one repeat does not silently rewrite the whole series or invent an exception scheduler.

### 6. One Core remains the execution authority

All new endpoints are read projections over `scheduleRequest`'s already authorized results. The Form and timeline mutations reuse existing schedule APIs. There is no new timer process, plugin-owned executor, credential-sharing path, duplicate employee, or duplicated task store. The ordinary employee/Manager/Governor control boundaries remain unchanged.

## API examples

A task with a 90-minute estimate and a separate ten-minute safety timeout:

```sh
agents schedule create --name 'Release review' --employee EMPLOYEE_ID \
  --time 18:30 --days 7 --timezone Europe/London \
  --prompt 'Review evidence and report blockers. Do not deploy.' \
  --duration-minutes 90 --timeout 600 --max-occurrences 3 --json
```

The JSON field is `spec.plan.durationMinutes`. A complete `plan` replacement object may omit the field to remove the estimate. Other scheduling semantics and native histories remain unchanged.

```sh
agents plan timeline --from '2026-11-01T00:00:00-04:00' \
  --to '2026-11-02T00:00:00-05:00' --timezone America/New_York --json
agents plan analytics --metric schedules --group-by employee \
  --filter '{"tags":["portfolio"]}' --json
agents plan analytics --metric runs --group-by status \
  --from '2026-10-01T00:00:00Z' --to '2026-11-01T00:00:00Z' --json
agents plan feed --outcomes '["failed","skipped"]' --limit 30 --json
agents plan feed --before RETURNED_NEXT_CURSOR --limit 30 --json
```

`plan.timeline {from,to,timezone?,filter?,limit?}` returns normalized bounds, timezone, `events`, `truncated` and `retainedHistoryLimit`. Each event includes `id,jobId,name,employeeId,employee,at,date,startAt,endAt,status,kind,durationKind,jobAvailable,canReschedule`, with `runId`, `estimatedMinutes`, `jobRevision`, `message`, `trigger` and `scheduledAt` where relevant. Forecast duration kinds are estimate/point, recorded kinds are actual/elapsed. An absent estimate does not supply an end date. Forecasts are bounded to 100 dates per schedule; total default 500/max 2,000. The date range is positive and at most 93 days. Use `schedule.preview` for additional precise dates. Removing a schedule removes its live temporal row; its actual audit remains queryable in Feed/history.

`plan.analytics {metric?,groupBy?,filter?,outcomes?,from?,to?}` returns `metric,groupBy,total,buckets[{key,label,value}],scope` and the retained-history limit for runs. Date bounds must be supplied together, at most 93 days, and only apply to the runs metric. `filter.states` describes current schedule state, while `outcomes` describes actual run outcomes. The schedules metric rejects run-only filters instead of silently ignoring them.

`plan.feed {filter?,outcomes?,from?,to?,before?,limit?}` returns `entries,hasMore,nextCursor,retainedHistoryLimit`. Limit is 1–100, default 30. Use the opaque returned cursor; malformed cursors fail. Each entry extends a stored run with identity-only employee information and `jobAvailable`. History is bounded to the existing scheduler retention/query limits, not an unlimited lifetime audit.

```sh
agents plan view-create --spec '{"name":"Europe release desk","layout":"timeline","filter":{"tags":["review"]},"options":{"timezone":"Europe/London","timelineScale":"week"}}' --json
agents plan view-create --spec '{"name":"Run outcomes","layout":"chart","options":{"chartMetric":"runs","chartGroupBy":"status","chartType":"donut"}}' --json
agents plan view-create --spec '{"name":"Morning agenda","layout":"plan","options":{"timezone":"Asia/Shanghai","plannerMode":"agenda"}}' --json
```

`options` accepts `timezone`, `timelineScale:day|week|month`, `plannerMode:day|week|agenda`, `chartMetric:schedules|runs`, `chartGroupBy:status|employee|team|priority`, and `chartType:bar|horizontal|line|donut`. Updating options replaces that object. All fields have schemas in `agents api describe ...` and the role-specific handbook.

## Interactive review method

The primary exploration was performed step by step through a live, disposable native renderer: choose the next action based on the screen, click/type/drag, inspect screenshots and the resulting records, then branch into failure cases. It was AI-guided interaction through connected tools, not a claim that a human person physically tested the machine.

The screenshots and chronological observations are in `.aexus/artifacts/plan-parity/interactive-notes.jsonl` and the neighboring numbered PNG files. Test employees lived only in `/private/tmp/ac-plan-exploration-*`. Deterministic engine responses verify dispatch, cancellation, outcome recording and native conversation routing; they do not prove an arbitrary language model will reason correctly about a real project. The 108-record portfolio was generated as setup data (12 release trains × 9 defined responsibilities), not counted as 108 independent manual tests.

| Charter | Steps and actual observation |
| --- | --- |
| Baseline | Open the previous Plan, compare its four tabs with all ten MiniNotion source types; inspect a detailed review form lacking duration. |
| London review | Save a three-Sunday 18:30 London review, estimate 90 minutes and timeout 600 seconds; verify 18:30–20:00 estimate and unchanged timeout. |
| First-event visibility | Day initially appeared empty because the only event was offscreen after 18:00. Added first-occurrence positioning and a navigation button; retest showed the event immediately. |
| Form interruption | Fill a detailed DST rehearsal, inspect Gallery, return to Form. Draft was lost; after lifecycle repair, name, multiline prompt, date, target and estimate survived. |
| Paused intake | Submit the restored form paused; inspect actual saved ID, UTC instant, enabled=false and no engine activity. |
| Fall-back night | Day Timeline on New York's fall-back date displays two distinct 01:00 hours and 25 columns. A 00:30 +180-minute estimate ends 02:30 local. |
| Move cancellation | Drag a future one-time task by a day; inspect confirmation; Keep original leaves the instant unchanged. |
| Concurrent move | While the move dialog is open, a second edit changes notes. Confirm is rejected by revision; notes and original instant survive. |
| Confirmed move | Reopen a fresh proposal, confirm, then inspect Calendar and Planner: same task ID, new date, no duplicate occurrence. |
| Overnight continuity | Add 23:00–02:00 evidence collection. Following-day Planner shows Continues, alongside the separate same-time rehearsal. |
| Same-name employees | A second Alex in another Team has a durationless approval instant; both remain distinguishable and individually addressable. |
| Live feed cancellation | Running-only Feed retained a stale card after cancellation although Core returned zero. Reconciled loaded pages; retest showed Running empty and Cancelled containing actual attempts. |
| Portfolio completeness | Inspect 108 future records while Table pages 100. Chart shows all 108: 96 scheduled, 12 paused, three separate 36-task employee buckets. |
| Chart semantics | Switch column, horizontal, donut and categorical line; switch metric to Actual runs. Future portfolio correctly reports zero runs. |
| Busy manual work | A real short-delay fixture timer fires while manual work is active. Feed reports Skipped / Employee is busy; manual review remains running. |
| Removed schedule | Delete an inactive rehearsal through the editor. Its two cancelled attempts remain in Feed with Schedule removed, disabled edit action and a valid private-conversation link. |
| Removed metadata | Actual-run chart groups those deleted-job attempts under Unknown priority rather than guessing the old priority. |
| Exact midnight | A 22:00 +120-minute span incorrectly appeared in the next day's timeline. Fixed half-open overlap; retest excludes it while keeping real cross-midnight spans and boundary instants. |
| Invalid form | Missing employee disables submit. Invalid IANA zone gives a visible error without losing multilingual title, multiline prompt or milliseconds. |
| Double submit | Correct timezone, double-click Create; exactly one paused schedule saved, with the precise timestamp and full prompt. |
| Saved temporal view | Save timezone/scale/filter, visit Company, reselect; presentation options restore without modifying the task. |
| New activity and cursor | While holding an older cursor, submit a real two-second fixture task. New run appears; older cursor still yields the earlier attempts, and Open full conversation reaches the original employee thread. |
| Cross-layout edit | Inspect nine release-train items in Gallery; edit final-approval notes; Table, Board and List show the same paused record and unchanged next date. |
| Narrow window | At 720×900, scroll the tab strip to the late-added layouts and inspect the single-column Form. No type is silently hidden from the catalog. |
| Finite quota in later month | Browse November after a three-October-Sunday review quota. Timeline shows no newly invented repeats. |
| Saved view removal | Rename and then remove the saved layout; all 116 scenario schedule records remain. |

Two additional proposed interactive checks (a separate one-second timeout demonstration and switching to an employee credential for scope exploration) were blocked by the tool before execution. They are recorded as **not executed**, were not retried through another path, and are not counted as manual passes. Existing authorization/timeout regressions are separate evidence and are not relabeled as manual testing.

After discovery, `Infra/src/test/plan-parity-core-test.mjs` and `Infra/src/test/plan-parity-ui-test.mjs` lock the repaired behavior. They complement the interactive evidence rather than replacing it. Full regression and installed-package outcomes are recorded in the final verification report, with failures and skipped live-platform tests separated.
