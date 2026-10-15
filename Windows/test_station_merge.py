#!/usr/bin/env python3
"""Pure, isolated regression tests for the Windows station import merge."""
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import json
import unittest

from migrate import merge_station


def sha(value):
    return hashlib.sha256(value).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def entry(id_, name, type_, parent=None, content=None):
    item = {"id": id_, "name": name, "type": type_, "parent": parent}
    if content is not None:
        item["sha256"] = sha(content)
        item["bytes"] = len(content)
    return item


class MergeStationTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix="cloudhosts-migration-test-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.candidate = root/"candidate"
        self.imported = root/"ImportedMac"/"MacData"
        self.candidate.mkdir()
        self.imported.mkdir(parents=True)

    def add_mac(self, rows, content):
        write_json(self.imported/"station"/"index.json", rows)
        for relative, value in content.items():
            path = self.imported/"station"/"content"/relative
            if value is None:
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(value)

    def add_windows(self, rows, content):
        write_json(self.candidate/"station"/"index.json", rows)
        for relative, value in content.items():
            path = self.candidate/"station"/"content"/relative
            if value is None:
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(value)

    def read_rows(self):
        return json.loads((self.candidate/"station"/"index.json").read_text(encoding="utf-8"))

    def test_fresh_profile_imports_nested_folders_and_binary(self):
        payload = bytes([0, 255, 128, 12])
        self.add_mac(
            [entry("folder-m", "工程", "folder"),
             entry("file-m", "结果.bin", "file", "folder-m", payload),
             entry("empty-m", "空目录", "folder", "folder-m")],
            {"工程": None, "工程/结果.bin": payload, "工程/空目录": None}
        )
        self.assertEqual(merge_station(self.candidate, self.imported), (3, 3))
        self.assertEqual(len(self.read_rows()), 3)
        self.assertEqual((self.candidate/"station/content/工程/结果.bin").read_bytes(), payload)
        self.assertTrue((self.candidate/"station/content/工程/空目录").is_dir())

    def test_preserves_windows_and_remaps_colliding_name_and_id(self):
        old = b"Existing Windows bytes"
        mac = b"Different Mac bytes"
        self.add_windows([entry("same-id", "报告.txt", "file", content=old)], {"报告.txt": old})
        self.add_mac([entry("same-id", "报告.txt", "file", content=mac)], {"报告.txt": mac})
        self.assertEqual(merge_station(self.candidate, self.imported), (1, 2))
        rows = self.read_rows()
        self.assertEqual(rows[0]["id"], "same-id")
        self.assertEqual(rows[1]["name"], "报告 (2).txt")
        self.assertNotEqual(rows[1]["id"], rows[0]["id"])
        self.assertEqual((self.candidate/"station/content/报告.txt").read_bytes(), old)
        self.assertEqual((self.candidate/"station/content/报告 (2).txt").read_bytes(), mac)
        self.assertEqual((self.imported/"station/content/报告.txt").read_bytes(), mac)

    def test_nested_remapped_parent_keeps_children_and_case_insensitivity(self):
        self.add_windows([entry("w", "Projects", "folder")], {"Projects": None})
        self.add_mac(
            [entry("child", "Readme.TXT", "file", "parent", b"mac"),
             entry("parent", "projects", "folder")],
            {"projects": None, "projects/Readme.TXT": b"mac"}
        )
        self.assertEqual(merge_station(self.candidate, self.imported), (2, 3))
        rows = self.read_rows()
        folder = next(row for row in rows if row["id"] == "parent")
        child = next(row for row in rows if row["id"] == "child")
        self.assertEqual(folder["name"], "projects (2)")
        self.assertEqual(child["parent"], folder["id"])
        self.assertEqual((self.candidate/"station/content/projects (2)/Readme.TXT").read_bytes(), b"mac")

    def test_rejects_cycle_and_invalid_content_without_changing_live_index(self):
        self.add_mac([entry("a", "A", "folder", "b"),
                      entry("b", "B", "folder", "a")], {})
        with self.assertRaisesRegex(RuntimeError, "cycle"):
            merge_station(self.candidate, self.imported)
        self.assertFalse((self.candidate/"station"/"index.json").exists())

    def test_detects_sha_mismatch_before_record_persistence(self):
        self.add_mac([entry("x", "asset.bin", "file", content=b"expected")],
                     {"asset.bin": b"changed"})
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            merge_station(self.candidate, self.imported)
        self.assertFalse((self.candidate/"station"/"index.json").exists())


if __name__ == "__main__":
    unittest.main()
