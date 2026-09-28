# Licensing and redistribution

The complete Agents Company distribution is published under **GNU GPL v3** (`LICENSE`), including its bundled GPL MiniNotion functionality. The earlier Apache-2.0 host material and notices remain in `licenses/host-original-Apache-2.0.txt`; the compatible permissive components retain their own notices. This does not relicense vendor runtimes, services or trademarks.

## Bundled open-source components

| Component | License | Source |
| --- | --- | --- |
| Complete host distribution | GPL-3.0-only | `src/`, `bin/`, `scripts/`, `Modules/` |
| Cloud Hosts | Apache-2.0 | `PlugIns/cloud-hosts/` |
| MiniNotion and its multi-column editor | GPL-3.0-only | `PlugIns/mini-notion/` |
| Margin Reader | MIT | `PlugIns/margin-reader/` |
| Community avatars | MIT | `src/renderer/src/assets/pets/`, full notices in `licenses/` there |
| Original application and integration icons | Apache-2.0, GPL-compatible | SVG sources and source records beside the assets |

The release source archive contains the complete matching application/plugin source, lockfiles and build scripts. It also includes the preferred TypeScript source and build files for the unmodified BlockNote 0.54.2 dependency tree in `licenses/upstream/blocknote-0.54.2-source.tar.gz`, with provenance and SHA-256 in the adjacent JSON. The multi-column component's [GPLv3 license](https://github.com/TypeCellOS/BlockNote/blob/v0.54.2/packages/xl-multi-column/LICENSE) applies to the combined covered distribution; this release does not rely on a claim that a plugin boundary alone removes copyleft obligations.

Publish the matching source archive beside every binary, at no additional charge, and keep both available. Build instructions are in `CONTRIBUTING.md` and `docs/DEPLOYMENT.md`. No signature or proprietary key is required to build or run a modified application.

## Separately installed engines

Public desktop and server packages do **not** bundle the Claude Agent SDK or its native executable. Development uses the SDK for types and tests; package scripts exclude those development dependencies and the plugin copy step excludes the SDK. At the user's explicit request, the installer downloads the controller and matching native executable directly from fixed official npm URLs, verifies the committed SHA-512 values, and stores them in user data. Existing compatible installations can be reused. Their licenses and legal notices remain intact.

The integration uses **Claude Agent** naming and offers API-key/provider configuration, not an application-provided claude.ai subscription login. These choices follow the [Agent SDK integration guidance](https://code.claude.com/docs/en/agent-sdk/overview). The unmodified external program remains governed by [Anthropic's applicable terms](https://code.claude.com/docs/en/legal-and-compliance); this project's GPL does not grant rights to that program, model services or credits. Users supply their own permitted credentials and are billed by their provider.

Codex is also a separately detected or explicitly installed execution program. Its [source license](https://github.com/openai/codex/blob/main/LICENSE) and the user's service agreement remain independent of the company interface.

## Artwork and names

The source includes the restored OpenAI and Claude character collection, the MIT-licensed Anthropic Buddy animations and six MIT-licensed community companions. Extracted Finder/MarginNote application icons remain excluded. Source, license and pending review records are documented in `licenses/artwork-review.md`, `licenses/release-review.json`, `THIRD_PARTY_NOTICES.md` and the adjacent asset `sources.json` files. The project GPL does not grant additional rights to vendor artwork or trademarks; attribution and publication do not constitute a redistribution license. Engine/OS names identify compatibility and do not imply endorsement.

## Release verification

`npm run release:check` requires the recorded source/artifact evidence. `--technical` checks engineering prerequisites only. Release packaging must verify that vendor engine modules have not re-entered production dependencies and that required matching sources are present. Credentials, personal workspaces, private screenshots and development Git history are not part of the public source snapshot.
