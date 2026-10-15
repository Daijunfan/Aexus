#!/usr/bin/env node
// Focused triage probes for the business-UI failures.
//
// Each probe answers one question that separates "product defect" from "fragile
// inherited assertion" from "harness/fixture infrastructure". It uses the same
// disposable fixture Core as the inherited suites and touches nothing outside an
// isolated AGENTS_COMPANY_HOME.
//
// Usage: node tests/qa-business-triage-probe.cjs [probeName ...]
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const repo = path.resolve(__dirname, '..')
const core = path.join(repo, 'AgentBoard', 'Aexus')
const outRoot = path.join(repo, 'artifacts', 'full-acceptance-20261015', 'business-ui')

const probes = {}

// Does a fully initialized fixture employee have a private reply at all?
// `chat-editing-ui-test.mjs:86` reads `.lastReply.readAt` without optional chaining
// after only *group* sends, so it fails if the projection legitimately has no reply.
probes.initReply = async (fixture) => {
  await seedTeam(fixture)
  const card = await fixture.cli('card', 'create', '--title', 'Probe Aster', '--group', 'A',
    '--engine', 'codex', '--model', 'gpt-6-luna', '--effort', 'low')
  await fixture.ready(card.id)
  const status = (await fixture.cli('session', 'status', '--employee', card.id))[0]
  const inbox = await fixture.cli('session', 'inbox')
  return {
    question: 'After initialization reaches ready, does session.status expose lastReply?',
    initialized: status.initialization?.status,
    lastReply: status.lastReply ?? null,
    inboxUnread: inbox.find((item) => item.employeeId === card.id)?.unread ?? null,
    conclusion: status.lastReply === undefined
      ? 'no private reply exists before any private send; a suite that reads .lastReply.readAt without optional chaining is fragile, and any intent to prove "group work leaves the private unread state alone" is unverifiable in that fixture'
      : 'a private reply does exist after initialization'
  }
}

// Does routed group work mark read state on deliveries, and does a group-only
// conversation ever create a private lastReply?
probes.groupRouting = async (fixture) => {
  await seedTeam(fixture)
  const card = await fixture.cli('card', 'create', '--title', 'Probe Rowan', '--group', 'A',
    '--engine', 'codex', '--model', 'gpt-6-luna', '--effort', 'low')
  await fixture.ready(card.id)
  const group = (await fixture.request(null, 'chat.create', { name: 'Probe group', members: [card.id] })).data
  await fixture.request(null, 'chat.send', { id: group.id, text: 'Probe group request for @Rowan', mentions: [card.id], clientMessageId: 'probe-group-1' })
  const settled = await fixture.until(async () => {
    const history = await fixture.request(null, 'chat.history', { id: group.id })
    const value = history.data.messages.at(-1)
    return value?.deliveries?.every((item) => item.readAt !== undefined) ? value : false
  }, 'group delivery read state')
  const status = (await fixture.cli('session', 'status', '--employee', card.id))[0]
  return {
    question: 'Does routed group work produce deliveries with readAt, and leave lastReply unset?',
    deliveries: settled.deliveries.map((item) => ({ employeeId: item.employeeId, mode: item.mode, status: item.status, readAt: item.readAt ?? null, ackMessageId: item.ackMessageId ?? null })),
    lastReply: status.lastReply ?? null,
    conclusion: settled.deliveries.some((item) => item.readAt !== undefined)
      ? 'group deliveries do carry read acknowledgements; the projection is populated'
      : 'group deliveries did not reach a read state in this fixture'
  }
}

// How many top-level views does the compiled renderer actually expose, and is the
// fourth view the acquired suites expect present anywhere?
probes.views = async () => ({
  question: 'How many top-level presentation views exist in the source of truth?',
  appViewsFile: 'AgentBoard/Aexus/src/shared/app-views.ts',
  appViews: fs.readFileSync(path.join(core, 'src', 'shared', 'app-views.ts'), 'utf8')
    .split('\n').filter((line) => /id:'/.test(line)).map((line) => (line.match(/id:'([^']+)'/) || [])[1]),
  assertFourViewSuites: ['group-chat-ui-test.mjs', 'plan-ui-test.mjs'],
  conclusion: 'two inherited suites assert 4 .app-view-button elements; the current source declares 3 views and renders 3 standalone (1 picker + 2 switches)'
})

// messenger-ui-test.mjs:25 dies on `call('chat.update',{id:group.id,members:[]})` with
// `page.evaluate: Object` — the renderer bridge rethrows a non-Error RPC payload, so the
// log hides the reason. Ask the Core directly.
probes.chatUpdateEmptyMembers = async (fixture) => {
  await seedTeam(fixture)
  const card = await fixture.cli('card', 'create', '--title', 'Probe Juniper', '--group', 'A',
    '--engine', 'codex', '--model', 'gpt-6-luna', '--effort', 'low')
  await fixture.ready(card.id)
  const group = (await fixture.request(null, 'chat.create', { name: 'Probe messenger', members: [card.id] })).data
  const emptied = await fixture.request(null, 'chat.update', { id: group.id, members: [] })
  const reread = await fixture.request(null, 'chat.get', { id: group.id })
  return {
    question: 'Does chat.update accept an emptied member list, and what does it say otherwise?',
    ok: emptied.ok,
    error: emptied.error ?? null,
    membersAfter: reread.data?.members?.length ?? null,
    conclusion: emptied.ok
      ? 'the call is accepted; messenger-ui-test.mjs fails for a different reason and must be re-probed'
      : 'the Core rejects an empty member list, so messenger-ui-test.mjs:25 cannot reach the rest of the suite; decide whether the rejection is intended (then restate the suite) or a regression'
  }
}

// conversation-controls/message-wallpaper crash at module load appending to repo files
// that the migration removed. Confirm the targets rather than assuming.
probes.noteTargets = async () => ({
  question: 'Do the progress/share_chat files that two suites append to at module load exist?',
  files: ['progress/Agents-company1.md', 'share_chat/Agents-company1-channel-views.md'].map((relative) => ({
    relative,
    exists: fs.existsSync(path.join(core, relative)),
    parentExists: fs.existsSync(path.dirname(path.join(core, relative)))
  })),
  users: ['conversation-controls-ui-test.mjs:11-12', 'message-wallpaper-ui-test.mjs:12-13'],
  conclusion: 'the suite `note()` helper appends to a repository file instead of an artifact path; when that file is absent the suite dies before it opens a browser, so it currently covers nothing'
})

// `card create --group A` requires Team A to exist; the inherited suites add it first.
async function seedTeam(fixture) {
  const groups = await fixture.cli('group', 'list')
  if (!groups.some((group) => group.name === 'A')) await fixture.cli('group', 'add', 'A')
}

async function main() {
  const requested = process.argv.slice(2)
  const names = requested.length ? requested : Object.keys(probes)
  const needsCore = names.some((name) => ['initReply', 'groupRouting', 'chatUpdateEmptyMembers'].includes(name))
  const results = {}
  let fixture
  try {
    if (needsCore) {
      const { fixtureCore } = await import(pathToFileURL(path.join(core, 'test', 'fixtures', 'headless-core.mjs')).href)
      fixture = await fixtureCore({})
    }
    for (const name of names) {
      if (!probes[name]) throw new Error('unknown probe: ' + name)
      results[name] = await probes[name](fixture)
      console.log('--- ' + name)
      console.log(JSON.stringify(results[name], null, 2))
    }
    fs.mkdirSync(outRoot, { recursive: true })
    fs.writeFileSync(path.join(outRoot, 'triage-probes.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2))
  } finally {
    await fixture?.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
