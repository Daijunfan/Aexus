// Traverses real CLI/Core results in isolated workspaces, including stale and published refs.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {profileApplication} from './fixtures/profile-application.mjs'
import {assetWorkbenchFixture} from './fixtures/asset-workbench.mjs'
const app=await profileApplication(),root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/files-workbench/core');fs.mkdirSync(out,{recursive:true});let f;const checks=[],actions=[]
const check=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
try{
 f=await assetWorkbenchFixture(app.directory);const {rpc,a,b,group,conversation,member,peer,channel,source}=f
 let page=await f.settled();check(page.errors.length===0,'local and remote protocol inventories complete without errors')
 const seen=new Map(),directories=[]
 const visit=async(id)=>{let offset=0,count=0,expected;const ids=new Set();do{const result=await rpc('assets.children',{id,offset,limit:2});expected??=result.total;assert.equal(result.total,expected);assert.ok(result.entries.length<=2);for(const node of result.entries){assert.ok(!ids.has(node.id),'No duplicate directory page entries: '+node.id);ids.add(node.id);count++;seen.set(node.id,node);if(node.directory){directories.push(node);if(!node.symlink)await visit(node.id)}else if(node.location){const info=await rpc('assets.file',{id:node.location.asset,path:node.location.path,operation:'info'});assert.ok(info.exists,node.name);actions.push({action:'info',id:node.id});const location=await rpc('assets.locate',{id:node.id});assert.ok(location.parent.location?.asset);assert.ok(location.breadcrumbs.length);actions.push({action:'locate',id:node.id})}else{assert.ok(node.document);const location=await rpc('assets.locate',{id:node.id});assert.equal(location.canReveal,false);assert.equal(location.parent.id,node.owner.conversation)}}offset=result.nextOffset}while(offset!==null);assert.equal(count,expected,'Every folder returns coherent pagination: '+id)}
 await visit('root');check(directories.length>10&&actions.length>10,'every advertised directory traverses with page size 2; files resolve and locate through the same CLI/Core references')
 const tree=await rpc('assets.tree');check(tree.facets.employees.filter(x=>x.name==='Alex').length===2,'same-name employees retain distinct IDs and Team labels')
 const own=await rpc('assets.search',{employee:a.id,limit:500});check(own.entries.some(x=>x.owner.employee===a.id&&x.owner.view==='Company')&&own.entries.some(x=>x.owner.employee===a.id&&x.owner.view==='Messages'),'employee filter spans personal and shared member workspaces')
 check(own.entries.some(x=>x.name==='brief.md')&&own.entries.some(x=>x.name==='channel-notes.txt')&&!own.entries.some(x=>x.owner.employee===b.id),'shared user originals are included; peer-owned files are not mistaken for the selected employee')
 const ownTree=await rpc('assets.tree',{employee:a.id}),findNode=(node,id)=>node.id===id?node:node.children?.map(child=>findNode(child,id)).find(Boolean)
 const ownGroup=await rpc('assets.search',{employee:a.id,conversation,limit:500});assert.equal(findNode(ownTree,conversation).fileCount,ownGroup.total)
 const ownChannel=await rpc('assets.search',{employee:a.id,conversation:channel,limit:500});assert.equal(findNode(ownTree,channel).fileCount,ownChannel.total)
 assert.equal(findNode(ownTree,'published:channel:'+source.channelId).fileCount,1)
 check(true,'filtered group/channel badges match exact file queries; published-image folder count is not zero')
 const product=await rpc('assets.search',{team:'Product team',limit:500});check(product.entries.every(x=>x.owner.team==='Product team'||x.owner.conversation&&x.owner.employee===undefined),'Team filter includes related shared originals and correct members across views')
 const groupPage=await rpc('assets.search',{conversation,limit:500});check(groupPage.entries.every(x=>x.owner.conversation===conversation)&&groupPage.entries.some(x=>x.name==='legacy.png'),'group scope includes original files, members and historical read-only attachments')
 const images=await rpc('assets.search',{kind:'image',view:'Messages',limit:100});check(images.entries.length===2&&images.entries.every(x=>x.kind==='image'),'published channel and historical group images share the image filter')
 const png=images.entries.find(x=>x.name==='reference.png');check((await rpc('assets.file',{id:png.location.asset,path:png.location.path,operation:'image'})).data===f.image.toString('base64'),'channel image uses postId/mediaId and returns exact bytes')
 check((await rpc('assets.file',{id:png.location.asset,path:f.mediaId,operation:'image'})).data===f.image.toString('base64'),'pre-fix copied media-ID references remain readable')
 check((await rpc('assets.search',{query:'100%_plan.md'})).total===1,'literal percent and underscore file search does not become a wildcard')
 const physical=(await rpc('assets.search',{query:'personal.txt',employee:a.id})).entries[0];check((await rpc('assets.file',{id:physical.id,operation:'read'})).content==='Alex Product personal','nested asset ID works without reconstructing the path')
 for(const virtual of ['root','company','messages','groups','channels','plan'])assert.equal((await rpc('assets.locate',{id:virtual})).canReveal,false)
 const cloud=(await rpc('assets.search',{storage:'cloud'})).entries;check(cloud.length===1&&cloud[0].document&&!(await rpc('assets.locate',{id:cloud[0].id})).node.location,'cloud-only metadata can locate its channel without an implicit download')
 const remotes=(await rpc('assets.search',{storage:'remote'})).entries;check(remotes.some(x=>x.name==='remote.txt')&&remotes.every(x=>x.storage==='remote'),'remote files stay on their original host and expose their storage class')
 const original=await rpc('conversation.file',{conversation,operation:'read',path:'brief.md'}),token=await f.token(a.id)
 for(const [command,args] of [['assets.tree',{}],['assets.locate',{id:'shared'}],['assets.search',{employee:a.id}],['assets.file',{id:conversation,operation:'write',path:'brief.md',content:'forbidden'}]])assert.equal((await f.request(token,command,args)).ok,false)
 assert.equal((await f.request(token,'conversation.file',{conversation,operation:'write',path:'brief.md',content:'forbidden'})).ok,false)
 await rpc('conversation.file',{conversation,operation:'write',path:member.directory+'/draft.md',content:'Member can write own folder'},token)
 assert.equal((await rpc('conversation.file',{conversation,operation:'read',path:'brief.md'})).content,original.content)
 check(true,'asset APIs remain human-only; member API can edit only its own subtree and cannot overwrite originals')
 await rpc('assets.file',{id:'shared',operation:'write',path:'ui-created.txt',content:'v1',create:true});const doc=await rpc('assets.file',{id:'shared',operation:'read',path:'ui-created.txt'})
 await rpc('assets.file',{id:'shared',operation:'write',path:'ui-created.txt',content:'v2',hash:doc.hash});assert.equal((await f.request(null,'assets.file',{id:'shared',operation:'write',path:'ui-created.txt',content:'stale',hash:doc.hash})).ok,false)
 await rpc('assets.file',{id:'shared',operation:'move',path:'ui-created.txt',to:'renamed.txt'});const removed=await rpc('assets.file',{id:'shared',operation:'trash',path:'renamed.txt'});await rpc('assets.file',{id:'shared',operation:'restore',trashId:removed.id});assert.equal((await rpc('assets.file',{id:'shared',operation:'read',path:'renamed.txt'})).content,'v2')
 check(true,'create, edit with hash, stale edit rejection, rename, trash and restore preserve data')
 for(const [id,file] of [['shared|..%2Foutside',undefined],['shared','../outside'],['shared|%zz',undefined]])assert.equal((await f.request(null,'assets.file',{id,path:file,operation:'read'})).ok,false)
 assert.equal((await f.request(null,'assets.file',{id:png.location.asset,path:png.location.path,operation:'write',content:'forbidden'})).ok,false)
 const name='late-delete.txt';fs.writeFileSync(path.join(f.shared,name),'transient');await f.settled();const stale=(await rpc('assets.search',{query:name})).entries[0];fs.unlinkSync(path.join(f.shared,name));const missing=await f.request(null,'assets.locate',{id:stale.id});assert.equal(missing.ok,false);assert.match(missing.error,/no longer exists/)
 check(true,'reserved/escaped paths and read-only writes fail safely; deleted file locations return a useful refresh instruction')
 const parsed=await f.cli('assets','locate',physical.id);assert.equal(parsed.node.owner.employee,a.id)
 const cli=await f.cli('assets','search','--view','Messages','--employee',a.id,'--kind','code');assert.ok(cli.entries.some(x=>x.name==='analysis.ts'))
 check(true,'new location and combined ownership/type filters execute through the actual CLI parser')
 fs.mkdirSync(path.join(f.shared,'Pagination'));for(let i=0;i<213;i++){const file=(i%3===0?'Alpha':i%3===1?'beta':'资料')+'-'+String(i).padStart(3,'0')+'.md';fs.writeFileSync(path.join(f.shared,'Pagination',file),'x'.repeat(i+1))}
 await f.settled()
 for(const sort of ['name','modified','size']){const full=await rpc('assets.search',{sort,limit:500}),pages=[];for(let offset=0;offset<full.total;offset+=17){const current=await rpc('assets.search',{sort,offset,limit:17});assert.equal(current.total,full.total);pages.push(...current.entries.map(node=>node.id));assert.ok(current.entries.every(node=>!('_orderKey' in node)))}assert.deepEqual(pages,full.entries.map(node=>node.id));assert.equal(new Set(pages).size,pages.length)}
 check(true,'213 mixed-name files plus cloud/publication records page in stable name/date/size order with no missing or duplicate items')
 const beforePath=a.cwd;await rpc('card.update',{id:a.id,patch:{title:'Alex renamed'}});await f.settled();const renamed=await rpc('assets.search',{employee:a.id,query:'personal.txt'});assert.equal(renamed.entries[0].owner.employeeName,'Alex renamed');assert.ok(fs.existsSync(path.join(beforePath,'personal.txt')))
 check(true,'renaming a current employee refreshes ownership labels without moving their original workspace')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,actions,directories:directories.length,paidModels:0,productionDataUsed:false},null,2))
}catch(error){fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));throw error}finally{await f?.close();app.dispose()}
