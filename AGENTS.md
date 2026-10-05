# Avalon contributor instructions

Keep changes small and preserve the existing CLI-first boundaries. Read `CONTRIBUTING.md`, `SECURITY.md`, `API.md` and `PERMISSIONS.md` before changing execution or authority. Do not launch child Agents unless the task explicitly requests them.

## Core and presentation

- Business behavior belongs to the Node Core. Electron and browser UI call the same authenticated operations; UI behavior cannot bypass the CLI/API.
- Update the command registry, Core dispatch, CLI parser, API documentation and tests together. Run `npm run docs:managers` after changing API or permission documentation.
- Keep Team, employee, native-session and workspace identities stable. Employee engines are fixed at creation; using another engine requires deleting the employee and creating a new one. Preserve archived native references from older versions. Never silently change execution host or elevate permissions.
- “Local” means the Core host. Browser-local files must be uploaded, not treated as server paths. Client navigation/cameras are separate from shared company geometry.
- Secretary/Governor/Manager authority comes from the role policy. Secretary is the highest Agent application-administration role; only the user may appoint, demote or delete Secretaries. Creation lines, directory names and view membership do not grant permissions.

## Plugins and engines

- All three first-release plugins are source-versioned under `PlugIns/`. Keep their licenses, CLI, runtime, schema, UI and build inputs together; update `plugins.lock.json` deliberately.
- User workspaces and credentials are not source. Portable plugin workspaces live outside application binaries; existing bound directories are never moved automatically.
- An engine adapter handles its documented execution protocol and normalizes results. It cannot bypass Core permissions. Unsupported capabilities must fail explicitly.
- Never mark a pending redistribution review approved without actual evidence. Attribution does not establish permission to redistribute vendor artwork or runtimes.

## Verification and user data

- Promotional output directories, including per-post and per-view folders, must use English names. Keep asset links and generation paths synchronized when renaming.

- Test with temporary `AGENTS_COMPANY_HOME`, workspace and native-profile directories. Never create/delete test employees or run sample schedules in real user state.
- Use deterministic protocol/model fixtures by default. Billed model calls, real-host changes and native child Agents require explicit authorization; record what actually ran.
- Test desktop rendering in hidden windows and Web rendering in headless browsers. Do not claim another operating system passed based on a local build.
- Preserve existing edits. Never reset the repository, clear credentials, overwrite user documents, or publish a repository/tag/package without explicit permission.
- Builds do not imply installation. Do not stop or replace another developer's running app automatically. When a user explicitly requests installation, inspect active tasks, back up state and stop the old process before replacing its ASAR.
- For an authorized macOS installation, use `npm run install:mac -- --source '/path/Avalon.app'`, then verify the installed app in an isolated hidden-window test. Do not hand-roll hot replacement.

## Release

`npm run release:check -- --technical` checks engineering prerequisites. Full `release:check` also enforces unresolved redistribution reviews. Candidate archives are private artifacts until those reviews are complete. Every validation report must separate passed, failed, skipped and untested platforms.
