"""Verify an exported test deck with Anki's real backend in a disposable profile.

Run with an isolated environment containing anki==26.8.1. No AnkiWeb calls and
no user profile reads. The Anki runtime is a test-only dependency, not bundled.
"""
from __future__ import annotations
import json
import pathlib
import tempfile
import sys
from anki.collection import Collection
from anki.import_export_pb2 import ImportAnkiPackageRequest

root = pathlib.Path(__file__).resolve().parents[1]
artifacts = root / 'artifacts/local-delivery-20260929'
result = {'ankiVersion': '26.8.1', 'passed': False}
try:
    with tempfile.TemporaryDirectory(prefix='anki-import-', dir=artifacts) as temp:
        collection = Collection(str(pathlib.Path(temp) / 'collection.anki2'))
        try:
            for filename in ['deck.apkg', 'deck-again.apkg']:
                log = collection.import_anki_package(ImportAnkiPackageRequest(
                    package_path=str(artifacts / 'exports' / filename)))
                assert log.log.found_notes == 2
            ids = collection.find_cards('')
            assert len(ids) == 2, 'Repeated package import duplicated cards'
            assert collection.db.scalar("select count(*) from notes where flds like '%[sound:%'") == 1
            assert collection.db.scalar("select count(*) from notes where flds like '%margin-reader://%'") == 2
            media = collection.media.check()
            assert not media.missing, media
            result.update(passed=True, cards=len(ids), missingMedia=list(media.missing), unusedMedia=list(media.unused))
            print('PASS Anki backend imports both packages: two cards, no duplicates, intact audio/images and reader links')
        finally:
            collection.close()
except Exception as error:
    result['error'] = repr(error)
    raise
finally:
    (artifacts / 'anki-import.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
