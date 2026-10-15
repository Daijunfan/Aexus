// CloudHosts canonical, versioned command descriptions. Adapted from Aexus API
// discovery design; handlers remain in CloudHosts Core and share its data.
const {createHash}=require('node:crypto');
const pkg=require('../package.json'),legacy=require('../schema.json');
const string=(max=16000)=>({type:'string',minLength:1,maxLength:max});
const id=string(180),bool={type:'boolean'},integer=(max=500)=>({type:'integer',minimum:0,maximum:max});
const array=(item,max=200)=>({type:'array',items:item,maxItems:max});
const obj=(props={},required=[],open=false)=>({type:'object',additionalProperties:open,properties:props,required});
const any=obj({},[],true);
const rule=obj({kind:string(32)},['kind'],true);
const viewLayouts=['table','board','timeline','calendar','plan','list','gallery','chart','feed','form'];
const viewFilter=obj({search:{type:'string',maxLength:240},employee:string(180),team:string(180),channel:string(180),
 states:array({type:'string',enum:['scheduled','running','paused','completed','attention','due']},20),
 priorities:array({type:'string',enum:['low','normal','high','urgent']},20),tags:array(string(40),20)});
const viewOptions=obj({timezone:string(100),timelineScale:{type:'string',enum:['day','week','month']},
 plannerMode:{type:'string',enum:['day','week','agenda']},chartMetric:{type:'string',enum:['schedules','runs']},
 chartGroupBy:{type:'string',enum:['status','employee','team','priority']},chartType:{type:'string',enum:['bar','horizontal','line','donut']}});
const viewProperties={name:string(80),layout:{type:'string',enum:viewLayouts},groupBy:{type:'string',enum:['status','employee','priority']},
 filter:viewFilter,sort:{type:'string',enum:['nextAt','name','updatedAt','priority']},
 direction:{type:'string',enum:['asc','desc']},options:viewOptions};
const viewSpec=obj(viewProperties,['name','layout']),viewPatch=obj(viewProperties);
const definitions=[
 ['company.roster','Read permitted Agent identities and roles','read',obj()],
 ['company.teams','List visible teams','read',obj()],
 ['company.createTeam','Create a real team','write',obj({name:string(100),description:{type:'string',maxLength:1000},memberIds:array(id)},['name'])],
 ['company.updateTeam','Edit team with optimistic revision','write',obj({id,name:string(100),description:{type:'string',maxLength:1000},memberIds:array(id),expectedRevision:integer(1000000)},['id'])],
 ['company.bindings','List visible manager relationships','read',obj()],
 ['company.tasks','List work delegated by or to this Agent','read',obj({agentId:id,limit:{type:'integer',minimum:1,maximum:500}})],
 ['company.task','Read one authorized delegated task','read',obj({id},['id'])],
 ['company.delegate','Delegate to an authorized Agent with stable retry identity','delegate',obj({agentId:id,text:string(),clientTaskId:string(160)},['agentId','text'])],
 ['messages.list','List groups where this Agent is a member','read',obj()],
 ['messages.get','Read a group where this Agent is a member','read',obj({id},['id'])],
 ['messages.create','Create a group containing permitted members','write',obj({name:string(80),description:{type:'string',maxLength:1000},memberIds:array(id),autoPublishReplies:bool},['name'])],
 ['messages.update','Edit group as Owner/Admin','write',obj({id,name:string(80),description:{type:'string',maxLength:1000},memberIds:array(id),expectedRevision:integer(1000000),autoPublishReplies:bool},['id'])],
 ['messages.history','Read published group history, paged','read',obj({id,before:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:100}},['id'])],
 ['messages.search','Search published group messages','read',obj({id,query:string(240),before:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:100}},['id','query'])],
 ['messages.entry','Read one published group message','read',obj({id,messageId:id},['id','messageId'])],
 ['messages.publish','Post a non-triggering public Agent message to a joined group','publish',obj({id,text:string(),kind:{type:'string',enum:['note','decision','blocker','result']},replyTo:id,clientMessageId:string(160)},['id','text'])],
 ['plan.list','List authorized Plans','read',obj({includeArchived:bool})],
 ['plan.get','Read one authorized Plan','read',obj({id},['id'])],
 ['plan.query','Search authorized Plan rows, true run states, tags, Teams and Agents','read',obj({search:{type:'string',maxLength:240},status:{type:'string',enum:['scheduled','running','paused','completed','attention','due']},filter:viewFilter,
  sort:{type:'string',enum:['nextAt','name','updatedAt','priority']},direction:{type:'string',enum:['asc','desc']},
  limit:{type:'integer',minimum:1,maximum:500},offset:{type:'integer',minimum:0}})],
 ['plan.history','Read execution records for authorized Plans','read',obj({id,limit:{type:'integer',minimum:1,maximum:500}})],
 ['plan.preview','Preview concrete schedule occurrences','read',obj({rule,after:{type:'string'},count:{type:'integer',minimum:1,maximum:100}},['rule'])],
 ['plan.create','Create a Plan tied to the calling Agent and current grant','schedule',obj({name:string(160),action:obj({type:{const:'agent'},mode:{const:'resume'},agentId:id,text:string(),groupId:id},['type','mode','agentId','text']),rule,enabled:bool,notes:{type:'string',maxLength:16000},priority:{type:'string',enum:['low','normal','high','urgent']},tags:array(string(40),20),clientRequestId:string(160)},['name','action','rule'])],
 ['plan.update','Modify a Plan created by this Agent','schedule',obj({id,patch:obj({name:string(160),notes:{type:'string',maxLength:16000},enabled:bool,rule,action:any,priority:{type:'string',enum:['low','normal','high','urgent']},tags:array(string(40),20)}),expectedRevision:integer(1000000)},['id','patch'])],
 ['plan.archive','Archive a Plan created by this Agent','schedule',obj({id,expectedRevision:integer(1000000)},['id'])],
 ['plan.schema','Discover the ten Aexus Plan layout contracts','read',obj()],
 ['plan.views','List built-in and authorized saved Plan views','read',obj()],
 ['plan.view-create','Save a Plan layout, filtering and sorting without changing tasks','write',obj({spec:viewSpec},['spec'])],
 ['plan.view-update','Change an owned saved Plan view with revision protection','write',obj({id,patch:viewPatch,expectedRevision:{type:'integer',minimum:1}},['id','patch'])],
 ['plan.view-delete','Delete an owned saved view; jobs and runs remain unchanged','write',obj({id,expectedRevision:{type:'integer',minimum:1}},['id'])],
 ['channel.list','List channels this Agent currently belongs to','read',obj()],
 ['channel.get','Read a channel in current membership scope','read',obj({id},['id'])],
 ['channel.timeline','Page actual published news and discussion within current channel membership','read',
  obj({id,kind:{type:'string',enum:['all','news','message']},cursor:string(500),beforeEntry:id,limit:{type:'integer',minimum:1,maximum:100}},['id'])],
 ['channel.history','Page discussion messages without news','read',obj({id,cursor:string(500),beforeEntry:id,limit:{type:'integer',minimum:1,maximum:100}},['id'])],
 ['channel.post','Read one current article by stable ID','read',obj({id},['id'])],
 ['channel.posts','Find active articles only in authorized channels','read',obj({channelId:id,sourceId:id,query:{type:'string',maxLength:500},saved:bool,cursor:string(500),limit:{type:'integer',minimum:1,maximum:100}})],
 ['channel.message-post','Publish an explicitly authored Channel discussion reply without launching new Agent turns','publish',
  obj({id,text:string(),replyTo:id,kind:{type:'string',enum:['message','summary','decision','blocker','question','result']},clientMessageId:string(160),files:array(id,8)},['id','text'])],
 ['channel.publish','Publish a real article only where this Agent is an explicit member-publisher','publish',
  obj({channelId:id,sourceId:id,externalId:string(1024),publishedAt:{type:'integer',minimum:0},title:{type:'string',maxLength:1000},body:{type:'string',maxLength:1048576},url:{type:'string',maxLength:4096},authorName:{type:'string',maxLength:160},clientMessageId:string(160),files:array(id,8)},['externalId'])],
];
const resource=obj({id},['id'],true);
const rows={type:'array',items:resource};
const outputSchemas={
 'company.roster':rows,'company.teams':rows,'company.createTeam':resource,'company.updateTeam':resource,
 'company.bindings':rows,'company.tasks':rows,'company.task':resource,'company.delegate':resource,
 'messages.list':rows,'messages.get':resource,'messages.create':resource,'messages.update':resource,
 'messages.history':obj({groupId:id,messages:rows},['groupId','messages'],true),
 'messages.search':obj({groupId:id,messages:rows},['groupId','messages'],true),
 'messages.entry':resource,'messages.publish':resource,
 'plan.list':rows,'plan.get':resource,'plan.query':obj({total:{type:'integer',minimum:0},rows},['total','rows'],true),
 'plan.history':rows,'plan.preview':array({type:'string'},100),
 'plan.create':resource,'plan.update':resource,'plan.archive':resource,
 'plan.schema':obj({version:{type:'integer'},layouts:array({type:'string'},20)},['version','layouts'],true),
 'plan.views':rows,'plan.view-create':resource,'plan.view-update':resource,
 'plan.view-delete':obj({id,deleted:bool},['id','deleted']),
 'channel.list':rows,'channel.get':resource,
 'channel.timeline':obj({id,kind:{type:'string'},entries:rows,hasMore:bool,unreadCount:integer(10000000)},['id','entries','hasMore'],true),
 'channel.history':obj({id,kind:{type:'string'},entries:rows,hasMore:bool},['id','entries','hasMore'],true),
 'channel.post':resource,
 'channel.posts':obj({posts:rows,total:integer(10000000)},['posts','total'],true),
 'channel.message-post':resource,
 'channel.publish':obj({id,channelId:id,status:{type:'string'},duplicate:bool},['id','channelId','status','duplicate'],true),
};
// Operator-only Messenger preferences, adapted from Aexus Messenger but
// always stored as projections over the existing CloudHosts source records.
const conv=string(200),messengerPatch=obj({pinned:bool,favorite:bool,archived:bool,unread:bool});
const messagePatch=obj({saved:bool,pinned:bool,hidden:bool,reaction:{type:'string',maxLength:20}});
const operatorDefinitions=[
 ['messenger.state','Read persistent conversation preferences, folders and drafts','read',obj(),
  obj({version:{type:'integer'},revision:{type:'integer'},conversations:any,messages:any,drafts:any,folders:array(any,2000)},['version','revision','conversations','messages','drafts','folders'],true)],
 ['messenger.directory','Discover real group and native conversation identities, scoped by folders','read',obj({
  type:{type:'string',enum:['all','agent','group','favorites','unread']},query:{type:'string',maxLength:500},folder:id,
  archived:{type:'string',enum:['exclude','include','only']},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:200}}),
  obj({entries:rows,total:{type:'integer',minimum:0},hasMore:bool},['entries','total','hasMore'],true)],
 ['messenger.conversation','Pin, favorite, archive or mark a real conversation unread','write',
  obj({conversations:array(conv),patch:messengerPatch},['conversations','patch']),any],
 ['messenger.message','Apply saved/pinned/hidden/reaction metadata to a real public message','write',
  obj({conversation:conv,id,ids:array(id),patch:messagePatch},['conversation','patch']),any],
 ['messenger.draft','Persist text, mentions, note mode and reply draft without sending','write',
  obj({conversation:conv,text:{type:'string',maxLength:100000},replyTo:{type:['string','null'],maxLength:180},asNote:bool,
    mentions:array(id),clientMessageId:string(160),expectedClientMessageId:string(160)},['conversation']),any],
 ['messenger.folder-save','Save a personal folder of real conversations or a dynamic category','write',
  obj({id,name:string(80),conversations:array(conv,2000),include:{type:'string',enum:['explicit','all','agent','group','favorites','unread']},
   excluded:array(conv,2000),expectedRevision:{type:'integer',minimum:0}},['name']),resource],
 ['messenger.folder-delete','Remove a personal folder without deleting any messages','write',
  obj({id,expectedRevision:{type:'integer',minimum:1}},['id']),obj({id,deleted:bool},['id','deleted'])],
 ['messenger.reorder','Persist conversation list positions for one UI scope','write',
  obj({scope:string(180),order:array(conv,2000),expectedOrder:array(conv,2000)},['scope','order']),any],
 ['messenger.search','Read real published messages across groups and native journals','read',
  obj({conversation:conv,query:{type:'string',maxLength:500},filter:{type:'string',enum:['all','saved','pinned']},
   author:{type:'string',enum:['all','you','agent']},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}}),
  obj({messages:rows,total:{type:'integer',minimum:0},hasMore:bool,truncated:bool},['messages','total','hasMore','truncated'],true)],
 ['messenger.forward','Forward verifiable messages to a non-triggering group note or an explicitly accepted native turn','execute',
  obj({messages:array(obj({conversation:conv,id},['conversation','id']),50),to:conv,comment:{type:'string',maxLength:16000},
   textOnly:bool,execute:bool,clientMessageId:string(160)},['messages','to','clientMessageId']),
  obj({to:conv,count:{type:'integer'},status:{type:'string'},clientMessageId:string(160)},['to','count','status','clientMessageId'],true)],
 ['messenger.forward-status','Reconcile a durable forward receipt without sending a second task','read',
  obj({clientMessageId:string(160)},['clientMessageId']),
  obj({clientMessageId:string(160),status:{type:'string'},retryable:bool},['clientMessageId','status','retryable'],true)],
 ['channel.create','Operator creates a real Agent or external news channel','write',
  obj({name:string(100),description:{type:'string',maxLength:1000},mode:{type:'string',enum:['agents','external']},memberIds:array(id),publisherIds:array(id),adminIds:array(id),ownerId:{type:['string','null'],maxLength:180},retentionDays:{type:'integer',minimum:1,maximum:365}},['name']),resource],
 ['channel.update','Update channel identity, roles, publisher scope and revision','write',
  obj({id,name:string(100),description:{type:'string',maxLength:1000},memberIds:array(id),publisherIds:array(id),adminIds:array(id),
   ownerId:{type:['string','null'],maxLength:180},expectedRevision:{type:'integer',minimum:1},archived:bool},['id']),resource],
 ['channel.sources','List source subscriptions and enabled states, without secrets','read',
  obj({channelId:id,plugin:{type:'string',enum:['process','telegram','x','youtube']},includeDisabled:bool}),rows],
 ['channel.source-add','Bind an external Telegram, X, YouTube or process source','write',
  obj({channelId:id,plugin:{type:'string',enum:['process','telegram','x','youtube']},locator:string(4096),name:string(160),enabled:bool},['channelId','plugin','locator']),resource],
 ['channel.source-update','Edit source display/config with optimistic revision','write',
  obj({id,patch:obj({name:string(160),enabled:bool}),expectedRevision:{type:'integer',minimum:1}},['id','patch']),resource],
 ['channel.source-remove','Disable a source while retaining publications and collector scope records','write',
  obj({id,expectedRevision:{type:'integer',minimum:1}},['id']),resource],
 ['channel.message-send','Post operator-authored non-triggering discussion; no native Agent turn','publish',
  obj({id,text:string(),replyTo:id,kind:{type:'string',enum:['message','summary','decision','blocker','question','result']},
   clientMessageId:string(160),files:array(id,8)},['id','text']),resource],
 ['channel.read-state','Read exact user article/discussion read markers without acknowledging','read',
  obj({id,entryIds:array(id)},['id']),obj({channelId:id,entries:array(obj({entryId:id,read:bool},['entryId','read'])),unreadCount:integer(10000000)},['channelId','entries','unreadCount'],true)],
 ['channel.acknowledge','Mark specific channel entries or all visible entries read for the user','write',
  obj({id,entryIds:array(id),all:{const:true},sourceId:id},['id']),
  obj({channelId:id,acknowledged:integer(10000000),unreadCount:integer(10000000)},['channelId','acknowledged','unreadCount'])],
 ['channel.save','Keep or release an article past its normal retention','write',
  obj({id,saved:bool},['id','saved']),resource],
 ['channel.delete','Delete news content and preserve a non-replayable tombstone','write',
  obj({id},['id']),obj({id,deleted:bool},['id','deleted'])],
 ['channel.collectors','Read collector metadata without bearer tokens or secret hashes','read',obj(),rows],
 ['channel.collector-add','Issue a one-time source-scoped collector bearer token','write',
  obj({name:string(100),sourceIds:array(id)},['name','sourceIds']),
  obj({collector:resource,token:string(120)},['collector','token'])],
 ['channel.collector-revoke','Revoke one external collector token','write',
  obj({id},['id']),obj({id,revoked:bool},['id','revoked'])],
];
const restricted=[
 ['api.info','Inspect the live Core API and document/build versions','read'],
 ['api.list','Search the single CloudHosts canonical command catalog','read'],
 ['api.describe','Inspect one Core command input/output contract','read'],
 ['api.document','Read one logical API or scenario document','read'],
 ['plugins.list','List explicitly connected external plugin services','read'],
 ['plugins.attach','Bind a verified existing plugin service and its workspace','write'],
 ['plugins.detach','Disconnect an explicitly bound plugin service','write'],
 ['plugins.grant','Grant or revoke one persistent Agent plugin access','write'],
 ['plugins.describe','Describe one declared plugin command','read'],
 ['plugins.call','Call an explicitly bound external plugin service as the operator','execute'],
 ['company.assignRole','Change Agent role policy','write'],
 ['company.bind','Change management relationship','write'],['company.retry','Retry delegated task','execute'],
 ['messages.archive','Archive a group','write'],['messages.post','Operator group message with recipient execution','execute'],
 ['messages.retry','Retry a recipient','execute'],['messages.read','Change operator read marker','write'],
 ['messages.sessions','List native private sessions','read'],['messages.nativeHistory','Read private native history','read'],
 ['messages.nativeSend','Send a new native turn','execute'],['messages.nativeInterrupt','Interrupt a native turn','execute'],['messages.approvals','Read native approvals','read'],
 ['plan.run','Start a native run','execute'],['plan.cancel','Cancel a native run','execute'],['plan.calendar','Read Plan calendar','read'],
 ['plan.timeline','Read Plan timeline','read'],['plan.analytics','Read aggregate Plan analytics','read'],['plan.feed','Read aggregate Plan feed','read'],
 ['station.list','List transfer station','read'],['station.import','Import control host file','write'],
 ['station.create','Create transfer resource','write'],['station.update','Update transfer resource','write'],
 ['station.read','Read transfer resource','read'],['station.write','Write transfer resource','write'],
 ['station.fetch','Fetch remote file','execute'],['station.send','Transfer file','execute'],
 ['station.copy','Copy across hosts','execute'],['station.export','Export to control host','write'],
 ['station.remove','Remove transfer resource','write'],['station.cancel','Cancel transfer','write'],
 ['workspaces.list','Read saved workspace metadata','read'],['workspaces.get','Read workspace metadata','read'],
 ['workspaces.register','Register a workspace','write'],['workspaces.unregister','Unregister a workspace','write'],
 ['workspaces.projects','List projects','read'],['workspaces.project','Read project','read'],
 ['workspaces.projectCreate','Create project','write'],['workspaces.projectUpdate','Update project','write'],
 ['workspaces.projectArchive','Archive project','write'],
];
const catalog=[
 ...legacy.commands.map(entry=>{
  const properties=Object.fromEntries(Object.entries(entry.options||{}).map(([name,v])=>[name,{type:v.type==='number'?'number':v.type==='boolean'?'boolean':v.type==='object'?'object':'string'}]));
  const required=Object.entries(entry.options||{}).filter(([,v])=>v.required).map(([name])=>name);
  return {name:entry.method,summary:entry.description,inputSchema:obj(properties,required,true),outputSchema:any,effect:/^(hosts\.(?:list|agent-list|agent-hosts|agent-capabilities|agent-read|agent-order|agent-tui|check|get|inspect|directories|terminal-list|terminal-read|desktop-list|rdp-list|rdp-credentials|fingerprints))$/.test(entry.method)?'read':'execute',agentCallable:false,contractStatus:'legacy'};
 }),
 {name:'hosts.files',summary:'Read or change remote workspace files',inputSchema:any,outputSchema:any,effect:'execute',agentCallable:false,contractStatus:'legacy'},
 ...definitions.map(([name,summary,effect,inputSchema])=>({name,summary,effect,inputSchema,outputSchema:outputSchemas[name],agentCallable:true,contractStatus:'strict'})),
 ...operatorDefinitions.map(([name,summary,effect,inputSchema,outputSchema])=>({name,summary,effect,inputSchema,outputSchema,agentCallable:false,contractStatus:'strict'})),
 ...restricted.map(([name,summary,effect])=>({name,summary,effect,inputSchema:any,outputSchema:any,agentCallable:false,contractStatus:'partial'})),
];
const unique=new Map();
for(const item of catalog){if(unique.has(item.name))throw Error('Duplicate command: '+item.name);unique.set(item.name,Object.freeze(item))}
const aliases=Object.freeze({'team.list':'company.teams','team.create':'company.createTeam','team.update':'company.updateTeam','chat.list':'messages.list','chat.history':'messages.history','chat.get':'messages.get','schedule.create':'plan.create','schedule.update':'plan.update','schedule.archive':'plan.archive','host.list':'hosts.list'});
const apiVersion='1.1.0',schemaHash=createHash('sha256').update(JSON.stringify([...unique.values(),aliases])).digest('hex');
const release=()=>{try{return require('./release.cjs').verify()}catch{return {version:pkg.version,verified:false}}};
function resolve(name){return aliases[name]||name}
function lookup(name){return unique.get(resolve(name))}
function describe(name){const command=lookup(name);if(!command)throw Error('Unknown API command: '+name);
 return {...command,apiVersion,schemaHash,...(name!==command.name?{requestedAlias:name}:{})}}
function list({prefix='',search='',agentOnly=false}={}){if(typeof prefix!=='string'||typeof search!=='string'||prefix.length>100||search.length>240)throw Error('Invalid API catalog filter');
 const q=search.toLowerCase();return [...unique.values()].filter(x=>(!agentOnly||x.agentCallable)&&x.name.startsWith(prefix)&&(!q||(x.name+' '+x.summary).toLowerCase().includes(q)))
  .map(({name,summary,effect,agentCallable,contractStatus})=>({name,summary,effect,agentCallable,contractStatus}));}
function metadata(){const v=release();return {apiVersion,schemaHash,productVersion:v.version,buildId:v.buildId||null,buildVerified:v.verified===true,commandCount:unique.size,agentCommandCount:[...unique.values()].filter(x=>x.agentCallable).length};}
const scenarios={
 'team-discussion':'Discover company.createTeam and messages.create. Company Team management requires explicit role+scope, while group invitations may include existing peers in your shared Teams. Publishing a note does not launch another native task.',
 'weekly-verification':'Discover plan.query and plan.create/plan.update; use a stable clientRequestId; re-read each Plan revision and current grant before mutations.',
 'delegated-work':'Discover company.delegate and company.task; provide a stable clientTaskId; a new delegation has its own native run and durable result.',
 'session-history':'Existing Codex native thread and companion collaboration history may be distinct; use session identifiers and never pretend histories were merged.',
 'plan-saved-view':'Use plan.schema to inspect all ten layouts, plan.views to discover saved views, and plan.view-create/update/delete with an expected revision; saved views only change projections, never native Plan jobs or runs.',
 'plan-query':'Use plan.query with args {"filter":{"employee":"self","states":["scheduled"],"tags":["verification"]},"sort":"nextAt","direction":"asc","limit":20,"offset":0}. Query results include real run status, scoped totals, safe Team/Agent labels and tag facets. Role and group grants are applied before aggregations; read results never create tasks.',
};
function document(document='index'){if(document==='index')return {document,markdown:'# CloudHosts API\nUse cloud_docs identity → search → describe → cloud_api. Core and plugins must publish actual contracts. Guardian is excluded.\n'+Object.keys(scenarios).map(s=>'- scenario/'+s).join('\n')};
 if(document.startsWith('command/'))return {document,...describe(document.slice(8))};
 const scenario=document.startsWith('scenario/')?scenarios[document.slice(9)]:undefined;if(scenario)return {document,markdown:scenario};
 throw Error('Unknown API document: '+document);}
function validate(schema,value,label='arguments'){
 if(Array.isArray(schema.type)){
  for(const type of schema.type){try{validate({...schema,type},value,label);return}catch{}}
  throw Error(label+' must match one of: '+schema.type.join(', '));
 }
 if(schema.type==='null'&&value!==null)throw Error(label+' must be null');
 if(schema.const!==undefined&&value!==schema.const)throw Error(label+' must equal '+JSON.stringify(schema.const));
 if(schema.enum&&!schema.enum.includes(value))throw Error(label+' must be one of '+schema.enum.join(', '));
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be an object');
  for(const key of schema.required||[])if(value[key]===undefined)throw Error('Missing '+label+'.'+key);
  for(const [key,val] of Object.entries(value)){
   const part=schema.properties?.[key];
   if(!part){if(schema.additionalProperties===false)throw Error('Unknown '+label+'.'+key);continue}
   validate(part,val,label+'.'+key);
  }
 }else if(schema.type==='string'){
  if(typeof value!=='string'||schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength)throw Error(label+' must be a string within length bounds');
 }else if(schema.type==='array'){
  if(!Array.isArray(value)||schema.maxItems!==undefined&&value.length>schema.maxItems)throw Error(label+' must be an array within size bounds');
  for(const [i,item] of value.entries())validate(schema.items,item,label+'['+i+']');
 }else if(schema.type==='integer'||schema.type==='number'){
  if(typeof value!=='number'||!Number.isFinite(value)||schema.type==='integer'&&!Number.isInteger(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)throw Error(label+' must be a valid number');
 }else if(schema.type==='boolean'&&typeof value!=='boolean')throw Error(label+' must be boolean');
}
module.exports={catalog:[...unique.values()],aliases,metadata,resolve,lookup,describe,list,document,validate};
