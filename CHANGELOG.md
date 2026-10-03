# Changelog

> 项目当前名称为 **Avalon**，分享地址：[Daijunfan/Avalon](https://github.com/Daijunfan/Avalon)。下文 Anexus 为当时的发布名称；安装包、命令和历史路径按实际记录保留。

## 0.56.3 — Shared context and concise Agent rules

- Verify all-member group delivery in the same native conversation; mentions select work targets and other members receive awareness.
- Reduce reading/publication/API-tool prompts and group documentation to basic API and authority rules; update both READMEs and generated guides.
- Place group author avatars outside message bubbles while preserving message identity, replies and read receipts.

## 0.56.0 — Anexus identity and everyday collaboration

- Rebrand the product as Anexus while retaining its icon, durable identities, workspace/data locations and CLI compatibility; add the anexus alias and safe legacy app upgrade.
- Show editable personal photos and actual Agent portraits in group/channel messages; remove redundant one-to-one Telegram conversation rows.
- Use the themed conversation-type menu, hide category scrollbars and retain normal horizontal scrolling.
- Add scoped file-manager reveal actions and a persistent resizable assets drawer across views.
- Replace the local promotional library with varied multi-image posts, mostly everyday user scenarios with a smaller developer-focused set.
- Detailed Chinese release notes: [0.56.0](docs/releases/0.56.0.zh-CN.md).

## 0.55.0 — Unified assets and completed Margin Reader

- Add the fixed Company/Messages/Plan file tree, flat asset search, lazy paging and background indexing, including published attachments and cloud documents.
- Add English/Pinyin directory creation and explicit migration for managed and externally bound roots, preserving identities, original files and legacy references.
- Fix bidirectional shared-file transfers; keep conversation originals and peer folders protected. Preserve Company ESC/Back draft behavior and the redesigned team locator.
- Integrate Telegram document metadata, original thumbnails and filenames, album order, verified cloud-to-channel downloads and persistent local copies.
- Include independent conversation roles, mute/silence controls and fixed-text notices, configurable conversation directories, Secretary API tooling and complete Plan discovery.
- Bundle Margin Reader 0.9.4 with source-linked reading/maps, split reading, precise subtree drops and cancellation, complete document covers, save/close fixes, designs and exports; bundle MiniNotion 1.23.0 with event summaries, slash categories and authorized selection assistance.
- Detailed Chinese release notes: [0.55.0](docs/releases/0.55.0.zh-CN.md). Platform validation and redistribution review boundaries remain explicit.

## 0.53.1 — Secretary APIs and complete Plan discovery

- Give every native engine one authenticated Core API execution tool and focused command discovery, reusing existing role, workspace, membership and execution-permission boundaries.
- Return exact task IDs, revisions, roles, teams, rules, times and available actions from Plan; let Secretary inspect and maintain records whose employee was deleted without granting execution to missing or peer targets.
- Add revision-checked batch schedule deletion, full raw CLI argument forwarding and Secretary management of saved Plan views; keep legacy routes out of default discovery while retaining protocol compatibility.
- Preserve per-message source-view context, user-defined messaging categories and social-source navigation, employee profile tabs and shared-file navigation refinements.
- Document the GUI/API comparison and verify native tool execution with isolated protocol and loopback model fixtures.

## 0.53.0 — Shared workspaces and integrated messaging

- Show labelled Add Team / Add Employee actions only in Company; restore private chats, groups and channels from one Archived chats list.
- Persist group/channel uploads under their named shared folder; send one text-only file notice with the original user message. Keep each employee’s named work folder and personal Workspace available through authenticated CLI/API operations.
- Keep user originals and peer outputs read-only through the shared file API; support explicit copies without silently moving workspaces or native sessions.
- Include deliberate group publishing, finite awareness delivery and independent private/shared unread state.
- Integrate employee/external-process channel engines, connection settings and avatars, plus channel/post layouts.
- Retain the Core modularization and message query worker; bundle Margin Reader 0.9.1, MiniNotion 1.22.1 and Cloud Hosts 1.2.2 from the current source.

## 0.50.13 — Shared views and group conversations

- Make Company Views return directly to All Team before opening its menu; use the same button sizing and styling as Messages.
- Share exact private-message read receipts across Messages, workspaces and the Company canvas, including late-loaded replies and view changes.
- Add user-managed groups with Team import, editable cross-Team membership, explicit mentions/all-member routing into existing employee queues, concise authenticated publishing, durable history and delivery receipts.
- Expose shared view discovery/navigation and all group actions through the same authenticated CLI/Core APIs; keep employee roles, bindings, private histories and workspaces unchanged.

## 0.50.8 — Team selection and bilingual introduction

- Show only the current view's teams when adding an employee; All Team continues to show the full roster.
- Clear an open form's invalid selection after a team is deleted, renamed, or removed from the view. Keep other draft fields intact.
- Remove deleted team references from the employee creation template and update them when a team is renamed.
- Add a complete English README, language-switch links, and a Fate character introduction in both languages.

## 0.50.7 — Exact character creation for Managers and Governors

- Add `avatar.list` catalog discovery and explicit `character`, `avatarStyle`, and `profession` creation parameters, separate from `managementRole`.
- Expose actual appearance metadata in employee status and add the scoped `card.avatar` operation. Unknown or ambiguous characters fail instead of becoming a default animal.
- Update both supervisor handbooks and machine-readable creation metadata. Managers retain own-team scope; Governors retain cross-team Employee/Manager creation.
- Fix `card create --thinking off` parsing and validate the Core boolean parameter.
- Verify all 57 selectable appearances through both supervisor roles, plus five real named-character creations by fresh Claude Code Managers and a Governor using DeepSeek Flash with thinking off.

## 0.50.6 — Selected Fate Masters

- Add Shirou Emiya, Rin Tohsaka, Sakura Matou, Illyasviel von Einzbern, Kiritsugu Emiya, Kirei Kotomine and Waver Velvet in original-series-inspired and cute companion styles.
- Reuse the existing eight-frame animation player and flat picker. The collection now has 42 Fate appearances and 57 selectable companions in total.
- Preserve the existing Servant artwork and all employee identities, engines and positions.

## 0.50.5 — Fate companion appearances

- Add 14 Servants from Fate/stay night and Fate/Zero in two generated fan-art styles each: original-series-inspired proportions and cute companion proportions.
- Put all 28 appearances in the existing flat picker, with no added categories; preserve prior companions and saved identities.
- Use eight authored frames per skin for attentive, typing, greeting and rest states. Actual employee activity controls the displayed state; picker previews remain lightweight and respect reduced motion.
- Add Core selection/save, image/alpha, animation and identity-preservation checks in isolated hidden windows.

## 0.50.4 — Cloud hiring and navigation

- Reuse Core target validation in the employee form: Pi/Cline Local Workers can use Cloud Team workspaces through Tunnel. Cloud-native/plugin targets remain unsupported.
- Remove Clawd from the picker; preserve the other 15 choices and saved employee identities.
- Load lossless six-frame picker strips while keeping original-resolution animation pixels.
- Reuse exact routes across view switches and stable scene children during panning; avoid forced layout on non-zoom wheel input.
- Pause only obscured canvas playback and reuse unchanged dropdown, plugin and conversation block data. Execution and scheduling are unchanged.

## 0.50.3 — Cline and Pi support

- Add real Cline ACP and Pi RPC adapters with shared Core/CLI messaging, tool approvals, queues, cancellation and native session continuation. These adapters currently execute text tasks in Core-local Build workspaces, including locally running Cloud Team Managers.
- Default DeepSeek integrations in Claude Code, Cline and Pi to DeepSeek Flash with thinking off. Install Cline/Pi from checksum-pinned official packages into user-managed Core storage.
- Preserve empty Cline sessions correctly across a close/reopen before the first message, and fix native session ID validation during cleanup.
- Fix employee engines at creation. Existing employees display their engine read-only; changing engines requires deleting the employee and creating a new one.
- Render all four engine marks as complete inline SVGs in both light and dark themes. Preserve 34 companion choices, restore the six saved community characters, and include Clawd in the Claude collection.
- Show real ongoing delegated tasks as green collaboration lines, keep participants awake, and replace the README cover with the approved four-engine collaboration capture.
- Align the three sidebar tools with equal sizes and spacing. Apply ad-hoc signing to local macOS candidates and verify their normal LaunchServices startup.


## 0.49.8

- Show only genuine in-flight message/control requests and reply subscriptions; remove query pulses and completed-call linger.
- Keep communication participants awake without changing engine busy state.
- Route badge-side siblings through short shared corridors and synchronize shared flow animation.

## 0.49.7

- Use a round Kali icon and a consistent, larger 64px system-icon frame; rebalance the header without changing Team geometry.

## 0.49.6

- Keep active arrow tips at their actual receiving endpoint; fit arrowheads within short incoming segments.
- Display the Apple macOS mark for teams hosted on a Mac and the official Kali dragon for Kali Linux hosts.

## 0.49.5

- Align Governor, Manager and Employee in the same badge header and clarify engine and unread indicators with descriptive tooltips.

## 0.49.4

- Restore directional arrowheads on active management lines with a fixed open chevron and flowing dashed body; preserve route geometry and employee placement.

## 0.49.3

- Use the current application icon in the company header, browser login and favicon, all from the same source artwork.
- Add the public GitHub URL to every promotional image and refresh the shared cover.

## 0.49.2

- Refine active management-line endpoints: compact connection ports with a steady terminal lead, while the line body continues to flow. Avoid overlapping triangle and dashed stroke shapes; keep canonical paths, editing and employee layout unchanged.
- Add isolated visual checks at overview, normal and enlarged canvas zooms.

## 0.49.1

- Management activity is tracked per sender/recipient; rapid notifications and completed Manager turns no longer erase other delivery pulses. Active links are thicker, directional flowing dashes with reduced-motion support.
- Added explicit, potentially billed engine probes, user-managed SDK loading, and joint checksum-verified Claude controller/native installation. Public artifacts exclude vendor runtimes.
- Replaced unverified artwork with MIT-licensed companions and original integration icons; retained legacy avatar IDs.
- Added privacy-aware fresh-frame screenshot export and expired-session detection on browser reconnection.
- Added matching upstream editor source for the GPL distribution and kept all plugin sources in the release tree.


## 0.49.0 — open-source release candidate

The first public-source candidate preserves the illustrated office, company roles, CLI-first control, local/SSH workspaces and existing data bindings. No repository or binary is published automatically.

### Added

- A browser frontend over the same Node Core, authenticated HTTP calls and a persistent WebSocket event stream.
- Independent client navigation, selected Team view and camera; shared Team/employee geometry.
- Browser upload/download, server-directory selection and view-scoped plugin gateways with save acknowledgement.
- A presentation-only Electron shell for a remote Web Core.
- Internal Codex and Claude Agent runtime adapters, capability discovery and dynamic executable selection.
- Verified, pinned native engine downloads, configuration and supported device/API-key authentication.
- Full source and packaged runtime/UI for Cloud Hosts, MiniNotion and Margin Reader.
- Portable plugin workspace defaults, standalone server packaging and platform-specific desktop targets.
- Windows IPC, launcher and ConPTY adapters; platform-specific strict-isolation failures remain explicit.
- Reproducible-source checks, separate test suites and CI definitions for macOS, Windows and Linux.

### Reliability and compatibility

- Core acquires data-directory ownership before startup migration.
- Atomic state/history writes preserve recoverable copies and report corruption.
- Existing permission choices are preserved. New employees default to Ask; Full access is explicit.
- Network mutation request IDs prevent duplicate execution within the retained retry window.
- Logout/revocation closes active Web and plugin subscriptions.
- Engine switching retains employee identity, visible history and archived native references. Native context cannot be assumed interchangeable across engines.
- Existing orthogonal geometry reuse, coalesced refreshes and render memoization remain covered by regression tests.

### Release limitations

This is a single-owner self-hosted product, not a multi-tenant service. Strict execution isolation currently has a macOS implementation; unsupported targets fail closed. Engine capabilities vary by installed version and provider. Consult the recorded test results rather than assuming that a build verifies every platform.

Public redistribution remains subject to the evidence-based reviews in `LICENSING.md` and `licenses/release-review.json`. Candidate packaging does not waive artwork, plugin or vendor runtime terms.

## Before 0.49.0

The prior local development series introduced company roles, Work/Build/Cloud execution, CLI plugins, hidden supervisor initialization, task scheduling, unread replies, Team views, editable orthogonal connections and performance improvements. Its development history is preserved; unverified historical claims are not retroactively presented as release certification.
