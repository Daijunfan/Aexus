# Agents Company

[简体中文](README.md) · [English](README.en.md)

**Turn AI agents scattered across terminals, chat windows, and remote machines into a team that works together.**

Give a Governor one instruction. Let Managers divide the work and employees execute it in their own project directories. See who is working, who is communicating, and where the results live—all in one interface.

![Agents Company: real collaboration between Codex, Claude Code, Cline, and Pi](docs/images/cover.png)

[Downloads](https://github.com/Daijunfan/Agents-Company/releases) · [Installation & deployment](docs/DEPLOYMENT.md) · [CLI / API reference](API.md) · [Permissions](PERMISSIONS.md) · [Contributing](CONTRIBUTING.md)

## Why Agents Company?

- **Less switching between agent windows.** Put Codex, Claude Code, Cline, and Pi on one canvas. Open any employee's conversation, files, and terminal directly.
- **Clear execution locations.** Teams bind to real environments, and employees inherit their workspaces. Failed remote connections report an error; tasks never silently move to the browser or another host.
- **Visible progress and collaboration.** Work states, unread replies, and actual management interactions appear on the canvas. Green animated lines represent active management communication or delegated tasks that are still running. They turn off when the activity ends.
- **Shared tools for coordination.** Governors manage across teams; Managers manage their own team's employees. Both use the same company API to assign, inspect, and schedule work.

## Features

| Capability | What you can do |
| --- | --- |
| Visual office | Move teams and employees, adjust connectors, change themes, and organize existing teams into custom views |
| Role-based collaboration | Coordinate across teams as a Governor; manage every Employee in your team as a Manager, regardless of who created them |
| Four Coding Agent engines | Use Codex App Server, Claude Agent SDK, Cline ACP, and Pi RPC; configure engines separately from model providers |
| Local and SSH workspaces | Run engines on the Core host, control remote workspaces from Core, or use supported native remote execution |
| Project workbench | Browse and edit files, use interactive terminals, attach supported images, and transfer files between workspaces |
| Tasks and history | Queue tasks, schedule work, handle approvals, restore conversations, and track unread replies |
| Desktop and browser | Use the same React interface and Node Core through Electron or a browser |
| CLI-first control | Access public CLI / Core APIs for teams, employees, engines, hosts, files, and plugins |
| Animated companions | Choose Fate Servants and selected Masters in two styles; specify characters, styles, and professions through the API |

Connections show creation relationships and actual interactions. **Roles determine authority.** A Manager or Governor can control an employee within their scope without a creation line. Only the user controls Governor creation, deletion, and role assignment.

## New: Fate / Holy Grail War characters

The collection includes **14 Servants** from **Fate/stay night** and **Fate/Zero**, plus **seven selected Masters**: Shirou Emiya, Rin Tohsaka, Sakura Matou, Illyasviel von Einzbern, Kiritsugu Emiya, Kirei Kotomine, and Waver Velvet. Every character comes in an **anime-inspired** and a **cute chibi** style—**42 Fate appearances** in the same character picker, including Saber, Archer, and Gilgamesh.

Animations follow the employee's actual work, communication, and rest states. These are newly drawn fan-art sprites. See the [asset notes](src/renderer/src/assets/pets/fate/README.md) for their styles, frame layouts, and provenance.

Managers and Governors can discover the catalog and choose an exact appearance, so an employee named Gilgamesh actually looks like Gilgamesh:

```sh
agents avatar list --query "Gilgamesh" --style chibi --json
agents card create --title "Gilgamesh" --group "Your Team" --character "Gilgamesh" --avatar-style chibi --profession "Code review" --management-role employee --engine claude --model deepseek-flash --thinking off --json
```

`character` selects the person, `avatarStyle` selects the appearance style, `profession` describes their work, and `managementRole` sets their company rank. Managers create Employees within their team. Governors can create Employees and Managers across teams. The employee creation form lists teams in the current view; switch to **All Team** to select from every team.

## Coding Agent engines

| Engine | Integration | Supported execution scope |
| --- | --- | --- |
| Codex | Official App Server protocol | Core-local workspaces and supported SSH / native cloud workspaces |
| Claude Code | Claude Agent SDK | Core-local workspaces and supported SSH / native cloud workspaces |
| Cline | Official CLI's ACP protocol | Core-local Build workspaces and Cloud Team workspaces through Tunnel |
| Pi | Official Coding Agent's RPC protocol | Core-local Build workspaces and Cloud Team workspaces through Tunnel |

Cline, Pi, and Claude Code configured for DeepSeek default to **DeepSeek Flash with thinking off**. Cline/Pi support streaming messages, tool approvals, task queues, cancellation, and native session continuation. Cline Flash supports image input; the Pi adapter currently accepts text only. See [engine adapters](docs/ENGINE_ADAPTERS.md) for model configuration and capability details.

Cline/Pi employees in a Cloud Team can use a Core-local engine to operate a remote workspace through Tunnel. Managers with a local workspace can also coordinate cloud employees through the company API. Cline/Pi do not currently support native cloud execution or plugin workspaces. The cover is an actual capture of all four engines participating in a local Mac workspace.

**An employee's engine is fixed at creation.** To use another engine, delete the employee and create a new one. Models and supported runtime settings can still be changed within the same engine.

## Three included plugins

- **Cloud Hosts:** manage SSH hosts, connection status, and remote desktop entry points.
- **MiniNotion:** organize local notes, databases, plans, calendars, and knowledge.
- **Margin Reader:** read documents, collect excerpts, and organize reference material.

Complete source for all three plugins lives in `PlugIns/`, including their independent CLIs, command schemas, and runtimes. Working documents, accounts, and credentials are excluded from the published source.

## Getting started

1. **Open the desktop app or connect to your backend.** The browser is the interface. “Local” always means the machine running Core.
2. **Configure an engine in Settings.** Check its executable path, version, protocol, and authentication status. If needed, install a checksum-verified official runtime and configure your own account or API key.
3. **Create a team and bind its environment.** Choose a project directory, a plugin workspace, or a registered SSH host.
4. **Add employees and send a task.** You can start with a Governor and ask it to create Managers and Employees for you.

Regular engine checks do not call a model. An explicit test call asks for confirmation before making a potentially billed request. Claude Agent uses API-key / provider configuration; this application does not provide claude.ai subscription login. Your selected provider supplies model access and billing.

Engine runtimes and the Claude SDK controller are installed separately after user confirmation, rather than bundled in public installers. Compatible existing installations can be reused. Model calls, SSH operations, and file changes occur on the actual execution host.

### Run from source

Requires Node.js **22.18+** (**22.19+** for Pi; validation baseline: Node 24) and npm. SSH / POSIX terminals require Python and OpenSSH. Local Windows terminals use ConPTY.

```sh
npm ci
npm run setup
npm run build:plugins
npm run build
npm run dev
```

### Run the browser backend

```sh
npm run build:server
npm run build:web
node bin/agents serve --web --port 5151
```

In another terminal, run `node bin/agents web token`. Open `http://127.0.0.1:5151` and enter that token to sign in. The token establishes an authenticated session; do not put it in the URL.

Use HTTPS or SSH forwarding for access from another computer. Do not open the same data directory simultaneously from the desktop app and a separate backend. See the [deployment guide](docs/DEPLOYMENT.md) for configuration, storage locations, and examples.

## Deployment options

| Setup | Description |
| --- | --- |
| Mac desktop | Primary development and everyday testing environment; current Mac packages target Apple Silicon |
| Windows desktop | Run the desktop, Core, engines, files, terminal, and plugins on Windows x64 |
| Linux backend + a browser on another computer | Run Core, tasks, and files on Linux x64; use a browser elsewhere. Disconnecting the browser does not stop backend tasks |

These are the three supported deployment patterns. Cloud Hosts manages SSH workspaces, with each team bound to an actual host and directory. Strict process isolation currently supports macOS only; unsupported platforms reject that mode instead of silently weakening it.

Agents Company is a **single-user, self-hosted application with access from multiple devices**. It does not isolate mutually untrusted tenants. New employees can use Ask, Workspace write, or Full access. Upgrading does not automatically increase existing employees' permissions.

## Development and verification

```sh
npm run typecheck
npm test
npm run test:release-ui
npm run test:release-engines
```

Regular Core / UI tests use temporary data and deterministic protocol fixtures. Tests involving real models or real cloud hosts are explicitly run separately. Do not test deletion against your actual workspaces.

- [Architecture and module boundaries](ARCHITECTURE.md)
- [Engine adapters and installation](docs/ENGINE_ADAPTERS.md)
- [Plugin development](PLUGIN_SPEC.md)
- [Contributing and CI](CONTRIBUTING.md)
- [Security and private reporting](SECURITY.md)
- [Changelog](CHANGELOG.md)

Some detailed reference documents are currently written in Chinese.

## License

Project code is licensed under **GNU GPL v3**. Third-party code and artwork retain their own licenses, notices, and review records; the project's GPL does not grant additional rights to brand assets. Corresponding source includes all plugins and the required upstream editor source. Separately installed Coding Agent runtimes and model services are governed by their respective terms.

See [LICENSE](LICENSE), [licensing details](LICENSING.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
