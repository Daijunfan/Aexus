import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import http from 'node:http'
import {createHash} from 'node:crypto'
import {profileApplication} from './fixtures/profile-application.mjs'
import {assetWorkbenchFixture} from './fixtures/asset-workbench.mjs'
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/files-library-rebuild'),application=await profileApplication(),checks=[];let f,network
const pass=text=>{checks.push(text);console.log('PASS '+text)},hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),flatten=node=>[node,...(node.children??[]).flatMap(flatten)],nodeId=(asset,file)=>asset+'|'+encodeURIComponent(file)
const report={passed:false,checks,paidModelCalls:0,productionData:false}
// A real one-page PDF fixture, independent of the removed Reader product.
function samplePdf(){
 const drawing='BT /F1 25 Tf 35 380 Td (Research Library) Tj ET\nBT /F1 13 Tf 35 345 Td (Original PDF cover, rendered by Core) Tj ET\n0.08 0.53 0.92 rg 35 280 260 8 re f\n0.16 0.24 0.35 rg 35 210 65 45 re f 115 210 65 75 re f 195 210 65 110 re f\n'
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`]
 let pdf='%PDF-1.4\n';const offsets=[0]
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`}
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
 return Buffer.from(pdf)
}
function largePng(bytes){
 // Keep the original C2PA metadata and add a valid PNG text chunk to exceed the
 // 1 MiB direct-image path. The real worker must decode this complete PNG.
 const data=Buffer.from('Comment\0'+'X'.repeat(600000)),type=Buffer.from('tEXt'),chunk=Buffer.alloc(data.length+12)
 chunk.writeUInt32BE(data.length);type.copy(chunk,4);data.copy(chunk,8)
 let crc=0xffffffff;for(const byte of Buffer.concat([type,data])){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 chunk.writeUInt32BE((crc^0xffffffff)>>>0,data.length+8)
 return Buffer.concat([bytes.subarray(0,-12),chunk,bytes.subarray(-12)])
}
try{
 f=await assetWorkbenchFixture(application.directory);const {rpc,a,b,conversation,member,workspace,source,channelWorkspace,remote}=f
 await rpc('card.avatar',{id:a.id,avatar:'fireball'});await rpc('card.avatar',{id:b.id,avatar:'robot'})
 const catalog=await rpc('assets.tree'),nodes=flatten(catalog),remoteNode=nodes.find(n=>n.id==='team:Remote%20team'),host=remoteNode.host
 assert.equal(host.name,'Fixture remote');assert.equal(host.kind,'remote');assert.equal(host.os,'linux');assert.equal(nodes.find(n=>n.id==='employee:'+a.id).host.kind,'local')
 assert.equal(nodes.find(n=>n.owner?.employee===a.id&&n.id.startsWith(conversation+'|')).owner.avatar,'fireball')
 assert.ok(!JSON.stringify(nodes.map(n=>n.host)).includes(remote));for(const h of catalog.facets.hosts)for(const key of ['address','identityFile','password','secret','defaultDirectory','host'])assert.ok(!(key in h),'Host projection must not disclose '+key)
 const shelf=await rpc('assets.browse',{employee:a.id});assert.equal(shelf.entries.length,3);assert.ok(shelf.entries.every(n=>n.owner.employee===a.id));assert.deepEqual(new Set(shelf.entries.map(n=>n.owner.view)),new Set(['Company','Messages']))
 assert.ok((await rpc('assets.browse',{host:host.id})).entries.every(n=>n.host.id===host.id));assert.ok((await rpc('assets.browse',{view:'Messages',employee:b.id})).entries.every(n=>n.owner.view==='Messages'&&n.owner.employee===b.id))
 pass('Canonical workspace shelves carry real host and employee portrait metadata; Team/employee/host filters keep separate ownership across views without exposing connection secrets.')
 const ownInfo=await rpc('assets.info',{id:'employee:'+a.id});assert.equal(ownInfo.physicalPath,a.cwd);assert.equal(ownInfo.verified,'local');assert.ok(ownInfo.exists)
 const groupInfo=await rpc('assets.info',{id:nodeId(conversation,member.directory)});assert.equal(groupInfo.physicalPath,path.join(workspace.root,member.directory));assert.equal(groupInfo.node.owner.employee,a.id)
 const remoteInfo=await rpc('assets.info',{id:'team:Remote%20team'});assert.equal(remoteInfo.physicalPath,remote);assert.equal(remoteInfo.host.id,host.id);assert.equal(remoteInfo.verified,'remote',remoteInfo.note)
 const virtual=await rpc('assets.info',{id:'company'});assert.equal(virtual.verified,'virtual');assert.equal(virtual.physicalPath,undefined)
 const cloud=(await f.settled({query:'cloud-source.txt'})).entries.find(n=>n.document);const cloudInfo=await rpc('assets.info',{id:cloud.id});assert.equal(cloudInfo.host.id,host.id);assert.equal(cloudInfo.verified,'metadata');assert.equal(cloudInfo.bytes,f.document.length);assert.ok(cloudInfo.physicalPath.startsWith(remote+'/'));assert.ok(!fs.existsSync(path.join(channelWorkspace.root,'cloud-source.txt')))
 const image=(await f.settled({query:'reference.png'})).entries[0],imageInfo=await rpc('assets.info',{id:image.id});assert.equal(imageInfo.node.storage,'local');assert.ok(imageInfo.readOnly);assert.equal(imageInfo.host.kind,'local')
 for(const id of ['missing','shared|..%2Foutside.txt','shared|%2Fetc%2Fpasswd'])assert.equal((await f.request(null,'assets.info',{id})).ok,false)
 const token=await f.token(a.id);for(const command of ['assets.browse','assets.info','assets.preview'])assert.equal((await f.request(token,command,command==='assets.browse'?{}:{id:'employee:'+a.id})).ok,false)
 pass('Get Info verifies local/remote paths only on explicit request, reports cloud metadata without copying documents, distinguishes virtual collections and preserves user-only API boundaries.')
 fs.mkdirSync(path.join(f.shared,'Documents','Deep Folder'));fs.writeFileSync(path.join(f.shared,'Documents','Deep Folder','report.md'),'# 本地资料预览\n\nEvidence and source material. 中文与 English 保持可读。\n\n## Research notes\n\nThe original document remains unchanged while Core derives its cover.')
 await f.settled()
 const folders=await rpc('assets.browse',{query:'Deep Folder',kind:'folder'});assert.ok(folders.entries.some(n=>n.directory&&n.name==='Deep Folder'));const literal=await rpc('assets.browse',{query:'100%_plan.md'});assert.equal(literal.entries.length,1)
 const hostSearch=await rpc('assets.browse',{query:'remote.txt',host:host.id});assert.equal(hostSearch.entries.length,1);assert.equal(hostSearch.entries[0].host.id,host.id)
 let offset=0,ids=[];do{const page=await rpc('assets.browse',{root:'shared',query:'',limit:1,offset});ids.push(...page.entries.map(n=>n.id));offset=page.nextOffset}while(offset!==null)
 assert.equal(ids.length,new Set(ids).size);assert.ok(ids.some(id=>decodeURIComponent(id).includes('Documents')))
 pass('Gallery browsing and recursive folder/file search retain literal matching, stable page identities and storage-host filtering.')
 assert.ok(!(await rpc('plugin.list')).some(plugin=>plugin.id==='margin-reader'),'document covers must work without Reader installed')
 let networkRequests=0;network=http.createServer((req,res)=>{networkRequests++;res.end('must not load')});await new Promise(resolve=>network.listen(0,'127.0.0.1',resolve));const remoteImage='http://127.0.0.1:'+network.address().port+'/external.png'
 fs.writeFileSync(path.join(f.shared,'Documents','Research.pdf'),samplePdf());fs.writeFileSync(path.join(f.shared,'Documents','local.png'),f.image)
 fs.writeFileSync(path.join(f.shared,'Documents','Article.html'),`<html><title>Reading notes</title><h1>Reading notes</h1><p>Original local material and a workspace-local illustration.</p><script src="${remoteImage}">fetch('${remoteImage}')</script><img src="${remoteImage}"><img src="local.png"><p>Scripts and network resources are never executed.</p></html>`)
 const sourceFiles=['Research.pdf','Article.html','Deep Folder/report.md'].map(name=>path.join(f.shared,'Documents',name)),before=sourceFiles.map(hash),previews=path.join(out,'previews');fs.mkdirSync(previews,{recursive:true})
 for(const name of ['Research.pdf','Article.html','Deep Folder/report.md']){const preview=await rpc('assets.preview',{id:nodeId('shared','Documents/'+name)});assert.equal(preview.kind,'image',name+': '+preview.reason);assert.equal(preview.mimeType,'image/png');assert.ok(Buffer.from(preview.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.ok(preview.width<=360&&preview.height<=480);if(name.endsWith('.pdf'))assert.equal(preview.pageCount,1);fs.writeFileSync(path.join(previews,path.basename(name)+'.png'),Buffer.from(preview.data,'base64'));fs.copyFileSync(path.join(f.shared,'Documents',name),path.join(previews,path.basename(name)))}
 assert.equal(networkRequests,0,'document preview must not execute scripts or request external images')
 const illustrated=await rpc('assets.preview',{id:nodeId('shared','Documents/Article.html')}),withoutImage=fs.readFileSync(sourceFiles[1],'utf8').replace('<img src="local.png">','');fs.writeFileSync(path.join(f.shared,'Documents','Without-image.html'),withoutImage)
 assert.notEqual((await rpc('assets.preview',{id:nodeId('shared','Documents/Without-image.html')})).data,illustrated.data,'the workspace-local illustration must actually appear')
 const large=path.join(f.shared,'Documents','Large.png');fs.writeFileSync(large,largePng(f.image));assert.ok(fs.statSync(large).size>1024*1024);const largeHash=hash(large),largeCover=await rpc('assets.preview',{id:nodeId('shared','Documents/Large.png')});assert.equal(largeCover.kind,'image',largeCover.reason);assert.ok(largeCover.width<=360&&largeCover.height<=480);assert.equal(hash(large),largeHash,'PNG metadata and original bytes stay untouched');fs.writeFileSync(path.join(previews,'Large.png.png'),Buffer.from(largeCover.data,'base64'));fs.copyFileSync(path.join(f.shared,'Documents','local.png'),path.join(previews,'local.png'))
 // The old generic font rendered these Chinese characters as the same tofu box.
 // Compare actual Core cover pixels, not just font registration or PNG headers.
 const glyphCover=async(character,index)=>{const name='glyph-'+index+'.md';fs.writeFileSync(path.join(f.shared,'Documents',name),'# '+character+'\n\nGlyph coverage');const cover=await rpc('assets.preview',{id:nodeId('shared','Documents/'+name)});assert.equal(cover.kind,'image');return cover.data}
 const missing=await glyphCover('\uffff','missing');for(const [index,character] of [...'资料预览与读'].entries())assert.notEqual(await glyphCover(character,index),missing,'Missing CJK glyph: '+character)
 report.cjkGlyphs='资料预览与读'
 fs.writeFileSync(path.join(f.shared,'Documents','Broken.pdf'),'not a PDF');assert.equal((await rpc('assets.preview',{id:nodeId('shared','Documents/Broken.pdf')})).kind,'fallback','invalid documents return an explicit unavailable preview')
 assert.equal((await rpc('assets.preview',{id:image.id})).kind,'image');assert.equal((await rpc('assets.preview',{id:cloud.id})).kind,'fallback');assert.equal((await rpc('assets.preview',{id:nodeId('team:Remote%20team','remote.txt')})).kind,'fallback');assert.deepEqual(sourceFiles.map(hash),before)
 const textPath=path.join(f.shared,'Documents','Deep Folder','report.md'),first=await rpc('assets.preview',{id:nodeId('shared','Documents/Deep Folder/report.md')});fs.writeFileSync(textPath,'# Changed source\nNew evidence.');const second=await rpc('assets.preview',{id:nodeId('shared','Documents/Deep Folder/report.md')});assert.notEqual(first.version,second.version);assert.notEqual(first.data,second.data)
 pass('Core-owned workers render real PDF/HTML/Markdown/image covers without Reader, with bounded dimensions and fresh-version pixels; no scripts/network, remote fetch or source mutation.')
 report.passed=true
}catch(error){report.error=error.stack;throw error}finally{await f?.close();if(network)await new Promise(resolve=>network.close(resolve));application.dispose();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2))}
