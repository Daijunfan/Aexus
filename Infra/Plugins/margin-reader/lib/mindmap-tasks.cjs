'use strict';
const fs=require('node:fs/promises'),S=require('./safety.cjs'),M=require('./study-model.cjs');
const DAY=86400000;
function rows(set,rootId,state){
 const ids=rootId?M.subtree(set.cards,M.card(set,rootId).id):null;
 return set.cards.filter(c=>(!ids||ids.has(c.id))&&(c.mindmap?.task||c.mindmap?.status&&c.mindmap.status!=='none'||c.mindmap?.progress!==undefined)).map(c=>({id:c.id,parentId:c.parentId,title:(state?M.effective(state,set,c):c).title,note:c.note||'',...c.mindmap?.task,status:c.mindmap?.status||'none',progress:c.mindmap?.progress??0,priority:c.mindmap?.priority||0}));
}
function plan(set,p={},state){
 const tasks=rows(set,p.rootId,state),dates=tasks.flatMap(t=>[t.start,t.due].filter(Boolean)),start=dates.length?dates.reduce((a,b)=>a<b?a:b):null,end=dates.length?dates.reduce((a,b)=>a>b?a:b):null,offset=p.offset||0,limit=p.limit||100;
 return {setId:set.id,revision:set.revision,total:tasks.length,range:start?{start,end,days:Math.round((Date.parse(end)-Date.parse(start))/DAY)+1}:null,tasks:tasks.slice(offset,offset+limit),nextOffset:offset+limit<tasks.length?offset+limit:null};
}
const escapeCSV=v=>{const text=String(v??'');return '"'+(/^[\s]*[=+@-]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';};
const escapeICS=v=>String(v??'').replaceAll('\\','\\\\').replaceAll('\r','').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
function folded(line){let out='',part='',limit=75;for(const c of line){if(Buffer.byteLength(part+c)>limit){out+=part+'\r\n ';part='';limit=74;}part+=c;}return out+part;}
function serialize(set,format,p={},state){
 const tasks=rows(set,p.rootId,state);
 if(format==='csv')return {text:'\uFEFF'+[['ID','Title','Start','Due','Assignee','Status','Progress','Priority','Estimate'],...tasks.map(t=>[t.id,t.title,t.start,t.due,t.assignee,t.status,t.progress,t.priority,t.estimate])].map(row=>row.map(escapeCSV).join(',')).join('\r\n')+'\r\n',tasks:tasks.length};
 const date=v=>v.replaceAll('-',''),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Margin Reader//Local mind map tasks//EN','CALSCALE:GREGORIAN'];
 for(const t of tasks){
  const start=t.start||t.due;if(!start)continue;
  const end=new Date(Date.parse(t.due||start)+DAY).toISOString().slice(0,10);
  lines.push('BEGIN:VEVENT','UID:'+t.id+'.'+set.id+'@margin-reader.local','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+date(start),'DTEND;VALUE=DATE:'+date(end),'SUMMARY:'+escapeICS(t.title),'DESCRIPTION:'+escapeICS([t.note,t.assignee?'Assignee: '+t.assignee:'',t.status+' · '+t.progress+'%'].filter(Boolean).join('\n')),'END:VEVENT');
 }
 lines.push('END:VCALENDAR');return {text:lines.map(folded).join('\r\n')+'\r\n',tasks:tasks.filter(t=>t.start||t.due).length};
}
async function request(store,method,p){
 const state=await store.load(),set=M.findSet(state,p.setId);if(method==='study.mindmap.tasks.plan')return plan(set,p,state);
 M.revision(set,p.expectedRevision);S.assert(p.path.toLowerCase().endsWith('.'+p.format),'INVALID_PARAMS','Use the matching .csv or .ics extension.');const target=await S.safePath(store.workspace,p.path);await require('./files.cjs').parentExists(store.workspace,p.path);
 const result=serialize(set,p.format,p,state);
 await store.transaction(async(state,rollback)=>{M.revision(M.findSet(state,p.setId),p.expectedRevision);await S.safePath(store.workspace,p.path);await S.writeNew(target,result.text);rollback(()=>fs.rm(target,{force:true}));});
 return {path:p.path,format:p.format,bytes:Buffer.byteLength(result.text),tasks:result.tasks};
}
module.exports={plan,serialize,request};
