# CloudHosts for Windows and macOS

This is the CloudHosts tool in Toolbox (not VMLab). Both systems use the
same HTML UI, host registry schema, station logic and HTTP/WebSocket service.

## Build

On the Mac developer machine:

```sh
cd /Users/djf/develop/CS/Toolbox/CloudHosts
npm ci && npm test && npm run build
# Download official node-v24.16.0-win-x64.zip and SHASUMS256.txt
# to artifacts/windows-runtime/ before packaging.
python3 Windows/build.py
```

The Windows build uses a SHA-256 verified portable Node.js executable, copies
the WebView2 .NET Framework assemblies/loader from Toolbox's FileTransfer
SDK cache, and produces the shared Windows icon from the Mac icon artwork.

On a physical Windows x64 computer with the .NET Framework compiler:

```bat
build.cmd
CloudHosts.exe
```

The script builds `CloudHosts.exe` (WinForms + WebView2),
`CloudHostsSilentService.exe` (no-console background launcher), `backend\\Windows\\RdpCredentials.exe` (Windows Credential Manager) and
`backend\Windows\ConPtyTerminal.exe` (ConPTY, Windows GUI subsystem) directly. It does not require
a PowerShell execution-policy change. Windows needs an installed WebView2
Evergreen runtime and an SSH client on PATH. Target hosts need appropriate SSH
keys and host-key trust; Python 3 is needed for remote file-workspace operations.
The bundled Node runtime and Windows app are self-contained relative to the
folder, so distribute the *entire* build, not just the executable.

Keep the directory installed outside the user profile's CloudHosts data
directory (e.g. `%LOCALAPPDATA%\Programs\Toolbox Cloud Hosts\`). The
Windows settings/keys are kept in `%APPDATA%\Toolbox\CloudHosts\`. Closing
the GUI retains the background service and its live terminal sessions.

In the 2.8.2 installation, the per-user logon task
`Toolbox CloudHosts Backend` can launch `CloudHostsSilentService.exe` from the
installed application directory. This Windows GUI-subsystem helper starts the
same Node backend with a hidden console, without opening a CMD/PowerShell
window on login. It remains running after the CloudHosts GUI exits. Keep the
task under the interactive user, never SYSTEM; its HTTP API listens on localhost.

**Active-session-safe hotfix for the current physical DJF-Windows installation:**
The existing Node service and logon-task definition are left running until the
user's current terminal sessions finish. The installed ConPTY helper was
replaced with a validated `/target:winexe` build (same JSONL stdin/stdout
protocol, no visible console). The old executable was renamed as a rollback
backup, and the old UI index was augmented with the new `styled-select-hotfix.js`
and `styled-select-hotfix.css` assets without restarting Node. Three concurrent
new Windows terminal sessions passed real SSH input/output validation; three
pre-existing sessions were preserved. Do not change the task definition or
restart Node merely to remove the remaining startup console until active
sessions have drained.

The 2.8.3 release uses `windowsHide:true` for headless ConPTY,
SSH checks, Python file workers, and forwarded SSH tunnels. The Mac/Windows
UI uses a shared dropdown renderer whose original native `<select>` remains
available for FormData, validation and change events.

## Four-mode workspace and real SSH access

The top toolbar switches between **单机**, **终端看板**, **Agent 看板** and
**文件看板**. The agent board uses the target machine's installed Codex,
Claude Code, Cline or Pi CLI; the file board manages independent directory
tabs and 1–6 columns. Both are handled by the latest Node backend's
`hosts.workspace` RPC. When updating binaries, replace/restart the old Node
service as well, or it can reject these modes with `Invalid workspace layout`.

The Python SSH transport on Windows normalizes a configured
`UserKnownHostsFile` path to forward slashes without embedded JSON quotes.
Keep strict host-key verification enabled. The installed 2.8.3 backend passed
live SSH Agent CLI capability detection and remote Linux directory listing on
physical DJF-Windows through the user's already saved host connection.

## Directory download on Windows

The file station's **Download** action saves folders as ZIP archives. On
Windows the CloudHosts service calls the built-in .NET ZipFile API with UTF-8
names, preserving nested files, empty directories and Chinese filenames. The
Windows native Save dialog downloads the archive through the authenticated
localhost API to a temporary file, then atomically places the completed ZIP in
the selected location. Normal files retain their existing save behavior.

The 2.8.2 archive module has passed isolated Windows and real HTTP endpoint
tests without modifying the user's saved cloud host configuration.

## Copy Mac data to an existing Windows computer

Never overwrite Windows data directly or transplant running server PID files.

1. Run `python3 Windows/export_mac.py` on the Mac. Its timestamped zip includes
   the Mac host registry, workspaces, station, known-hosts and referenced SSH
   keys; nonpersistent server/process files are excluded.
2. Transfer the owner-only zip to the Windows account using an authenticated
   SSH/SFTP channel. Do not send the file over unencrypted file sharing.
3. Run `python migrate.py MacData.zip --dry-run` and check host and station
   counts; then run `python migrate.py MacData.zip`.
4. The importer verifies per-file SHA-256 digests, merges existing Windows
   hosts by ID/name, retains Windows-only hosts, restores Mac workspaces and
   station data, and keeps both a timestamped Windows rollback directory and
   an `ImportedMac\MacData` snapshot.
5. The importer requires successful owner-only Windows ACL updates for
   imported private keys. If that check fails, migration rolls back; do not
   ignore the error or weaken ACLs.
6. Verify all imported hosts and station files via the Windows UI/CLI, then
   remove the temporary transfer zip on Windows. Retain both backups until
   connection and data checks have passed.

The Windows RDP helper saves credentials in the per-user Windows Credential Manager.
Passwords travel through stdin/stdout, never command-line arguments or .rdp files.
Mac Keychain credentials cannot be imported by copying CloudHosts files; existing
Windows RDP logins must be re-entered before saving to the Windows credential vault.

## macOS hosts controlled from Windows

A registered macOS host supports SSH terminal, file browsing and system
information. Its desktop uses VNC forwarded through an SSH tunnel to
127.0.0.1:5900, so the VNC port should not be publicly exposed. On the target
Mac, enable **Remote Login** and **Screen Sharing** in System Settings →
General → Sharing, grant access only to trusted users, and add the Windows
client's public SSH key to the intended Mac account's authorized_keys after
verifying the fingerprint. Screen Sharing may require configuring compatible
VNC viewer authentication. The Windows endpoint must be able to route to the
Mac's SSH port; test SSH host-key trust first.

For Windows RDP targets, macOS ships an embedded Guacamole/FreeRDP engine.
The updated Windows source offers a CloudHosts-owned RDP ActiveX window over
CloudHosts' existing localhost SSH tunnel, with Windows Credential Manager
support and a fallback to mstsc.exe. Direct (non-SSH) RDP profiles still use
the system client. The pre-existing 2.8.0 Windows installation has not been
replaced with this updated source; the native ActiveX control and credential
helper **must still be compiled and tested on the physical Windows PC** before
cross-platform parity can be claimed. The earlier Windows installation passed
actual ConPTY input/ACK/output checks against GPU-server and a local PowerShell
regression; macOS Screen Sharing/VNC, native station interactions and GUI
acceptance remain outstanding.
