# Message product references and adopted design

Research date: 2026-10-04. Sources are the products' official API/help documentation. This document records design decisions, not claims that every feature of those products has been reproduced.

| Official reference | Relevant pattern | Application here |
| --- | --- | --- |
| [Telegram rights](https://core.telegram.org/api/rights) | Administration, posting restrictions and default member restrictions are explicit conversation properties. | Read a current conversation policy; authorize operations on the exact group/channel; keep membership, office and posting restrictions distinct. |
| [Telegram scheduled messages](https://core.telegram.org/api/scheduled-messages) | Scheduled messages have their own queue and publication lifecycle. | Timed fixed-text conversation notices have their own definitions, timer and occurrence history; no Plan job or model execution. |
| [Discord roles and permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions) | Role hierarchy constrains member-management actions. | Preserve a protected Owner, explicit transfer and separate demotion/removal. This project's requested Admin-to-Admin appointment/revocation is an intentional product-specific rule. |
| [Slack file objects](https://docs.slack.dev/reference/objects/file-object/) | Files expose metadata and authenticated access rather than relying only on a displayed filename. | Published entries provide stable attachment IDs, metadata and scoped read/download tools. Copies target a member's own workspace and verify content before commit. |

## Product-specific choices

Company role and conversation office remain separate. A Member Secretary can maintain direct shared-root files under the user's explicit requirement; that does not grant Admin governance and does not permit writing peer member folders. Owner/Admin does not automatically gain root-file write access.

A catalog describes all the employee's Company and Message workspaces with actual paths and permissions. There is no task-placement mandate. One copy API can target either type of own workspace.

The post-count workflow is a separate channel capability: one counter and editable prompt per employee, exact durable batch IDs, explicit automatic provenance, visible queued/running/completed states and no Plan records. It does not reuse the fixed-text notice schema. Duplicate/new/edit distinctions are taken from Core's authoritative article insertion, not counts observed by a GUI or a shifting last-N query.

## Interface decisions

Conversation administration groups related actions into Members & roles, Notifications, and channel Post counts. Role changes are revision-checked. Demoting Admin keeps Member; removing membership is a separately confirmed action. Owner transfer is confirmed. Post-count cards display employee, threshold, prompt, progress, enabled/paused state and history. Document copy dialogs show the target employee and concrete destination before copying, then actual progress and committed path. Core performs the same checks for GUI, CLI and native Agent tools.

## Validation evidence

See `artifacts/message-collaboration/` for isolated Core/CLI reports and browser/hidden-Electron screenshots. Product requirements are verified against the local implementation; the official sources justify the borrowed interaction patterns rather than serving as evidence that local tests passed.
