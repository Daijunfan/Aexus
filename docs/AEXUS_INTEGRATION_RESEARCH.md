# Aexus → CloudHosts: native-agent collaboration research

Reviewed: 2026-10-12. Source projects: `/Users/djf/develop/CS/Aexus` and this `CloudHosts` tree. This is a technical design note, not a claim of finished production integration.

## Product definition

**CloudHosts / Agent Workspace — cross-host native Coding Agent operations console** (云主机 · 原生 Agent 协作工作台). The managed entities are host, engine process, **actual native session**, group, message, schedule, and recorded run. Do not create an employee, fictional role, company hierarchy, AI CEO, behavioral persona, hidden bootstrap prompt, or additional model conversation per view. A native session may run locally or on a registered SSH host. Group membership is only a relationship between existing session IDs.

## Original views and architectural dependencies

| Aexus view | Implementation / service | Dependence to avoid | CloudHosts adaptation |
|---|---|---|---|
| Company | `src/renderer/src/office/OfficeCanvas.tsx`, `Employee.tsx`, `CanvasRoom.tsx`, company canvas CSS | `StoredSession` employee/profile/role, office animation and hierarchy | Existing Agent Board is already the host- and native-session-based projection. Keep it; optionally reuse compact avatar/hover/motion design. |
| Messages | `components/MessageView.tsx`, `useMessenger.ts`, `main/chat-groups.ts`, `channel-discussion.ts`, group delivery / mentions | employee policies, chat reply injection, delegated work prompts, employee-initialization workflows | Native Groups keyed by actual Agent session IDs, out-of-band message history, message→Plan link, explicit targeted native session dispatch only. |
| Plan | `components/PlanView.tsx`, `PlanEditor.tsx`, `PlanTimeViews.tsx`, `ChannelPlans.tsx`, `shared/plan.ts`, `main/scheduler/{service,execute}.ts` | employee-owned schedule, role-specific permission, plan-mode prompts, delegation, injected planning context | Local Core-owned scheduler with persisted jobs and occurrence/run ledger. One-time/interval, reminders to group, explicit exact-thread Codex task. Board, calendar and timeline read the same records. |

Aexus has richer features: categories/favorites/archives, quoting and forwarding, channel publications, recipient acknowledgments, weekly/monthly/event rules, saved Plan filters, calendar planning, analytics, chart/feed and other projections. Do not transplant all at once. The Company view alone does not justify a second standalone hierarchy.

## Navigation and data flow

Retain existing CloudHosts top-level **Single Host / Terminal Board / File Board / Agent Board**. Within Agent Board, add three persistent child tabs **Sessions (Company-like) / Messages / Plan**. The UI in this tree currently labels the first tab `Company · Agents`. A more precise final label is **Sessions** or **Agent Fleet**; it has the user's chosen host topology and draggable session tiles.

```
CloudHosts Core (single source of truth)
 ├─ hosts / SSH / PTY / exact native sessions ── Agent Board (Sessions)
 ├─ groups / append-only messages / read cursors ── Messages
 └─ enabled schedule / occurrence claim / run ledger ── Plan
               ├─ reminder → Core record, optionally a group message; zero model input
               └─ user-enabled task → a particular existing Codex native thread,
                                      with exactly the saved user task text
```

Messages in the app are **not model messages**. Posting a chat message or adding a session to a group never calls a model. Genuine autonomous group conversation requires the Agent to receive text (a deliberate task, explicit subscribed event, or an Agent-initiated read) and therefore uses some model context. Do not promise that automatic multi-agent responses take zero context. `No preprompt` can truthfully mean no additional *system/role initialization*, not that no user/task tokens are consumed.

An operator may click a message's **Plan this** to create a paused draft. They review exact text, target native session and schedule before opt-in enablement. For actual agent execution, no message digest, group identity, role instruction, channel control policy or routing notes are prepended. Results should be optionally published as explicit Core events; private native conversations must not be silently copied into a group.

## Prototype already created and isolated validation

The initial CloudHosts worktree already contained an unpublished prototype. It was committed as snapshot **`ecd00d7`** before this analysis. Core files `src/collaboration.cjs`, `src/plan-scheduler.cjs`, views `ui/agent-workspace.js`, `ui/messages.js`, `ui/plan-view.js`, CLI/RPC and tests were present. They were not copied wholesale from Aexus React/Electron: they use CloudHosts vanilla JS and the existing local JSON-RPC server.

The prototype's present capabilities are: group create/edit/archive, member IDs, messages/replies, read sequence, retry-safe message IDs; Plan create/edit/pause/archive/manual run/once/interval and a bounded run ledger; Agent Board / Messages / Plan tabs; Plan Board/Calendar/Timeline projections; group message→Plan draft; explicit manual-run confirmation. Plans are off by default. Scheduler is part of the Core backend and works when the GUI is closed **if the Core remains running**.

Validated in an isolated `CLOUD_HOSTS_HOME`: 8 collaboration/Plan Node tests, CLI group→message→Plan→reminder test, **21 headless WebKit integration assertions**. No existing Agent session, actual cloud folder or production schedule was touched. A new source-only guard pins a scheduled native action to the **engine source host and Codex environment identity** as well as the thread and work-host ID; if identities change, the run enters attention and sends no task text.

## Remaining delivery gates

1. **Security / correctness:** Validate local auth and all write permissions; avoid role-based privilege inheritance. Test multiple operator windows, atomic-message race, aborted requests, corruption recovery, immutable ID and idempotency keys.
2. **Real collaboration:** Add explicit `Assign to Agent` action with preview of *exact* model-bound text and destination; separate read/delivery receipts from tasks. Do not automatically activate all group members or inject group transcripts. Group messages are currently a bulletin-board-style shared log, not autonomous multi-agent chat.
3. **Scheduler reliability:** Current rules: once / interval only, no weekly/monthly/event trigger. Add timezone-aware recurrence, bounded runs, pause/resume, busy skips, misfire behavior, occurrence history and alert on unknown submission. Keep task submission exactly once from the app's perspective; unknown remote acceptance cannot be auto-retried. No guaranteed background jobs while the host/Core is shut down or Mac is sleeping.
4. **Process affinity:** Preserve exact `threadId`, source host/account, `CODEX_HOME`, work host and cwd; reject changed identity. Scheduled Agent jobs must never pick the most recent or a fresh conversation. PTY engines may participate in groups and reminders; scheduled autonomous execution currently only supports the verified native Codex driver.
5. **UX/accessibility:** Group search, unread indicators, rich message replies and badges; Plan day/week calendar and task status/target chips, no duplicate reloads, keyboard navigation and bilingual UI. Do not import Aexus employee portraits/office animations as a prerequisite.
6. **Release:** CLI tests, isolated headless WebKit, macOS native Codex, real SSH and Windows native ConPTY; package integrity check with source+build+running buildId. Do not ship this prototype to production merely because the isolated tests passed.

## Suggested delivery sequence

**Phase A:** Stabilize the currently working child tabs (Sessions / Messages / Plan), names and layouts; fully prove group persistence, no model turn on ordinary post, no hidden prompts, user-readable run history. **Phase B:** Add explicit task assignment to an existing native session and publication of execution records with user confirmation; no unauthorized group broadcasts. **Phase C:** Add essential timezone-aware recurrence, alerts, multi-window correctness and cross-platform release validation. Defer external news feeds, delegated employee hierarchy, autonomous chatting, office animations and expansive analytics until the smaller model is reliable.
