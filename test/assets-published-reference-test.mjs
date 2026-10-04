// A real channel image must remain readable through the exact asset reference advertised by Core.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),app=await profileApplication(),shared=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-asset-ref-'))
let f
try{
 f=await fixtureCore({AGENTS_COMPANY_SHARED_DIR:shared},path.join(app.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data}
 const source=await rpc('channel.source-add',{plugin:'telegram',locator:'asset_reference_only',name:'Asset reference fixture'}),bytes=fs.readFileSync(path.join(root,'app_icon.png')),publishedAt=Date.now(),externalId='asset-image'
 const upload=await rpc('channel.media-put',{sourceId:source.id,externalId,publishedAt,mediaKey:'image',name:'reference.png',mimeType:'image/png',data:bytes.toString('base64')})
 const post=await rpc('channel.publish',{sourceId:source.id,externalId,publishedAt,title:'Asset reference',body:'Public image fixture',mediaIds:[upload.media.id]})
 const page=await rpc('assets.search',{query:'reference.png'}),node=page.entries.find(x=>x.name==='reference.png');assert.ok(node,'Published image is advertised in Assets')
 console.log('Advertised asset reference',node.location)
 const read=await rpc('assets.file',{id:node.location.asset,path:node.location.path,operation:'image'});assert.equal(read.data,bytes.toString('base64'))
 const info=await rpc('transfer.download-info',{from:node.location});assert.equal(info.bytes,bytes.length)
 console.log('PASS published image preview and download resolve the same original bytes; no real user data or model calls')
}finally{await f?.close();app.dispose();fs.rmSync(shared,{recursive:true,force:true})}
