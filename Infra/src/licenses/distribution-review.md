# Distribution review for 0.49.1

## Combined covered application

The release uses GPL-3.0-only for the combined application. `LICENSE` is byte-identical to the included MiniNotion GPL text. The original Apache-2.0 notices remain in `NOTICE` and `Infra/src/licenses/host-original-Apache-2.0.txt`; the Cloud Hosts and Margin Reader source retains its Apache-2.0/MIT notices. All three plugin source trees, exact lockfiles and build scripts are included by `Infra/src/tooling/source-files.mjs`.

The unmodified BlockNote 0.54.2 source archive contains 5,442 entries, including the multi-column TypeScript sources, build inputs and GPL license. Its SHA-256 was independently recomputed against `Infra/src/licenses/upstream/blocknote-source.json`. The full release gate verifies that digest. Binary publication must include the matching application source archive, including this upstream archive.

## External Claude Agent runtime

The host and MiniNotion list the SDK only as a development dependency. Host production installation and the plugin runtime copy exclude it. `Infra/src/main/engines/claude-sdk.ts` loads a separately installed user copy; `installer.ts` downloads the SDK and native executable only after explicit confirmation from pinned official npm URLs and verifies their SHA-512 values. No package install scripts are executed. The downloaded package retains its original license.

A 0.49.1 macOS candidate was inspected: zero Claude SDK/native package entries in app.asar and zero SDK package directories in the bundled plugin resources. The official installation test also downloaded both pinned native engines and the Claude controller into temporary user data, executed their version commands, imported the controller exports and verified cancellation preserves the previous installation. This test made no model calls. Final platform packages must repeat the absence inspection.

This resolves redistribution by excluding the vendor runtime, rather than asserting permission to relicense it. Public UI and documentation identify the integration as Claude Agent and configure API keys/providers; the integration does not offer claude.ai subscription login. Vendor program and service terms remain separate. See `LICENSING.md`.

## Reproduce

Run `npm run release:check`, build the desired platform package on that OS, inspect its ASAR and plugin runtime directories for `@anthropic-ai/claude-agent-sdk` (including platform native packages), and run `Infra/src/test/packaged-desktop-smoke-test.mjs` from a copy outside the source checkout. The optional `Infra/src/test/engine-install-test.mjs` downloads pinned official artifacts but does not perform inference.
