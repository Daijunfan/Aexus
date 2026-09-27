# Coding Agent adapters

## Boundaries

Core owns employee identity, roles, Teams, queues, task delegation, initialization, transcripts and revocation. A Coding Agent remains an external execution engine. Its adapter translates supported public runtime operations/events; it does not grant permissions or create company employees through native subagent features.

The current registrations are Codex App Server and Claude Agent SDK. Model providers (including provider-specific Claude configurations) are independent of engine IDs. Switching providers does not create a new employee engine kind.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/shared/engines.ts` | Stable IDs, display metadata and supported capabilities |
| `src/main/engines/runtime.ts` | Runtime registry |
| `src/main/engines/contract.ts` | Session driver and Core callbacks |
| `codex-runtime.ts` / `claude-runtime.ts` | Original native lifecycle/event integrations |
| `claude-options.ts` | SDK-specific permission and execution options |
| `registry.ts` | Version/protocol/authentication checks, bounded cache/coalescing |
| `executable.ts` | Dynamic discovery of configured, managed or bundled binaries |
| `configuration.ts` | Public settings and encrypted provider credentials |
| `installer.ts` | Verified, pinned native program installation |
| `login.ts` | Supported official device authentication |
| `startup.ts` | Per-profile Codex startup-handshake coordination |

`sessions.ts` exposes the same company API and delegates send, steer, interrupt, close, settings and background-process handling through the driver. Raw compatibility events remain available; scheduler completion also receives a normalized result. Legacy native-history import/delete compatibility is still engine-specific. It must not become a dependency of role authorization.

The contract deliberately keeps the existing two runtime behaviors. Some compatibility metadata still references the current native session types. Adding a radically different engine may require extending those adapters; merely placing an executable on PATH is not a complete integration.

## Adding an engine

1. Add an explicit stable ID and capability definition. Do not use an unrestricted `string` that silently falls through to another engine.
2. Implement the driver using the engine's documented integration surface. Unsupported capabilities return an explicit error and should not be advertised in the UI.
3. Convert events to the project's public conversation/state model. Keep native session IDs private to the adapter and preserve their ownership/origin when archiving them.
4. Implement no-inference discovery/authentication checks on the actual execution host. Resolve binaries when used; installation should not require restarting Core.
5. Add protocol fixtures and lifecycle tests for completion, errors, cancellation, permissions, initialization and engine switching. Use an optional explicit live test for billed model calls.

A UI capability is the intersection of project authorization, adapter support, selected model capability and current session state. A missing engine is not a reason to escalate privileges or fall back to execution on a different machine.

## Switching

`card.update --data '{"engine":"…"}'` preserves employee ID, Team, role, directory, visible transcript and archived native references. The current task must be idle or explicitly stopped. Native contexts are not promised to migrate between different engines. Schedules pin their selected engine; after a switch, update the affected schedules deliberately rather than silently running them against another engine.

## Installation and authentication

`engine-downloads.json` contains the approved platform package, exact version, SHA-512 and native executable path. `scripts/update-engine-downloads.mjs` is an explicit maintainer operation against the official registry. Review the change and test the new version before release.

The application streams the fixed archive, validates the committed digest, rejects unsafe archive paths/links, and installs under its own data directory. Package lifecycle scripts and global PATH changes are not used. Cancellation leaves the previous working installation selected. An installation does not authenticate an account or grant inference credits.

Claude Agent uses allowed API-key/provider configuration; this application does not offer claude.ai subscription login. Codex uses its official device authorization. No check sends a hidden paid inference turn. “Authentication configured” is not a guarantee of current quota or provider availability.

## User-owned engine runtime installation

The public distribution contains the adapters, not the Claude Agent SDK/native runtime. SDK types are a development dependency only. `claude-sdk.ts` resolves an explicitly configured or managed SDK, then an existing development/global installation; compatible paired native programs are also detected. This keeps Codex and non-engine company/plugin operations available before any engine is installed.

The installer retrieves both the SDK controller and matching native executable from `engine-downloads.json`, verifies official npm origin and SHA-512, preserves their legal notices, and activates them only after both complete. Cancellation preserves the previous configuration. `engine.configure` optionally accepts an absolute `sdkPath`; hosted MiniNotion reuses the same user-owned SDK and executable through process-local discovery. Neither runtime bytes nor credentials are copied into public release artifacts.

`engine.check` reports executable/protocol/auth configuration without inference. `engine.probe --engine ID --confirm [--model ID]` is a separate, potentially billed OK-only call on the Core host, with a temporary directory and 45-second timeout. It does not create a company employee or a persistent native session.
