// Independent source identity images: real SQLite/retention, isolated home, no services or models.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-source-avatar-')),entry=path.join(temp,'avatars.cjs'),require=createRequire(import.meta.url),before=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=path.join(temp,'state');fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let core
try{
 await build({stdin:{contents:"export * from './src/main/channel-avatars';export {one,run,closeChannelStore} from './src/main/channel-store';export {pruneChannelNews} from './src/main/channels'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=require(entry);const now=Date.now(),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
 core.run('INSERT INTO channels(id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?)','channel','Telegram source','telegram',now,now)
 core.run('INSERT INTO sources(id,plugin,target_id,locator,name,enabled,poll_seconds,channel_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)','source','telegram','original-target','public_channel','Channel',1,300,'channel',now,now)
 const args={sourceId:'source',name:'channel.png',mimeType:'image/png',data:png},receipt=core.putSourceAvatar(args),hash=createHash('sha256').update(Buffer.from(png,'base64')).digest('hex')
 assert.deepEqual(receipt,{sourceId:'source',sha256:hash});assert.deepEqual(core.readSourceAvatar('source'),{data:png,mimeType:'image/png',name:'channel.png'});assert.equal(core.sourceAvatar('source').bytes,Buffer.from(png,'base64').length)
 const saved=core.one('SELECT * FROM source_avatars WHERE source_id=?','source');assert.deepEqual(core.putSourceAvatar(args),receipt);assert.deepEqual(core.one('SELECT * FROM source_avatars WHERE source_id=?','source'),saved,'identical retry does not rewrite identity state')
 for(const patch of [{mimeType:'image/jpeg'},{mimeType:'image/svg+xml'},{mimeType:'constructor'},{data:'not base64!'},{data:'A'.repeat(11184816)},{name:'../avatar.png'},{name:'bad\nname.png'}]){assert.throws(()=>core.putSourceAvatar({...args,...patch}));assert.deepEqual(core.one('SELECT * FROM source_avatars WHERE source_id=?','source'),saved,'bad input cannot replace a valid avatar')}
 core.run('INSERT INTO posts(id,source_id,external_id,state,title,body,published_at,received_at,updated_at,expires_at,content_hash,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)','post','source','news','active','Old news','Original text',now,now,now,now+48*3600000,'hash','hash')
 core.pruneChannelNews(now+49*3600000);assert.equal(core.one('SELECT state FROM posts WHERE id=?','post').state,'expired');assert.deepEqual(core.readSourceAvatar('source'),{data:png,mimeType:'image/png',name:'channel.png'},'48-hour article cleanup does not erase source identity')
 core.run('DELETE FROM posts WHERE id=?','post');core.run('UPDATE sources SET enabled=0 WHERE id=?','source');assert.equal(core.sourceAvatar('source').sha256,hash,'unfollowing preserves the channel identity')
 core.closeChannelStore();assert.deepEqual(core.readSourceAvatar('source'),{data:png,mimeType:'image/png',name:'channel.png'},'source image survives database reopen')
 const replacement=Buffer.concat([Buffer.from(png,'base64'),Buffer.from('changed')]).toString('base64');assert.notEqual(core.putSourceAvatar({...args,data:replacement}).sha256,hash);assert.equal(core.readSourceAvatar('source').data,replacement)
 core.run('DELETE FROM sources WHERE id=?','source');assert.equal(core.sourceAvatar('source'),undefined);assert.throws(()=>core.readSourceAvatar('source'),error=>error.code==='SOURCE_AVATAR_NOT_FOUND')
 console.log('PASS independent source avatar: validated original bytes, idempotent atomic replacement, retained through news expiry/unfollow/reopen, source deletion cleanup')
}finally{core?.closeChannelStore();if(before===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=before;fs.rmSync(temp,{recursive:true,force:true})}
