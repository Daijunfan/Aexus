'use strict';
const {randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),D=require('./documents.cjs'),O=require('./outline.cjs'),M=require('./study-model.cjs');
const methods=new Set(['toc.batch','toc.generate','toc.undo','toc.redo']);
function checkpoint(doc){doc.tocHistory??={undo:[],redo:[]};doc.tocHistory.undo.push({toc:structuredClone(doc.toc),customOutline:doc.customOutline});doc.tocHistory.undo=doc.tocHistory.undo.slice(-30);doc.tocHistory.redo=[];}
function heuristic(parsed){
 const nodes=[];const stack=[];
 parsed.sections.forEach((section,index)=>{
  for(const line of section.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
   if(line.length>120)continue;
   const numbered=/^(\d+(?:\.\d+){0,5})[.、]?\s+\S/u.exec(line),chapter=/^(第[零〇一二三四五六七八九十百千万\d]{1,12}[章节目篇卷部]|chapter\s+\d+|part\s+[IVX\d]+)\s*/i.test(line);
   if(!numbered&&!chapter)continue;const depth=chapter?0:Math.min(5,numbered[1].split('.').length-1);stack.length=depth;
   const node={id:randomUUID(),title:line,parentId:stack.at(-1)||null,locator:parsed.kind==='pdf'?{page:index+1}:{section:index},source:'custom'};nodes.push(node);stack[depth]=node.id;
  }
 });
 S.assert(nodes.length<=5000,'TOO_LARGE','Generated outline exceeds 5000 chapters.');S.assert(nodes.length,'NOT_FOUND','No structured numbered headings were found. Add chapters manually.');return nodes;
}
async function request(store,method,p){
 return store.transaction(async state=>{
  const doc=D.findDocument(state,p.id);S.assert(doc.revision===p.expectedRevision,'CONFLICT','Refresh the document outline before changing it.');const parsed=await D.parsedDocument(store,doc);
  if(method==='toc.undo'||method==='toc.redo'){
   const direction=method.slice(4),from=doc.tocHistory?.[direction];S.assert(from?.length,'NOT_FOUND','No outline history in this direction.');doc.tocHistory[direction==='undo'?'redo':'undo'].push({toc:structuredClone(doc.toc),customOutline:doc.customOutline});Object.assign(doc,from.pop());doc.revision++;
  }else{
   checkpoint(doc);
   if(method==='toc.generate'){doc.toc=p.strategy==='numbered'?heuristic(parsed):structuredClone(parsed.toc);doc.customOutline=p.strategy==='numbered';doc.revision++;}
   else{
    S.assert(Array.isArray(p.operations)&&p.operations.length>0&&p.operations.length<=500,'INVALID_PARAMS','Choose 1–500 outline operations.');
    for(const op of p.operations){S.assert(op&&typeof op==='object'&&!Array.isArray(op),'INVALID_PARAMS','Invalid outline operation.');const {action,...args}=op,method='toc.'+action;S.assert(['add','update','remove','move','indent','outdent'].includes(action),'INVALID_PARAMS','Unknown outline action.');
     const params={...args,id:doc.id,expectedRevision:doc.revision};require('../runtime.cjs').validate(method,params);O.editOutline(doc,parsed,method,params);
    }
   }
  }
  doc.updatedAt=new Date().toISOString();return {id:doc.id,revision:doc.revision,toc:doc.toc,history:{canUndo:Boolean(doc.tocHistory?.undo.length),canRedo:Boolean(doc.tocHistory?.redo.length)}};
 });
}
async function importStudy(store,state,set,p){
 const doc=D.findDocument(state,p.documentId);S.assert(set.documentIds.includes(doc.id),'NOT_MEMBER','Add the document to the study before importing its outline.');await D.parsedDocument(store,doc);
 const nodes=p.nodeIds?doc.toc.filter(n=>p.nodeIds.includes(n.id)):doc.toc;S.assert(nodes.length>0&&nodes.length<=5000,'INVALID_PARAMS','Choose 1–5000 outline chapters.');
 let root=set.cards.find(c=>c.outlineSource?.documentId===doc.id&&c.outlineSource.nodeId===null);
 if(!root){root=require('./study-advanced.cjs').note(set,p.title||doc.title);root.outlineSource={documentId:doc.id,nodeId:null};}
 const map=new Map();
 for(const node of nodes){S.assert(!node.unresolved,'INVALID_LOCATOR','An outline chapter has an unresolved source position.');let card=set.cards.find(c=>c.outlineSource?.documentId===doc.id&&c.outlineSource.nodeId===node.id);
  if(!card){card=require('./study-advanced.cjs').note(set,node.title);card.outlineSource={documentId:doc.id,nodeId:node.id};card.anchor={documentId:doc.id,sourceHash:doc.hash,locator:node.locator,display:'collapsed'};}
  card.parentId=map.get(node.parentId)?.id||root.id;card.inMap=true;map.set(node.id,card);
 }
 set.cards=M.order(set.cards);set.lastOutlineImport={rootId:root.id,chapters:nodes.length};
}
module.exports={methods,request,checkpoint,importStudy,heuristic};
