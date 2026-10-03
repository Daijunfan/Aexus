import fs from 'node:fs'
import path from 'node:path'
import {compileCliInputs} from '../src/shared/cli-contract.ts'

const root=path.resolve(import.meta.dirname,'..'),destination=path.join(root,'docs/managers'),check=process.argv.includes('--check')
const read=name=>fs.readFileSync(path.join(root,name),'utf8')
const {COMMANDS:commands,CLI_COMMANDS}=await import('../src/shared/api-registry.ts')
if(commands.length<100||new Set(commands.map(item=>item.name)).size!==commands.length)throw Error('Could not read the full unique CLI registry')
const code=value=>'<code>'+value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;')+'</code>'
const index=[
  '## 全部 CLI 命令索引','',
  '下面 '+commands.length+' 项来自共享协议 `src/shared/api-registry.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。','',
  '| 命令 | 参数 | 作用 | 对应界面 | 授权策略 |','| --- | --- | --- | --- | --- |',
  ...commands.map(({name,args,summary,gui,permission})=>`| ${code('agents '+name.replaceAll('.',' '))} | ${code(args||'—')} | ${summary} | ${gui} | ${permission} |`),
  '',
  '另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。`agents api call COMMAND --args JSON|@file --json` 将参数原样转发至该规范 Core 命令，不增加嵌套 Core 接口。',''
].join('\n')
const begin='<!-- BEGIN GENERATED CLI COMMAND INDEX -->',end='<!-- END GENERATED CLI COMMAND INDEX -->'
const sourceApi=read('API.md'),prefix=sourceApi.includes(begin)?sourceApi.slice(0,sourceApi.indexOf(begin)).trimEnd():sourceApi.trimEnd()
const api=prefix+'\n\n'+begin+'\n'+index.trimEnd()+'\n'+end+'\n'
if(check){if(sourceApi!==api)throw Error('Root API command index is stale')}
else fs.writeFileSync(path.join(root,'API.md'),api)
const scheduler=read('SCHEDULER.md').replace(/^---\n[\s\S]*?\n---\n\n/,'').replace(/^# Host scheduler CLI API/m,'### Host scheduler CLI API')
const guide=[
  '# Agents Company Manager CLI 完整手册','',
  read('docs/managers/INTRO.md').trim(),'',
  '## 根项目 API 全文','',
  api.replace(/\[`(PlugIns\/[^`]+)`\]\(PlugIns\/[^)]+\)/g,'`$1`').trim(),'',
  '## 定时任务完整规范','',
  '以下为宿主调度器全文，包括一次性、间隔和按周任务、时区与工作时段、模型/思考覆盖、运行记录和取消。','',
  scheduler.trim(),''
].join('\n')
const files=new Map([['commands.json',JSON.stringify(commands,null,2)+'\n'],['API.md',guide],...['PLAN.md','SCHEDULER.md','PLUGIN_SPEC.md','ENGINE_CAPABILITIES.md','ARCHITECTURE.md','PERMISSIONS.md'].map(name=>[name,read(name)])])
if(read('docs/managers/AGENTS.md')!==read('docs/managers/CLAUDE.md'))throw Error('Manager agent instructions must match across engines')
for(const name of files.keys())if(fs.existsSync(path.join(root,'Agents-Managers',name)))throw Error('Manager Team root must not contain documentation: '+name)
for(const [name,content] of files){const file=path.join(destination,name);if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw Error('Manager documentation is stale: '+name)}else fs.writeFileSync(file,content)}
const cliFile=path.join(root,'bin/command-inputs.json'),cliContent=JSON.stringify(compileCliInputs(CLI_COMMANDS),null,2)+'\n'
if(check){if(!fs.existsSync(cliFile)||fs.readFileSync(cliFile,'utf8')!==cliContent)throw Error('CLI input contracts are stale')}else fs.writeFileSync(cliFile,cliContent)
console.log(`${check?'Verified':'Generated'} Manager documentation and ${commands.length} CLI entries`)
