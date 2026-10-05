import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {profileApplication} from './fixtures/profile-application.mjs'
import {assetWorkbenchFixture} from './fixtures/asset-workbench.mjs'
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/files-library-rebuild'),application=await profileApplication(),checks=[];let f
const pass=text=>{checks.push(text);console.log('PASS '+text)},hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),flatten=node=>[node,...(node.children??[]).flatMap(flatten)],nodeId=(asset,file)=>asset+'|'+encodeURIComponent(file)
const report={passed:false,checks,paidModelCalls:0,productionData:false}
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
 fs.mkdirSync(path.join(f.shared,'Documents','Deep Folder'));fs.writeFileSync(path.join(f.shared,'Documents','Deep Folder','report.md'),'# A real article\n\nEvidence and source material.')
 await f.settled()
 const folders=await rpc('assets.browse',{query:'Deep Folder',kind:'folder'});assert.ok(folders.entries.some(n=>n.directory&&n.name==='Deep Folder'));const literal=await rpc('assets.browse',{query:'100%_plan.md'});assert.equal(literal.entries.length,1)
 const hostSearch=await rpc('assets.browse',{query:'remote.txt',host:host.id});assert.equal(hostSearch.entries.length,1);assert.equal(hostSearch.entries[0].host.id,host.id)
 let offset=0,ids=[];do{const page=await rpc('assets.browse',{root:'shared',query:'',limit:1,offset});ids.push(...page.entries.map(n=>n.id));offset=page.nextOffset}while(offset!==null)
 assert.equal(ids.length,new Set(ids).size);assert.ok(ids.some(id=>decodeURIComponent(id).includes('Documents')))
 pass('Gallery browsing and recursive folder/file search retain literal matching, stable page identities and storage-host filtering.')
 const reader=createRequire(path.join(root,'build/plugins/margin-reader/package.json')),pdfLib=reader('pdf-lib'),pdf=await pdfLib.PDFDocument.create(),cover=pdf.addPage([360,480]);cover.drawText('Research Library',{x:35,y:380,size:25});fs.writeFileSync(path.join(f.shared,'Documents','Research.pdf'),await pdf.save());fs.writeFileSync(path.join(f.shared,'Documents','Article.html'),'<html><title>Reading notes</title><h1>Reading notes</h1><p>Original local material.</p><script>throw Error("Never execute")</script><img src="https://example.invalid/no-network.png"></html>')
 const sourceFiles=['Research.pdf','Article.html'].map(name=>path.join(f.shared,'Documents',name)),before=sourceFiles.map(hash)
 for(const name of ['Research.pdf','Article.html','Deep Folder/report.md']){const preview=await rpc('assets.preview',{id:nodeId('shared','Documents/'+name)});assert.equal(preview.kind,'image',name+': '+preview.reason);assert.equal(preview.mimeType,'image/png');assert.ok(Buffer.from(preview.data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.ok(preview.width<=360&&preview.height<=480);if(name.endsWith('.pdf'))assert.equal(preview.pageCount,1)}
 assert.equal((await rpc('assets.preview',{id:image.id})).kind,'image');assert.equal((await rpc('assets.preview',{id:cloud.id})).kind,'fallback');assert.equal((await rpc('assets.preview',{id:nodeId('team:Remote%20team','remote.txt')})).kind,'fallback');assert.deepEqual(sourceFiles.map(hash),before)
 const textPath=path.join(f.shared,'Documents','Deep Folder','report.md'),first=await rpc('assets.preview',{id:nodeId('shared','Documents/Deep Folder/report.md')});fs.writeFileSync(textPath,'# Changed source\nNew evidence.');const second=await rpc('assets.preview',{id:nodeId('shared','Documents/Deep Folder/report.md')});assert.notEqual(first.version,second.version)
 pass('Actual Reader workers render PDF/HTML/Markdown/image covers with bounded dimensions and current-version checks; no remote original is auto-fetched and source bytes remain unchanged.')
 report.passed=true
}catch(error){report.error=error.stack;throw error}finally{await f?.close();application.dispose();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2))}
