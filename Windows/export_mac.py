#!/usr/bin/env python3
"""Export CloudHosts persistent Mac user data for authenticated SSH transfer.

No private-key or password text is printed. The archive is sensitive and must
be kept under owner-only permissions, transferred over SSH, then deleted.
"""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import os
import re
import stat
import zipfile

HOME = Path.home()
DATA = HOME / "Library/Application Support/Toolbox/CloudHosts"
OUT = Path(__file__).resolve().parents[1] / "artifacts" / "windows-migration"
DYNAMIC_NAMES = {"server.json", "server.pid", "server.log"}
DYNAMIC_DIRS = {"sessions"}

def digest(value):
    return hashlib.sha256(value).hexdigest()

def export():
    os.umask(0o077)
    if not (DATA/"hosts.json").is_file():
        raise FileNotFoundError("Mac CloudHosts hosts.json is missing")
    OUT.mkdir(parents=True,exist_ok=True)
    hosts = json.loads((DATA/"hosts.json").read_text(encoding="utf-8"))
    if not isinstance(hosts,list):
        raise RuntimeError("Mac CloudHosts registry is invalid")
    station = DATA/"station/index.json"
    station_items = len(json.loads(station.read_text(encoding="utf-8"))) if station.exists() else 0
    workspace = DATA/"workspace.json"
    boards = len(json.loads(workspace.read_text(encoding="utf-8")).get("boards", [])) if workspace.exists() else 0
    external = {}
    for row in hosts:
        for name in ("identityFile", "knownHosts", "sshConfig"):
            raw = row.get(name)
            if not raw: continue
            p = (HOME / raw[2:] if raw.startswith("~/") else Path(raw))
            if p.exists() and p.is_file() and not p.is_symlink() and (str(p).startswith(str(HOME)+"/")):
                external[str(p)] = p
    # SSH Include rules are needed for ProxyJump and host aliases, but should
    # never overwrite a Windows user's own SSH configuration.
    for name in ("config", "toolbox-cloud-hosts.conf", "djf-windows.conf", "known_hosts"):
        p = HOME/".ssh"/name
        if p.is_file() and not p.is_symlink():
            external[str(p)] = p
    bundle = OUT / ("CloudHosts-MacData-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".zip")
    sha = {}
    mappings = {}
    skipped = []
    with zipfile.ZipFile(bundle,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for file in sorted(DATA.rglob("*")):
            relative = file.relative_to(DATA)
            if file.is_symlink():
                skipped.append(str(relative))
                continue
            if not file.is_file() or relative.parts[0] in DYNAMIC_DIRS:
                continue
            if len(relative.parts)==1 and (relative.name in DYNAMIC_NAMES or relative.name.startswith(("terminal-","askpass-"))):
                continue
            name = "data/" + relative.as_posix()
            bytes_ = file.read_bytes()
            archive.writestr(name, bytes_)
            sha[name] = digest(bytes_)
        for original,p in sorted(external.items()):
            name = "external/" + hashlib.sha256(original.encode()).hexdigest()[:16] + "-" + re.sub(r"[^A-Za-z0-9._-]","_",p.name)
            content=p.read_bytes()
            archive.writestr(name,content)
            sha[name]=digest(content)
            mappings[original]=name
        manifest = {
            "schema":1,"createdAt":datetime.now().isoformat(),"hostCount":len(hosts),
            "stationItemCount":station_items,"boardCount":boards,
            "fileDigests":sha,"externalPaths":mappings,"skippedSymlinks":skipped,
        }
        archive.writestr("manifest.json",json.dumps(manifest,ensure_ascii=False,separators=(",",":")))
    bundle.chmod(stat.S_IRUSR|stat.S_IWUSR)
    print("MAC_HOSTS",len(hosts))
    print("MAC_STATION_ITEMS",station_items)
    print("MAC_BOARDS",boards)
    print("ARCHIVED_FILES",len(sha))
    print("SYMLINKS_SKIPPED",len(skipped))
    print("ARCHIVE_PATH",bundle)
    print("ARCHIVE_SHA256",digest(bundle.read_bytes()))
if __name__=="__main__":
    export()
