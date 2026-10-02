# Margin Reader 0.1.1 — Mac acceptance passed

Verified on 2026-09-26 using the actual user's Mac, both standalone Node and the installed Agents Company native renderer. This supersedes the earlier pending source-only repair note. The historical failed test reports remain in artifacts/; no failed run was relabeled as passed.

## Repairs

- Replace the repeated-group Base64 regexp with a bounded canonical round trip. Full 4 MiB chunks retain strict alphabet, padding and size checks without exhausting V8's regexp stack.
- Bound generated article filenames by UTF-8 bytes, preserving complete Unicode code points and reserving extension/suffix space.
- Allow IPv4/IPv6 fallback only across addresses validated for this request. Preserve private-address and redirect validation; report missing redirect locations and interrupted downloads.
- Prefer lazy/responsive image URLs over placeholders, retaining fallback sources.
- Detect HTML charset metadata/BOM, preserve the document base URL and bound base64-expanded offline HTML/image output.
- Correct the acceptance script's image check to inspect the reader's shadow root. The initial acceptance script timed out because document.querySelectorAll does not enter a shadow root. The subsequent test checks every image's successful decode; no assertion was removed.

## Actual PDF acceptance

The source was the downloaded AI Systems Performance Engineering by Chris Fregly in /Users/djf/Downloads. It was not replaced with a generated test document.

| Check | Result |
| --- | --- |
| Original file size | 22,817,987 bytes (about 22.8 MB) |
| Pages | 1,061 |
| Original outline nodes | 516, all within the document and resolved |
| UI upload | Six chunks, completed successfully |
| Source and imported SHA-256 | ebbc20ddf8ca501c7349b43bf942f32ffdcb5715b8001b2e8b54bb18da953de3 |
| Page rendering | Pages 1, 531 and 1061 checked; original chapter click verified |
| CLI | Text retrieval, full-document search and reading position checked |
| Restart | Same document ID and reading position recovered |
| Original source | SHA-256 and modification time unchanged |

The installed plugin was separately tested inside a hidden native window of /Applications/Agents Company.app. Its actual hosted upload processed the same book with an identical hash, 1,061 pages and 516 outline entries. This also verifies the host Node runtime rather than only standalone Node.

## Real blog acceptance

| Blog | Download path tested | Saved content | Offline result |
| --- | --- | --- | --- |
| Lilian Weng — Prompt Engineering | CLI | 29,339 text characters, 7 raster images | All images decode after service restart with external browser requests blocked |
| 阮一峰 — Flex 布局教程：语法篇 | UI URL dialog and installed native UI | 4,067 text characters, 17 headings, 16 raster images | All 16 images decode after reopening with external requests blocked |

Both real blog imports returned zero warnings. The Chinese standalone UI test also asserts that offline reading makes no remote requests. Access restrictions, DRM, login walls and client-only pages remain explicit limitations; the successful tests do not claim universal website compatibility.

## Regression and integration results

- 25 Node test groups passed, including full-size Base64 chunks, invalid input checks, a generated 1,200-page multi-chunk PDF, Chinese encoding, lazy images, scope isolation and concurrent writers.
- 16 existing browser UI checks passed.
- 12 existing host integration checks passed.
- 7 real local-book / English-blog acceptance checks passed.
- 3 Chinese-blog UI acceptance checks passed.
- 5 installed native-window acceptance checks passed. All test windows remained hidden.

Reports and screenshots (paths relative to this repository):

- artifacts/repair-mac-core.log
- artifacts/repair-ui.log
- artifacts/repair-host.log
- artifacts/import-acceptance-2026-09-26T13-49-31-722Z/result.json
- artifacts/blog-ui-2026-09-26T13-53-08-555Z/result.json
- artifacts/installed-ui-2026-09-26T13-57-21-063Z/result.json
- artifacts/default-library-import.json
- artifacts/repair-installation.json

The earlier import-acceptance-2026-09-26T13-47-58-309Z report records the shadow-root test bug and remains failed for auditability.

## Installed package and user library

Installed version: 0.1.1 at /Users/djf/AgentsCompany/plugins/margin-reader.

Before replacing the plugin, the host API reported zero active engines and zero plugin windows. The host was quit normally, the old plugin and default workspace were backed up under /Users/djf/AgentsCompany/plugin-backups/margin-reader-2026-09-26T13-55-02-934Z, and the verified package was installed. The host application binary was not changed.

The actual book and both blogs are now imported in workspaces/default. The book's library filename is AI Systems Performance Engineering.pdf. Existing user documents were preserved. Downloads originals, user documents, runtime caches and acceptance books are excluded from Git.

## Reproduce

```sh
npm test
npm run build:plugin
npm run test:ui
npm run test:host
npm run test:acceptance
npm run test:blog-ui
# Explicit installed-native test; use the real local PDF path:
READER_TEST_PDF='/absolute/path/to/AI Systems Performance Engineering.pdf' node tests/installed-reader-ui.cjs
```

No model inference was used in reader acceptance. Host source and host Git were not edited, staged, committed or reset for this repair.
