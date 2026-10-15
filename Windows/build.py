#!/usr/bin/env python3
"""Reproducible Windows payload for Toolbox CloudHosts, built on macOS.

Run from the Toolbox repository after npm run build. This creates a Windows
native WebView2 + ConPTY application bundle, without touching Windows data.
The Windows target compiles native sources using its .NET Framework compiler.
"""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLBOX = ROOT.parent
ASSETS = ROOT / "artifacts"
RUNTIME = ASSETS / "windows-runtime"
NODE_VERSION = "v24.16.0"
NODE_ZIP = RUNTIME / f"node-{NODE_VERSION}-win-x64.zip"
SHA_LIST = RUNTIME / "SHASUMS256.txt"
STAGE = ASSETS / "windows" / "Aexus"

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1<<20), b""):
            h.update(block)
    return h.hexdigest()

def build():
    if not NODE_ZIP.exists() or not SHA_LIST.exists():
        raise RuntimeError(f"Official Node.js Windows runtime and SHASUMS missing in {RUNTIME}")
    expected = next((line.split()[0] for line in SHA_LIST.read_text().splitlines() if line.endswith(NODE_ZIP.name)), None)
    if not expected or sha256(NODE_ZIP) != expected:
        raise RuntimeError("Node.js Windows runtime does not match official SHA-256")
    if not (ROOT / "dist/ui/bundle.js").exists():
        raise RuntimeError("Build UI first using npm run build")
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    with zipfile.ZipFile(NODE_ZIP) as z:
        names = [n for n in z.namelist() if n.endswith("/node.exe")]
        if len(names) != 1:
            raise RuntimeError("Node.exe was not found in the verified Windows archive")
        (STAGE / "node.exe").write_bytes(z.read(names[0]))

    backend = STAGE / "backend"
    backend.mkdir()
    for name in ("cli.cjs", "schema.json", "package.json", "release.json", "LICENSE", "upstream.json"):
        shutil.copy2(ROOT / name, backend / name)
    for name in ("src", "dist", "docs"):
        shutil.copytree(ROOT / name, backend / name)
    aexus = ROOT / "AgentBoard" / "Aexus"
    if not (aexus/"out/main/daemon.js").is_file() or not (aexus/"out/renderer/index.html").is_file():
        raise RuntimeError("Build embedded Aexus Node/Web with original frozen scripts first")
    bundled=backend/"AgentBoard"/"Aexus"
    bundled.parent.mkdir(parents=True,exist_ok=True)
    def ignore_aexus(directory,names):
        excluded=shutil.ignore_patterns("node_modules","test","artifacts","__pycache__",".git","*.tsbuildinfo")(directory,names)
        if Path(directory)==aexus:excluded.add("PlugIns")
        if Path(directory)==aexus/"build":excluded.add("plugins")
        return excluded
    shutil.copytree(aexus,bundled,ignore=ignore_aexus)
    (bundled/"INSTALL_WINDOWS_DEPENDENCIES.txt").write_text(
        "Use the frozen package-lock.json to install Windows x64 dependencies on a dedicated release builder: npm ci --omit=dev. "
        "Never copy macOS node_modules or omit the native node-pty Windows runtime.\n")
    runtime = backend / "Runtime"
    runtime.mkdir()
    for f in (ROOT / "Runtime").iterdir():
        if f.is_file() and f.suffix in (".py", ".ps1", ".mjs", ".cjs", ".txt", ".json"):
            shutil.copy2(f, runtime / f.name)
    (backend / "node_modules").mkdir()
    shutil.copytree(ROOT / "node_modules/ws", backend / "node_modules/ws")
    shutil.copytree(ROOT / "node_modules/jsbi",backend / "node_modules/jsbi")
    (backend/"node_modules/@js-temporal").mkdir()
    shutil.copytree(ROOT/"node_modules/@js-temporal/polyfill",backend/"node_modules/@js-temporal/polyfill")
    (backend / "Windows").mkdir()
    shutil.copy2(ROOT / "Windows/ConPtyTerminal.cs", backend / "Windows/ConPtyTerminal.cs")
    shutil.copy2(ROOT / "Windows/RdpCredentials.cs", backend / "Windows/RdpCredentials.cs")

    sdk = TOOLBOX / "FileTransfer/artifacts/webview2"
    for src, name in [
        (sdk/"lib/net462/Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Core.dll"),
        (sdk/"lib/net462/Microsoft.Web.WebView2.WinForms.dll", "Microsoft.Web.WebView2.WinForms.dll"),
        (sdk/"runtimes/win-x64/native/WebView2Loader.dll", "WebView2Loader.dll"),
        (sdk/"LICENSE.txt", "WebView2-LICENSE.txt"),
    ]:
        if not src.is_file():
            raise FileNotFoundError(f"WebView2 SDK component missing: {src}")
        shutil.copy2(src, STAGE/name)
    (STAGE / "Windows").mkdir()
    for filename in ("CloudHostsApp.cs", "NativeRdp.cs", "NativeRdpBridge.cs", "CloudHostsSilentService.cs"):
        shutil.copy2(ROOT / "Windows" / filename, STAGE / "Windows" / filename)
    shutil.copy2(ROOT / "Windows/build.ps1", STAGE/"build.ps1")
    shutil.copy2(ROOT / "Windows/build.cmd", STAGE/"build.cmd")
    shutil.copy2(ROOT / "Windows/README.md", STAGE/"README.md")
    shutil.copy2(ROOT / "Windows/migrate.py", STAGE/"migrate.py")
    shutil.copy2(ROOT / "Windows/test_conpty_local.py", STAGE/"Windows/test_conpty_local.py")
    shutil.copy2(ROOT / "Windows/test_agent_local.cjs", STAGE/"Windows/test_agent_local.cjs")
    shutil.copy2(ROOT / "Windows/test_agent_cli.cs", STAGE/"Windows/test_agent_cli.cs")
    shutil.copy2(ROOT / "Windows/test_agent_resume.cjs", STAGE/"Windows/test_agent_resume.cjs")
    shutil.copy2(ROOT / "Windows/test_hidden.py", STAGE/"Windows/test_hidden.py")
    shutil.copy2(ROOT / "Windows/test_host_copy.cjs", STAGE/"Windows/test_host_copy.cjs")
    (STAGE/"tests").mkdir()
    shutil.copy2(ROOT/"tests/test_file_board_edits.py",STAGE/"tests/test_file_board_edits.py")
    # Native Node/WebSocket protocol tests run headlessly in the packaged Windows
    # runtime, before replacing the user's installed application.
    (backend/"tests").mkdir()
    shutil.copy2(ROOT/"tests/agent-tui-bridge.test.cjs",backend/"tests/agent-tui-bridge.test.cjs")
    shutil.copy2(ROOT/"tests/agent-routing-capabilities.test.cjs",backend/"tests/agent-routing-capabilities.test.cjs")
    # Same artwork as the macOS .icns; Windows .ico includes every standard size.
    # Windows ICO accepts PNG-compressed image entries; use the macOS built-in
    # 'sips' for resizing so this build needs no third-party Python packages.
    import struct
    import subprocess
    import tempfile
    sizes = (16, 24, 32, 48, 64, 128, 256)
    images = []
    with tempfile.TemporaryDirectory(prefix="cloudhosts-icons-") as tmp:
        for size in sizes:
            image = Path(tmp) / (str(size) + ".png")
            subprocess.run(["/usr/bin/sips", "-z", str(size), str(size), str(ASSETS/"icon.png"), "--out", str(image)], check=True, stdout=subprocess.DEVNULL)
            images.append(image.read_bytes())
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = len(header) + len(images) * 16
    entries = []
    for size, data in zip(sizes, images):
        entries.append(struct.pack("<BBBBHHII", size if size < 256 else 0, size if size < 256 else 0, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (STAGE/"Aexus.ico").write_bytes(header + b"".join(entries) + b"".join(images))
    info = {
        "application":"Aexus.exe", "displayName":"Aexus",
        "version":json.loads((ROOT/"package.json").read_text())["version"],
        "buildId":json.loads((ROOT/"release.json").read_text())["buildId"],
        "nodeVersion":NODE_VERSION, "nodeSHA256":sha256(NODE_ZIP),
        "nativeUI":"WebView2 WinForms", "terminal":"ConPTY",
        "macAppId":"com.agentscompany.app"
    }
    (STAGE/"manifest.json").write_text(json.dumps(info,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    out = ASSETS/"windows"/"Aexus-Windows-x64.zip"
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in STAGE.rglob("*"):
            if f.is_file():
                z.write(f,f.relative_to(STAGE).as_posix())
    print("WINDOWS_PAYLOAD="+str(STAGE))
    print("WINDOWS_ARCHIVE="+str(out))
    print("ARCHIVE_SHA256="+sha256(out))
    print("STAGED_FILES="+str(sum(1 for f in STAGE.rglob("*") if f.is_file())))
if __name__ == "__main__":
    build()
