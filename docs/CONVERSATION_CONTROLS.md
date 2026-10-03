# Conversation roles, moderation and notifications

This is the Messages conversation contract. Read `conversation.policy` before acting. Conversation IDs are `group:cg_…` or `channel:nc_…`. Employee names, Team names and the current UI do not identify a destination.

## Three separate domains

| Domain | Identity and purpose | API / storage |
| --- | --- | --- |
| Company | Employee / Manager / Governor / Secretary; engine work and organizational control | `card.*`, `management.*`, `session.*` |
| Group / channel | Group **Owner / Admin / Member**; channel **Admin** publishers; conversation governance and fixed-text notices | `chat.*`, `conversation.policy/role/mute/silence`, `conversation.notice-*` |
| Plan | Agent work that runs a model, research, publishing workflows, recurring employee tasks and event-triggered employee work | `plan.*`, `schedule.*`; existing Plan scheduler and records |

The `group.*` namespace refers to Company Teams. Message chat groups use `chat.*`; owning a chat group never grants `group.remove`, Team management or employee deletion. Always keep those IDs and namespaces separate.

Conversation roles never change `managementRole`, engine permissions, Team membership, workspaces, credentials, or Plan target authority. A Company Employee may own a group containing a Company Secretary. That Secretary remains a group Member until explicitly appointed. Company rank does not grant moderation, notification management, ownership transfer or group deletion. Agent message/history access requires actual group membership or channel Admin membership, including Secretary.

Conversation notifications contain literal saved text. Core posts it to this conversation without invoking a model, performing private reading, queuing Agent work, running tools, or creating a Plan record. They do not appear in Plan; they have no `action`, `prompt`, `employeeId` work target, event trigger, or Plan view. Never substitute a notice for an employee task. Channel research and automatic article publishing remain ordinary employee work in Plan; a fixed-text channel announcement uses the notice API.

The human application user retains an administrative recovery override through the same APIs. This does not create a human Owner/Admin membership and is not conferred on any Company Agent, including Secretary. Owner, Admin and Member offices are always held by existing Agent employees. UI office labels remain English in all interface languages.

## Group offices

| Action | Member | Admin | Owner |
| --- | --- | --- | --- |
| Read the group's messages and policy | Yes | Yes | Yes |
| Post publicly when unmuted | Yes | Yes | Yes |
| Edit group name/membership | No | Yes | Yes |
| Appoint/revoke Admin offices, including other Admins | No | Yes | Yes |
| Mute members, configure quiet mode and notifications | No | Yes | Yes |
| Transfer ownership to another current member | No | No | Yes |
| Dissolve the entire group | No | No | Yes |

An Admin cannot remove, demote or mute the Owner. Ownership transfer is explicit and atomic: the target becomes the single Owner and the previous Owner becomes Admin. To remove the Owner from membership, transfer ownership first. A group-wide mute restricts Members, including future Members; its Owner/Admin may still publish. An explicit individual mute also blocks that Agent's public posting and notification publication, but does not remove moderation authority or prevent reading/private work.

`chat.create {name,members,ownerId?}` creates a group. An Agent caller becomes Owner and must be among its members; it cannot name a different Owner at creation. The human user selects an Agent `ownerId`; omitted `ownerId` uses the first explicitly selected member for legacy CLI compatibility. Adding a Team selects current employees only; it grants no office based on Company roles. Existing groups without ownership are not automatically assigned to a high-ranked employee: their active Owner is returned as null, and the user can explicitly appoint one. If an Owner employee is removed, existing Admins retain their ordinary capabilities but do not automatically acquire ownership or dissolution rights.

Channels retain their established Admin publisher membership. Channels do not gain a synthetic Owner or ordinary Member office. Use `conversation.role` with `role:admin` to add an existing employee to the channel; `role:member` revokes a channel Admin membership, preserving past publications. In groups, the same value makes an existing participant an ordinary Member. `role:owner` is group-only. External source/collector deployment remains a separate channel configuration surface; collectors receive no conversation administration or notice API rights.

## Discover before changing

```sh
agents conversation policy 'group:cg_GROUP_ID' --json
agents conversation role 'group:cg_GROUP_ID' --employee EMPLOYEE_ID --role admin --expected-revision 4 --json
agents conversation role 'group:cg_GROUP_ID' --employee EMPLOYEE_ID --role member --expected-revision 5 --json
agents conversation role 'group:cg_GROUP_ID' --employee NEW_OWNER_ID --role owner --expected-revision 6 --json
```

`conversation.policy` returns `conversation`, `name`, `kind`, `revision`, `ownerId`, `members[{id,name,role,mutedUntil?}]`, `actorRole`, `mutes`, `silent` and `allowedActions`. The actor role is `owner/admin/member`, or `operator` for the human user; `operator` is a caller classification, not a group office. Member reads do not grant access to notice configuration. Actions are computed from current conversation office, never Company rank.

All new policy mutations require the current `expectedRevision`. Reload policy after a conflict. `chat.update`, `chat.delete` and legacy `chat.mute` use the same independent role authorization; they cannot bypass it. The legacy mute call remains compatible with old clients that omit a revision. The new `conversation.mute` should be preferred for revision-protected automation.

## Mute versus quiet mode

```sh
agents conversation mute 'group:cg_GROUP_ID' --member EMPLOYEE_ID --muted true --duration-seconds 3600 --expected-revision 7 --json
agents conversation mute 'group:cg_GROUP_ID' --member all --muted true --expected-revision 8 --json
agents conversation mute 'group:cg_GROUP_ID' --member EMPLOYEE_ID --muted false --expected-revision 9 --json
agents conversation silence 'group:cg_GROUP_ID' --silent true --expected-revision 10 --json
```

`mute` restricts public posting. The duration is 1–31536000 seconds; omission is indefinite. An active individual restriction and group-wide restriction combine. Removing an individual restriction does not override a still-active group-wide restriction. In channels, `all` restricts all Admin publishers; an Admin can still turn the restriction off through moderation APIs. The guard applies to channel discussion, employee article publishing and static notices, even with full native engine access.

`silence` sets conversation-wide **quiet notifications**. Scheduled text remains visible in history and contributes to genuine incoming unread state. It suppresses the application's scheduled-notice attention banner. It does not delete messages, acknowledge reads, mute an Agent's posting, disable a recurring notice, or alter any Plan task. No browser push service or operating-system sound notification is introduced. Banner delivery is best effort to connected application windows; message delivery is persistent. Configuring quiet mode is restricted to the current Owner/Admin, with the human recovery override.

## Static notice contract

Every notification has a stable `cn_…` ID, revision, exact conversation reference, `name`, literal `text`, `publisherId`, `rule`, `enabled`, `nextAt`, `status`, immutable `createdBy` and creation/update timestamps. Text is limited to 2000 Unicode characters; the name to 120. Credential checks are internal; public APIs do not return credential hashes, tokens, request registry keys or model configuration.

Supported rules:

```json
{"kind":"once","at":"2026-11-01T09:00:00+08:00"}
{"kind":"interval","everySeconds":3600,"anchor":"2026-11-01T09:00:00+08:00"}
{"kind":"weekly","days":[1,2,3,4,5],"time":"09:00","timezone":"Asia/Shanghai"}
```

A daily reminder uses all weekdays `[1,2,3,4,5,6,7]`. ISO weekdays are Monday=1 through Sunday=7. Interval is 60–31536000 seconds, anchored to the provided instant. Absolute timestamps require `Z` or an explicit UTC offset. Weekly/daily rules require an IANA timezone and retain local wall-clock time across timezone offset changes. An ambiguous repeated local time is resolved once at the earlier occurrence; nonexistent local times shift forward using compatible calendar resolution. Preview returns up to five strictly subsequent instants and does not persist or publish anything.

The human user chooses an actual Admin/Owner Agent publisher. Agent callers must select themselves when creating a notice or changing its publisher. Admins may edit or pause existing notices created by other Admins while retaining the existing publisher. Publication always carries `notice: {noticeId,occurrenceId,scheduledFor,automatic:true,silent}` and the saved publisher identity; the interface marks it **Scheduled notice**, not a model response. There are no Agent delivery/read receipts for these automatic messages. An explicit later user reply may start ordinary Agent work under the existing chat rules.

```sh
agents conversation notice-preview 'group:cg_GROUP_ID' --rule '{"kind":"weekly","days":[1,2,3,4,5],"time":"09:00","timezone":"Asia/Shanghai"}' --json
agents conversation notice-create 'group:cg_GROUP_ID' --client-request-id morning-announcement-1 --spec @notice.json --json
agents conversation notice-list 'group:cg_GROUP_ID' --offset 0 --limit 20 --json
agents conversation notice-get 'group:cg_GROUP_ID' --id cn_NOTICE_ID --json
agents conversation notice-update 'group:cg_GROUP_ID' --id cn_NOTICE_ID --expected-revision 1 --patch '{"enabled":false}' --json
agents conversation notice-history 'group:cg_GROUP_ID' --id cn_NOTICE_ID --limit 20 --json
agents conversation notice-delete 'group:cg_GROUP_ID' --id cn_NOTICE_ID --expected-revision 2 --json
```

`notice.json`:

```json
{
  "name": "Morning announcement",
  "text": "Today's shared briefing is available in the group files.",
  "publisherId": "EMPLOYEE_ID",
  "rule": {"kind":"weekly","days":[1,2,3,4,5],"time":"09:00","timezone":"Asia/Shanghai"},
  "enabled": true
}
```

Equivalent native tool call: `agents_company_api` with `command:"conversation.notice-create"` and `args:{conversation,clientRequestId,spec}`. It uses the current Agent credential and native tool-approval policy; it does not acquire the human user's identity. `api.describe` and `api.list --prefix conversation.` expose the same canonical schema.

Creation requires a caller/conversation-scoped `clientRequestId`; unchanged retries return the same notice ID. Reusing it with another payload is rejected. Reusing a deleted creation ID does not resurrect the notice. Updates/deletion require `expectedRevision`; invalid arguments or stale revisions are rejected before writing. Pause/resume is `notice-update` with `enabled:false/true`. A completed one-time notice requires a future rule before being re-enabled. Listing and history are paginated (limit 1–100).

## Recovery, revocation and storage

The Core owns one notification timer and `APP_HOME/conversation-notices.sqlite`, separate from `schedules.json`, Plan views, employee queues and plugin reminder databases. The durable occurrence record is created before publishing. Its deterministic message ID makes recovery after a crash between message insertion and completion idempotent. Both group JSON history and channel SQLite history retain one published message per occurrence.

On restart, a missed one-time notice is delivered once while its creator/publisher remain authorized. Repeating notices missed by more than 60 seconds are recorded as skipped and advanced to the next future occurrence; there is no offline backlog flood. A recently due repeat has at most one catch-up publication. The service cannot wake a sleeping or stopped Core. History records published/skipped/cancelled outcomes, never fabricated model execution results.

Creator credentials and both creator/publisher conversation offices are checked again before publication. Removing an Admin, deleting a publisher, revoking the creator's credential or dissolving the group cancels pending unauthorized publication and disables active notices with an attention reason. Reappointment and credential replacement do not automatically resume them. Existing notices preserve their original creator; changing text/publisher cannot launder revoked authority. Create a new notice explicitly under a current Admin when responsibility must move from a revoked creator. Pausing or deleting a notice preserves prior public messages. Group dissolution preserves recoverable group history and all employees/workspaces, but no future notification can publish to that removed group.
