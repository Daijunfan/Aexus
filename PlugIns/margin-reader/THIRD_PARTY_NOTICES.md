# Third-party notices

Margin Reader original code is MIT licensed. This project is not affiliated with MarginNote. Its blue/white SVG icon is independently drawn, not a copied commercial binary asset.

Runtime packages and their license files are retained in the built node_modules directory. PDF.js fonts, CMaps, WASM, CSS and viewer scripts are retained with its Apache-2.0 license. No fonts are exported as standalone user deliverables.

| Package | Version | License | Project |
| --- | --- | --- | --- |
| @lingo-reader/mobi-parser | 0.4.6 | MIT | https://github.com/hhk-png/lingo-reader#readme |
| @mozilla/readability | 0.6.0 | Apache-2.0 | https://github.com/mozilla/readability |
| @napi-rs/canvas | 0.1.100 | MIT | https://github.com/Brooooooklyn/canvas |
| iconv-lite | 0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite |
| ipaddr.js | 2.2.0 | MIT |  |
| jsdom | 26.1.0 | MIT | git+https://github.com/jsdom/jsdom.git |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) | https://github.com/Stuk/jszip.git |
| mammoth | 1.12.3 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js.git |
| marked | 15.0.12 | MIT | https://marked.js.org |
| pdfjs-dist | 5.4.624 | Apache-2.0 | https://mozilla.github.io/pdf.js/ |
| proper-lockfile | 4.1.2 | MIT | https://github.com/moxystudio/node-proper-lockfile |
| sanitize-html | 2.17.7 | MIT | https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html#readme |
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| katex | 0.18.9 | MIT | https://github.com/KaTeX/KaTeX |
| @open-spaced-repetition/binding | 0.5.0 | MIT | https://github.com/open-spaced-repetition/ts-fsrs |
| ts-fsrs | 5.4.2 | MIT | https://github.com/open-spaced-repetition/ts-fsrs |
| word-extractor | 1.0.4 | MIT | https://github.com/morungos/node-word-extractor |

## Primary implementation references

- Mozilla PDF.js: https://github.com/mozilla/pdf.js
- Mozilla Readability: https://github.com/mozilla/readability
- Mammoth DOCX conversion: https://github.com/mwilliamson/mammoth.js
- Legacy Word extraction: https://github.com/morungos/node-word-extractor
- MOBI/KF8 parser: https://github.com/hhk-png/lingo-reader/tree/main/packages/mobi-parser
- HTML sanitization: https://github.com/apostrophecms/sanitize-html

Tests use original synthetic PDF, DOCX, EPUB and MOBI documents, not copied commercial books. External live test downloads, when used, are kept outside source Git.
