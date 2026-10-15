// Group identity, policy and authenticated publication. Agent IDs refer to the
// persistent CloudHosts registry; messages and recipient receipts live in SQLite.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const registry=require('./registry.cjs'),store=require('./collaboration-store.cjs');
const folder=()=>path.join(registry.home,'collaboration'),index=()=>path.join(folder(),'groups.json');
const copy=value=>structuredClone(value);
function atomic(file,data){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const temp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
 finally{fs.rmSync(temp,{force:true})}
}
function catalog(){
 if(!fs.existsSync(index()))return {version:1,items:[]};
 if(fs.lstatSync(index()).isSymbolicLink())throw Error('Collaboration catalog cannot be a symlink');
 const parsed=JSON.parse(fs.readFileSync(index(),'utf8'));
 if(parsed.version!==1||!Array.isArray(parsed.items))throw Error('Invalid collaboration catalog');
 return parsed;
}
const title=(value,label,max=100)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(label+' must contain 1–'+max+' characters');return value.trim()};
const agents=()=>require('./agent-sessions.cjs').sessions();
function members(values){
 if(!Array.isArray(values)||values.length>200||values.some(value=>typeof value!=='string'))throw Error('Choose up to 200 Agent IDs');
 const all=new Set(agents().map(item=>item.id)),result=[...new Set(values)];
 for(const id of result)if(!all.has(id))throw Error('Unknown native Agent session: '+id);
 return result;
}
function requireGroup(id,{archived=false}={}){
 const group=catalog().items.find(item=>item.id===id);
 if(!group||group.archived&&!archived)throw Error('Unknown or archived group');
 return group;
}
function presentation(group){
 const available=new Map(agents().map(item=>[item.id,item]));
 const last=store.latest(group.id);
 return {...group,lastMessage:last?{id:last.id,sequence:last.sequence,text:last.text.slice(0,160),createdAt:last.createdAt,authorName:last.author.name}:group.lastMessage,
  unreadCount:store.unreadSince(group.id,group.readSequence||0),
  members:group.memberIds.map(id=>{
   const a=available.get(id);return a?{id,name:a.name,engine:a.engine,engineHostId:a.engineHostId,targetHostId:a.targetHostId,status:a.status,running:a.running}:{id,name:'Unavailable Agent',missing:true};
  })};
}
function list({includeArchived=false}={}){return catalog().items.filter(item=>includeArchived||!item.archived).map(presentation)}
function get({id}){return presentation(requireGroup(id,{archived:true}))}
function create({name,memberIds=[],description='',autoPublishReplies=true }={}){
 name=title(name,'Group name',80);if(typeof description!=='string'||description.length>1000)throw Error('Group description too long');
 if(typeof autoPublishReplies!=='boolean')throw Error('Group reply publishing must be enabled or disabled');
 const now=new Date().toISOString(),ids=members(memberIds);
 const item={id:'cg_'+randomUUID(),name,description,memberIds:ids,ownerId:ids[0]||null,adminIds:[],mutes:{},autoPublishReplies,revision:1,createdAt:now,updatedAt:now,readSequence:0,lastMessage:null,archived:false};
 const data=catalog();data.items.push(item);atomic(index(),data);return presentation(item);
}
function update({id,name,description,memberIds,expectedRevision,ownerId,adminIds,mutes,autoPublishReplies}={}){
 const data=catalog(),item=data.items.find(row=>row.id===id&&!row.archived);
 if(!item)throw Error('Unknown group');
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Group changed; reload before editing');
 if(name!==undefined)item.name=title(name,'Group name',80);
 if(description!==undefined){if(typeof description!=='string'||description.length>1000)throw Error('Group description too long');item.description=description}
 if(memberIds!==undefined||ownerId!==undefined){
  const next=memberIds===undefined?item.memberIds:members(memberIds);
  const nextOwner=ownerId===undefined?item.ownerId:ownerId;
  // Owner transfer and member removal must be one atomic edit, so a
  // removed owner does not make an otherwise valid handoff impossible.
  if(nextOwner!=null&&!next.includes(nextOwner))throw Error('Transfer group Owner to a remaining member');
  item.memberIds=next;item.ownerId=nextOwner;
  item.adminIds=(item.adminIds||[]).filter(member=>next.includes(member)&&member!==nextOwner);
  item.mutes=Object.fromEntries(Object.entries(item.mutes||{}).filter(([member])=>next.includes(member)));
 }
 if(adminIds!==undefined){
  if(!Array.isArray(adminIds)||adminIds.some(member=>!item.memberIds.includes(member)))throw Error('Group Admin must be a member');
  item.adminIds=[...new Set(adminIds)].filter(member=>member!==item.ownerId);
 }
 if(autoPublishReplies!==undefined){if(typeof autoPublishReplies!=='boolean')throw Error('Invalid group reply setting');item.autoPublishReplies=autoPublishReplies}
 if(mutes!==undefined){
  if(!mutes||typeof mutes!=='object'||Array.isArray(mutes)||Object.entries(mutes).some(([member,until])=>!item.memberIds.includes(member)||until!==null&&!Number.isSafeInteger(until)))throw Error('Invalid group mute controls');
  item.mutes=mutes;
 }
 item.revision++;item.updatedAt=new Date().toISOString();atomic(index(),data);return presentation(item);
}
function archive({id,expectedRevision}={}){
 const data=catalog(),item=data.items.find(row=>row.id===id&&!row.archived);
 if(!item)throw Error('Unknown group');
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Group changed; reload before archiving');
 item.archived=true;item.revision++;item.updatedAt=new Date().toISOString();atomic(index(),data);
 return {archived:true,id};
}
function messages({id,before,limit=50}={}){
 requireGroup(id,{archived:true});
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('History limit must be 1..100');
 if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw Error('Invalid message cursor');
 return store.history(id,before,limit);
}
function search({id,query,before,limit=50}={}){
 requireGroup(id,{archived:true});
 return store.search(id,query,before,limit);
}
function entry({id,messageId}={}){
 requireGroup(id,{archived:true});
 const item=store.find(id,messageId);
 if(!item)throw Error('Published message is not in this group');
 return item;
}
function post({id,text,replyTo,clientMessageId,kind='message',mentions=[],files=[]}={},author={kind:'operator',name:'You'}){
 const group=requireGroup(id);
 if(!['message','note','decision','blocker','result'].includes(kind))throw Error('Invalid message kind');
 if(!['operator','core','agent'].includes(author?.kind))throw Error('Invalid author');
 if(author.kind==='agent'&&(!author.id||!group.memberIds.includes(author.id)))throw Error('Agent is no longer a group member');
 const attachments=require('./collaboration-attachments.cjs').capture(files);
 text=attachments.length&&!String(text||'').trim()?'Please review the attached files.':title(text,'Message',16000);
 if(replyTo!==undefined&&typeof replyTo!=='string')throw Error('Invalid reply target');
 if(clientMessageId!==undefined&&(typeof clientMessageId!=='string'||clientMessageId.length<1||clientMessageId.length>160))throw Error('Invalid client message ID');
 const original=replyTo?store.find(id,replyTo):null;
 if(replyTo&&!original)throw Error('Reply target is not in this group');
 if(mentions!=='all'&&(!Array.isArray(mentions)||mentions.some(item=>typeof item!=='string')))throw Error('Mentions must contain Agent IDs or all');
 const explicit=mentions==='all'?[...group.memberIds]:[...new Set(mentions)];
 for(const member of explicit)if(!group.memberIds.includes(member))throw Error('Mentioned Agent is not a member: '+member);
 const addressed=original?.author.kind==='agent'&&group.memberIds.includes(original.author.id)?[original.author.id]:[];
 const targetIds=kind==='message'&&author.kind==='operator'?
  [...new Set(explicit.length?explicit:addressed.length?addressed:group.memberIds)]:[];
 const fingerprint=createHash('sha256').update(JSON.stringify([text,replyTo||null,kind,explicit,targetIds,attachments])).digest('hex');
 const item={id:'gm_'+randomUUID(),groupId:id,sequence:0,kind,text,author,createdAt:new Date().toISOString(),
  replyTo:replyTo||null,replyPreview:original?{authorName:original.author.name,text:original.text.slice(0,240)}:null,
  mentions:explicit,recipientIds:targetIds,broadcast:!explicit.length&&!addressed.length&&kind==='message',
  clientMessageId:clientMessageId||null,attachments,fingerprint};
 const saved=store.append(item,targetIds);
 if(saved.created){
  // Metadata is a projection; SQLite already committed the message and outbox.
  const data=catalog(),current=data.items.find(row=>row.id===id);
  if(current){current.lastMessage={id:item.id,text:text.slice(0,160),createdAt:item.createdAt,authorName:author.name};current.updatedAt=item.createdAt;current.revision++;atomic(index(),data)}
  if(targetIds.length)queueMicrotask(()=>{try{require('./collaboration-execution.cjs').kick()}catch(error){console.error('Group dispatch:',error.message)}});
 }
 return copy(saved.message);
}
function postFromTool(scope,{text,replyTo}={}){
 if(!scope||typeof scope!=='object'||!scope.agentId||!scope.messageId||!scope.groupId||!scope.turnId)throw Error('Missing authenticated execution scope');
 const group=requireGroup(scope.groupId);
 if(!group.memberIds.includes(scope.agentId))throw Error('Agent is no longer a member');
 const mute=group.mutes?.[scope.agentId];
 if(mute===null||typeof mute==='number'&&mute>Date.now())throw Error('Agent is muted in this group');
 let delivery=store.delivery(scope.messageId,scope.agentId);
 // A fast native tool call can precede the turn/start RPC acknowledgment.
 // The authenticated active tool scope binds the routing claim to that turn.
 if(delivery?.status==='routing'&&!delivery.turn_id){
  store.change(scope.messageId,scope.agentId,['routing'],{status:'running',turn_id:scope.turnId});
  delivery=store.delivery(scope.messageId,scope.agentId);
 }
 if(!delivery||delivery.turn_id!==scope.turnId||!['submitted','running','awaiting_reply','replied'].includes(delivery.status))
  throw Error('Publication is unavailable outside the assigned active task');
 if(replyTo!==undefined&&replyTo!==scope.messageId)throw Error('Cannot change public reply target');
 const member=agents().find(row=>row.id===scope.agentId);
 const item=post({id:scope.groupId,text,replyTo:scope.messageId,
  kind:'result',clientMessageId:'group-reply:'+scope.messageId+':'+scope.agentId,
  mentions:[]},{kind:'agent',id:scope.agentId,name:member?.name||'Agent'});
 store.change(scope.messageId,scope.agentId,['submitted','running','awaiting_reply','replied'],{status:'replied',published_at:new Date().toISOString()});
 return item;
}
function retry({id,messageId,agentId}={}){
 const group=requireGroup(id),item=store.find(id,messageId);
 if(!item||!item.recipientIds?.includes(agentId)||!group.memberIds.includes(agentId))throw Error('Unknown or unauthorized message recipient');
 const outcome=store.retry(messageId,agentId);queueMicrotask(()=>require('./collaboration-execution.cjs').kick());
 return {messageId,agentId,status:outcome.status};
}
function readMessage({id,sequence}={}){
 const data=catalog(),group=data.items.find(item=>item.id===id&&!item.archived);
 if(!group)throw Error('Unknown group');
 if(!Number.isSafeInteger(sequence)||sequence<0)throw Error('Invalid read sequence');
 const max=store.latest(id)?.sequence||0;
 const previous=Number.isSafeInteger(group.readSequence)?group.readSequence:0;
 const next=Math.max(previous,Math.min(sequence,max));
 if(next!==group.readSequence){group.readSequence=next;atomic(index(),data)}
 return {groupId:id,readSequence:group.readSequence,unreadCount:store.unreadSince(id,group.readSequence)};
}
const postSystem=(id,text,source,agent)=>post({id,text,kind:'result',clientMessageId:'plan:'+source},
 agent&&requireGroup(id).memberIds.includes(agent.id)?{kind:'agent',id:agent.id,name:agent.name}:{kind:'core',name:'Plan'});
module.exports={list,get,create,update,archive,messages,search,entry,post,postSystem,postFromTool,retry,readMessage};
