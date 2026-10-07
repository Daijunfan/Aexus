# Engine library and scoped Infra

## Opening a workspace

A new application client starts at the **Engine library**. Only installed Engine names,
cover artwork, descriptions and versions are shown. No Engine Page, Company canvas,
employee transcript, Messages list, Plan database or file drawer is mounted before Load.
Selecting a card is a preview; clicking **Load** or dropping it into the launch dock opens
that Engine. Loading does not send a prompt, hire employees or invoke a model.

Inside a loaded workspace the header exposes **Engine / Infra** and the current Engine.
Company, Messages, all ten Plan layouts and the file browser use the same resource scope.
**Back to engine library** returns to the launcher without cancelling work.

The viewed Engine is per client, not the global running Engine. Two browser windows may
view different Engines. Multiple workflows, employee turns and schedules run concurrently
under their own persisted Engine identity. Switching A → B or A → home → A neither
restarts those tasks nor reassigns them. Cancelling a task is a separate explicit operation.

A browser-created or duplicated window cannot inherit another live window’s client ID.
Each document claims its saved ID using an exclusive browser lock; a copied window
receives a new ID and starts at the library. Reloading the original window reuses its
ID after the previous document releases it. Where Web Locks are unavailable, each
page load starts with a fresh identity rather than risking shared selection. The
authenticated user and background task ownership are unaffected.

## Public CLI

The original authenticated CLI and Contract transport are retained:

```sh
aexus contract engines --json
aexus view load-engine deep-research --json
aexus view launcher --json

aexus --engine-scope deep-research infra group list --json
aexus --engine-scope deep-research session list --json
aexus --engine-scope deep-research chat list --json
aexus --engine-scope deep-research channel list --json
aexus --engine-scope deep-research plan query --json
aexus --engine-scope deep-research assets tree --json

# Equivalent fixed scope for a CLI process:
AEXUS_ENGINE_ID=deep-research aexus session status --json
```

`view.load-engine` and `view.launcher` affect only the addressed presentation client;
CLI resource calls use `--engine-scope` or `AEXUS_ENGINE_ID` independently. A background
Engine must never infer its work scope from another window's `view.get` result.
The scope is transported through local sockets, HTTP CLI, Contract calls and session
following. An inherited task/Engine scope cannot be replaced by a nested request.
A browser cannot change its workspace scope by attaching a different Engine ID to a
normal API request; it must explicitly load that Engine first.

For backwards-compatible human administration, CLI requests without an Engine scope
retain original Core discovery and authorization. The launcher uses explicit null scope,
not the administrative unscoped channel. An Engine scope restricts existing authorization;
it never grants a role, another employee's credentials or unrestricted OS file access.

## Existing and new resources

New resources created inside a scoped Engine are linked to it. Existing unassigned data
is retained, not automatically assigned by guessing a name. The user opens **Linked
Engine resources** to associate selected Teams, employees, groups, channels or schedules.

```sh
aexus infra scope --engine-id deep-research --available --json
aexus infra bind --engine-id deep-research --resources '{"teams":["Research"]}' --json
aexus infra unbind --engine-id deep-research --resources '{"employees":["EMPLOYEE_ID"]}' --json
```

Use `expectedRevision` when saving an edited selection. Conflicts retain the draft and
require an explicit reload. Binding or unbinding never clones or deletes employees,
conversations, tasks, files or native sessions, and never changes Company or conversation
roles. The user may explicitly link a resource to more than one Engine.

A linked Team includes its current and future employees. An individually linked employee
can show its Team label without revealing unlinked colleagues or the whole Team file root.
Group/channel associations include related participants. Explicit exclusions survive
restart and are not undone by restoring a workflow checkpoint. Renaming display names
does not move workspaces; deleting resources removes them from the live projection.

## Isolation during asynchronous work

Core checks both lists and explicit object targets. Directory counts, pagination, topology
summaries, pending relationships and file indexes are computed within the same scope.
A known ID is not sufficient to read another Engine's employee, discussion, task or file.

Workflows pin their own Engine identity for each Contract operation; scheduled and native
tasks retain their original delegation. The full internal event stream remains available
to those services regardless of which Engine is visible. Only presentation copies are
filtered. Window events carry Engine and navigation revision metadata, so queued events
from an earlier Engine, including an earlier visit to the same Engine, are discarded.
Late HTTP responses are discarded, but successful mutations are never automatically replayed.

A scoped `session.follow` subscription checks scope before returning the initial snapshot
and again as events arrive. Removing its association closes the subscription without
stopping the native task. Browser following also closes when its selected workspace changes;
independent CLI subscriptions remain pinned to their own original Engine.

## Files and original permissions

The original Company workspaces, group/channel originals and employee subdirectories
remain in place. An employee-only association does not expose the parent Team's file root.
File reading and writing still pass the existing member and ownership checks. Ordinary
members cannot edit user originals or peer directories; any established Secretary rules
remain governed by the existing role policy. Copying authorized files into the employee's
own workspace stays available.

This is authenticated application/API scoping in a single-owner Core, not a security
sandbox for arbitrary trusted code running as the same operating-system account.

## Verification

```sh
npm run test:engine-scope
npm run typecheck
npm run contract:check
```

The scope suite covers source-level event/SDK contracts, real CLI arguments, authenticated
HTTP and streaming, scoped cross-view queries, parallel native/workflow execution,
restart/exclusion recovery, actual drag-and-drop/touch components, and complete Web and
hidden desktop flows. Tests use disposable state and deterministic native protocol
fixtures, never formal employee data or billed inference. Logs retain failed attempts;
only actual successful reruns are reported as passed. A build is not an installation.
