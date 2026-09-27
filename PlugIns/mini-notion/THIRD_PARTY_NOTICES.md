# Third-party software

Mini Notion uses the following open-source projects without modifying their library source files:

- BlockNote — MPL-2.0. Source and license: https://github.com/TypeCellOS/BlockNote
- BlockNote Multi-column — GPL-3.0, used under its open-source license. https://github.com/TypeCellOS/BlockNote/tree/main/packages/xl-multi-column
- Shiki — MIT. https://github.com/shikijs/shiki
- Temporal polyfill — ISC. https://github.com/js-temporal/temporal-polyfill
- JSEP — MIT. https://github.com/EricSmekens/jsep
- Electron — MIT, with bundled Chromium and Node.js notices. https://github.com/electron/electron
- React / React DOM — MIT. https://github.com/facebook/react
- react-markdown — MIT. https://github.com/remarkjs/react-markdown
- remark-gfm — MIT. https://github.com/remarkjs/remark-gfm
- Mantine — MIT. https://github.com/mantinedev/mantine
- Lucide — ISC. https://github.com/lucide-icons/lucide
- JSZip — MIT or GPL-3.0-or-later; used under MIT. https://github.com/Stuk/jszip
- Tiptap — MIT. https://github.com/ueberdosis/tiptap
- ProseMirror — MIT. https://github.com/ProseMirror

The original packages and their license files are available via the exact versions in package-lock.json. Electron's bundled licenses remain included in the desktop distribution.

The application name and visual design are independent. Notion is a trademark of its respective owner. Mini Notion is not affiliated with or endorsed by Notion.

Agent integration uses the official `@anthropic-ai/claude-agent-sdk` (0.3.269). Its package declares “SEE LICENSE IN README.md”; see the included package README and Anthropic's referenced terms. Codex integration uses the installed Codex CLI's documented App Server protocol. These integrations do not imply endorsement by Anthropic or OpenAI.

Offline emoji catalog: Unicode Emoji 16.0 (https://unicode.org/Public/emoji/16.0/emoji-test.txt) and Unicode CLDR 48 Chinese annotations (https://github.com/unicode-org/cldr-json/tree/48.0.0/cldr-json/cldr-annotations-full/annotations/zh). Unicode License v3: see UNICODE-LICENSE.txt. Emoji glyphs are rendered by the operating system. The icon-name catalog is generated from the installed Lucide 0.577.0 package; the vectors are rendered by that package. No Notion proprietary icon assets are bundled.

- KaTeX 0.18.9 — MIT. Local block and inline equation rendering with bundled fonts; https://github.com/KaTeX/KaTeX. The full notice is included in KATEX-LICENSE.txt. No remote math/font service is used.
