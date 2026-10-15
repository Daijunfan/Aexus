#!/usr/bin/env python3
"""Atomic and lossless import of Mac CloudHosts into an existing Windows profile.

Usage: py migrate.py <MacData.zip> [--dry-run]
Requires running as the target Windows user. Existing hosts and files are
retained, with rollback backups; private keys never appear in stdout.
"""
from pathlib import Path
from datetime import datetime
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
import zipfile

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def lookup_path(original, root, mapping):
    if not original:
        return None
    if original in mapping:
        return str(root/"ssh"/"imported-mac"/Path(mapping[original]).name)
    prefix="/Users/djf/Library/Application Support/Toolbox/CloudHosts/"
    if original.startswith(prefix):
        return str(root / original[len(prefix):].replace("/",os.sep))
    return None

def merge_station(candidate, imported):
    """Merge Mac station entries without overwriting Windows entries or content.

    Preserve the original Mac station verbatim in ImportedMac/MacData.
    Rename name collisions and remap duplicate UUIDs for active Windows rows.
    This operates only on the disposable candidate directory before swap.
    """
    source = imported / "station"
    index = source / "index.json"
    if not index.is_file():
        return 0, len(load_json(candidate/"station"/"index.json", []))
    mac_rows = load_json(index, [])
    win_index = candidate / "station" / "index.json"
    windows_rows = load_json(win_index, [])
    if not isinstance(mac_rows, list) or not isinstance(windows_rows, list):
        raise RuntimeError("Station index must contain a list")
    by_id = {}
    for row in mac_rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row["id"] in by_id:
            raise RuntimeError("Mac station has invalid or duplicate IDs")
        by_id[row["id"]] = row
    occupied_ids = {row["id"] for row in windows_rows}
    occupied = {(row.get("parent"), str(row.get("name", "")).casefold()) for row in windows_rows}
    used_paths = {}
    mapped_ids = {}
    entries = []
    pending = set()

    def display_name(original):
        if not isinstance(original, str) or not original or original in (".", ".."):
            raise RuntimeError("Mac station has an invalid filename")
        forbidden = '<>:"/\\|?*'
        value = "".join("_" if ord(c) < 32 or c in forbidden else c for c in original)
        value = value.rstrip(" .")
        if not value or value.upper().split(".")[0] in {
            "CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10)),
        }:
            value = "_" + value
        return value

    def source_path(item_id):
        if item_id in used_paths:
            return used_paths[item_id]
        row = by_id[item_id]
        parent = row.get("parent")
        if parent:
            if parent not in by_id or by_id[parent].get("type") != "folder":
                raise RuntimeError("Mac station parent is missing or not a folder")
            if parent in pending:
                raise RuntimeError("Mac station contains a folder cycle")
            relative = source_path(parent) / row["name"]
        else:
            relative = Path(row["name"])
        if not row["name"] or row["name"] in (".", "..") or any(c in row["name"] for c in ("/", "\\", "\x00")):
            raise RuntimeError("Mac station contains an unsafe filename")
        used_paths[item_id] = relative
        return relative

    def add(item_id):
        if item_id in mapped_ids:
            return
        if item_id in pending:
            raise RuntimeError("Mac station contains a folder cycle")
        pending.add(item_id)
        row = by_id[item_id]
        parent = row.get("parent")
        if parent:
            if parent not in by_id or by_id[parent].get("type") != "folder":
                raise RuntimeError("Mac station parent is missing or not a folder")
            add(parent)
        if row.get("type") not in ("file", "folder"):
            raise RuntimeError("Mac station item type is invalid")
        mapped_parent = mapped_ids.get(parent)
        desired = display_name(row["name"])
        ext = Path(desired).suffix
        base = desired[:-len(ext)] if ext else desired
        name = desired
        content = candidate / "station" / "content"
        parent_path = used_dest[parent] if parent else Path()
        n = 2
        while (mapped_parent, name.casefold()) in occupied or (content/parent_path/name).exists():
            name = f"{base} ({n}){ext}"
            n += 1
        new_id = item_id
        while new_id in occupied_ids:
            new_id = str(uuid.uuid4())
        occupied_ids.add(new_id)
        mapped_ids[item_id] = new_id
        occupied.add((mapped_parent, name.casefold()))
        used_dest[item_id] = parent_path / name
        original = source / "content" / source_path(item_id)
        target = content / used_dest[item_id]
        if original.is_symlink() or not original.exists():
            raise RuntimeError("Mac station content is missing or symbolic")
        if row["type"] == "folder":
            if not original.is_dir():
                raise RuntimeError("Mac station folder content mismatch")
            target.mkdir(parents=True, exist_ok=False)
        else:
            if not original.is_file():
                raise RuntimeError("Mac station file content mismatch")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, target)
            if "sha256" in row and hash_file(target) != row["sha256"]:
                raise RuntimeError("Mac station file checksum mismatch")
        item = dict(row)
        item.update(id=new_id, parent=mapped_parent, name=name)
        entries.append(item)
        pending.remove(item_id)

    used_dest = {}
    for item_id in by_id:
        add(item_id)
    save_json(win_index, [*windows_rows, *entries])
    save_json(imported/"station-merge.json", {
        "macItems": len(mac_rows), "windowsItems": len(windows_rows),
        "resultItems": len(windows_rows) + len(entries),
        "ids": mapped_ids,
    })
    return len(mac_rows), len(windows_rows) + len(entries)


def icacls_private(path):
    # USERDOMAIN\\USERNAME can differ from the actual SSH logon identity on
    # Microsoft/Entra accounts. Grant to the current token SID instead.
    identity = subprocess.run(
        ["whoami", "/user", "/fo", "csv", "/nh"],
        capture_output=True, text=True,
    )
    if identity.returncode:
        raise RuntimeError("Cannot identify Windows user SID for imported SSH key ACL")
    rows = list(csv.reader(identity.stdout.splitlines()))
    sid = rows[0][1].strip() if len(rows) == 1 and len(rows[0]) == 2 else ""
    if not re.fullmatch(r"S-1-(?:\d+-){1,}\d+", sid):
        raise RuntimeError("Invalid Windows user SID for imported SSH key ACL")
    command = ["icacls", str(path), "/inheritance:r", "/grant:r", "*" + sid + ":(F)"]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Could not restrict imported SSH key permissions (icacls exit " + str(result.returncode) + "): " + result.stderr[-160:].strip())

def migrate(archive_path,dry_run=False):
    appdata=Path(os.environ["APPDATA"])
    parent=appdata/"Toolbox"
    target=parent/"CloudHosts"
    source=Path(archive_path)
    if os.name!="nt":
        raise RuntimeError("Run on the physical Windows PC, not macOS")
    if not source.is_file():
        raise FileNotFoundError("Mac archive is missing")
    parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source) as package:
        manifest=json.loads(package.read("manifest.json"))
        if manifest.get("schema") != 1:
            raise RuntimeError("Unsupported migration format")
        files=manifest["fileDigests"]
        if len(files)>30000:
            raise RuntimeError("Archive file count exceeds safety limit")
        for name,digest in files.items():
            if (not name.startswith(("data/","external/")) or
                name.startswith("/") or ".." in Path(name).parts):
                raise RuntimeError("Unsafe import path")
            if sha(package.read(name))!=digest:
                raise RuntimeError("Mac data checksum mismatch")
        mac_hosts=json.loads(package.read("data/hosts.json"))
        if len(mac_hosts)!=manifest["hostCount"]:
            raise RuntimeError("Mac host count mismatch")
        original=load_json(target/"hosts.json",[])
        if not isinstance(original,list):
            raise RuntimeError("Existing Windows host registry is invalid")
        if not isinstance(mac_hosts,list):
            raise RuntimeError("Mac host registry is invalid")
        oldkey=target/"credential.key"
        newkey="data/credential.key"
        if oldkey.is_file() and newkey in files and sha(oldkey.read_bytes())!=files[newkey]:
            if any(row.get("secret") for row in original+mac_hosts):
                raise RuntimeError("Encryption keys differ; a credential re-encryption procedure is required")
        candidate=parent/(".CloudHosts-import-"+uuid.uuid4().hex)
        backup=parent/("CloudHosts-backup-"+datetime.now().strftime("%Y%m%d-%H%M%S"))
        if backup.exists():
            raise RuntimeError("Backup path already exists")
        if target.is_dir():
            shutil.copytree(target,candidate)
        else:
            candidate.mkdir()
        imported=candidate/"ImportedMac"/"MacData"
        imported.mkdir(parents=True)
        key_targets=[]
        swapped=False
        try:
            for name in files:
                contents=package.read(name)
                if name.startswith("data/"):
                    rel=Path(name[len("data/"):])
                    snapshot=imported/rel
                    snapshot.parent.mkdir(parents=True,exist_ok=True)
                    snapshot.write_bytes(contents)
                    if rel.parts[0] in ("hosts.json","workspace.json","credential.key"):
                        continue
                    if rel.parts[0] in ("known_hosts","ssh"):
                        destination=candidate/rel
                        if not destination.exists():
                            destination.parent.mkdir(parents=True,exist_ok=True)
                            destination.write_bytes(contents)
                    # Original Mac runtime caches and historical data are kept
                    # in ImportedMac even when Windows already has a counterpart.
                else:
                    rel=Path(name[len("external/"):])
                    destination=candidate/"ssh"/"imported-mac"/rel
                    destination.parent.mkdir(parents=True,exist_ok=True)
                    destination.write_bytes(contents)
                    if rel.suffix in (".pem", ".key") or any(x.get("identityFile")==original_path for x in mac_hosts for original_path,entry in manifest["externalPaths"].items() if entry==name):
                        key_targets.append(destination)
            if newkey in files and not oldkey.is_file():
                (candidate/"credential.key").write_bytes(package.read(newkey))
                key_targets.append(candidate/"credential.key")
            source_to_win=manifest["externalPaths"]
            mapping={original:name[len("external/"):] for original,name in source_to_win.items()}
            existing_by_id={str(row["id"]):i for i,row in enumerate(original)}
            existing_by_name={str(row["name"]).casefold():i for i,row in enumerate(original)}
            result=list(original)
            added=0
            for host in mac_hosts:
                index=existing_by_id.get(str(host["id"]),existing_by_name.get(str(host["name"]).casefold()))
                if index is None:
                    record=dict(host)
                    for field in ("identityFile","knownHosts","sshConfig"):
                        path=lookup_path(record.get(field),target,mapping)
                        if path:record[field]=path
                        elif field in record: record.pop(field)
                    existing_by_id[str(record["id"])]=len(result)
                    result.append(record)
                    added+=1
                else:
                    record=dict(result[index])
                    for field in ("vm","desktop","distribution","info","status"):
                        if field not in record and field in host:
                            record[field]=host[field]
                    for field in ("identityFile","knownHosts","sshConfig"):
                        if not record.get(field) or not Path(os.path.expanduser(record[field])).exists():
                            port=lookup_path(host.get(field),target,mapping)
                            if port:record[field]=port
                    result[index]=record
            macos_present=any(row.get("os")=="macos" for row in result)
            if not macos_present:
                now=int(datetime.now().timestamp()*1000)
                identity=str(uuid.uuid4())
                result.append({
                    "id":identity,"name":"本地 Mac（djftekiMacBook-Pro）",
                    "host":"djf@10.21.181.184","os":"macos","port":22,
                    "defaultDirectory":"/Users/djf",
                    "desktop":{"protocol":"vnc","address":"127.0.0.1",
                               "port":5900,"viaHostId":identity},
                    "createdAt":now,"updatedAt":now
                })
                added+=1
            if len({str(row["id"]) for row in result})!=len(result):
                raise RuntimeError("Host ID conflict")
            save_json(candidate/"hosts.json",result)
            mac_workspace=json.loads(package.read("data/workspace.json")) if "data/workspace.json" in files else None
            if mac_workspace:
                old_workspace=load_json(target/"workspace.json",None)
                if old_workspace:
                    present={b["id"] for b in old_workspace.get("boards",[])}
                    for board in mac_workspace.get("boards",[]):
                        if board["id"] not in present:
                            old_workspace.setdefault("boards",[]).append(board)
                    save_json(candidate/"workspace.json",old_workspace)
                else:
                    save_json(candidate/"workspace.json",mac_workspace)
            mac_station_count, station_total = merge_station(candidate, imported)
            if mac_station_count != manifest["stationItemCount"]:
                raise RuntimeError("Mac station item count mismatch")
            if any(str(mac["id"]) not in {str(row["id"]) for row in result} for mac in mac_hosts):
                raise RuntimeError("Mac host ID missing after merge")
            print("MAC_HOSTS_IMPORTED="+str(len(mac_hosts)))
            print("WINDOWS_HOSTS_PRESERVED="+str(len(original)))
            print("RESULT_HOSTS="+str(len(result)))
            print("ADDED_HOSTS="+str(added))
            print("MAC_STATION_ITEMS="+str(mac_station_count))
            print("RESULT_STATION_ITEMS="+str(station_total))
            print("WORKSPACE_BOARDS="+str(len(load_json(candidate/"workspace.json",{}).get("boards",[]))))
            if dry_run:
                print("MIGRATION_DRY_RUN=PASS")
                return
            # Same-volume rename with immediate rollback if any verification fails.
            if target.exists():
                target.rename(backup)
            try:
                candidate.rename(target)
                swapped=True
                for key in key_targets:
                    relative=key.relative_to(candidate)
                    icacls_private(target/relative)
                if len(load_json(target/"hosts.json",[]))!=len(result):
                    raise RuntimeError("Installed registry validation failed")
                print("MIGRATION=PASS")
                print("BACKUP="+str(backup) if backup.exists() else "BACKUP=no previous directory")
            except BaseException:
                if target.is_dir():
                    failed=parent/(".CloudHosts-failed-"+uuid.uuid4().hex)
                    target.rename(failed)
                    shutil.rmtree(failed,ignore_errors=True)
                if backup.exists():
                    backup.rename(target)
                swapped=False
                raise
        finally:
            if not swapped and candidate.exists():
                shutil.rmtree(candidate)
    return

if __name__=="__main__":
    if len(sys.argv)<2:
        raise SystemExit("Usage: migrate.py MacData.zip [--dry-run]")
    migrate(sys.argv[1], "--dry-run" in sys.argv[2:])
