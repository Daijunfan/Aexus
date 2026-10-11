'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
test('new and old unconfigured studies resolve to topics without rewriting saved cards, sources or state on reads',async t=>{
 const f=await setup(t);let set=await f.api('study.create',{title:'Unconfigured existing study'});
 set=await f.api('study.map.configure',{setId:set.id,expectedRevision:set.revision,layout:'down'});
 set=await f.api('study.note.create',{setId:set.id,expectedRevision:set.revision,title:'原始长标题 '.repeat(16),text:'完整内容保留'});
 const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);const raw=JSON.parse(before).studySets[set.id];assert.equal(raw.map.mindmap,undefined);
 const read=await f.api('study.get',{setId:set.id}),geometry=await f.api('study.map.geometry',{setId:set.id});assert.equal(read.map.mindmap.enabled,true);assert.equal(geometry.mindmap,true);assert.equal(geometry.positions.length,1);assert(geometry.positions[0].width<=320);assert(geometry.positions[0].height>0);assert.equal(read.cards[0].title,raw.cards[0].title);assert.deepEqual(await fs.readFile(file),before);
 const {layoutStudy}=await import('../ui/study-map-layout.mjs');const layout=layoutStudy(raw.cards,raw.map);assert.equal(layout.mindmap,true);assert(layout.topics.get(raw.cards[0].id).lines.length>2);assert(!layout.topics.get(raw.cards[0].id).lines.some(l=>l.ellipsis));const compact=layoutStudy(raw.cards,{...raw.map,mindmap:{titleLines:2}});assert.equal(compact.topics.get(raw.cards[0].id).lines.length,2);assert(compact.topics.get(raw.cards[0].id).lines[1].ellipsis);assert(compact.positions.get(raw.cards[0].id).height<125);
});
test('source snapshots are hidden only in the default topic projection; card mode and inline-image opt-in keep exact source geometry',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'source.pdf'),pdfFixture());let set=await f.api('study.create',{title:'PDF topics'});
 set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['source.pdf']});const document=await f.api('document.get',{id:set.documentIds[0]});
 const capture=await f.api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:document.id,expectedSourceVersion:document.sourceVersion,captureId:randomUUID(),title:'原文定位',text:'',color:'purple',locator:{page:2},selection:{rects:[{page:2,x:.1,y:.06,width:.7,height:.12}]}});
 const get=()=>f.api('study.get',{setId:set.id}),geometry=()=>f.api('study.map.geometry',{setId:set.id});set=await get();const original=structuredClone(set.cards),png=await f.api('study.card.image',{setId:set.id,cardId:capture.card.id});assert(png.contentBase64);
 assert.equal((await geometry()).positions[0].imageBounds,null);
 for(const patch of [{enabled:false},{enabled:true,showImages:true},{showImages:false}]){set=await f.api('study.mindmap.configure',{setId:set.id,expectedRevision:set.revision,patch});const g=await geometry();assert.equal(Boolean(g.positions[0].imageBounds),patch.enabled===false||patch.showImages===true);assert.deepEqual(set.cards,original);assert.equal((await f.api('study.card.image',{setId:set.id,cardId:capture.card.id})).contentBase64,png.contentBase64);}
 await f.error('study.create',{title:'Invalid',mapMode:'unknown'},'INVALID_PARAMS');const cards=await f.api('study.create',{title:'Explicit cards',mapMode:'cards'});assert.equal(cards.map.mindmap.enabled,false);
});
test('petal topics have filled rounded shapes, a quiet canvas and consistent curved branches; full labels remain accessible',async()=>{
 const {layoutStudy}=await import('../ui/study-map-layout.mjs'),{topicMarkup}=await import('../ui/mindmap-view.mjs'),{contrast}=await import('../ui/color-contrast.mjs');
 const cards=[{id:'r',title:'中心主题',parentId:null},...['目标','行动','资料','复盘'].map((title,i)=>({id:'c'+i,title,parentId:'r'}))];
 const layout=layoutStudy(cards,{mindmap:{theme:'petal',skeleton:'rounded'}});assert.equal(layout.positions.size,5);assert.equal(layout.config.paper,'#FFFFFF');assert(layout.links.every(l=>l.line==='curve'&&l.width>=3));
 for(const [id,style]of layout.topics){assert.equal(style.shape,'rounded');assert.notEqual(style.fill,'#FFFFFF');assert(contrast(style.fill,style.textColor)>=4.5);assert.equal(style.showImage,false);const box=layout.positions.get(id);assert(box.height>=44&&box.height<90);}
 const card=cards[1],html=topicMarkup(card,layout.positions.get(card.id),layout.topics.get(card.id),{cards},'http://localhost/','');assert(!html.includes('study-card-image'));assert(html.includes('mm-topic-details'));assert(html.includes('aria-label="主题：目标"'));
});
test('old freely positioned excerpts cannot cover attached topics after compact layout, and the stored positions remain unchanged',async()=>{
 const {layoutStudy}=await import('../ui/study-map-layout.mjs');const cards=[{id:'r',title:'An original root excerpt '.repeat(6),parentId:null},{id:'c',title:'A second PDF paragraph '.repeat(5),parentId:'r'},{id:'f',title:'An independently positioned source '.repeat(4),parentId:null,position:{x:493.33,y:84.44}}],before=structuredClone(cards);
 const layout=layoutStudy(cards,{layout:'down'}),boxes=[...layout.positions.values()];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));}
 assert.deepEqual(cards,before);assert.deepEqual([...layout.positions],[...layoutStudy(cards,{layout:'down'}).positions]);
});
test('topic line wrapping keeps ordinary English words intact and rich-title UTF-16 ranges exact',async()=>{
 const {wrapLabel,labelWidth}=await import('../ui/mindmap-style.mjs');
 const text='the file system for a known Software Architect';const rows=wrapLabel(text,210,17);assert(rows.length>1);
 for(const r of rows){assert.equal(text.slice(r.start,r.end),r.text);assert(labelWidth(r.text,17)<=210);assert(!r.text.endsWith('kn'));}
 for(const text of ['中文🙂 mixed title with symbols','A\nB\n','superlongidentifierwithoutspaces'.repeat(3),'a  b   c'])for(const r of wrapLabel(text,85,16)){assert.equal(text.slice(r.start,r.end),r.text);assert(!/[\uD800-\uDBFF]$/.test(r.text));assert(!/^[\uDC00-\uDFFF]/.test(r.text));}
});
