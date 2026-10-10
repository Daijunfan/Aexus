# Retrieval

This directory owns research-source browsing and user-supplied background material decoding. Research planning/budgets and task scheduling belong to `workflow/`; semantic credibility, coverage, findings and contradictions belong to `knowledge/`. Host authentication and file transfer remain in Contract/Infra.

## User-facing components

- `SourcePanel.tsx` accepts the existing `ResearchSource[]`, `ResearchFinding[]`, `SourceSelection`, and callbacks; it renders bounded pages, source-site/status filters, raw fragment locations, provenance states and return-to-report interactions. It does not fetch original pages or reclassify candidate snippets as verified evidence.
- `source-browser.ts` is a disposable indexed view. Source IDs, evidence, and semantic states remain in the workflow/domain records; this module stores no parallel source database.
- `source-cache.mjs` wraps an independent reader within **one research run**. Same-URL requests with the same cancellation owner share the in-flight response; successful responses are bounded by LRU bytes, entry count, and TTL. Failures and cancellations never become cached reading proof. Workflow owns optional runtime wiring.
- `materials.ts` exports `parseResearchMaterial(file, {signal?})`, returning `{name, content}` for existing workflow input. The optional `readPdf` injection is for deterministic tests.
- `docx.ts` reads the primary text in ordinary .docx Office ZIP packages using browser-native ZIP decompression and XML parsing. Paragraphs, table cells, explicit breaks and UTF-8/UTF-16 XML are retained. It does not evaluate Office content, follow external links, load images, or process macro-enabled files. Other DOCX package parts are not read.

## Supported local background material

| Input | Limit | Limitations |
| --- | --- | --- |
| TXT, MD, CSV, JSON | 200 KB per file | Strict UTF-8 or UTF-16 with BOM; malformed/binary encodings fail clearly instead of replacing text silently |
| PDF | 8 MiB, 80 pages, 200k extracted characters | Text layer only, no OCR, no encrypted PDF |
| DOCX | 8 MiB, 4 MiB inflated main XML, 200k characters | Body text and table cells; no images, text in other package parts, or encrypted Office |

User-provided background files are **context**, never independently verified published sources. Original web citations are still verified by the independent source reader. The research workflow's ten-material limit and exact `{name,content}` shape are unchanged. Compression features depend on the host browser supporting `DecompressionStream('deflate-raw')`; otherwise the DOCX reader fails explicitly.

## Verification

Run without live Agent tasks, paid inference or external web calls:

```sh
node --test Engine/deep-research/retrieval/test/source-browser.test.mjs Engine/deep-research/retrieval/test/materials.test.mjs Engine/deep-research/retrieval/test/source-cache.test.mjs
AGENTS_BROWSER_CHANNEL=chrome node Engine/deep-research/retrieval/test/source-browser.ui.mjs
AGENTS_BROWSER_CHANNEL=chrome node Engine/deep-research/retrieval/test/docx.ui.mjs
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

The browser tests use generated local fixtures and bind a short-lived loopback HTTP server. All screenshots and build artifacts go beneath `.aexus/`, outside the versioned source tree.
