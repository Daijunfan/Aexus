# Contributing

Start with `README.md`, `ARCHITECTURE.md`, `API.md` and `PERMISSIONS.md`. Read `SECURITY.md` before working on execution, authentication, files or plugins. The project is CLI-first: a UI action calls the same authorized Core operation as the CLI.

## Development

```sh
npm ci
npm run setup
npm run build:plugins
npm run build
npm run typecheck
npm run test:release-core
npm run dev
```

Keep Node/npm within the supported versions in `package.json`. Validate Mac and Windows desktop packages on their respective systems. Linux validation covers the Core/Web backend and a browser client on another computer; a remote Windows host test is not equivalent to testing a Windows Core.

All three bundled plugin source trees are versioned with this repository. Change the plugin in `PlugIns/<name>`, preserve its license and update `plugins.lock.json` when its version changes. Use `examples/plugin-starter` for a new plugin. Do not include working documents, credentials, browser profiles, dependency directories or generated runtime state.

## Changes and tests

Keep changes scoped. Existing Team identities, native session references, workspace bindings, scheduling rules, initialization visibility, read receipts and CLI permissions are compatibility boundaries. An unsupported adapter capability must fail clearly instead of switching execution hosts or escalating privileges.

For a new API, update the registry, Core, CLI, documentation and behavior tests together, then run `npm run docs:managers`. Browser and desktop operations must use the same Core authorization. A simulated UI click is not a substitute for a business API test.

The test groups are separate:

- `test:release-core`: isolated Core/CLI and geometry/authorization tests with protocol fixtures; no billed inference.
- `test:release-ui`: hidden Mac/Windows desktop and browser end-to-end checks; Linux runs the browser suite. Browser tests need Playwright Chromium or `AGENTS_BROWSER_CHANNEL=chrome`.
- `test:release-engines`: actual installed engine processes against a local deterministic model fixture. Codex can be selected with `AGENTS_TEST_CODEX_BIN`.
- Tests named `*-live*`: opt-in only. For an authorized real-model smoke test, prefer the configured Cline/Pi gateway; use other engines when their specific behavior needs validation. Never silently fall back to another paid provider. Read each test's required authorization, execution host, model and cleanup before running. Never let an ordinary CI run use paid models or real user workspaces.

Use a fresh `AGENTS_COMPANY_HOME` and temporary workspace roots for tests. Do not launch, stop, install over, or manipulate another developer's running desktop or scheduler automatically. Do not run a model or create native child agents unless the task explicitly requires and authorizes it.

## Pull requests

Explain the problem, behavior change and tests actually run. Include screenshots for UI changes and identify the platform and engine versions used. Describe migration and rollback for data changes. Do not report a skipped test as passed.

Keep public screenshots and diagnostics free of passwords, tokens, private hostnames and customer content. For security issues, follow the private reporting guidance in `SECURITY.md` rather than posting exploit details publicly.

## Release checks

```sh
npm run release:check -- --technical
npm run release:source
npm run release:check
```

Technical checks are not licensing approval. Pending entries in `licenses/release-review.json` must have real documented evidence before public redistribution. Never clear a review merely to make the build pass. Do not push a release, package, tag or public repository without the maintainer's explicit approval.
