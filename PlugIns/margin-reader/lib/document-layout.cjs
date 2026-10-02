'use strict';
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs');
const D=require('./documents.cjs');
const writes=new Set(['document.fold.chapters','document.region.set','document.region.remove','document.layout.undo','document.layout.redo']);
const reads=new Set(['document.region.list','document.layout.get']);
const snapshot=doc=>({foldedPages:structuredClone(doc.foldedPages||[]),foldRegions:structuredClone(doc.foldRegions||[])});
function checkpoint(doc){doc.layoutHistory??={undo:[],redo:[]};doc.layoutHistory.undo.push(snapshot(doc));doc.layoutHistory.undo=doc.layoutHistory.undo.slice(-30);doc.layoutHistory.redo=[];}
async function read(store,method,p){
  const state=await store.load(),doc=D.findDocument(state,p.id),parsed=await D.parsedDocument(store,doc);assert(doc.kind==='pdf','INVALID_PARAMS','Page layout requires a PDF document.');
  const regions=(doc.foldRegions||[]).filter(r=>p.includeDeleted||!r.deletedAt).map(r=>({...r,sourceChanged:r.sourceHash!==doc.hash}));
  if(method==='document.region.list')return {revision:doc.revision,sourceVersion:doc.sourceVersion,regions,history:{canUndo:Boolean(doc.layoutHistory?.undo.length),canRedo:Boolean(doc.layoutHistory?.redo.length)}};
  require('./outline.cjs').validateLocator({page:p.page},parsed);
  const scale=p.width/parsed.sections[p.page-1].width,sourceHeight=parsed.sections[p.page-1].height*scale;
  const set=p.setId?require('./study-model.cjs').findSet(state,p.setId):null;
  const notes=(set?.cards||[]).filter(c=>c.anchor?.documentId===doc.id&&c.anchor.sourceHash===doc.hash&&c.anchor.locator.page===p.page&&require('./study-notebooks.cjs').visible(set,c.anchor));
  const layout=await import('../ui/page-slices.mjs');return {id:doc.id,page:p.page,revision:doc.revision,width:p.width,...layout.pageSlices(sourceHeight,regions.filter(r=>!r.sourceChanged&&r.page===p.page),notes,scale)};
}
async function request(store,method,p){
  return store.transaction(async state=>{
    const doc=D.findDocument(state,p.id);assert(doc.revision===p.expectedRevision,'CONFLICT','Document layout changed; refresh before editing.');
    assert(doc.kind==='pdf','INVALID_PARAMS','Page layout requires a PDF document.');
    const parsed=await D.parsedDocument(store,doc);
    if(method==='document.layout.undo'||method==='document.layout.redo'){
      const direction=method.split('.').at(-1),history=doc.layoutHistory,other=direction==='undo'?'redo':'undo';assert(history?.[direction]?.length,'NOT_FOUND','No document layout history is available.');history[other].push(snapshot(doc));Object.assign(doc,history[direction].pop());
    }else{
      checkpoint(doc);doc.foldRegions??=[];
      if(method==='document.fold.chapters'){
        assert(Array.isArray(p.nodeIds)&&p.nodeIds.length>0&&p.nodeIds.length<=500,'INVALID_PARAMS','Select 1–500 chapter IDs.');
        const selected=p.nodeIds.map(id=>{const n=doc.toc.find(n=>n.id===id);assert(n&&!n.unresolved,'NOT_FOUND','Chapter not found or unresolved.');return n;});
        const pages=new Set(doc.foldedPages||[]);
        for(const n of selected){const start=n.locator.page;let end=parsed.pageCount;
          const descendants=new Set([n.id]);for(const child of doc.toc)if(descendants.has(child.parentId))descendants.add(child.id);
          const after=doc.toc.slice(doc.toc.indexOf(n)+1).find(v=>!descendants.has(v.id)&&v.locator.page>start);
          if(after)end=after.locator.page-1;
          for(let page=start;page<=end;page++)p.folded===false?pages.delete(page):pages.add(page);
        }
        doc.foldedPages=[...pages].sort((a,b)=>a-b);
      }else if(method==='document.region.remove'){
        const region=doc.foldRegions.find(r=>r.id===p.regionId&&!r.deletedAt);assert(region,'NOT_FOUND','Folded region not found.');region.deletedAt=new Date().toISOString();
      }else{
        let region=p.regionId?doc.foldRegions.find(r=>r.id===p.regionId&&!r.deletedAt):null;
        if(p.regionId)assert(region,'NOT_FOUND','Folded region not found.');
        const value={...(region||{}),id:region?.id||randomUUID(),page:p.page??region?.page,start:p.start??region?.start,end:p.end??region?.end,folded:p.folded??region?.folded??true,sourceHash:doc.hash};
        require('./outline.cjs').validateLocator({page:value.page},parsed);
        assert(Number.isFinite(value.start)&&Number.isFinite(value.end)&&value.start>=0&&value.end<=1&&value.end-value.start>=.001,'INVALID_PARAMS','Choose a nonempty interval within this page.');
        assert(!value.folded||doc.foldRegions.every(r=>r.id===value.id||r.deletedAt||r.sourceHash!==doc.hash||r.folded===false||r.page!==value.page||r.end<=value.start||r.start>=value.end),'INVALID_PARAMS','Folded regions on the same page cannot overlap.');
        if(region)Object.assign(region,value);else{assert(doc.foldRegions.length<2000,'TOO_LARGE','Folded region capacity reached.');doc.foldRegions.push(value);}
      }
    }
    doc.revision++;doc.updatedAt=new Date().toISOString();return D.descriptor(doc,parsed);
  });
}
function unfoldTarget(doc,locator){
  const ranges=(doc.foldRegions||[]).filter(r=>!r.deletedAt&&r.folded!==false&&r.sourceHash===doc.hash&&r.page===locator.page&&(locator.pageOffset??0)>=r.start&&(locator.pageOffset??0)<r.end);
  const whole=doc.foldedPages?.includes(locator.page);
  if(!whole&&!ranges.length)return false;
  checkpoint(doc);
  if(whole)doc.foldedPages=doc.foldedPages.filter(p=>p!==locator.page);
  ranges.forEach(r=>r.folded=false);doc.revision++;doc.updatedAt=new Date().toISOString();return true;
}

module.exports={writes,reads,read,request,checkpoint,unfoldTarget};
