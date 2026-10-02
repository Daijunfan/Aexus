import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {applicationRoot} from './resources'
import {listPlugins,pluginFile} from './plugins/registry'

const coreDocuments=[
 ['core/api','API.md'],['core/permissions','PERMISSIONS.md'],['core/plan','PLAN.md'],
 ['core/scheduler','SCHEDULER.md'],['core/architecture','ARCHITECTURE.md']
] as const

/** Public reference material only. Reading a document never grants execution authority. */
function materialize(){
 const root=path.join(APP_HOME,'api-docs'),source=applicationRoot(),plugins=listPlugins()
 const documents=new Map<string,{file:string;text:string}>()
 for(const [id,file] of coreDocuments)documents.set(id,{file:path.join('core',file),text:fs.readFileSync(path.join(source,file),'utf8')})
 for(const plugin of plugins){
  const prefix='plugin/'+plugin.id+'/',directory=path.join('plugins',plugin.id),schema=fs.readFileSync(pluginFile(plugin.directory,plugin.schema),'utf8')
  documents.set(prefix+'api',{file:path.join(directory,'API.md'),text:fs.readFileSync(pluginFile(plugin.directory,plugin.documentation),'utf8')})
  documents.set(prefix+'schema',{file:path.join(directory,'schema.json'),text:schema})
  const commands=JSON.parse(schema).commands as {method:string;description:string}[]
  documents.set(prefix+'index',{file:path.join(directory,'README.md'),text:[
   '# '+plugin.name+' API 方法索引 ('+plugin.version+')','',
   '先选择方法，再用 `agents api docs '+prefix+'command/METHOD` 读取该方法的完整真实 schema（参数、说明与示例）；不必加载整册 API。读取文档不授予操作权限。','',
   ...commands.map(command=>'- `'+command.method+'` — '+command.description.replace(/\s+/g,' ').slice(0,160)), '',
   '完整参考：[API](API.md) / [schema](schema.json)。',''
  ].join('\n')})
 }
 documents.set('index',{file:'README.md',text:[
  '# Agents Company API 文档索引','',
  '按当前任务读取所需文档；初始化只读身份与本索引，不加载整册 API 或所有 schema。所有职位可阅读完整公开文档，实际操作仍由 Core 校验身份、角色、成员与工作区权限。','',
  '## 三个 Core 视图','',
  '| 视图 | 负责内容 | API 入口 |',
  '| --- | --- | --- |',
  '| Company | Team、员工、关系与画布 | `group.*`、`card.*`、`management.*`、`office.*`、`team-view.*` |',
  '| Messages | 私聊、群聊、新闻频道与讨论 | `session.*`、`chat.*`、`channel.*`、`messenger.*` |',
  '| Plan | 员工任务的计划、排期与运行记录 | `plan.*`、`schedule.*` |','',
  '**Plan 是 Core 视图，不是 MiniNotion 插件。** Core Plan 操作同一套调度记录；MiniNotion 是独立的笔记/数据库软件，插件命令不能替代 `agents plan` 或 `agents schedule`。','',
  '`describe` 仅查询 Core 命令，例如 `agents api describe schedule.create --all --json`；不接收插件方法名或文档 ID。`--all` 只扩展公开文档发现，不授予执行权限；实际身份用 `agents auth whoami --json` 查询。','',
  '## Core 参考','',
  ...coreDocuments.map(([id,file])=>'- `'+id+'` — ['+file+'](core/'+file+')'),'',
  '按需执行 `agents api docs core/plan` 或 `agents api docs core/api`。默认 `agents api docs` 只返回本索引。','',
  '## 已安装插件','',
  ...plugins.map(plugin=>'- **'+plugin.name+'** (`'+plugin.id+'`, '+plugin.version+') — [方法索引](plugins/'+plugin.id+'/README.md); `agents api docs plugin/'+plugin.id+'/index`。'),
  ...(plugins.length?[]:['当前没有已安装插件。']), '',
  '先读插件 index，再用文档工具 `{"operation":"document","document":"plugin/mininotion/command/page.create"}`（或 `agents api docs plugin/mininotion/command/page.create`）读取单方法；先看准确参数再执行，不能猜。完整参考仍为 `plugin/PLUGIN_ID/api` 或 `plugin/PLUGIN_ID/schema`。','',
  "执行模板：`agents plugin call mininotion page.create --employee EMPLOYEE_ID --params '{\"title\":\"...\"}' --json`。EMPLOYEE_ID 取 identity 返回的员工 ID，此模板操作其已绑定的 Work 插件工作区；执行入口是 `plugin call`，不是 `api call`。",
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
 return {root,documents}
}

export function ensureApiDocuments():string{return materialize().root}

export function readApiDocument(document='index'){
 const {root,documents}=materialize()
 let entry=documents.get(document)
 const single=document.match(/^plugin\/([^/]+)\/command\/(.+)$/)
 if(!entry&&single){
  const schema=documents.get('plugin/'+single[1]+'/schema')
  if(schema){
   const command=JSON.parse(schema.text).commands.find((command:{method:string})=>command.method===single[2])
   if(!command)throw Error('Unknown plugin command: '+single[1]+'/'+single[2])
   entry={file:schema.file,text:JSON.stringify(command,null,2)+'\n'}
  }
 }
 if(!entry)throw Error('Unknown API document: '+document)
 return {markdown:entry.text,document,path:path.join(root,entry.file),catalogRoot:root}
}
