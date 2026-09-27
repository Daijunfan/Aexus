# Third-party artwork and plugin notices

## MiniNotion

MiniNotion source and notices are in `PlugIns/mini-notion/`. The plugin carries its
own GPL-3.0-only LICENSE and THIRD_PARTY_NOTICES.md into its distributable package.
It is built from source and loaded through the documented local plugin interface.

## Scheduler time arithmetic

`@js-temporal/polyfill` 0.5.1 (ISC) and `jsbi` 4.3.2 (Apache-2.0) provide
calendar/timezone arithmetic. Their package license files ship with the runtime
dependencies. The scheduler itself is implemented in the host Core.

## Conversation Markdown

`react-markdown` and `remark-gfm` (MIT) render assistant replies in the desktop
conversation. Their license files ship with the runtime dependencies.

## Native execution transport

The `ws` package (MIT) provides the private loopback WebSocket endpoint. Native Codex execution uses the installed OpenAI CLI on each machine; no model credentials are copied to the execution host.

## Community pet artwork (MIT)

Woodi, Inky, Byte and WonderCube: Copyright (c) 2026 Schrotty74.
Source: https://github.com/Schrotty74/chatgpt-pets

Marmalade and Voltcoin: Copyright (c) 2026 Alexey Yakovlev.
Source: https://github.com/aprocom/chatgpt-pets

Unmodified sprite atlases, licensed under MIT. Full copyright/permission notices
ship in `src/renderer/src/assets/pets/licenses/`; pinned revisions and SHA-256 values
are in the adjacent `sources.json`. No author endorsement is implied.

## VS Code Codicons

File-tree, navigation and terminal icons use `@vscode/codicons` 0.0.46-24 by
Microsoft and contributors: https://github.com/microsoft/vscode-codicons.
Artwork is CC BY 4.0; code is MIT. Icons are unmodified, styled for size and color.
Full licenses ship with the dependency. https://creativecommons.org/licenses/by/4.0/

## Orthogonal connector editing

`src/shared/connector-path.ts` adapts the segment/bend editing approach from
mxGraph 4.2.2 `mxEdgeSegmentHandler` (JGraph Ltd and Gaudenz Alder, 2006–2015).
Source: https://github.com/jgraph/mxgraph/blob/v4.2.2/javascript/src/js/handler/mxEdgeSegmentHandler.js
It is modified for this project's shared CLI Core, fixed terminal leads and
source-Team-relative persisted routes. The Apache-2.0 release license is bundled
at `licenses/mxgraph-4.2.2-Apache-2.0.txt`. No mxGraph DOM runtime is required.

## Cloud Hosts interactive clients

Cloud Hosts bundles unmodified noVNC 1.7.0 (MPL-2.0), xterm.js 6.0.0 and xterm FitAddon 0.11.0 (MIT). Their license texts are included in the plugin `licenses/` directory and legal notices accompany the generated bundle. noVNC source for this distribution is available at https://github.com/novnc/noVNC/tree/v1.7.0 and through the exact package version in `PlugIns/cloud-hosts/package-lock.json`. No native RDP client is redistributed; the plugin invokes a separately installed operating-system client.

## Original presentation artwork

Application, Cloud Hosts, Margin Reader, local-computer and security-Linux icons, and the engine integration glyphs are original Agents Company vector artwork under Apache-2.0. Engine and operating-system names identify compatible third-party products and do not imply endorsement. No extracted Finder/MarginNote icons or official OpenAI pet sprite sheets are redistributed. Legacy avatar IDs resolve to the licensed community sprites above.
