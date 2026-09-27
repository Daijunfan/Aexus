# Changelog

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
