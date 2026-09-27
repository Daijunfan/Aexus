import type {Engine,ModelInfo,SlashCommand} from './types'

/** UI commands backed by the same Core operations as their CLI entrypoints. */
export const engineCommands:SlashCommand[]=[
  {name:'fork',description:'将当前会话克隆为独立员工',argumentHint:'<新员工名称>'},
  {name:'plan',description:'进入官方计划模式，可附带规划任务',argumentHint:'[prompt]'},
  {name:'normal',description:'退出计划模式，恢复执行',argumentHint:''},
  {name:'help',description:'查看当前员工可用的命令',argumentHint:''},
  {name:'model',description:'选择模型和思考强度',argumentHint:'[model] [effort]'},
  {name:'effort',description:'设置当前模型的思考强度',argumentHint:'[level|default]'},
  {name:'fast',description:'切换官方 Fast 档位（更高用量）',argumentHint:'[on|off|status]'},
  {name:'permissions',description:'查看或设置执行权限',argumentHint:'[mode]',aliases:['approvals']},
  {name:'status',description:'查看当前模型、思考强度、速度和工作目录',argumentHint:''},
]
export function activeModel(models:ModelInfo[],model?:string){return models.find(m=>m.value===model||m.resolvedModel===model)??(model===undefined||model==='default'?models.find(m=>m.isDefault||m.value==='default'):undefined)}
export function modelEfforts(engine:Engine,model?:ModelInfo):string[]{return model?.supportedEffortLevels??(engine==='claude'&&model&&!model.supportsEffort?[]:engine==='codex'?['low','medium','high','xhigh']:['low','medium','high'])}
export function fastTier(model?:ModelInfo){return model?.serviceTiers?.find(t=>t.name.toLowerCase()==='fast'||t.id==='fast'||t.id==='priority')}
export function supportsFast(engine:Engine,model?:ModelInfo){return engine==='codex'?!!fastTier(model):model?.supportsFastMode===true}
export function mergeCommands(commands:SlashCommand[],engine:Engine,model?:ModelInfo){
  const merged=new Map(commands.map(c=>[c.name,c]))
  for(const c of engineCommands)if(c.name!=='fast'||supportsFast(engine,model))merged.set(c.name,c)
  if(!supportsFast(engine,model))merged.delete('fast')
  if(engine==='codex')for(const c of [{name:'ps',description:'查看此员工的原生后台终端',argumentHint:''},{name:'stop',description:'停止此员工的原生后台终端',argumentHint:''},{name:'skills',description:'列出当前工作目录可用的 Skills',argumentHint:''},{name:'mcp',description:'查看 MCP 服务状态',argumentHint:''},{name:'account',description:'查看引擎账号信息',argumentHint:''},{name:'usage',description:'查看官方额度和会话用量',argumentHint:''},{name:'new',description:'新建上下文，保留当前员工与工作目录',argumentHint:'',aliases:['clear']},{name:'compact',description:'使用 Codex 官方协议压缩当前上下文',argumentHint:''},{name:'review',description:'使用 Codex 官方审查流程检查改动',argumentHint:'[review instructions]'}])merged.set(c.name,c)
  return [...merged.values()]
}
