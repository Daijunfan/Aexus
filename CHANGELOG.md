# Changelog

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
