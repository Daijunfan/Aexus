import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore()
try{
 assert.equal((await f.cli('settings','get')).language,'en')
 await f.cli('group','add','Messages');const person=await f.create('保存','Messages'),before=await f.cli('session','list')
 await f.cli('settings','set','--language','zh-CN');assert.equal((await f.cli('settings','get')).language,'zh-CN')
 await assert.rejects(()=>f.cli('settings','set','--language','fr'),/language/);assert.equal((await f.cli('settings','get')).language,'zh-CN')
 await f.stop();await f.start();assert.equal((await f.cli('settings','get')).language,'zh-CN');const after=await f.cli('session','list');assert.deepEqual(after.groups,before.groups);assert.deepEqual(after.sessions,before.sessions)
 await f.cli('settings','set','--language','en');assert.equal((await f.cli('settings','get')).language,'en')
 assert.ok((await f.cli('api','describe','settings.set')).args.includes('--language en|zh-CN'));assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS language Core/CLI: default English, validated en/zh-CN updates, restart persistence, unchanged employees/teams/permissions and no execution side effects')
}finally{await f.close()}
