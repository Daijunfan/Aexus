# Deployment

## Supported deployment cases

1. Mac desktop with a local Core (Apple Silicon release package; primary development/test machine).
2. Windows x64 desktop with a local Core.
3. Linux x64 Core/Web backend, operated from another computer’s browser.

Linux native desktop is outside this release. Source setup on Linux installs the backend/plugin toolchain without downloading a native Electron shell. The shared Core still supports local and SSH execution environments.

## Runtime boundary

One Node Core owns one data directory. The same React office runs in Electron or a browser. In Web mode, “local” means the Core host, not the computer displaying the page. An employee's working directory, engine installation and credentials are resolved on its execution host.

The first release is a single-owner, self-hosted system with multiple browser clients. It does not provide separate human tenants or collaborative document editing guarantees. Team geometry is shared; each browser tab has its own active view, camera and navigation.

## Source setup

Use a supported Node.js version satisfying `package.json` (22.18 or newer; Node 24 is the tested server baseline), npm, and Git. SSH workflows additionally need Python and OpenSSH. Windows local terminals use the optional node-pty/ConPTY runtime. Strict process isolation has a separate platform capability; see `SECURITY.md`.

```sh
npm ci
npm run setup
npm run build:plugins
npm run build:server
npm run build:web
```

The source distribution includes Cloud Hosts, MiniNotion and Margin Reader. `plugins.lock.json` pins the required plugin versions. Missing plugin source fails the build; it is never silently omitted.

## Mac and Windows desktop

```sh
npm run dev
# Private local candidate, retaining valid existing development workspaces:
npm run app
```

The native desktop still uses its local Core/IPC and existing data. Public distribution commands run the redistribution gate before packaging. macOS install uses the existing `npm run install:mac -- --source /path/to/Agents\ Company.app` installer only after the old application is fully stopped.

A native desktop shell can also connect to a remote authenticated Web Core:

```sh
AGENTS_COMPANY_WEB_URL=https://agents.example.net /path/to/Agents\ Company
```

This mode does not start another local Core or expose local filesystem/operator APIs to the remote page. It retains only a narrow presentation/save-before-close bridge. The same Web authentication is required.

## Standalone server archive

`npm run release:server` builds a platform-specific archive containing the Node Core,
Web frontend, open-source runtime dependencies and all three plugins. Public packaging enforces
`licenses/release-review.json`. Until those reviews are complete, maintainers can
make a private validation candidate with `npm run release:server -- --development`.
Build on the target operating system and architecture; Node itself is not bundled.

Extract the archive on a machine with supported Node, change into its directory,
and run `node bin/agents serve --web --port 5151`. No source checkout, compiler or
Electron window is required. Vendor Coding Agent SDK/program downloads and provider authentication remain
explicit setup actions; they are not bundled in this archive. Publish the matching complete source archive alongside an
approved binary distribution. Both archives have SHA-256 sidecars.

## Remote desktops in the Cloud Hosts plugin

The browser's VNC display connects through an authenticated, view-scoped WebSocket
relay on the public Core origin. Only an existing Core-created desktop connection
can become a relay target; there is no arbitrary proxy URL. Logout or closing the
plugin revokes the viewing ticket. Keyboard/mouse remain subject to the VNC session.

RDP continues to use an operating-system client. In Web mode the plugin offers the
`.rdp` file and explains which network its address belongs to; it does not silently
launch a desktop client on the backend server. A backend loopback RDP endpoint needs
an explicit client-side SSH forward before that profile can be opened locally.

## Local browser

Do not run two Cores against the same data directory. Stop the local desktop first, or select a separate directory:

```sh
AGENTS_COMPANY_HOME="$HOME/AgentsCompany-web" node bin/agents serve --web --port 5151
AGENTS_COMPANY_HOME="$HOME/AgentsCompany-web" node bin/agents web token
```

Open `http://127.0.0.1:5151`. Enter the token shown by the second command. It is exchanged for an HttpOnly browser session; it is not stored in localStorage. Engine installation is available in Settings and uses the Core host. Downloading does not authenticate a model account or provide inference credits.

## Linux server + another computer

An SSH tunnel is the smallest deployment:

```sh
# Server
AGENTS_COMPANY_HOME=/home/agents/.local/share/agents-company node bin/agents serve --web --port 5151
# Client; keep this SSH connection open
ssh -L 5151:127.0.0.1:5151 user@server
```

Then open `http://127.0.0.1:5151` on the client. This preserves the configured origin. The server process should run as an unprivileged account with access only to the intended repositories and credentials. Closing the browser does not stop that server's tasks; stopping Core does cancel its managed processes according to the existing scheduler lifecycle.

For an HTTPS reverse proxy:

```sh
node bin/agents serve --web --host 127.0.0.1 --port 5151 --public-url https://agents.example.net
```

Preserve the browser Host header. Example Caddy configuration:

```caddy
agents.example.net {
    reverse_proxy 127.0.0.1:5151
}
```

Do not expose the backend port directly. WebSocket upgrades and streaming responses must pass through the proxy. An explicit `--allow-insecure` switch exists for an isolated private test network only; it is not a recommended public deployment.

Example systemd unit is in `docs/deploy/agents-company.service`. Adjust the service account, installation directory and environment. No scheduler or user credentials are bundled into the source or server archives.

## Remote CLI

```sh
export AGENTS_COMPANY_URL=https://agents.example.net
export AGENTS_COMPANY_TOKEN_FILE=/secure/path/to/server-token
node bin/agents status --json
```

A local control token is never automatically sent to an arbitrary remote host. The selected remote credential must be explicit. To direct a user UI command to one attached browser, set `AGENTS_COMPANY_CLIENT` to its `system.info.clientId`. Ordinary employee tokens cannot choose another browser's identity.

## Files, plugins and save behavior

Browser uploads transfer bytes into the selected backend/SSH workspace. A browser-local path is never treated as a server path. Downloads are streamed with a specific file version. Directory selection explicitly browses the Core host.

Plugin backend runtimes stay on the server. Their UI is presented through view-scoped, opaque-origin sandboxed iframes and a fixed-target gateway; loopback plugin URLs are not handed to a different machine's browser. Plugin RPC passes through the authenticated parent Core channel; direct POSTs to plugin page URLs are rejected. Core requests are capped at 64 MiB, with smaller chunk limits for file transfers. Logging out revokes streams and removes browser plugin windows. Closing a plugin waits for its save acknowledgement. A plugin that does not acknowledge remains open with an error.

Desktop native file selection, windows and screenshots keep their existing implementation. Browser presentation uses in-page windows and a server-directory picker. Native desktop capture is not falsely advertised for a server that has no desktop. CLI business APIs remain independent of these presentation capabilities.

## Storage and recovery

`AGENTS_COMPANY_HOME` owns company state, control credentials, client view settings, engine-managed binaries and histories. New release plugin workspaces default to its `workspaces/` directory. Existing Team directory bindings are preserved, including valid older development paths. Packaged plugins never require the original developer's source path.

Keep one Core per data directory. `runtime.lock` is acquired before migration. If a process crashes, a provably dead local PID can be recovered; do not remove a lock belonging to another machine or a live process. Do not share an actively written data directory over a network filesystem.

Transcript writes are atomic and retain a `.previous` copy. Corruption is reported rather than silently replaced by an empty conversation. Stop Core, preserve both copies, validate the previous JSON and deliberately restore it; never guess or overwrite active data.

Back up company state, plugin/work directories, native engine profiles and encryption keys together using an appropriate protected backup procedure. An application upgrade is not a workspace migration. Record the application version before restoring a backup.

## Support matrix

Platform support is tested in layers: pure Core/CLI, real engine protocol, PTY, browser UI, then native packaging. CI definitions are provided for macOS, Linux and Windows. A green matrix must be observed before publishing a platform as verified. macOS-only strict isolation is intentionally not represented as Windows/Linux isolation. Remote-engine availability depends on the selected host, engine version, authentication and protocol capabilities, not the browser OS.

For the systemd example, provision both writable directories for the service account before starting it:

```sh
sudo install -d -o agents -g agents /var/lib/agents-company /var/lib/agents-company-projects
```

Build Team projects are deliberately outside the private Core state directory; the template sets `AGENTS_COMPANY_PROJECTS=/var/lib/agents-company-projects`. Plugin Work spaces remain in their dedicated managed data subtree.

