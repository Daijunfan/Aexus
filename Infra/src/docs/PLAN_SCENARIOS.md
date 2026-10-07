# Plan and MiniNotion: scenario-based acceptance

This guide separates three things: the schedule definition, its actual execution record, and the content saved by the employee. A green/succeeded engine turn alone does not prove that a report or database record was written.

All automated cases use a new `AGENTS_COMPANY_HOME`, temporary employee workspaces and deterministic engine/provider fixtures. They never create demonstration schedules in the user's company. Screenshots contain only fixture names and content. New Plan controls are English; this work does not translate or replace MiniNotion's existing interface.

## A. Sunday project review across time zones

**Situation.** Alex in Product owns a Sunday 17:00 review in America/New_York. The Core host uses Asia/Shanghai. The plan is high priority, has review/release tags, and ends at an absolute cutoff.

**What should be visible.** Table shows the recurrence's own timezone alongside Next run in the display zone. Board groups it under the actual state or priority. Calendar can switch between UTC and New York without editing the task. Employees with the same display name in different teams remain distinguishable.

**Checks.** Preview the next dates, compare local Sunday/17:00, then edit only Notes in the real editor. Rule, absolute `until`, exact `nextAt`, employee ID and native context must stay unchanged. Saving a filtered "Sunday only" database view and reloading preserves the filter. A preview patch changes the preview only, not the saved rule.

```sh
agents schedule preview JOB_ID --count 5 --json
agents schedule preview JOB_ID --patch '{"rule":{"kind":"weekly","time":"09:15","days":[1],"timezone":"Asia/Tokyo"}}' --count 3 --json
agents schedule get JOB_ID --json
```

## B. One-off deployment gate with precise time

**Situation.** A one-time quality gate is set at an ISO instant with seconds and milliseconds. After completion, the user wants to add the acceptance notes.

**Checks.** The editor retains the original instant through a notes-only edit, instead of truncating to the minute. A completed job can accept notes, tags, or a corrected description without creating another occurrence. Occurrence count and historical run count do not change. Empty preview is explained visibly rather than appearing to fail silently.

No actual deployment is performed in the fixture. The employee runs a deterministic response and the test checks the persisted schedule and history.

## C. Repeated quality checks with a hard limit

**Situation.** Check a release three times at hourly intervals, then stop. Another scenario repeats twice over a short interval so the whole execution can be observed during the test.

**Checks.** The first calendar range contains the three expected times. A later range contains none after the quota has already been allocated in the forecast. Moving the calendar or using `--after` does not replenish the limit. Exactly 100 allowed occurrences are not incorrectly described as truncated; an unlimited high-frequency rule does show a truncation warning.

The end-to-end MiniNotion case actually runs two scheduled turns, writes two different records, checks `occurrences=2` and `nextAt=null`, and verifies that no new native conversation was created. Manual runs are tested separately and do not consume the scheduled count.

## D. Daily digest, monthly research and an overnight work window

**Situation.** Mira produces a daily London digest and a last-day-of-month Tokyo research brief. Operations runs hourly, restricted to 22:00–02:00 on allowed starting weekdays in Shanghai.

**What should be visible.** Recurrence labels remain readable, monthly and daily tasks share the same database, and the schedule details expose exact timezone and window settings. An interval of 30 seconds opens as 30 Seconds, not 0.5 Minutes in an integer-only field.

**Checks.** The underlying scheduler suite exercises month ends, leap dates, daylight-saving changes, overnight ownership, exclusive window ends, timeouts and skipped busy work. The scenario UI test checks the actual displayed labels and metadata, not only CSS classes or a mocked table.

## E. A crowded release day

**Situation.** Eight distinct release tasks fall within one morning and are assigned to two employees.

**What should be visible.** Each month cell shows three entries and a `+N more` action. Day agenda lists all returned occurrences with full title, assignee, local time and status. Recorded executions are identified separately from upcoming forecasts. The calendar does not add a nested scrolling region to each day.

**Checks.** Open the day agenda, verify all eight items, select the final item and check that the correct schedule editor opens. Switch the display timezone and compare the shifted local time against the same underlying UTC instant. No schedule definition changes.

The calendar remains bounded by the existing API limits. A day agenda contains the occurrences in the returned result, not an assertion that an unlimited high-frequency day is complete. The truncation warning remains visible when relevant.

## F. Exceptions should be actionable, not look completed

**Situation.** One task succeeds, one is intentionally paused, and another waits long enough to hit a one-second fixture timeout.

**What should be visible.** The same database displays Scheduled, Paused, Completed and Attention. Table includes the **Last run** outcome; Board includes concise planning notes and actual last outcome. "Completed" describes the schedule's future occurrence state, while "succeeded/timed out" describes the actual run.

**Checks.** Start the blocked fixture, observe timeout, then compare Table and Board with `schedule.history`. Verify that notes can be added to the completed job. Existing manual work must not be interrupted by a competing schedule.

## G. Large databases and duplicate employee names

**Situation.** Product and Operations both contain an employee named Alex. The company also contains 105–115 plans whose tags span multiple pages.

**Checks.** Employee grouping/filtering uses stable IDs and shows Team names. A tag only present on page two is still available from page one. Query facets come only from the caller's authorized schedules, never from all employees' private plans. Deleting the last page's records returns the UI to the last valid page rather than leaving an empty or reversed pagination range. Clear filters restores the complete visible list. Sorting and pagination do not repeat IDs across pages.

## H. A scheduled employee writes a rich MiniNotion report

**Situation.** A Work employee is bound to an existing MiniNotion main-page folder. A scheduled review must update a child report containing a decision summary, an evidence table, next-action checkboxes and a code block.

**Execution under test.** The installed Codex process is connected only to a local deterministic HTTP provider. It performs the actual tool call through the employee's authenticated `agents plugin call mininotion ... --employee ID` channel. The test rejects completion unless the latest tool returns a successful Core response. It then independently reads the saved content.

**Checks.** Verify the weekly rule using preview, execute one explicit manual test run, and confirm the next weekly date was not consumed. Check the real child page via `page.read-markdown`, open the actual MiniNotion window, and inspect its native table/checklist/code rendering. The test does not merely insert a success message into the transcript.

The fixture controls the model's chosen action. It validates the complete execution route and saved result; it does not certify that an arbitrary model will always follow every natural-language instruction.

## I. Repeat tasks populate the same MiniNotion database

**Situation.** Two short recurring quality checks create "First verification" and "Second verification" in the same database, with status and date properties plus a content block explaining the evidence.

**Checks.** Let the real timer trigger both turns. Require two succeeded run records, two actual stored records, a consumed limit, and the same original employee/native session. Open Table, Board, Gallery, List and Calendar in MiniNotion and verify both record titles in every view. Run filesystem audit, close/reopen the plugin, and reread records and report content. All views must reference one data source.

The timing system remains Core-owned `schedule.*`. MiniNotion retains its existing pages, database properties, document reminders and files; Plan does not duplicate or replace them.

## Reproduce safely

Run from the repository. Each test creates and removes its own fixture data.

```sh
npm run typecheck
npm run build
node Infra/src/test/plan-polish-core-test.mjs
node Infra/src/test/plan-polish-ui-test.mjs
node Infra/src/test/plan-notion-delivery-test.mjs
```

The final command requires a real local Codex executable; `AGENTS_TEST_CODEX_BIN` selects it. All model responses in that test come from localhost, with a new native profile and no production provider key. `AGENTS_COMPANY_TEST_APP` selects a built/installed app for the UI and delivery tests.

Evidence is written beneath `.aexus/artifacts/plan-polish/`: scenario JSON, logs, light/dark/compact screenshots, the crowded-day agenda, and MiniNotion native-renderer screenshots. The regular Core, UI, scheduler, engine, plugin and Tunnel suites remain independent regression gates. Real SSH/live-host tests require separate authorization and must be reported as skipped when not run.
