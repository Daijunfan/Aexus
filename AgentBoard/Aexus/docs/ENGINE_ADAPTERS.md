# Coding Agent adapters

## Boundaries

Core owns employee identity, roles, Teams, queues, task delegation, initialization, transcripts and revocation. A Coding Agent remains an external execution engine. Its adapter translates supported public runtime operations/events; it does not grant permissions or create company employees through native subagent features.

The current registrations are Codex App Server, Claude Agent SDK, Cline ACP and Pi RPC. Model providers (including provider-specific Claude configurations) are independent of engine IDs. Switching providers does not create a new employee engine kind.

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

The contract preserves the existing runtime behaviors. Some compatibility metadata still references the current native session types. Adding a radically different engine may require extending those adapters; merely placing an executable on PATH is not a complete integration.

## Adding an engine

1. Add an explicit stable ID and capability definition. Do not use an unrestricted `string` that silently falls through to another engine.
2. Implement the driver using the engine's documented integration surface. Unsupported capabilities return an explicit error and should not be advertised in the UI.
3. Convert events to the project's public conversation/state model. Keep native session IDs private to the adapter and preserve their ownership/origin when archiving them.
4. Implement no-inference discovery/authentication checks on the actual execution host. Resolve binaries when used; installation should not require restarting Core.
5. Add protocol fixtures and lifecycle tests for completion, errors, cancellation, permissions, initialization and fixed employee-engine identity. Use an optional explicit live test for billed model calls.

A UI capability is the intersection of project authorization, adapter support, selected model capability and current session state. A missing engine is not a reason to escalate privileges or fall back to execution on a different machine.

## Employee engine identity

An employee's engine is selected at creation and cannot be changed. To use another engine, explicitly delete the employee and create a new one. `card.update` rejects a different engine; legacy `config.engine` always rejects. Model and supported runtime settings remain configurable within the chosen engine. Existing histories and archived native references from older versions remain intact.

## Installation and authentication

`engine-downloads.json` contains the approved platform package, exact version, SHA-512 and native executable path. `scripts/update-engine-downloads.mjs` is an explicit maintainer operation against the official registry. Review the change and test the new version before release.

The application streams the fixed archive, validates the committed digest, rejects unsafe archive paths/links, and installs under its own data directory. Package lifecycle scripts and global PATH changes are not used. Cancellation leaves the previous working installation selected. An installation does not authenticate an account or grant inference credits.

Claude Agent uses allowed API-key/provider configuration; this application does not offer claude.ai subscription login. Codex uses its official device authorization. No check sends a hidden paid inference turn. “Authentication configured” is not a guarantee of current quota or provider availability.

## User-owned engine runtime installation

The public distribution contains the adapters, not the Claude Agent SDK/native runtime. SDK types are a development dependency only. `claude-sdk.ts` resolves an explicitly configured or managed SDK, then an existing development/global installation; compatible paired native programs are also detected. This keeps Codex and non-engine company/plugin operations available before any engine is installed.

The installer retrieves both the SDK controller and matching native executable from `engine-downloads.json`, verifies official npm origin and SHA-512, preserves their legal notices, and activates them only after both complete. Cancellation preserves the previous configuration. `engine.configure` optionally accepts an absolute `sdkPath`; hosted MiniNotion reuses the same user-owned SDK and executable through process-local discovery. Neither runtime bytes nor credentials are copied into public release artifacts.

`engine.check` reports executable/protocol/auth configuration without inference. `engine.probe --engine ID --confirm [--model ID]` is a separate, potentially billed OK-only call on the Core host, with a temporary directory and 45-second timeout. It does not create a company employee or a persistent native session.

## Cline ACP / Pi RPC

`cline-client.ts` and `pi-client.ts` own their documented subprocess protocols; their runtime modules normalize text/tool events through `session:agent` and use the existing Core lifecycle/approval/queue contracts. Task cooperation indicators therefore remain tied to actual delegated engine turns. `process-probe.ts` reuses those transports for isolated, explicit OK-only checks.

Cline 3.0.65 uses `CLINE_PROVIDER=deepseek`, `CLINE_MODEL=deepseek-flash`, `CLINE_API_KEY` and `--auto-approve false`; Core handles ACP permission requests. Pi 0.87.1 uses its official RPC JSONL protocol, `--thinking off`, `DEEPSEEK_API_KEY`, isolated `PI_CODING_AGENT_DIR` and a small explicit tool-permission extension connected to Core approvals. Auto-discovered Pi extensions are disabled. Neither adapter delegates company authority to native subagents.

Supported scope is Core-local Build, Work/plugin directories, or a Cloud Team workspace through the existing MCP Tunnel, with `kind:worker`. Work uses the same assigned directory, authenticated plugin launcher and Core permissions. Cline/Pi cloud-native processes remain unavailable; the creation UI offers an explicit switch to Core-local execution with the same cloud workspace. Text input, Cline Flash images, resume and task lifecycle are supported; unsupported controls are hidden or reject explicitly. CLI discovery may create a disposable native session but performs no model request. Native session data lives beneath the employee's private `agent-access` profile.

Actual request verification: DeepSeek Chat Completions documents `reasoning_effort: "none"` as Thinking off; Cline emits that value. Pi emits `thinking: {type: "disabled"}`. Do not infer Thinking off from absence of visible thought text.

### Cloud routing and Cline image compatibility

Cline receives an employee-bound MCP bridge through ACP and its private MCP settings, because 3.0.65 does not consume ACP `mcpServers`. A small stdio shim transports MCP JSON to the same private compatibility route; Core owns SSH, one-use tool approvals and cancellation. Closing a native request cancels its corresponding remote operation. Its private working directory/home prevents loading the operator's local project configuration in cloud mode. Built-in workspace tools are disabled, model-facing tool definitions are restricted to the five Tunnel tools, and Core independently rejects non-Tunnel permission requests even in Full access. Cline Plan permits remote reads only.

Pi disables built-in tools and context-file discovery in cloud mode. `pi-tunnel.ts` registers the same five tools using Pi's native extension interface. Its documented extension-UI RPC carries each request to a Core-owned MCP connection. Core requires a one-use approval matching the tool-call ID, name and arguments. Cancellation is sent through MCP before closing the connection. No failed operation is retried as a local command.

Cline 3.0.65 drops ACP images, and its packaged extension bootstrap cannot run without missing JavaScript dependencies. `cline-compat.ts` therefore projects Core-approved image references into native Chat Completions image content through an employee-private loopback relay. It forwards the native response stream and preserves model/Thinking parameters; it does not run another model turn. Image data and native history remain inside the employee profile and share its existing cleanup. A delivery acknowledgement prevents silently treating a dropped image as success. The private provider endpoint is restored when the session closes and recovered after a restart. No upstream binary, global configuration or package dependency is modified.

Creation-time `engine.capabilities` is read-only and available under the existing identity permission. The response declares workspace modes and employee kinds; it grants no management authority. `engine.inspect` uses each adapter's own metadata rather than falling through to Codex.

Focused verification: `node test/process-transport-test.mjs`, `node test/process-cloud-test.mjs`, and the existing process-engine/Core/UI tests. `test/process-engines-native-test.mjs` accepts optional `AGENTS_TEST_CLINE_BIN` and `AGENTS_TEST_PI_BIN`. It runs the installed executables against a deterministic loopback model and an SSH transport fixture, using temporary profiles and fake keys. It does not call paid models or real user hosts.

### Provider key ownership

Native Cline/Pi processes receive only their own configured provider credentials. A missing saved key fails explicitly instead of borrowing ANTHROPIC/OPENAI/DEEPSEEK environment values. Claude uses its separate native/Core provider configuration. Core validates custom endpoints and model IDs as before; the compatibility relay pins the Cline Authorization header. Tests use distinct dummy keys and a loopback receiver, never actual paid requests.
