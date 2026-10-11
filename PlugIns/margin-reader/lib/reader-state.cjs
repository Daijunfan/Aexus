'use strict';
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs'),D=require('./documents.cjs'),M=require('./study-model.cjs');
const {validateLocator}=require('./outline.cjs');
const methods=new Set(['reader.comparison.set','reader.comparisons.list','reader.comparisons.save','reader.comparisons.open','reader.comparisons.update','reader.tabs.set','reader.notebook.create','reader.notebook.source','reader.notebook.unlink','document.pages.query','document.meta.update']);
async function target(store,state,value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['documentId','locator','sourceHash'].includes(k)),'INVALID_PARAMS','A pane requires a document ID and source locator.');
 const doc=D.findDocument(state,value.documentId);
 assert(!(await D.sourceStatus(store,doc)).changed&&(!value.sourceHash||value.sourceHash===doc.hash),'SOURCE_CHANGED','The pane source changed; explicitly save a refreshed arrangement.');
 return {documentId:doc.id,sourceHash:doc.hash,locator:validateLocator(value.locator||doc.position,await D.parsedDocument(store,doc))};
}
function view(state,id){const found=(state.readerViews||[]).find(v=>v.id===id);assert(found,'NOT_FOUND','Saved reader arrangement does not exist.');return found;}
function activate(state,record){
 const first=D.findDocument(state,record.primary.documentId);require('./document-layout.cjs').unfoldTarget(first,record.primary.locator);
 first.position=record.primary.locator;state.settings.lastDocument=first.id;
 const set=state.studySets[record.setId];state.settings.activeStudySet=set&&!set.deletedAt&&set.documentIds.includes(first.id)?set.id:null;
 state.settings.comparison=record.panes[0]||null;state.settings.comparisonExtra=record.panes[1]||null;
 state.settings.comparisonDirection=record.direction||'columns';state.settings.comparisonRatio=record.ratio||.5;
 state.settings.activeReaderView=record.id;state.settings.openDocuments=[...new Set([...(state.settings.openDocuments||[]),first.id,...record.panes.map(p=>p.documentId)])].slice(-(state.settings.tabLimit||20));
}
async function list(store,p){
 const state=await store.load();if(p.documentId)D.findDocument(state,p.documentId);
 const rows=[];
 for(const record of state.readerViews||[]){if(record.deletedAt&&!p.includeDeleted)continue;if(p.documentId&&![record.primary,...record.panes].some(v=>v.documentId===p.documentId))continue;
  const panes=[];for(const value of [record.primary,...record.panes]){const doc=state.documents[value.documentId];const status=doc&&!doc.trashed?await D.sourceStatus(store,doc).catch(()=>null):null;panes.push({...value,title:doc?.title||'Unavailable original',available:Boolean(status?.st?.isFile()),sourceChanged:!status||status.changed||value.sourceHash!==doc.hash});}
  rows.push({...record,sources:panes});
 }
 return {views:rows};
}
async function pages(store,p){
 const state=await store.load(),doc=D.findDocument(state,p.id),parsed=await D.parsedDocument(store,doc);
 assert(!p.query||p.query.length<=1000,'INVALID_PARAMS','Page query exceeds 1000 characters.');
 const sets=p.setId?[M.findSet(state,p.setId)]:Object.values(state.studySets).filter(s=>!s.deletedAt);
 const key=l=>doc.kind==='pdf'?l.page-1:l.section,rows=[];
 for(let i=0;i<parsed.sections.length;i++){
  const section=parsed.sections[i];if(p.query&&!section.text.toLocaleLowerCase().includes(p.query.toLocaleLowerCase()))continue;
  const cards=[],ink=[],bookmarks=(doc.bookmarks||[]).filter(b=>!b.deletedAt&&b.sourceHash===doc.hash&&key(b.locator)===i);
  for(const s of sets){for(const c of s.cards){const source=c.source||c.anchor;if(source?.documentId===doc.id&&(source.hash||source.sourceHash)===doc.hash&&key(source.locator)===i)cards.push({setId:s.id,cardId:c.id,title:c.title});}
   for(const stroke of s.ink||[])if(stroke.documentId===doc.id&&stroke.sourceHash===doc.hash&&stroke.page===i+1&&!stroke.hidden&&require('./study-advanced.cjs').layers(s).some(l=>l.id===(stroke.layerId||'default')&&l.visible&&!l.deletedAt))ink.push({setId:s.id,strokeId:stroke.id});}
  if(p.kind==='cards'&&!cards.length||p.kind==='ink'&&!ink.length||p.kind==='bookmarks'&&!bookmarks.length)continue;
  rows.push({section:i,...(doc.kind==='pdf'?{page:i+1}:{}),title:section.title,locator:doc.kind==='pdf'?{page:i+1}:{section:i},cards,ink,bookmarks:bookmarks.map(b=>({id:b.id,title:b.title})),excerpt:section.text.slice(0,150)});
 }
 const offset=p.offset||0,limit=p.limit||50;return {id:doc.id,revision:doc.revision,total:rows.length,pages:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};
}
async function notebookSource(store,p){
 const state=await store.load(),doc=D.findDocument(state,p.id);let link=doc.attachedTo;
 if(p.strokeId){assert(p.setId,'INVALID_PARAMS','A stroke source needs its study ID.');const s=M.findSet(state,p.setId),stroke=s.ink?.find(s=>s.id===p.strokeId&&s.documentId===doc.id);assert(stroke,'NOT_FOUND','Notebook stroke not found.');link=stroke.context||link;if(!p.page)p={...p,page:stroke.page};}
 assert(link,'NOT_FOUND','This notebook is no longer bound to an original document.');
 assert(!link.notebookHash||link.notebookHash===doc.hash,'SOURCE_CHANGED','Notebook pages changed; the old binding was not applied.');
 const source=D.findDocument(state,link.documentId),parsed=await D.parsedDocument(store,doc);
 validateLocator({page:p.page||doc.position.page},parsed);
 return target(store,state,{documentId:source.id,sourceHash:link.sourceHash,locator:link.locator||{page:p.page||doc.position.page}});
}
function paper(page,style,rgb){
 const {width:w,height:h}=page.getSize(),color=rgb(.82,.86,.9);
 if(style==='lined'||style==='grid')for(let y=24;y<h;y+=24)page.drawLine({start:{x:0,y},end:{x:w,y},thickness:.4,color});
 if(style==='grid')for(let x=24;x<w;x+=24)page.drawLine({start:{x,y:0},end:{x,y:h},thickness:.4,color});
 if(style==='dots')for(let x=24;x<w;x+=24)for(let y=24;y<h;y+=24)page.drawCircle({x,y,size:.8,color});
}
async function createNotebook(store,p){
 const initial=await store.load(),source=D.findDocument(initial,p.sourceId);
 assert(source.kind==='pdf'&&source.sourceVersion===p.expectedSourceVersion,'SOURCE_CHANGED','Choose an unchanged PDF source.');
 const parsed=await D.parsedDocument(store,source);assert(parsed.sections.length<=2000,'TOO_LARGE','The notebook supports up to 2000 source pages.');
 if(p.setId)M.revision(M.findSet(initial,p.setId),p.expectedRevision);
 const {PDFDocument,rgb}=require('pdf-lib'),pdf=await PDFDocument.create();
 for(const section of parsed.sections){const page=pdf.addPage([section.width,section.height]);paper(page,p.paper||'lined',rgb);}
 const title=M.title(p.title||(source.title+' · 笔记本').slice(0,200));pdf.setTitle(title);pdf.setProducer('Margin Reader');
 const generated=require('./generated-document.cjs'),prepared=await generated.prepare(store,p.path,Buffer.from(await pdf.save()));
 return store.transaction(async(state,rollback)=>{
  const original=D.findDocument(state,source.id);assert(original.sourceVersion===p.expectedSourceVersion&&!(await D.sourceStatus(store,original)).changed,'SOURCE_CHANGED','The original changed before notebook creation.');
  const set=p.setId?M.findSet(state,p.setId):null;if(set)M.revision(set,p.expectedRevision);
  const {doc,descriptor}=await generated.save(store,state,prepared,rollback,{title,customTitle:true,attachedTo:{documentId:original.id,sourceHash:original.hash},paper:p.paper||'lined'});
  doc.attachedTo.notebookHash=doc.hash;
  original.attachedNotebooks=[...new Set([...(original.attachedNotebooks||[]),doc.id])];original.revision++;
  if(set){require('./study-history.cjs').checkpoint(set);set.documentIds=[...new Set([...set.documentIds,original.id,doc.id])];M.touch(set);}
  const record={id:randomUUID(),title,revision:1,primary:{documentId:original.id,sourceHash:original.hash,locator:original.position},panes:[{documentId:doc.id,sourceHash:doc.hash,locator:{page:original.position.page||1}}],direction:'columns',ratio:.5,setId:set?.id||null,notebookId:doc.id};
  state.readerViews??=[];assert(state.readerViews.length<500,'TOO_LARGE','Saved-view capacity reached.');state.readerViews.push(record);
  if(p.activate!==false)activate(state,record);
  return {...descriptor,viewId:record.id,setRevision:set?.revision};
 });
}
async function request(store,method,p){
 if(method==='reader.comparisons.list')return list(store,p);
 if(method==='document.pages.query')return pages(store,p);
 if(method==='reader.notebook.source')return notebookSource(store,p);
 if(method==='reader.notebook.create')return createNotebook(store,p);
 return store.transaction(async state=>{
  if(method==='reader.comparison.set'){
   const key=p.slot===2?'comparisonExtra':'comparison';
   if(p.documentId===null){state.settings[key]=null;if(key==='comparison')state.settings.comparisonExtra=null;return null;}
   assert(p.slot!==2||state.settings.comparison,'INVALID_PARAMS','Open the first comparison pane before adding a third document.');
   const checked=await target(store,state,{documentId:p.documentId,locator:p.locator});
   state.settings[key]={documentId:checked.documentId,locator:checked.locator};return state.settings[key];
  }
  if(method==='reader.comparisons.save'){
   state.readerViews??=[];const existing=p.viewId?view(state,p.viewId):null;
   if(existing)assert(existing.revision===p.expectedRevision,'CONFLICT','The saved arrangement changed.');
   else assert(state.readerViews.length<500,'TOO_LARGE','Saved-view capacity reached.');
   const primary=await target(store,state,p.primary||{documentId:state.settings.lastDocument});
   const values=p.panes||[state.settings.comparison,state.settings.comparisonExtra].filter(Boolean);
   assert(Array.isArray(values)&&values.length>=1&&values.length<=2,'INVALID_PARAMS','Save one or two independent comparison panes.');
   const panes=[];for(const value of values)panes.push(await target(store,state,value));
   const record={id:existing?.id||randomUUID(),revision:(existing?.revision||0)+1,title:M.title(p.title),primary,panes,direction:p.direction||state.settings.comparisonDirection||'columns',ratio:p.ratio||state.settings.comparisonRatio||.5,setId:state.settings.activeStudySet||null};
   if(existing)Object.assign(existing,record);else state.readerViews.push(record);return record;
  }
  if(method==='reader.comparisons.open'){
   const record=view(state,p.viewId);assert(!record.deletedAt,'NOT_FOUND','Restore this arrangement before opening it.');
   for(const item of [record.primary,...record.panes])await target(store,state,item);
   activate(state,record);return {...record,opened:true};
  }
  if(method==='reader.comparisons.update'){
   const record=view(state,p.viewId);assert(record.revision===p.expectedRevision,'CONFLICT','The saved arrangement changed.');
   assert(p.title!==undefined||p.deleted!==undefined,'INVALID_PARAMS','Supply a title or deletion state.');
   if(p.title!==undefined)record.title=M.title(p.title);if(p.deleted===true)record.deletedAt=new Date().toISOString();else if(p.deleted===false)delete record.deletedAt;
   record.revision++;return record;
  }
  if(method==='reader.tabs.set'){
   const limit=p.limit||state.settings.tabLimit||20;
   assert(Array.isArray(p.ids)&&p.ids.length<=limit&&new Set(p.ids).size===p.ids.length,'INVALID_PARAMS','Use unique document IDs within the selected tab capacity.');
   p.ids.forEach(id=>D.findDocument(state,id));state.settings.tabLimit=limit;state.settings.openDocuments=[...p.ids];
   if(state.settings.lastDocument&&!p.ids.includes(state.settings.lastDocument))state.settings.lastDocument=p.ids.at(-1)||null;
   const set=state.studySets[state.settings.activeStudySet];if(set&&!set.documentIds.includes(state.settings.lastDocument))state.settings.activeStudySet=null;
   return {ids:state.settings.openDocuments,limit,lastDocument:state.settings.lastDocument};
  }
  const doc=D.findDocument(state,p.id);assert(doc.revision===p.expectedRevision,'CONFLICT','Document metadata changed.');
  if(method==='reader.notebook.unlink'){
   assert(doc.attachedTo,'NOT_FOUND','The document is not an attached notebook.');
   const parent=state.documents[doc.attachedTo.documentId];if(parent){parent.attachedNotebooks=(parent.attachedNotebooks||[]).filter(id=>id!==doc.id);parent.revision++;}
   delete doc.attachedTo;
   for(const saved of state.readerViews||[])if(saved.notebookId===doc.id&&!saved.deletedAt){saved.deletedAt=new Date().toISOString();saved.revision++;}
  }else if(method==='document.meta.update'){
   assert(['title','tags','category','favorite'].some(k=>p[k]!==undefined),'INVALID_PARAMS','Choose a metadata field.');
   if(p.title!==undefined){doc.title=M.title(p.title);doc.customTitle=true;}
   if(p.tags!==undefined)doc.tags=M.tags(p.tags);
   if(p.category!==undefined){assert(p.category.length<=100,'INVALID_PARAMS','Category exceeds 100 characters.');doc.category=p.category;}
   if(p.favorite!==undefined)doc.favorite=p.favorite;
  }else assert(false,'METHOD_NOT_FOUND','Unknown reader-state command.');
  doc.revision++;doc.updatedAt=new Date().toISOString();return D.descriptor(doc,await D.parsedDocument(store,doc));
 });
}
module.exports={methods,request,paper,target};
