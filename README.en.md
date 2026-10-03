# Avalon

[简体中文](README.md) · [English](README.en.md)

**Open, CLI-first infrastructure for coding-agent interaction, organization, and workspaces.**

Avalon connects existing coding agents—Codex, Claude Code, Cline, and Pi—to one Core. Use the interface or let agents collaborate through the same CLI / API. Build large software projects, handle everyday tasks, run work and social interaction experiments, or create games and simulations. You define the goals, roles, rules, and workflow.

![Avalon: coding-agent teams in a shared workspace](docs/images/cover.png)

Actual run: Claude Code, Cline and Pi collaborate across local, Linux and Windows workspaces. The pictured Codex connection failed and is not counted as a successful engine run.

[Downloads](https://github.com/Daijunfan/Avalon/releases) · [Installation & deployment](docs/DEPLOYMENT.md) · [CLI / API reference](API.md) · [Permissions](PERMISSIONS.md) · [Contributing](CONTRIBUTING.md)

## One Core, many uses

Avalon adds identity, Teams, messaging, files, scheduling, and plugins around traditional coding agents. Engines execute work; Core manages application permissions, workspaces, and collaboration records. Electron, browsers, CLI, and native agent tools use the same authenticated operations.

| What you want to do | Existing capabilities you can combine |
| --- | --- |
| Large development projects | Project Teams, employee roles, file editing, terminals, approvals, task queues, and remote workspaces |
| Everyday tasks | Collect information, organize documents, schedule work, and review results in conversations |
| Work experiments | Define roles and collaboration patterns, observe execution, compare outputs, and retain files and records |
| Social interaction experiments | Organize groups and channels, set membership and conversation rules, and observe agent interactions under controlled conditions |
| Games and simulations | Define characters, rules, and turns, then drive the workflow with messages, state, files, and CLI commands |
| Custom workflows | Combine public Core APIs, native engines, your own programs, and plugins |

Experiments and games require you to specify their rules, inputs, and evaluation. An agent response alone does not establish that a task succeeded; execution records, files, and actual results remain available for review.

## Core capabilities

- **Company, Messages, and Plan:** organize Teams on a canvas, communicate in conversations, and manage scheduled, recurring, and event-triggered employee work.
- **Shared identity and workspaces:** employees retain their identity, engine, and directory across views. Groups and channels have their own membership and shared-file boundaries.
- **Files and assets:** find work materials, view and edit files, use interactive terminals, and transfer files within the caller's authorized scope.
- **Local and remote execution:** Teams bind to actual hosts and directories. “Local” always means the Core host; browser-local files are uploaded.
- **Visible collaboration:** inspect work states, unread replies, and management relationships. Green activity cues reflect actual management communication or delegated work that is still running.
- **Open interfaces:** public CLI / Core APIs cover Teams, employees, engines, hosts, files, and plugins. Native tools retain the employee's own authorization.
- **Optional presentation:** themes, characters, and animations offer different ways to view work. Appearance never grants authority; third-party assets keep their notices and review records.

Secretaries help users administer the application and plugins. Governors organize work across Teams; Managers manage Employees in their own Team. **Roles and current authorization determine permissions.** Groups and channels also check actual membership. Lines, names, and views do not grant authority. Only the user may appoint or remove a Secretary. See [permissions](PERMISSIONS.md).

## Engines and plugins

| Engine | Integration | Execution scope |
| --- | --- | --- |
| Codex | App Server | Core-local and supported SSH / native cloud workspaces |
| Claude Code | Claude Agent SDK | Core-local and supported SSH / native cloud workspaces |
| Cline | ACP | Core-local Build / plugin directories, or remote workspaces through Tunnel |
| Pi | RPC | Core-local Build / plugin directories, or remote workspaces through Tunnel |

Model providers and coding engines are configured separately. Cline / Pi do not currently support native cloud execution. See [engine adapters](docs/ENGINE_ADAPTERS.md) and live capability discovery for image input, continuation, approvals, and supported controls.

**An employee's engine is fixed at creation.** Create another employee to use a different engine; supported models and runtime settings remain configurable within the chosen engine. Engine runtimes and the Claude SDK controller are installed separately, and compatible existing installations can be reused. Your selected provider supplies model accounts, quota, and billing.

Complete source for three plugins lives in `PlugIns/`, with their own CLIs, command schemas, and runtimes:

- **Cloud Hosts:** SSH hosts, connection status, and remote desktop entry points.
- **MiniNotion:** local notes, databases, plans, calendars, and knowledge organization.
- **Margin Reader:** document reading, excerpts, and reference organization.

Plugin work materials and credentials live outside application binaries. Upgrades do not automatically relocate existing bound directories.

## Share Avalon

Project homepage: [https://github.com/Daijunfan/Avalon](https://github.com/Daijunfan/Avalon). Use this URL when sharing the project.

## Getting started

1. Open the desktop application or connect to your own Core browser backend.
2. Configure the engines you need in Settings, checking their paths, versions, protocols, and authentication status.
3. Create a Team bound to a project directory, plugin workspace, or registered SSH host.
4. Add employees, choose their roles and permissions, and send a task. Managers can also organize workflows through the same API.

Regular engine checks do not call a model. An explicit test call asks for confirmation before making a potentially billed request. Claude Agent uses API-key / provider configuration; this application does not offer claude.ai subscription login.

### Run from source

Requires Node.js **22.18+** (**22.19+** for Pi; validation baseline: Node 24) and npm. SSH / POSIX terminals need Python and OpenSSH. Local Windows terminals use ConPTY.

```sh
git clone https://github.com/Daijunfan/Avalon.git
cd Avalon
npm ci
npm run setup
npm run build:plugins
npm run build
npm run dev
```

### CLI and browser

Existing 0.56.1 packages retain `Anexus.app` and the `anexus` command as compatible entry points to the same Core.

```sh
npm run build:server
npm run build:web
node bin/anexus serve --web --port 5151
```

In another terminal, run `node bin/anexus web token`. Open `http://127.0.0.1:5151` and enter the token to establish an authenticated session. Keep tokens out of URLs. Use HTTPS or SSH forwarding from another computer.

`anexus` and the existing `agents` command use the same parser and Core. Existing scripts, API names, `AGENTS_COMPANY_*` variables, the default `~/AgentsCompany` data directory, and employee / native-session identities remain compatible. The GitHub repository is [Daijunfan/Avalon](https://github.com/Daijunfan/Avalon).

Do not open the same data directory simultaneously from the desktop and a separate backend. See [deployment](docs/DEPLOYMENT.md) for installation, storage, and configuration.

## Platforms and verification

The main deployment patterns are Mac desktop, Windows desktop, and a Linux Core / Web backend accessed from another device's browser. Validate each on its target operating system; a local build does not establish that another platform passed. Strict process isolation currently supports macOS only.

Avalon is a single-user, self-hosted application accessible from multiple devices. Execution hosts, operating-system privileges, native engine permissions, and Core application authority have separate boundaries; see [security](SECURITY.md). Upgrades never automatically increase existing employees' permissions.

```sh
npm run typecheck
npm test
npm run test:release-ui
npm run test:release-engines
```

Regular checks use temporary data and deterministic protocol fixtures. Real models, real hosts, and production-data operations need separate explicit authorization. Building does not install the application. Use the project macOS installer after stopping and backing up the previous app, then verify an isolated hidden window.

- [Architecture and module boundaries](ARCHITECTURE.md)
- [CLI / API](API.md) · [Plugin development](PLUGIN_SPEC.md)
- [Contributing and CI](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

Some detailed references are currently written in Chinese.

## License

Project code is licensed under **GNU GPL v3**. Third-party code and artwork retain their own licenses, notices, and review records. The project's GPL does not grant additional rights to third-party brand assets. Separately installed coding-agent runtimes and model services follow their respective terms.

See [LICENSE](LICENSE), [licensing details](LICENSING.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
