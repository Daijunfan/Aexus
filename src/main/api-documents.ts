import {fileVersion,readSourceText} from './read-cache'
import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {applicationRoot} from './resources'
import {listPlugins,pluginFile} from './plugins/registry'

const coreDocuments=[
 ['core/api','API.md'],['core/permissions','PERMISSIONS.md'],['core/plan','PLAN.md'],
 ['core/scheduler','SCHEDULER.md'],['core/architecture','ARCHITECTURE.md'],
 ['core/conversation-workspaces','docs/CONVERSATION_WORKSPACES.md'],
 ['core/conversation-controls','docs/CONVERSATION_CONTROLS.md'],
 ['core/secretary-api','docs/SECRETARY_API_PARITY.md']
] as const

type DocumentEntry={file:string;text:string}
type Catalog={root:string;documents:Map<string,DocumentEntry>;methods:Map<string,unknown>}
let cached:(Catalog&{sourceVersion:string;projectionVersion:string})|undefined
const projectionVersion=(catalog:Catalog)=>JSON.stringify([...catalog.documents.values()].map(entry=>fileVersion(path.join(catalog.root,entry.file))))

/** Public reference material only. Reading a document never grants execution authority. */
function materialize(){
 const root=path.join(APP_HOME,'api-docs'),source=applicationRoot(),plugins=listPlugins()
 const inputs=[...coreDocuments.map(([,file])=>path.join(source,file)),...plugins.flatMap(plugin=>[pluginFile(plugin.directory,plugin.documentation),pluginFile(plugin.directory,plugin.schema)])]
 const sourceVersion=JSON.stringify([source,plugins,inputs.map(fileVersion)])
 if(cached?.root===root&&cached.sourceVersion===sourceVersion&&cached.projectionVersion===projectionVersion(cached))return cached
 const documents=new Map<string,DocumentEntry>(),methods=new Map<string,unknown>()
 for(const [id,file] of coreDocuments)documents.set(id,{file:path.join('core',file),text:readSourceText(path.join(source,file))})
 for(const plugin of plugins){
  const prefix='plugin/'+plugin.id+'/',directory=path.join('plugins',plugin.id),schema=readSourceText(pluginFile(plugin.directory,plugin.schema))
  documents.set(prefix+'api',{file:path.join(directory,'API.md'),text:readSourceText(pluginFile(plugin.directory,plugin.documentation))})
  documents.set(prefix+'schema',{file:path.join(directory,'schema.json'),text:schema})
  const commands=JSON.parse(schema).commands as {method:string;description:string}[]
  for(const command of commands)methods.set(prefix+'command/'+command.method,command)
  documents.set(prefix+'index',{file:path.join(directory,'README.md'),text:[
   '# '+plugin.name+' API 方法索引 ('+plugin.version+')','',
   '先选择方法，再用 `agents api docs '+prefix+'command/METHOD` 读取该方法的完整真实 schema（参数、说明与示例）；不必加载整册 API。读取文档不授予操作权限。','',
   ...commands.map(command=>'- `'+command.method+'` — '+command.description.replace(/\s+/g,' ').slice(0,160)), '',
   '完整参考：[API](API.md) / [schema](schema.json)。',''
  ].join('\n')})
 }
 documents.set('index',{file:'README.md',text:[
  '# Anexus API 文档索引','',
  '按当前任务读取所需文档；初始化只读身份与本索引，不加载整册 API 或所有 schema。所有职位可阅读完整公开文档，实际操作仍由 Core 校验身份、角色、成员与工作区权限。','',
  '## 三个 Core 视图','',
  '| 视图 | 负责内容 | API 入口 |',
  '| --- | --- | --- |',
  '| Company | Team、员工、关系与画布 | `group.*`、`card.*`、`management.*`、`office.*`、`team-view.*` |',
  '| Messages | 私聊、群聊、新闻频道与讨论 | `session.*`、`chat.*`、`channel.*`、`messenger.*`、`conversation.*` |',
  '| Plan | 员工任务的计划、排期与运行记录 | `plan.*`、`schedule.*` |','',
  '**Plan 是 Core 视图，不是 MiniNotion 插件。** Core Plan 操作同一套调度记录；MiniNotion 是独立的笔记/数据库软件，插件命令不能替代 `agents plan` 或 `agents schedule`。','',
  '`describe` 仅查询 Core 命令，例如 `agents api describe schedule.create --all --json`；不接收插件方法名或文档 ID。`--all` 只扩展公开文档发现，不授予执行权限；实际身份用 `agents auth whoami --json` 查询。','',
  '群组 Owner / Admin / Member 与 Company 职位独立。先读 `conversation.policy` 获取实际职位和可执行动作。固定正文通知、静音与禁言只由会话 Owner/Admin 配置；通知使用 `conversation.notice-*`，不调用模型、不进入 Plan。员工自动工作继续使用 `schedule.*`。完整界限见 `agents api docs core/conversation-controls`。','',
  '## 查询与操作','',
  '正式任务可直接使用 `agents_company_api`，参数 `command` 为已有 Core 命令，`args` 为该命令的参数对象。它以当前员工身份调用同一 API，无需 shell；写操作遵循当前 Ask/Full access，原生 planning 模式只读。初始化和静默阅读不可操作。','',
  'Plan 先调用 `{"command":"plan.query","args":{}}`：读取真实任务 ID/revision、完整规则、时间、人员职位/Team、target.exists、allowedActions。Secretary 也能看到员工已删除的任务；未知旧身份为 null。分页用 offset/limit。删除使用 schedule.delete 的 id 或 ids，带上 expectedRevision 或逐 ID 的 expectedRevisions；随后再查 plan.query 确认。','',
  '其他工作先用 `{"command":"api.list","args":{"prefix":"schedule."}}` 缩小目录，再用文档工具 describe 查准确参数。`agents api call COMMAND --args JSON --json` 可从 CLI 发送完全相同的请求；这只是参数入口，不增加权限。','',
  '## Core 参考','',
  ...coreDocuments.map(([id,file])=>'- `'+id+'` — ['+file+'](core/'+file+')'),'',
  '按需执行 `agents api docs core/plan` 或 `agents api docs core/api`。默认 `agents api docs` 只返回本索引。','',
  '## 已安装插件','',
  ...plugins.map(plugin=>'- **'+plugin.name+'** (`'+plugin.id+'`, '+plugin.version+') — [方法索引](plugins/'+plugin.id+'/README.md); `agents api docs plugin/'+plugin.id+'/index`。'),
  ...(plugins.length?[]:['当前没有已安装插件。']), '',
  '先读插件 index，再用文档工具 `{"operation":"document","document":"plugin/mininotion/command/page.create"}`（或 `agents api docs plugin/mininotion/command/page.create`）读取单方法；先看准确参数再执行，不能猜。完整参考仍为 `plugin/PLUGIN_ID/api` 或 `plugin/PLUGIN_ID/schema`。','',
  "执行模板：`agents plugin call mininotion page.create --employee EMPLOYEE_ID --params '{\"title\":\"...\"}' --json`。EMPLOYEE_ID 取 identity 返回的员工 ID，此模板操作其已绑定的 Work 插件工作区；也可使用统一工具的 `command=plugin.call`、`args={id,method,employee,params}`；两者进入同一工作区授权。",
  'Governor 操作插件默认共享范围时省略 `--employee`、`--team`、`--workspace`；MiniNotion 默认是共享 collection 根目录。显式传 `--employee` 仍选择该员工工作区。','',
  '插件列表来自当前安装包。执行插件仍须使用已授权工作区。远端或隔离环境可通过原生只读文档工具或同一 CLI 按需取正文，不需要复制手册到员工文件夹。',''
 ].join('\n')})
 for(const {file,text} of documents.values()){
  const target=path.join(root,file)
  fs.mkdirSync(path.dirname(target),{recursive:true})
  if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Cannot replace an API document symlink')
  if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===text)continue
  const temporary=target+'.tmp';fs.writeFileSync(temporary,text);fs.renameSync(temporary,target)
 }
 const catalog={root,documents,methods}
 cached={...catalog,sourceVersion,projectionVersion:projectionVersion(catalog)}
 return cached
}

export function ensureApiDocuments():string{return materialize().root}

export function readApiDocument(document='index'){
 const {root,documents,methods}=materialize()
 let entry=documents.get(document)
 const single=document.match(/^plugin\/([^/]+)\/command\/(.+)$/)
 if(!entry&&single){
  const schema=documents.get('plugin/'+single[1]+'/schema')
  if(schema){
   const command=methods.get(document)
   if(!command)throw Error('Unknown plugin command: '+single[1]+'/'+single[2])
   entry={file:schema.file,text:JSON.stringify(command,null,2)+'\n'}
  }
 }
 if(!entry)throw Error('Unknown API document: '+document)
 return {markdown:entry.text,document,path:path.join(root,entry.file),catalogRoot:root}
}
