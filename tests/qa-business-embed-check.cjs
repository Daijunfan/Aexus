#!/usr/bin/env node
// Hosted-branch check for the embedded Aexus renderer.
//
// Every inherited `AgentBoard/Aexus/test/*-ui-test.mjs` web suite logs in through the
// standalone `.web-login` control-token form, so none of them exercises the hosted
// branch the Aexus host actually loads (`ui/aexus-embed.js` → `?aexus-host=cloudhosts`).
// This check boots the same Core in web mode and loads the compiled renderer twice:
// once as the hosted frame and once standalone, then asserts the branch-specific DOM.
//
// It deliberately does NOT perform the hosted postMessage/ticket handshake — that
// belongs to the auth worker's lifecycle harness. What it proves is narrower and
// still useful: in hosted mode the renderer takes the hosted branch (no owner-token
// form, hosted Core status gate, no top-level view switcher, hosted DOM marker set).
//
// Isolated `AGENTS_COMPANY_HOME`; no product source, git, installed app or user state
// is touched. Usage: node tests/qa-business-embed-check.cjs
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const repo = path.resolve(__dirname, '..')
const core = path.join(repo, 'AgentBoard', 'Aexus')
const outRoot = path.join(repo, 'artifacts', 'full-acceptance-20261015', 'business-ui')
const requireFromCore = createRequire(path.join(core, 'package.json'))

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function main() {
  const { chromium } = requireFromCore('@playwright/test')
  const { fixtureCore } = await import(pathToFileURL(path.join(core, 'test', 'fixtures', 'headless-core.mjs')).href)
  const port = await freePort()
  const fixture = await fixtureCore({ AGENTS_COMPANY_WEB: '1', AGENTS_COMPANY_WEB_PORT: String(port) })
  const report = { port, checks: [], errors: [], mode: {} }
  const check = (label, condition, detail) => {
    report.checks.push({ label, ok: !!condition, detail })
    assert.ok(condition, label + (detail ? ' — ' + JSON.stringify(detail) : ''))
  }
  let browser
  try {
    await fixture.cli('group', 'add', 'Embed Team')
    browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), headless: true })

    // --- Hosted frame ---------------------------------------------------------
    const hostedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const hosted = await hostedContext.newPage()
    hosted.on('pageerror', (error) => report.errors.push({ page: 'hosted', message: error.message }))
    await hosted.goto(`http://127.0.0.1:${port}/?aexus-host=cloudhosts&client=qa-business-embed-check-000000000001`)
    await hosted.locator('.hosted-core-connection').waitFor({ timeout: 20000 })

    check('hosted mode sets the hosted DOM marker',
      await hosted.evaluate(() => document.documentElement.dataset.cloudhostsEmbedded) === 'true')
    check('hosted mode renders the host-managed Core gate, not the owner-token form',
      await hosted.locator('.web-login form.web-login').count() === 0
        && await hosted.locator('.web-login-overlay').count() === 1)
    check('hosted gate names the host as the authority',
      (await hosted.locator('.hosted-core-connection').innerText()).includes('host manages the Agent Core session'))
    report.mode.hostedViewButtons = await hosted.locator('.app-view-button').count()
    check('hosted mode does not render the standalone top-level view switcher',
      report.mode.hostedViewButtons === 0, { count: report.mode.hostedViewButtons })
    check('hosted mode is not a blank page',
      (await hosted.evaluate(() => document.body.innerText.trim().length)) > 0)
    report.mode.hostedStyleApplied = await hosted.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--company-header-height').trim() !== '')
    await hosted.screenshot({ path: path.join(outRoot, 'hosted-branch.png'), animations: 'disabled' })
    await hostedContext.close()

    // --- Standalone (what the inherited suites drive) -------------------------
    const standaloneContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const standalone = await standaloneContext.newPage()
    standalone.on('pageerror', (error) => report.errors.push({ page: 'standalone', message: error.message }))
    await standalone.goto(`http://127.0.0.1:${port}/`)
    await standalone.locator('.web-login input').waitFor({ timeout: 20000 })
    check('standalone mode keeps the owner-token login form',
      await standalone.locator('.web-login form.web-login, form.web-login').count() === 1)
    check('standalone mode is not marked hosted',
      await standalone.evaluate(() => document.documentElement.dataset.cloudhostsEmbedded ?? null) === null)
    report.mode.standaloneBrand = await standalone.locator('.web-login h1').innerText()
    await standalone.locator('.web-login input').fill(fs.readFileSync(path.join(fixture.env.AGENTS_COMPANY_HOME, 'control.token'), 'utf8').trim())
    await standalone.getByRole('button', { name: 'Enter workspace', exact: true }).click()
    await standalone.locator('.infinite-canvas').waitFor({ timeout: 20000 })
    report.mode.standaloneViewButtons = await standalone.locator('.app-view-button').count()
    report.mode.standaloneViewLabels = await standalone.locator('.app-view-button span').allInnerTexts()
    report.mode.appViewSource = 'AgentBoard/Aexus/src/shared/app-views.ts'
    await standaloneContext.close()

    check('no uncaught renderer error in either branch', report.errors.length === 0, report.errors)
    console.log('PASS hosted/standalone branch check')
    console.log(JSON.stringify(report, null, 2))
    fs.mkdirSync(outRoot, { recursive: true })
    fs.writeFileSync(path.join(outRoot, 'embed-check.json'), JSON.stringify({ passed: true, ...report }, null, 2))
  } catch (error) {
    fs.mkdirSync(outRoot, { recursive: true })
    fs.writeFileSync(path.join(outRoot, 'embed-check.json'), JSON.stringify({ passed: false, failure: error.message, ...report }, null, 2))
    throw error
  } finally {
    await browser?.close()
    await fixture.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
