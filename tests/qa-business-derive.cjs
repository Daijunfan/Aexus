#!/usr/bin/env node
// Derive runnable copies of inherited renderer suites whose only blocker is an
// assertion that no longer matches the migrated product shape.
//
// Rules this tool follows:
//   * the original file is never modified (it belongs to another owner);
//   * only an explicitly listed replacement is applied, and each one must match
//     exactly once, otherwise the derivation fails loudly;
//   * only the listed assertion is restated — no assertion is deleted or weakened,
//     and the change is printed so the report can show it verbatim;
//   * harness plumbing is redirected (module resolution and `root`) because the
//     derived file lives outside the embedded Core's test directory.
//
// Usage: node tests/qa-business-derive.cjs [name ...]
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const repo = path.resolve(__dirname, '..')
const core = path.join(repo, 'AgentBoard', 'Aexus')
const testDir = path.join(core, 'test')
const outDir = path.join(repo, 'artifacts', 'full-acceptance-20261015', 'business-ui', 'derived')

// A few suites build the renderer themselves and so import a Core build tool by bare
// specifier (`import {build} from 'electron-vite'`). That resolves from the Core's test
// directory but not from the derived copy, which produced
//   ERR_MODULE_NOT_FOUND: Cannot find package 'electron-vite'
// on three of the ten copies. Point each of these at the same file the original would
// have loaded. Verified that the resolved entry keeps named imports working:
// `electron-vite` resolves to an ESM bundle whose named exports include `build`.
const requireFromCore = createRequire(path.join(core, 'package.json'))
const bareSpecifiers = ['electron-vite', 'vite', 'esbuild', 'sharp'].flatMap((name) => {
  let resolved
  try { resolved = requireFromCore.resolve(name) } catch { return [] }
  return [{
    find: `from '${name}'`,
    replace: `from ${JSON.stringify(resolved)}`,
    note: `resolve ${name} by absolute path`,
    all: true
  }]
})

// `plumbing` is applied to every derivation. It only changes how the script finds
// its dependencies, never what it asserts. A step that does not apply is skipped and
// recorded, because suites differ in how they import Playwright.
const plumbing = [
  {
    find: "import {_electron as electron,expect} from '@playwright/test'",
    replace: `const {_electron:electron,expect}=createRequire(${JSON.stringify(path.join(core, 'package.json'))})('@playwright/test')`,
    note: 'resolve Playwright from the embedded Core, which owns the devDependency'
  },
  {
    find: "const root=path.resolve(import.meta.dirname,'..')",
    replace: `const root=${JSON.stringify(core)}`,
    note: 'the derived file lives outside the Core, so pin its root'
  },
  {
    find: 'createRequire(import.meta.url)',
    replace: `createRequire(${JSON.stringify(path.join(core, 'package.json'))})`,
    note: 'resolve the Core module graph explicitly'
  },
  // The copy lives outside the Core, so bare and relative ESM specifiers no longer
  // resolve. Point them at the Core by absolute path — `@playwright/test` publishes an
  // `import` entry (`index.mjs`), so named imports keep working.
  {
    find: "from './fixtures/headless-core.mjs'",
    replace: `from ${JSON.stringify(path.join(core, 'test', 'fixtures', 'headless-core.mjs'))}`,
    note: 'point the Core fixture import at the Core'
  },
  {
    find: "from './fixtures/profile-application.mjs'",
    replace: `from ${JSON.stringify(path.join(core, 'test', 'fixtures', 'profile-application.mjs'))}`,
    note: 'point the profile-application fixture import at the Core'
  },
  {
    find: "from './fixtures/ui-contracts.mjs'",
    replace: `from ${JSON.stringify(path.join(core, 'test', 'fixtures', 'ui-contracts.mjs'))}`,
    note: 'point the ui-contracts fixture import at the Core'
  },
  {
    find: "from '@playwright/test'",
    replace: `from ${JSON.stringify(path.join(core, 'node_modules', '@playwright', 'test', 'index.mjs'))}`,
    note: 'resolve Playwright by absolute path to its ESM entry',
    all: true
  },
  ...bareSpecifiers
]

// Six inherited suites append a progress note to two documentation files that live in
// the upstream repository and were not carried into the migrated Core:
//   progress/Agents-company1.md
//   share_chat/Agents-company1-channel-views.md
// `note()` is called at module scope, so when the target is missing the suite throws
// ENOENT before it opens a browser and covers nothing at all. The redirection below
// changes only *where the note is written* — the appended text, the console line and
// every assertion are untouched. The replacement stays a relative path so the suite's
// own `path.join(root, …)` keeps working. Verified absent by
// `node tests/qa-business-triage-probe.cjs noteTargets`.
const noteRedirect = [
  {
    find: "'progress/Agents-company1.md'",
    replace: "'" + path.relative(core, path.join(outDir, 'harness-notes', 'progress', 'Agents-company1.md')) + "'"
  },
  {
    find: "'share_chat/Agents-company1-channel-views.md'",
    replace: "'" + path.relative(core, path.join(outDir, 'harness-notes', 'share_chat', 'Agents-company1-channel-views.md')) + "'"
  }
]
const noteRationale =
  'The suite writes a progress note into progress/Agents-company1.md and '
  + 'share_chat/Agents-company1-channel-views.md at module scope. The migrated Core has neither file '
  + 'nor their parent directories (`noteTargets` probe: exists=false, parentExists=false), so the suite '
  + 'dies with ENOENT before opening a browser. Redirecting the note target is a harness fix, not an '
  + 'assertion change: it is the difference between running the suite and not running it.'

// `restated` holds the only assertion changes, one entry per derivation.
const derivations = {
  'plan-ui-test': {
    rationale:
      'plan-ui-test.mjs:24 asserts 4 top-level navigation buttons. src/shared/app-views.ts declares '
      + 'company/messages/plan and TeamViews.tsx renders 1 picker + 2 switches = 3. Every other assertion '
      + 'in the suite — editor/preview/save, Table/Board/Calendar/List, filters, saved views, pause/resume, '
      + 'manual run with history, reload persistence — is unrelated to the view count and never ran.',
    restated: [{
      find: 'assert.equal(geometry.length,4);assert.deepEqual(geometry[0],geometry[1]);assert.deepEqual(geometry[1],geometry[2])',
      replace: 'assert.equal(geometry.length,3);assert.deepEqual(geometry[0],geometry[1]);assert.deepEqual(geometry[1],geometry[2])'
    }]
  },
  'group-chat-ui-test': {
    rationale:
      'group-chat-ui-test.mjs:34 asserts 4 top-level navigation buttons for the same reason; the rest of the '
      + 'suite (members, mentions, broadcast, scoped drafts, shared read receipts, compact layout) never ran.',
    restated: [{
      find: 'assert.equal(styles.length,4)',
      replace: 'assert.equal(styles.length,3)'
    }]
  },
  // The unread divider still renders and its position assertion still holds, but the
  // migrated row markup wrapped the <article> in a `div.group-message-row`
  // (`components/GroupConversation.tsx:190` opens the div, `:192` renders the article as
  // its child), so the original `divider.locator('+ article')` adjacent-sibling
  // traversal matches nothing and the suite times out at 15 s before asserting anything.
  // The traversal is restated; the assertion — that the message immediately after the
  // divider is the first unread one — is unchanged.
  'message-reading-ui-test': {
    rationale:
      'message-reading-ui-test.mjs:16 reads the message after the unread divider with the adjacent-sibling '
      + 'selector "+ article". The divider itself is unchanged (chat/UnreadDivider.tsx:6 still emits '
      + 'data-unread-boundary) and the article still carries data-group-message, but it is now nested one '
      + 'level deeper inside div.group-message-row, so the selector matches nothing and the suite dies on a '
      + '15 s locator timeout. Only the traversal is restated.',
    restated: [{
      find: "divider.locator('+ article')",
      replace: "divider.locator('+ .group-message-row > article')",
      all: true
    }]
  },
  // The flagship Messages walk. It empties the member list at line 25, which the
  // migrated Core refuses: `chat.create` now appoints an Owner
  // (`src/main/chat-groups.ts:56`, defaulting to the first member) and
  // `chat-groups.ts:65` throws "Transfer ownership before removing the Owner".
  // Verified live by `qa-business-triage-probe.cjs chatUpdateEmptyMembers`
  // (`ok:false`). The suite asserts nothing between that call and the restore on the
  // next line, so keeping the Owner as the sole member exercises the identical update
  // path and preserves every assertion.
  'messenger-ui-test': {
    rationale:
      'messenger-ui-test.mjs:25 calls chat.update with members:[] after chat.create made the first member '
      + 'the group Owner. The Core now enforces an ownership invariant (chat-groups.ts:65, probe '
      + 'chatUpdateEmptyMembers returns ok:false "Transfer ownership before removing the Owner"), so the '
      + 'suite aborts before the entire Messages walk: pin, favorites, archive scopes, saved messages, '
      + 'reactions, pinned-message strip, forward with note, formatting, emoji, direct and group draft '
      + 'survival across reload, full-history search past the 100-message viewport, reply navigation, '
      + 'text quoting and reply-in-another-conversation. No assertion sits between the emptied list and '
      + 'the restore on the following line, so retaining the Owner changes no expectation.',
    restated: [{
      find: "await call('chat.update',{id:group.id,members:[]});",
      replace: "await call('chat.update',{id:group.id,members:[a.id]});"
    }]
  },
  // Recovered: these die at module scope on the missing note-log paths.
  'conversation-controls-ui-test': { rationale: noteRationale, harness: noteRedirect },
  'message-wallpaper-ui-test': { rationale: noteRationale, harness: noteRedirect },
  'mentions-engines-ui-test': { rationale: noteRationale, harness: noteRedirect },
  'plan-authority-ui-test': { rationale: noteRationale, harness: noteRedirect },
  'employee-view-refresh-ui-test': { rationale: noteRationale, harness: noteRedirect },
  // This one names the path twice (its `note` target *and* a root-only chown list), so
  // the shared redirect is ambiguous; match the assignment instead.
  'channel-post-views-ui-test': {
    rationale: noteRationale,
    harness: [{
      find: "path.join(root,'progress/Agents-company1.md')",
      replace: 'path.join(root,'
        + "'" + path.relative(core, path.join(outDir, 'harness-notes', 'progress', 'Agents-company1.md')) + "')"
    }]
  }
}

// `restated` and `harness` changes must each match exactly once, so a drift in the
// original is a loud failure rather than a silent no-op. `plumbing` is allowed to miss
// (suites import Playwright differently), and what applied is recorded in the manifest.
function apply(text, steps, label, { optional = false } = {}) {
  let out = text
  const applied = []
  for (const step of steps) {
    const first = out.indexOf(step.find)
    if (first === -1) {
      if (optional) continue
      throw new Error(`${label}: pattern not found: ${step.find.slice(0, 80)}`)
    }
    // A step may declare `all:true` when the same stale pattern legitimately appears more
    // than once and every occurrence needs the identical restatement; otherwise a repeat
    // is an error, because the caller has not proven the occurrences are equivalent.
    if (!step.all && out.indexOf(step.find, first + 1) !== -1) throw new Error(`${label}: pattern is ambiguous: ${step.find.slice(0, 80)}`)
    out = step.all ? out.split(step.find).join(step.replace) : out.replace(step.find, step.replace)
    applied.push((step.all ? '[all] ' : '') + (step.note || step.find.slice(0, 60)))
  }
  return { out, applied }
}

function main() {
  const requested = process.argv.slice(2)
  const names = requested.length ? requested : Object.keys(derivations)
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(path.join(outDir, 'harness-notes', 'progress'), { recursive: true })
  fs.mkdirSync(path.join(outDir, 'harness-notes', 'share_chat'), { recursive: true })
  const manifest = []
  for (const name of names) {
    const spec = derivations[name]
    if (!spec) throw new Error('no derivation defined for ' + name)
    const source = path.join(testDir, name + '.mjs')
    const original = fs.readFileSync(source, 'utf8')
    const restated = apply(original, spec.restated || [], name + ' restatement')
    const harness = apply(restated.out, spec.harness || [], name + ' harness')
    const derived = apply(harness.out, plumbing, name + ' plumbing', { optional: true })
    const target = path.join(outDir, name + '.qa.mjs')
    fs.writeFileSync(target, derived.out)
    manifest.push({
      name,
      source: path.relative(repo, source),
      derived: path.relative(repo, target),
      originalLines: original.split('\n').length,
      derivedLines: derived.out.split('\n').length,
      rationale: spec.rationale,
      restated: (spec.restated || []).map((step) => ({ from: step.find, to: step.replace })),
      harness: (spec.harness || []).map((step) => ({ from: step.find, to: step.replace })),
      plumbing: derived.applied
    })
    console.log(`derived ${name}: ${manifest.at(-1).originalLines} -> ${manifest.at(-1).derivedLines} lines`
      + ` (restated=${manifest.at(-1).restated.length} harness=${manifest.at(-1).harness.length} plumbing=${manifest.at(-1).plumbing.length})`)
    for (const change of manifest.at(-1).restated) console.log(`  restated assertion: ${change.from}\n                   -> ${change.to}`)
    for (const change of manifest.at(-1).harness) console.log(`  harness redirect:   ${change.from}\n                   -> ${change.to}`)
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), derivations: manifest }, null, 2))
  console.log('manifest: ' + path.relative(repo, path.join(outDir, 'manifest.json')))
}

main()
