# Security policy

Avalon can execute code, change files and operate registered remote hosts. Deploy it as an authenticated, single-owner development system. It is not a hardened multi-tenant service and does not isolate mutually untrusted people sharing one Core instance.

## Reporting

Do not include credentials, customer data, private hostnames, real transcripts or exploitable production details in public issues. Use [GitHub private vulnerability reporting](https://github.com/Daijunfan/Avalon/security/advisories) to send sensitive reports to the repository maintainers. Private vulnerability reporting is enabled. Please include affected versions, a minimal reproduction and impact without exposing third-party credentials.

## Trust boundaries

- Core authenticates the user and each employee separately. Team membership, role, initialization state and current authorization are checked by Core. Visible connection lines do not grant authority.
- Secretary is the highest Agent application-administration role. The user alone appoints, demotes or deletes Secretaries; the user or Secretary may manage Governor lifecycles. Secretary keeps its Agent principal, never the operator control token. Human read receipts, identity credentials and UI impersonation remain user-only.
- Trusted execution has the operating-system account's real privileges. API checks do not constrain arbitrary filesystem or shell access under that identity. Use restricted users, containers or the supported strict isolation profile when required.
- Strict local isolation currently uses the macOS sandbox adapter. Other targets fail closed when strict isolation is requested; they are not silently downgraded to Trusted. Linux/Windows operating-system isolation is not advertised as equivalent.
- Plugin view RPC retains the authenticated creator and rechecks current credentials, role and workspace access on each call; it does not replace an Agent with the operator. Plugin backend code is trusted executable code. The current backend interface is not a sandbox for malicious third-party plugins. Install only reviewed plugins. Web plugin renderers have opaque-origin sandboxed iframes. RPC uses a MessagePort to the authenticated parent, then the same Core authorization; the server binds a view to its session, client, plugin and workspace. Direct RPC to a view URL is rejected. View URLs grant read access to that view’s resources while its session is valid, so keep them private. This is distinct from a backend-code sandbox.
- Model/API credentials are stored only on the Core/execution host. Stored provider keys and SSH passwords use authenticated encryption with a separate local key file. Anyone who can read both files or control that OS account can decrypt them. Protect the data directory and backups accordingly.

## Network deployment

Keep the service on loopback by default. For remote use, use HTTPS with a reverse proxy or an SSH tunnel. Non-loopback plaintext HTTP requires an explicit private-test-network override. Never expose it as a public unauthenticated service.

Preserve the original Host/Origin headers at the reverse proxy and set the configured public origin exactly. Web sessions use HttpOnly/SameSite cookies, CSRF validation and an authenticated event stream. Do not place the operator token in a URL, bookmark, screenshot or log. `agents web token` intentionally prints it only in the local user's terminal.

Installers download fixed native engine releases from the official package registry and verify committed SHA-512 integrity before safe extraction. They do not execute package install scripts, accept arbitrary package URLs, change global PATH, or overwrite running engine programs. Review updates to `engine-downloads.json` as executable supply-chain changes.

## Data and logs

Workspaces and native histories may contain sensitive information. Diagnostic tests run in separate temporary data directories. Never test deletion against production employees. Source archives exclude runtime workspaces, credentials, browser profiles and private Git repositories; run an independent secret/history scan before public release.

A completed upload is atomically committed and never overwrites an existing file. If a network connection is interrupted during a mutation, query the result before repeating the action. A lost connection is not proof that an external operation did not happen.

## Dependency and release review

Run `npm audit`, review the affected runtime path, and document remaining issues rather than treating a successful build as a security review. Run `npm run release:check`; unresolved redistribution checks intentionally block public packaging. See `LICENSING.md`.

Media playback uses file-scoped, client-owned, expiring preview IDs, never the Core
control token in a URL. HTTP media requires the authenticated issuing session and
normal Origin/Host checks; logout closes active streams. Desktop uses a CSP-limited
custom stream protocol backed by the same authenticated Core reads. A preview cannot
change its file/workspace, and each chunk rechecks its version. Media containers are
sniffed before issuing a preview; client codecs may still reject unsupported encodings.

The client authentication transition also stops and clears already buffered media, clears
the in-memory audio queue, and removes its Media Session metadata. A temporary transport
reconnect does not count as logout. Queued audio is a local presentation list; it cannot
change a file scope, confer authority, or dispatch an employee task.
