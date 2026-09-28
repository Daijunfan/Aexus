/** Public engine IDs are stable; provider/model selection is independent. */
export const ENGINE_DEFINITIONS={
  codex:{label:'Codex',description:'Codex App Server',protocol:'app-server',capabilities:{streaming:true,images:true,approvals:true,resume:true,steer:true,plan:true,thinking:false,effort:true,background:true,clone:true}},
  cline:{label:'Cline',description:'Cline ACP · DeepSeek',protocol:'acp',capabilities:{streaming:true,images:false,approvals:true,resume:true,steer:false,plan:true,thinking:false,effort:false,background:false,clone:false}},
  pi:{label:'Pi',description:'Pi RPC · DeepSeek',protocol:'rpc',capabilities:{streaming:true,images:false,approvals:true,resume:true,steer:true,plan:false,thinking:false,effort:false,background:false,clone:false}},
  claude:{label:'Claude Agent',description:'Claude Agent SDK',protocol:'agent-sdk',capabilities:{streaming:true,images:true,approvals:true,resume:true,steer:true,plan:true,thinking:true,effort:true,background:true,clone:true}}
} as const
export type EngineId=keyof typeof ENGINE_DEFINITIONS
export function isEngine(value:unknown):value is EngineId{return typeof value==='string'&&Object.hasOwn(ENGINE_DEFINITIONS,value)}
export function engineDefinition(value:string){if(!isEngine(value))throw Error('Unsupported Coding Agent engine: '+value);return ENGINE_DEFINITIONS[value]}
export type EngineHealth={engine:EngineId;label:string;target:string;installed:boolean;path?:string;version?:string;protocol:'unchecked'|'compatible'|'incompatible';authentication:'configured'|'not-signed-in'|'unknown';ready:boolean;checkedAt:number;error?:string;managed:boolean;hasApiKey:boolean;capabilities:Record<string,boolean>}

/** New process adapters explicitly support Core-local Build workspaces. */
export function assertEngineWorkspace(engine:EngineId,mode:'build'|'cloud'|'work'){if((engine==='cline'||engine==='pi')&&mode!=='build')throw Error(`${ENGINE_DEFINITIONS[engine].label} 暂只支持 Core 本地工作目录，不支持云端或插件工作目录`)}
