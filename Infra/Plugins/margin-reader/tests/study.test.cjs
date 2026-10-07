'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
const {createPlugin}=require('../runtime.cjs');
const {digest}=require('../lib/safety.cjs');
const {loadImage,createCanvas}=require('@napi-rs/canvas');
async function prepared(t){
  const f=await setup(t);await fs.writeFile(path.join(f.workspace,'Book.pdf'),pdfFixture());
  await f.api('fs.write',{path:'Blog.html',content:'<h1>标题</h1><p>中文摘录与 English passage for a study card.</p><h2>第二节</h2><p>Another source paragraph.</p>'});
  let set=await f.api('study.create',{title:'Study A'});set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['Book.pdf','Blog.html']});
  const pdf=await f.api('document.open',{path:'Book.pdf',activate:false}),html=await f.api('document.open',{path:'Blog.html',activate:false});
  const get=()=>f.api('study.get',{setId:set.id});
  const make=async(extra={})=>{const current=await get();const p={setId:set.id,expectedRevision:current.revision,documentId:pdf.id,expectedSourceVersion:pdf.sourceVersion,captureId:randomUUID(),text:'Introduction - CLI Reader',locator:{page:1},selection:{rects:[{page:1,x:.08,y:.05,width:.8,height:.11}]},color:'yellow',...extra};return {p,result:await f.api('study.card.create',p)};};
  return {...f,set,pdf,html,get,make};
}
test('study membership is many-to-many, deduplicated, and never duplicates source files',async t=>{
  const {api,set,pdf,workspace}=await prepared(t);let b=await api('study.create',{title:'Study B'});b=await api('study.documents.add',{setId:b.id,expectedRevision:b.revision,paths:['Book.pdf','Book.pdf']});
  assert.equal(set.documentIds.length,2);assert.deepEqual(b.documentIds,[pdf.id]);
  assert.equal((await fs.readdir(workspace)).filter(p=>p.endsWith('.pdf')).length,1);
  const removed=await api('study.documents.remove',{setId:set.id,expectedRevision:set.revision,documentIds:[pdf.id]});assert.equal(removed.documentCount,1);assert.equal((await api('study.get',{setId:b.id})).documentCount,1);assert((await fs.stat(path.join(workspace,'Book.pdf'))).isFile());
});
test('PDF selection creates an actual cropped PNG and preserves original page and outline',async t=>{
  const {api,make,pdf,workspace}=await prepared(t);await api('reader.position.set',{id:pdf.id,locator:{page:2}});
  const hash=digest(await fs.readFile(path.join(workspace,'Book.pdf'))),{result}=await make();const c=result.card;
  assert.equal(c.image.kind,'pdf-crop');const image=await api('study.card.image',{setId:result.setId,cardId:c.id}),bytes=Buffer.from(image.contentBase64,'base64');assert.equal(bytes.toString('ascii',1,4),'PNG');
  const img=await loadImage(bytes),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,img.width,img.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<150&&pixels[i+1]<150&&pixels[i+2]<150)ink++;assert(ink>100);
  assert.equal((await api('reader.position.get',{id:pdf.id})).locator.page,2);assert.equal(digest(await fs.readFile(path.join(workspace,'Book.pdf'))),hash);
  assert.deepEqual((await api('document.get',{id:pdf.id})).toc,pdf.toc);
});
test('flow offsets preserve Chinese/English selected text and create a durable text image',async t=>{
  const {make,html,get,api}=await prepared(t);const text='中文摘录与 English passage for a study card.';
  const {result}=await make({documentId:html.id,expectedSourceVersion:html.sourceVersion,text,locator:{section:0},selection:{start:2,end:2+text.length},color:'purple'});
  assert.equal(result.card.image.kind,'text-image');assert.equal((await get()).cards[0].text,text);
  const image=await api('study.card.image',{setId:result.setId,cardId:result.card.id});assert((await loadImage(Buffer.from(image.contentBase64,'base64'))).height>100);
});
test('capture retries are idempotent and never duplicate or silently reuse changed requests',async t=>{
  const {api,error,get,make}=await prepared(t);const {p,result}=await make();const repeat=await api('study.card.create',p);assert.equal(repeat.card.id,result.card.id);assert.equal(repeat.duplicate,true);assert.equal((await get()).cards.length,1);
  await error('study.card.create',{...p,color:'blue'},'CONFLICT');
});
test('cards from different source files nest, detach, reorder and reject cycles/cross-set parents',async t=>{
  const {api,error,get,make,html}=await prepared(t),a=(await make()).result.card,b=(await make({documentId:html.id,expectedSourceVersion:html.sourceVersion,text:'Flow note',locator:{section:0},selection:{}})).result.card,c=(await make({text:'Third excerpt'})).result.card;
  let set=await get();set=await api('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:b.id,parentId:a.id});set=await api('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:c.id,parentId:b.id});
  await error('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:a.id,parentId:c.id},'INVALID_OUTLINE');
  await error('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:a.id,parentId:randomUUID()},'NOT_FOUND');
  set=await api('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:b.id,parentId:null,index:0});assert.equal(set.cards[0].id,b.id);assert.equal(set.cards.find(x=>x.id===c.id).parentId,b.id);
});
test('color, note, collapse and set edits require explicit revision checks',async t=>{
  const {api,error,get,make}=await prepared(t);const {result}=await make();let set=await get();const rev=set.revision;
  set=await api('study.card.update',{setId:set.id,expectedRevision:rev,cardId:result.card.id,note:'中文笔记',color:'green',collapsed:true});
  assert.equal(set.cards[0].note,'中文笔记');assert.equal(set.cards[0].collapsed,true);
  await error('study.update',{setId:set.id,expectedRevision:rev,title:'Stale'},'CONFLICT');
  set=await api('study.update',{setId:set.id,expectedRevision:set.revision,title:'Renamed set',description:'Description'});assert.equal(set.title,'Renamed set');
});
test('member removal and file rename/trash never discard saved excerpts',async t=>{
  const {api,get,make,pdf}=await prepared(t),c=(await make()).result.card;let set=await get();
  const original=(await api('study.card.image',{setId:set.id,cardId:c.id})).contentBase64;
  await api('fs.move',{path:'Book.pdf',target:'Renamed.pdf'});await api('document.open',{path:'Renamed.pdf',activate:false});set=await get();assert.equal(set.cards[0].sourcePath,'Renamed.pdf');assert.equal(set.cards[0].sourceChanged,false);
  set=await api('study.documents.remove',{setId:set.id,expectedRevision:set.revision,documentIds:[pdf.id]});assert.equal(set.cards[0].detached,true);
  const trash=await api('fs.trash',{path:'Renamed.pdf'});set=await get();assert.equal(set.cards[0].sourceAvailable,false);
  assert.equal((await api('study.card.image',{setId:set.id,cardId:c.id})).contentBase64,original);
  await api('fs.restore',{trashId:trash.trashId});
});
test('card subtree and whole study set can be trashed and restored with intact PNGs',async t=>{
  const {api,error,get,make}=await prepared(t),a=(await make()).result.card,b=(await make({parentId:a.id,text:'Child'})).result.card;let set=await get();
  const bytes=(await api('study.card.image',{setId:set.id,cardId:a.id})).contentBase64;
  set=await api('study.card.remove',{setId:set.id,expectedRevision:set.revision,cardId:a.id,mode:'subtree'});assert.equal(set.cards.length,0);assert.equal(set.cardTrash[0].count,2);
  set=await api('study.card.restore',{setId:set.id,expectedRevision:set.revision,trashId:set.cardTrash[0].id});assert.equal(set.cards.find(c=>c.id===b.id).parentId,a.id);
  const deleted=await api('study.remove',{setId:set.id,expectedRevision:set.revision});await error('study.get',{setId:set.id},'NOT_FOUND');assert((await api('study.list',{includeTrashed:true})).sets.some(s=>s.deletedAt));
  set=await api('study.restore',{setId:set.id,expectedRevision:deleted.revision});assert.equal((await api('study.card.image',{setId:set.id,cardId:a.id})).contentBase64,bytes);
});
test('source edits invalidate excerpt coordinates and reject stale capture without damaging snapshots',async t=>{
  const {api,error,get,make,html,workspace}=await prepared(t);await make({documentId:html.id,expectedSourceVersion:html.sourceVersion,text:'Earlier snapshot',locator:{section:0},selection:{}});
  await fs.writeFile(path.join(workspace,'Blog.html'),'<p>Changed document</p>');assert.equal((await get()).cards[0].sourceChanged,true);
  const set=await get();await error('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:html.id,expectedSourceVersion:html.sourceVersion,captureId:randomUUID(),text:'Old',locator:{section:0},color:'blue'},'SOURCE_CHANGED');assert.equal((await get()).cards.length,1);
});
test('card capture rejects wrong membership, unsupported colors and unsafe geometry',async t=>{
  const {api,error,get,pdf}=await prepared(t);const set=await get(),p={setId:set.id,expectedRevision:set.revision,documentId:pdf.id,expectedSourceVersion:pdf.sourceVersion,captureId:randomUUID(),text:'Test',locator:{page:1},color:'blue'};
  await error('study.card.create',{...p,selection:{rects:[{page:1,x:-1,y:0,width:1,height:1}]}},'INVALID_LOCATOR');
  await error('study.card.create',{...p,color:'not-a-color'},'INVALID_PARAMS');await error('study.get',{setId:'__proto__'},'NOT_FOUND');
  await api('fs.write',{path:'Other.txt',content:'Other'});const doc=await api('document.open',{path:'Other.txt',activate:false});
  await error('study.card.create',{...p,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator:{section:0}},'NOT_MEMBER');
  await error('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['../escape.txt']},'SCOPE_DENIED');
});
test('study source/asset operations stay inside the authorized workspace',async t=>{
  const {api,runtime,get,make,workspace,parent}=await prepared(t),c=(await make()).result.card,set=await get();
  await assert.rejects(runtime.readAsset(`study-card/${set.id}/../${c.id}.png`),e=>e.code==='SCOPE_DENIED');
  await fs.writeFile(path.join(parent,'outside.txt'),'private');await fs.symlink(path.join(parent,'outside.txt'),path.join(workspace,'linked.txt'));
  const r=await runtime.request({jsonrpc:'2.0',id:1,method:'study.documents.add',params:{setId:set.id,expectedRevision:set.revision,paths:['linked.txt']}});assert.equal(r.error.data.code,'SCOPE_DENIED');
  const image=await runtime.readAsset(`study-card/${set.id}/${c.id}.png`);assert.equal(image.mimeType,'image/png');
});
test('export/restart preserve graph and image data without putting base64 into live state',async t=>{
  const {api,get,make,workspace}=await prepared(t);const c=(await make()).result.card,set=await get();
  await api('study.open',{setId:set.id,documentId:c.source.documentId});
  await api('study.export',{setId:set.id,path:'Study.json',includeImages:true});const exported=JSON.parse(await fs.readFile(path.join(workspace,'Study.json')));assert(exported.set.cards[0].image.contentBase64);
  const disk=JSON.parse(await fs.readFile(path.join(workspace,'.margin-reader/state.json')));assert.equal(disk.studySets[set.id].cards[0].image.contentBase64,undefined);
  const other=await createPlugin({workspace});t.after(()=>other.close());const r=await other.request({jsonrpc:'2.0',id:1,method:'study.get',params:{setId:set.id}});assert.equal(r.result.cards[0].id,c.id);
  assert.equal((await api('settings.get')).activeStudySet,set.id);
});
test('parallel study editors reject stale writes and standalone CLI returns saved graph and PNG',async t=>{
  const {api,workspace,get,make}=await prepared(t),c=(await make()).result.card,set=await get(),other=await createPlugin({workspace});t.after(()=>other.close());
  const p={setId:set.id,expectedRevision:set.revision,title:'One writer'},replies=await Promise.all([other.request({jsonrpc:'2.0',id:1,method:'study.update',params:p}),other.request({jsonrpc:'2.0',id:2,method:'study.update',params:{...p,title:'Second writer'}})]);assert.equal(replies.filter(r=>r.result).length,1);
  const exec=require('node:util').promisify(require('node:child_process').execFile),env={...process.env};for(const k of ['AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE'])delete env[k];
  const r=await exec(process.execPath,[path.resolve(__dirname,'../cli.cjs'),'--workspace',workspace,'api','study.card.image','--data',JSON.stringify({setId:set.id,cardId:c.id})],{env,maxBuffer:10*1024*1024});assert.equal(JSON.parse(r.stdout).result.mimeType,'image/png');
});
test('multi-page PDF crops are stitched into one durable card image',async t=>{
  const {make,api}=await prepared(t);const {result}=await make({text:'Across two pages',selection:{rects:[{page:1,x:.07,y:.05,width:.82,height:.12},{page:2,x:.07,y:.05,width:.82,height:.12}]}});
  assert.equal(result.card.source.selection.rects.length,2);const image=await api('study.card.image',{setId:result.setId,cardId:result.card.id});const decoded=await loadImage(Buffer.from(image.contentBase64,'base64'));assert(decoded.height>350);assert(decoded.width>500);
});
test('older libraries receive study defaults without rewriting metadata during reads',async t=>{
  const {api,workspace}=await setup(t);await api('settings.set',{theme:'sepia'});
  const file=path.join(workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file,'utf8'));delete state.studySets;delete state.settings.activeStudySet;
  const text=JSON.stringify(state);await fs.writeFile(file,text);
  assert.deepEqual((await api('study.list')).sets,[]);assert.equal((await api('settings.get')).activeStudySet,null);assert.equal(await fs.readFile(file,'utf8'),text);
});
test('closing a runtime during capture fails without a partial saved card',async t=>{
  const {runtime,set,pdf,workspace}=await prepared(t);const work=runtime.request({jsonrpc:'2.0',id:99,method:'study.card.create',params:{setId:set.id,expectedRevision:set.revision,documentId:pdf.id,expectedSourceVersion:pdf.sourceVersion,captureId:randomUUID(),text:'closing',color:'blue',locator:{page:1}}});
  await runtime.close();const result=await work;assert(result.error);
  const state=JSON.parse(await fs.readFile(path.join(workspace,'.margin-reader/state.json')));assert.equal(state.studySets[set.id].cards.length,0);
});
