import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve(import.meta.dirname,'..'),destination=path.join(root,'Agents-Managers'),check=process.argv.includes('--check')
const read=name=>fs.readFileSync(path.join(root,name),'utf8')
const protocol=read('src/shared/protocol.ts'),pattern=/\{\s*name:\s*'([^']+)'\s*,\s*args:\s*'([^']*)'\s*,\s*summary:\s*'([^']*)'\s*,\s*gui:\s*'([^']*)'/g
const commands=[...protocol.matchAll(pattern)].map(([,name,args,summary,gui])=>({name,args,summary,gui}))
if(commands.length<100||new Set(commands.map(item=>item.name)).size!==commands.length)throw Error('Could not read the full unique CLI registry')
const code=value=>'<code>'+value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;')+'</code>'
const index=[
  '## 全部 CLI 命令索引','',
  '下面 '+commands.length+' 项来自共享协议 `src/shared/protocol.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。','',
  '| 命令 | 参数 | 作用 | 对应界面 |','| --- | --- | --- | --- |',
  ...commands.map(({name,args,summary,gui})=>`| ${code('agents '+name.replaceAll('.',' '))} | ${code(args||'—')} | ${summary} | ${gui} |`),
  '',
  '另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。',''
].join('\n')
const begin='<!-- BEGIN GENERATED CLI COMMAND INDEX -->',end='<!-- END GENERATED CLI COMMAND INDEX -->'
const sourceApi=read('API.md'),prefix=sourceApi.includes(begin)?sourceApi.slice(0,sourceApi.indexOf(begin)).trimEnd():sourceApi.trimEnd()
const api=prefix+'\n\n'+begin+'\n'+index.trimEnd()+'\n'+end+'\n'
if(check){if(sourceApi!==api)throw Error('Root API command index is stale')}
else fs.writeFileSync(path.join(root,'API.md'),api)
const scheduler=read('SCHEDULER.md').replace(/^---\n[\s\S]*?\n---\n\n/,'').replace(/^# Host scheduler CLI API/m,'### Host scheduler CLI API')
const guide=[
  '# Agents Company Manager CLI 完整手册','',
  read('Agents-Managers/INTRO.md').trim(),'',
  '## 根项目 API 全文','',
  api.replaceAll('(PlugIns/','(../PlugIns/').trim(),'',
  '## 定时任务完整规范','',
  '以下为宿主调度器全文，包括一次性、间隔和按周任务、时区与工作时段、模型/思考覆盖、运行记录和取消。','',
  scheduler.trim(),'',index
].join('\n')
const files=new Map([['API.md',guide],...['SCHEDULER.md','PLUGIN_SPEC.md','ENGINE_CAPABILITIES.md'].map(name=>[name,read(name)])])
if(read('Agents-Managers/AGENTS.md')!==read('Agents-Managers/CLAUDE.md'))throw Error('Manager agent instructions must match across engines')
for(const [name,content] of files){const file=path.join(destination,name);if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw Error('Manager documentation is stale: '+name)}else fs.writeFileSync(file,content)}
console.log(`${check?'Verified':'Generated'} Manager documentation and ${commands.length} CLI entries`)
