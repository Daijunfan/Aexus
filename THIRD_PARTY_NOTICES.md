# Third-party artwork and plugin notices

## Official ChatGPT / Codex pets

Codey, Dewey, Fireball, Rocky, Seedy, Stacky, BSOD and Null Signal artwork is sourced
from OpenAI's official Pets documentation: https://learn.chatgpt.com/docs/pets.
Artwork rights remain with OpenAI; use here does not imply endorsement.

The original asset URLs and SHA-256 hashes are in
`src/renderer/src/assets/pets/sources.json`. Assets are individual replaceable
skins; Agents Company's UI, animation controller and work-status
behavior are implemented separately.

## MiniNotion

MiniNotion source and notices are in `PlugIns/mini-notion/`. The plugin carries its
own GPL-3.0-only LICENSE and THIRD_PARTY_NOTICES.md into its distributable package.
It is built from source and loaded through the documented local plugin interface.

## Kali Linux icon

The Kali dragon square icon is from Kali Linux's official graphic-resources repository:
https://gitlab.com/kalilinux/documentation/graphic-resources/-/blob/main/kali-icon/sqaure-2/kali-dragon-square-simple.svg.
Kali Linux trademarks remain with their owners; the icon identifies the remote OS and
does not imply endorsement.

## Scheduler time arithmetic

`@js-temporal/polyfill` 0.5.1 (ISC) and `jsbi` 4.3.2 (Apache-2.0) provide
calendar/timezone arithmetic. Their package license files ship with the runtime
dependencies. The scheduler itself is implemented in the host Core.

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
