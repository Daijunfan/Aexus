# Third-party artwork and plugin notices

## Channel source identification

X uses the unmodified official white X logo on black; YouTube uses the unmodified
official full-color icon. Original downloads, hashes and brand guidance are recorded
in `Infra/src/renderer/src/assets/channel-icons/sources.json` and
`Infra/src/licenses/channel-brand-assets.txt`. These trademarks identify content sources and
do not imply endorsement. Their public redistribution review remains pending.
Telegram channel photos are separately collected user data, not bundled artwork.

## MiniNotion

MiniNotion source and notices are in `Infra/Plugins/mini-notion/`. The plugin carries its
own GPL-3.0-only LICENSE and THIRD_PARTY_NOTICES.md into its distributable package.
It is built from source and loaded through the documented local plugin interface.

## Scheduler time arithmetic

`@js-temporal/polyfill` 0.5.1 (ISC) and `jsbi` 4.3.2 (Apache-2.0) provide
calendar/timezone arithmetic. Their package license files ship with the runtime
dependencies. The scheduler itself is implemented in the host Core.

## Conversation Markdown

`react-markdown`, `remark-gfm`, and `remark-math` (MIT) render private, group and
channel message content. KaTeX 0.18.9 (MIT, Khan Academy and contributors) renders
formulas with locally bundled styles and fonts. Full notices for the added math
libraries ship in `Infra/src/licenses/katex-0.18.9-MIT.txt` and
`Infra/src/licenses/remark-math-6.0.0-MIT.txt`; these interfaces do not depend on plugin internals.

Fenced code uses highlight.js 11.12.0's common language bundle (BSD-3-Clause,
Copyright 2006 Ivan Sagalaev). Source: https://github.com/highlightjs/highlight.js.
Its full notice ships in `Infra/src/licenses/highlight.js-11.12.0-BSD-3-Clause.txt`.

## Conversation viewport

`@tanstack/react-virtual` 3.14.13 and `@tanstack/virtual-core` 3.17.11 (MIT,
Copyright 2021-present Tanner Linsley) provide variable-height message windowing.
Source: https://github.com/TanStack/virtual. Full notices are included in
`Infra/src/licenses/tanstack-react-virtual-3.14.13-MIT.txt` and
`Infra/src/licenses/tanstack-virtual-core-3.17.11-MIT.txt`.

## Native execution transport

The `ws` package (MIT) provides the private loopback WebSocket endpoint. Native Codex execution uses the installed OpenAI CLI on each machine; no model credentials are copied to the execution host.

## Historical community pet artwork (MIT)

Woodi, Inky, Byte and WonderCube: Copyright (c) 2026 Schrotty74.
Source: https://github.com/Schrotty74/chatgpt-pets

Marmalade and Voltcoin: Copyright (c) 2026 Alexey Yakovlev.
Source: https://github.com/aprocom/chatgpt-pets

These historical source assets are no longer offered in the picker or bundled in renderer output. Unmodified sprite atlases, licensed under MIT. Full copyright/permission notices
ship in `Infra/src/renderer/src/assets/pets/licenses/`; pinned revisions and SHA-256 values
are in the adjacent `sources.json`. No author endorsement is implied.

## VS Code Codicons

File-tree, navigation and terminal icons use `@vscode/codicons` 0.0.46-24 by
Microsoft and contributors: https://github.com/microsoft/vscode-codicons.
Artwork is CC BY 4.0; code is MIT. Icons are unmodified, styled for size and color.
Full licenses ship with the dependency. https://creativecommons.org/licenses/by/4.0/

## Orthogonal connector editing

`Infra/src/shared/connector-path.ts` adapts the segment/bend editing approach from
mxGraph 4.2.2 `mxEdgeSegmentHandler` (JGraph Ltd and Gaudenz Alder, 2006–2015).
Source: https://github.com/jgraph/mxgraph/blob/v4.2.2/javascript/src/js/handler/mxEdgeSegmentHandler.js
It is modified for this project's shared CLI Core, fixed terminal leads and
source-Team-relative persisted routes. The Apache-2.0 release license is bundled
at `Infra/src/licenses/mxgraph-4.2.2-Apache-2.0.txt`. No mxGraph DOM runtime is required.

## Cloud Hosts interactive clients

Cloud Hosts bundles unmodified noVNC 1.7.0 (MPL-2.0), xterm.js 6.0.0 and xterm FitAddon 0.11.0 (MIT). Their license texts are included in the plugin `Infra/src/licenses/` directory and legal notices accompany the generated bundle. noVNC source for this distribution is available at https://github.com/novnc/noVNC/tree/v1.7.0 and through the exact package version in `Infra/Plugins/cloud-hosts/package-lock.json`. No native RDP client is redistributed; the plugin invokes a separately installed operating-system client.

## Original presentation artwork

Application, Cloud Hosts, Margin Reader, local-computer and generic security-Linux icons are original Aexus (now Aexus) vector artwork under Apache-2.0. Engine and operating-system names identify compatible third-party products and do not imply endorsement. No extracted Finder/MarginNote icons are included.

The local 0.49.9 candidate restores the eight previously imported OpenAI pet atlases from `learn.chatgpt.com` and the original OpenAI/Codex and Claude identification glyphs from project history. These vendor assets are not covered by the application Apache or community MIT notices. Original sprite URLs and checksums are recorded in the pet manifest; public redistribution review is pending in `Infra/src/licenses/release-review.json`. Named avatar IDs render their own original artwork again.

The macOS identification glyph is sourced from Simple Icons (CC0-1.0); the pinned source and checksum are in `Infra/src/renderer/src/assets/os/sources.json`, and the license is in `Infra/src/licenses/simple-icons-CC0-1.0.txt`. Trademark rights are not granted by CC0; this glyph identifies the compatible operating system.

KALI LINUX ™ is a trademark of OffSec. The Kali dragon SVG is an unmodified asset from the official [Kali Linux press pack](https://gitlab.com/kalilinux/documentation/press-pack), displayed solely to identify Kali Linux hosts under the [published trademark policy](https://www.kali.org/docs/policy/trademark/). Source commit and checksum are recorded in the OS asset manifest.

## Official companion restoration (local candidate)

The picker preserves the six original MIT-licensed community characters alongside nine OpenAI characters and Claude's original Clawd SVG plus 18 official Anthropic Buddy character animations. Hoots and Clawd are copied from the installed vendor extensions; exact versions and checksums are in the pet manifest. The Clawd SVG is unchanged; its movement is implemented by this application.

Anthropic Buddy character frames and sequences are adapted from https://github.com/anthropics/claude-desktop-buddy at commit a280c6421931431ba6905aee9d2b50b2bfd8c103, Copyright 2026 Anthropic, PBC., MIT. The full license ships in `Infra/src/renderer/src/assets/pets/licenses/Anthropic-Buddy-MIT.txt`. Body frames and animation sequences retain the original character art; hardware particles are omitted and application state controls playback. The separate third-party Bufo GIFs are not imported.

## Additional Coding Agent identification marks

The Cline mark is the unmodified SVG from the official Cline CLI 3.0.65 package (Apache-2.0 project). Pi's unmodified mark comes from https://pi.dev/logo-auto.svg (official Pi project, MIT). Source records and hashes are in `Infra/src/renderer/src/assets/engines/sources.json`. These identify the separately installed engines and imply no endorsement. Runtime packages are installed into user-owned Core storage, not bundled into the application.

## Fate companion fan artwork

The optional Fate Servant and selected Master appearances are newly generated fan artwork inspired by Fate/stay night and Fate/Zero character designs associated with TYPE-MOON and the respective production rights holders. They are not official animation assets and imply no endorsement. Prompts, source references and asset hashes are recorded in `Infra/src/renderer/src/assets/pets/fate/sources.json`; no vendor redistribution permission is claimed.

## Emojibase data

The offline emoji picker includes a reduced English/Chinese dataset from `emojibase-data` 17.0.0 (https://github.com/milesj/emojibase), generated by `Infra/src/tooling/build-emoji.mjs`. Emoji are rendered with system fonts; no third-party emoji artwork is bundled.

MIT License

Copyright (c) 2017-2019 Miles Johnson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Zod — dedicated native discussion tool schema

- Version: 4.6.5 (bundled from the pinned development dependency).
- Source: https://github.com/colinhacks/zod
- License: MIT; full notice: `Infra/src/licenses/zod-4.6.5-MIT.txt`.
- Used for the Claude SDK tool's explicit message ID and nullable public-text arguments.

### tiny-pinyin 1.3.2
MIT-licensed directory-name romanization library by creeperyang. License: `Infra/src/licenses/tiny-pinyin-1.3.2-MIT.txt`. Source: https://github.com/creeperyang/pinyin.
