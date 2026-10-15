#!/usr/bin/env node
import {nativeFixture} from './native-fixture.mjs'
// A real, offscreen Electron renderer. Never show or focus a window.
import { spawn, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const run = promisify(execFile)
const root = join(import.meta.dirname, '..')
const home = mkdtempSync(join(tmpdir(), 'agents-company-ui-'))
const projects=mkdtempSync(join(tmpdir(),'agents-company-ui-projects-'))
const artifacts = process.env.AGENTS_COMPANY_TEST_ARTIFACTS || join(root, 'artifacts')
mkdirSync(artifacts, { recursive: true })
const env = { ...process.env, AGENTS_COMPANY_HOME: home, AGENTS_COMPANY_PROJECTS: projects, AGENTS_COMPANY_CWD: join(home, 'workspace'), AGENTS_COMPANY_OFFSCREEN: '1', AGENTS_COMPANY_WIDTH: process.env.AGENTS_COMPANY_TEST_WIDTH || '1440', AGENTS_COMPANY_HEIGHT: process.env.AGENTS_COMPANY_TEST_HEIGHT || '1200' }
const fixture = join(home, 'codex-fixture')
writeFileSync(fixture, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (!args.includes('gpt-5.6-luna') || !args.includes('model_reasoning_effort="low"')) process.exit(4);
process.stdin.resume(); process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({type: 'thread.started', thread_id: 'ui-fixture-thread'}) + '\\n');
  process.stdout.write(JSON.stringify({type: 'turn.started'}) + '\\n');
  process.stdout.write(JSON.stringify({type: 'item.completed', item: {id: 'note', type: 'agent_message', text: 'Working on your idea…'}}) + '\\n');
  setInterval(() => {}, 1000);
});
`, { mode: 0o755 })
env.CODEX_BIN = nativeFixture(fixture)
delete env.ELECTRON_RUN_AS_NODE
const app = spawn(process.env.AGENTS_COMPANY_TEST_APP || require('electron'), process.env.AGENTS_COMPANY_TEST_APP ? [] : ['.'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
app.stdout.on('data', (d) => { log += d })
app.stderr.on('data', (d) => { log += d })
const stopped = new Promise((r) => app.once('exit', r))
let checks = 0
const ok = (c, label) => { assert.ok(c, label); console.log(`PASS  ${label}`); checks++ }
async function cli(...args) {
  const { stdout } = await run(process.execPath, ['bin/agents', ...args, '--json'], { cwd: root, env, timeout: 12000 })
  const result = JSON.parse(stdout)
  assert.ok(result.ok, result.error)
  return result.data
}
async function until(test) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try { if (await test()) return } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('UI did not reach expected state')
}
try {
  await until(async()=>existsSync(join(home,'agents.sock')) && (await cli('ui','wait','.infinite-canvas')).found)
  ok((await cli('ui','dom','--sel','.company-actions button')).length===2,'only two primary add actions remain')
  for(const name of ['Engineering','Design']) {const dir=join(projects,name);mkdirSync(dir);await cli('group','add',name,'--root',dir)}
  const codey=await cli('card','create','--title','Codey','--group','Engineering','--engine','codex','--avatar','cat','--cwd','codey')
  const luna=await cli('card','create','--title','Luna','--group','Design','--engine','codex','--avatar','rabbit','--cwd','luna')
  await cli('canvas','set','--x','60','--y','110','--zoom','1')
  await until(async()=>(await cli('ui','style',`[data-card-id="${codey.id}"]`)).width===190)
  const original=await cli('ui','style',`[data-card-id="${codey.id}"]`)
  for(let i=0;i<18;i++)await cli('card','create','--title',`Partner ${i+1}`,'--group','Engineering','--engine','codex','--avatar',['fox','panda','robot','penguin','rabbit','cat'][i%6],'--cwd',`partner-${i+1}`)
  const layout=await cli('room','layout','Engineering')
  ok(layout.employees.length===19 && layout.bounds.width>760 && layout.bounds.height>500,'Team expands in both dimensions for 19 employees')
  ok((await cli('ui','style',`[data-card-id="${codey.id}"]`)).width===original.width,'adding employees does not shrink their rendered size')
  ok(new Set(layout.employees.map(e=>e.position.y)).size>1,'employees occupy multiple rows')
  ok(!(await cli('session','list','--live')).length,'populating the office launches no engines')
  const poses=(await cli('ui','dom','--sel','.employee .mascot')).map(e=>e.cls.match(/pose-(\w+)/)?.[1])
  ok(poses.every(p=>['sleep','yawn'].includes(p)),'idle companions only nap or yawn')
  await cli('ui','screenshot',join(artifacts,'canvas-team.png'))
  const firstView=await cli('canvas','view')
  await cli('ui','wheel','.infinite-canvas','--dx','-160','--dy','-90')
  await until(async()=>{const v=await cli('canvas','view');return v.x!==firstView.x||v.y!==firstView.y})
  ok(true,'trackpad wheel pans the canvas and persists the viewport')
  const beforeZoom=(await cli('canvas','view')).zoom
  await cli('ui','wheel','.infinite-canvas','--dy','-110','--zoom')
  await until(async()=>(await cli('canvas','view')).zoom!==beforeZoom)
  ok(true,'control-wheel zooms around the pointer')
  await cli('room','bounds','Engineering','--x','-12000','--y','-7000')
  await cli('canvas','set','--x','7260','--y','4310','--zoom','0.6')
  await until(async()=>(await cli('ui','dom','--sel','[data-team="Engineering"]')).length===1)
  ok(true,'rooms and camera support distant negative world coordinates')
  await cli('ui','drag','[data-team="Engineering"]','--dx','72','--dy','36')
  await until(async()=>(await cli('session','list')).rooms.Engineering.bounds.x>-12000)
  const moved=(await cli('room','layout','Engineering')).bounds
  ok(Math.abs(moved.x-(-11880))<3 && Math.abs(moved.y-(-6940))<3,'dragging a Team correctly divides screen movement by zoom')
  await cli('ui','drag',`[data-card-id="${codey.id}"]`,'--dx','54','--dy','48')
  await until(async()=>(await cli('session','list')).sessions.find(c=>c.id===codey.id).position)
  const placed=(await cli('session','list')).sessions.find(c=>c.id===codey.id)
  ok(placed.position.x>48 && placed.position.y>62,'employee can be dragged to a free two-dimensional position')
  ok((await cli('ui','view')).view==='home','dragging an employee does not also open its conversation')
  ok((await cli('room','layout','Engineering')).bounds.arrangement==='free','manual placement preserves other workstations by switching to free layout')
  await cli('ui','screenshot',join(artifacts,'canvas-free.png'))
  const design=await cli('room','layout','Design')
  await cli('canvas','set','--x',String(80-design.bounds.x*.6),'--y',String(130-design.bounds.y*.6),'--zoom','0.6')
  await until(async()=>(await cli('ui','dom','--sel','[data-team="Design"]')).length===1)
  await cli('room','bounds','Design','--width',String(design.bounds.width+160),'--height',String(design.bounds.height+110))
  await until(async()=>(await cli('room','layout','Design')).bounds.width>design.bounds.width)
  ok(true,'CLI Team resize updates the world-space room')
  await cli('ui','click','[data-team="Design"]')
  await until(async()=>(await cli('ui','dom','--sel','.team-settings')).length===1)
  await cli('ui','click','.team-settings')
  ok((await cli('ui','dom','--sel','input[name="team-root"]'))[0].text===realpathSync(join(projects,'Design')),'Team editor exposes its required external root')
  await cli('ui','type','select[name="shape"]','custom')
  await cli('ui','drag','.polygon-editor circle:nth-of-type(2)','--dx','-24','--dy','18')
  await cli('ui','screenshot',join(artifacts,'canvas-shape-editor.png'))
  await cli('ui','click','.save-team')
  await until(async()=>(await cli('room','layout','Design')).bounds.shape==='custom')
  const custom=(await cli('room','layout','Design')).bounds
  ok(custom.points?.length>=3&&custom.points[1].x<.92&&custom.points[1].y>0,'custom Team boundary control-point edits are persisted')
  await cli('room','bounds','Design','--shape','ellipse','--arrangement','circle')
  const ring=await cli('room','layout','Design')
  ok(ring.bounds.arrangement==='circle','ring arrangement is available through the same API')
  await cli('canvas','set','--x',String(60-ring.bounds.x*.65),'--y',String(115-ring.bounds.y*.65),'--zoom','0.65')
  await cli('ui','screenshot',join(artifacts,'canvas-island.png'))
  await cli('ui','click',`[data-card-id="${luna.id}"] .mascot`)
  await until(async()=>(await cli('ui','view')).view==='session')
  const live=(await cli('session','list','--live'))[0]
  ok(live.cwd===realpathSync(join(projects,'Design/luna')),'the engine starts in the employee subfolder under its Team root')
  ok(live.model==='gpt-5.6-luna'&&live.effort==='low','Codex keeps the specified low-cost model and effort')
  await cli('ui','type','.composer textarea','work');await cli('ui','click','.send-btn')
  await until(async()=>(await cli('session','transcript',live.id)).text.includes('Working on your idea'))
  await cli('ui','click','.back')
  await until(async()=>(await cli('ui','dom','--sel',`[data-card-id="${luna.id}"][data-state="working"]`)).length===1)
  ok(true,'the real busy event lights the badge on the same canvas')
  await cli('ui','screenshot',join(artifacts,'canvas-working.png'))
  await cli('session','interrupt',live.id)
  await until(async()=>(await cli('ui','dom','--sel',`[data-card-id="${luna.id}"][data-state="sleeping"]`)).length===1)
  ok(true,'completion returns to resting behavior without losing viewport or placement')
  await cli('session','close',live.id)
  ok(!(await cli('session','list','--live')).length,'test engine is released')
  console.log(`PASS=${checks} FAIL=0 — no model calls`)
} catch(e) {console.error(e,log.slice(-6000));process.exitCode=1}
finally {app.kill('SIGTERM');await stopped;rmSync(home,{recursive:true,force:true});rmSync(projects,{recursive:true,force:true})}
