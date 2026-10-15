# CloudHosts cross-platform acceptance ledger

Date: 2026-10-11
Candidate: 2.8.1-rc.1
Status: **INCOMPLETE**. Automated checks are not a substitute for physical Windows/Mac acceptance.

## Verified in this source checkout

- Node.js: 34/34 (npm test).
- macOS native WKWebView board geometry, row resizing, persistence, selectors for 1–6 columns: 19/19 (npm run test:board-native).
- Windows-WebView2 simulated RDP browser-to-native bridge lifecycle and system fallback, executed in WKWebView with mock platform objects: 9/9 (npm run test:rdp-native-ui). This does **not** exercise Windows ActiveX or an RDP server.
- Python: 3/3 (python3 -m unittest discover -s tests -p test_*.py).
- Native macOS terminal input regression: npm run test:native passed.
- Windows 2.8.1-rc.1 payload assembled by python3 Windows/build.py and passed ZIP CRC validation, containing native source, credential helper and ConPTY compiler inputs. Compilation on Windows is still required.

## New implementation

- Windows Credential Manager helper (generic per-user credentials, GUID-scoped, JSON over stdin/stdout): Windows/RdpCredentials.cs, src/rdp-credentials.cjs.
- CloudHosts-owned RDP ActiveX window over an established local SSH tunnel, native bridge validates the host/session with the local backend; system-client fallback remains: Windows/NativeRdp.cs, Windows/NativeRdpBridge.cs, Windows/CloudHostsApp.cs, ui/desktop.js.
- Windows C# compilation and release packaging wired into Windows/build.cmd, Windows/build.ps1, Windows/build.py.
- Regression suites added for platform credentials and native UI bridge.

## Outstanding actual acceptance

- Mac RC application build created application resources, then **failed signing** because the configured local signing item could not be found in Keychain. Do not replace /Applications/云主机.app with this unsigned candidate. Existing Mac 2.8.0 remains installed.
- Windows physical machine continues with previously installed 2.8.0. **No Windows native RDP ActiveX compilation or login/keyboard/mouse validation for 2.8.1-rc.1**. Do not replace the installed version until validated with rollback.
- Physical Mac Remote Login (SSH/22) and Screen Sharing (VNC/5900) require authorized system configuration; Windows-to-Mac terminal/desktop interaction has not passed.
- Full Mac-to-Windows data import (14 source hosts, 2 boards, 2 station items) previously rolled back following a secure private-key ACL error. Target Windows registry/content parity is **not confirmed**. Do not bypass ACL protections or delete backups.
- Windows native station drag/drop/save and full cross-platform UI equivalence remain unaccepted.
- Local Git repository had **no remote** and connected GitHub repository search found no matching Toolbox/CloudHosts project. Pushing commits remains blocked until a correct remote is configured.
- The recurring verification task must remain enabled.

## Release gate

Do not mark complete until: successful signed Mac build, live Mac app replacement and smoke tests; successful native Windows C# compilation and physical GUI/RDP/ConPTY/station acceptance; authorized Mac SSH/VNC and Windows↔Mac tests; full backup/restore-safe migration with host/board/station file and hash checks; both platform install replacement and rollback checks; then an authenticated push to the intended remote.
