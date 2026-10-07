'use strict';
const {randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),V=require('./mindmap-model.cjs');
const templates={
 brainstorm:{title:'头脑风暴',structure:'mindmap',theme:'radiance',branches:[['问题',['现状','期望','约束']],['方案',['方案 A','方案 B','方案 C']],['行动',['验证','迭代','复盘']]]},
 project:{title:'项目规划',structure:'logic-right',theme:'business',branches:[['目标',['成果','验收标准']],['执行',['里程碑','负责人','风险']],['交付',['测试','发布','复盘']]]},
 timeline:{title:'阶段路线图',structure:'timeline-horizontal',theme:'pastel',branches:[['调研',['收集信息','明确需求']],['设计',['原型','评审']],['实现',['开发','测试']],['发布',['验收','回顾']]]},
 cause:{title:'原因分析',structure:'fishbone-left',theme:'coral',branches:[['人员',['技能','协作']],['方法',['流程','标准']],['工具',['能力','可靠性']],['环境',['资源','条件']]]},
 organization:{title:'组织分工',structure:'org-down',theme:'blueprint',branches:[['研发',['产品','工程']],['运营',['内容','支持']],['保障',['质量','安全']]]},
 knowledge:{title:'知识体系',structure:'tree-right',theme:'forest',branches:[['基础',['定义','原理','术语']],['应用',['案例','实践']],['反思',['疑问','结论']]]},
 comparison:{title:'对照分析',structure:'matrix',theme:'business',branches:[['选项 A',['成本','效果','风险']],['选项 B',['成本','效果','风险']],['选项 C',['成本','效果','风险']]]},
 decision:{title:'决策拆解',structure:'brace',theme:'earth',branches:[['需要解决',['目标','边界']],['评估选择',['收益','代价']],['验证结论',['依据','下一步']]]}
};
const methods=new Set(['study.mindmap.zone.move','study.mindmap.pitch.plan','study.mindmap.equation.preview','study.mindmap.collapse','study.mindmap.arrange','study.mindmap.catalog','study.mindmap.configure','study.mindmap.topics.update','study.mindmap.decoration.set','study.mindmap.decoration.remove','study.mindmap.relationship.update','study.mindmap.template.apply','study.mindmap.export']);
function chosen(set,ids){return require('./study-organize.cjs').selected(set,ids);}
function editable(set,cards){for(const c of cards){require('./study-notebooks.cjs').guard(set,'study.mindmap.topics.update',{cardIds:[c.id]});if(c.anchor?.layerId)require('./study-advanced.cjs').editable(set,c.anchor.layerId);}}
async function request(store,method,p){
 if(method==='study.mindmap.equation.preview')return require('./mindmap-equation.cjs').render(p.latex);
 if(method==='study.mindmap.pitch.plan'){const state=await store.load(),set=M.findSet(state,p.setId),frames=(await import('../ui/mindmap-pitch.mjs')).pitchPlan(set.cards,set.map?.mindmap?.pitch);return {setId:set.id,revision:set.revision,frames,total:frames.length};}
 if(method==='study.mindmap.catalog')return {...V.C,templates:Object.fromEntries(Object.entries(templates).map(([k,v])=>[k,{title:v.title,structure:v.structure,theme:v.theme}]))};
 if(method==='study.mindmap.export')return require('./mindmap-export.cjs').exportMap(store,p);
 const setId=await store.transaction(async state=>{
  const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);
  require('./study-history.cjs').checkpoint(set);set.map??={};
  if(method==='study.mindmap.collapse'){
   const roots=require('./study-tree.cjs').roots(set,p.cardIds),byParent=new Map();for(const c of set.cards){if(!byParent.has(c.parentId))byParent.set(c.parentId,[]);byParent.get(c.parentId).push(c);}
   const rows=[],queue=roots.map(c=>[c,0]);for(let i=0;i<queue.length;i++){const [c,depth]=queue[i];rows.push(c);for(const child of byParent.get(c.id)||[])queue.push([child,depth+1]);c.collapsed=p.level>=0&&depth>=p.level;}
   editable(set,rows);
  }else if(method==='study.mindmap.arrange'){
   editable(set,chosen(set,p.cardIds));await require('./mindmap-arrange.cjs').arrange(set,p);
  }else if(method==='study.mindmap.zone.move'){
   await require('./mindmap-zones.cjs').move(set,p);
  }else if(method==='study.mindmap.configure'){
   S.assert(Object.keys(p.patch).length,'INVALID_PARAMS','Supply at least one map setting.');
   set.map.mindmap=V.merge(set.map.mindmap,V.patch(p.patch,V.mapRules));
   if(p.topicPitch){S.assert(Object.keys(p.topicPitch).every(k=>['cardId','visible','layout'].includes(k)),'INVALID_PARAMS','Unknown topic pitch option.');const c=M.card(set,p.topicPitch.cardId);editable(set,[c]);const {cardId,...pitch}=p.topicPitch;c.mindmap={...c.mindmap,pitch:V.topic({pitch},c.title).pitch};c.updatedAt=new Date().toISOString();}
  }else if(method==='study.mindmap.topics.update'){
   const cards=chosen(set,p.cardIds);editable(set,cards);S.assert(cards.length<=1000,'TOO_LARGE','Style at most 1000 selected topics per operation.');
   for(const c of cards){const patch=V.topic(p.patch,c.title);const base=p.reset?Object.fromEntries(['equation','offset','pitch'].filter(k=>c.mindmap?.[k]!==undefined).map(k=>[k,c.mindmap[k]])):c.mindmap;c.mindmap=V.merge(base,patch);c.updatedAt=new Date().toISOString();}
  }else if(method==='study.mindmap.relationship.update'){
   const link=set.links?.find(l=>l.id===p.linkId);S.assert(link,'NOT_FOUND','Relationship not found.');
   const from=p.from||link.from,to=p.to||link.to;S.assert(!link.toSetId||link.toSetId===set.id,'INVALID_PARAMS','Visual endpoint editing requires a same-map relationship.');
   editable(set,[M.card(set,from),M.card(set,to)]);S.assert(from!==to,'INVALID_PARAMS','Choose different relationship endpoints.');
   S.assert(!(set.links||[]).some(l=>l!==link&&l.from===from&&l.to===to&&(!l.toSetId||l.toSetId===set.id)),'ALREADY_EXISTS','This relationship already exists.');
   link.from=from;link.to=to;if(p.label!==undefined)link.label=V.text(p.label,200);link.mindmap=V.merge(p.reset?{}:link.mindmap,V.patch(p.patch||{},V.relationRules));
  }else if(method==='study.mindmap.decoration.remove'){
   const items=set.map.mindmap?.items||[],item=items.find(i=>i.id===p.decorationId);S.assert(item,'NOT_FOUND','Map annotation not found.');
   editable(set,set.cards.filter(c=>item.cardIds.includes(c.id)));set.map.mindmap.items=items.filter(i=>i!==item);
   // A summary topic remains a normal, editable floating branch after removing
   // its bracket. Its text/children are not deleted implicitly.
  }else if(method==='study.mindmap.decoration.set'){
   set.map.mindmap??={enabled:true};const items=set.map.mindmap.items??=[];
   const existing=p.decorationId?items.find(i=>i.id===p.decorationId):null;if(p.decorationId)S.assert(existing,'NOT_FOUND','Map annotation not found.');
   const members=p.cardIds||existing?.cardIds.filter(id=>set.cards.some(c=>c.id===id)),cards=(existing?.kind||p.kind)==='zone'?require('./study-tree.cjs').roots(set,members):chosen(set,members);editable(set,cards);
   S.assert(cards.length<=1000,'TOO_LARGE','Group at most 1000 topics.');if(existing?.topicId){const forbidden=M.subtree(set.cards,existing.topicId);S.assert(!cards.some(c=>forbidden.has(c.id)||M.subtree(set.cards,c.id).has(existing.topicId)),'INVALID_PARAMS','A summary cannot summarize itself or its own hierarchy.');}
   const kind=existing?.kind||p.kind;S.assert(['boundary','summary','callout','zone'].includes(kind),'INVALID_PARAMS','Select boundary, summary, callout or zone.');
   S.assert(!p.kind||p.kind===kind,'INVALID_PARAMS','Annotation kind cannot change.');
   if(kind==='zone')S.assert(cards.every(c=>!c.parentId||M.card(set,c.parentId).submap),'INVALID_PARAMS','A zone groups independent floating branches.');
   else if(kind==='callout')S.assert(cards.length===1,'INVALID_PARAMS','A callout belongs to exactly one topic.');
   else{const parent=cards[0].parentId;S.assert(cards.every(c=>c.parentId===parent),'INVALID_PARAMS','Group topics sharing the same parent.');if(kind==='summary')S.assert(parent,'INVALID_PARAMS','A summary groups attached sibling topics.');}
   S.assert(items.length<500||existing,'TOO_LARGE','At most 500 annotations.');
   const item=existing||{id:randomUUID(),kind,cardIds:[],style:{}};if(!existing||p.cardIds)item.cardIds=cards.map(c=>c.id);item.style=V.merge(item.style,V.patch(p.style||{},V.itemRules));
   if(!existing){if(kind==='summary'){const c=require('./study-advanced.cjs').note(set,item.style.title||'概要');item.topicId=c.id;c.mindmap={shape:'rounded'};}items.push(item);}
   if(kind==='summary'&&item.style.title!==undefined){const c=set.cards.find(c=>c.id===item.topicId);if(c){c.title=M.title(item.style.title||'概要');delete c.mindmap?.runs;}}
   set.map.mindmap.items=items;set.lastMindmapDecoration=item.id;
  }else if(method==='study.mindmap.template.apply'){
   S.assert(Object.hasOwn(templates,p.template),'INVALID_PARAMS','Unknown mind-map template.');const t=templates[p.template];
   const before=set.cards.length,root=require('./study-advanced.cjs').note(set,p.title||t.title);
   for(const [title,children] of t.branches){const c=require('./study-advanced.cjs').note(set,title);c.parentId=root.id;for(const title of children){const sub=require('./study-advanced.cjs').note(set,title);sub.parentId=c.id;}}
   set.cards=M.order(set.cards);set.map.mindmap={...set.map.mindmap,enabled:true,structure:t.structure,theme:t.theme,skeleton:({brainstorm:'classic',project:'logical',timeline:'timeline',cause:'fishbone',organization:'organization',knowledge:'tree',comparison:'matrix',decision:'brace'})[p.template]};set.lastInsertedCard=root.id;set.lastMindmapTemplate={rootId:root.id,count:set.cards.length-before};
  }else S.fail('METHOD_NOT_FOUND','Unknown mind-map operation.');
  V.validateSet(set);M.touch(set);return set.id;
 });
 const state=await store.load();return {...await M.describe(store,state,M.findSet(state,setId)),lastMindmapDecoration:state.studySets[setId].lastMindmapDecoration||null,lastMindmapTemplate:state.studySets[setId].lastMindmapTemplate||null};
}
module.exports={methods,request,templates};
