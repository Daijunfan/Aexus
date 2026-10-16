import {osIcon} from './os.js'
export const names={codex:'Codex',claude:'Claude Code',cline:'Cline',pi:'Pi',opencode:'OpenCode'}
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const cloudIcon='<svg class="agent-cloud" viewBox="0 0 32 24" fill="none" aria-hidden="true"><path d="M9 20h15a6 6 0 0 0 .8-12A9 9 0 0 0 7.5 7 6.5 6.5 0 0 0 9 20Z" fill="currentColor" fill-opacity=".09" stroke="currentColor" stroke-width="1.5"/></svg>'
export function normalize(item,hosts){
 const engineHostId=item.engineHostId||item.hostId,targetHostId=item.targetHostId||item.hostId
 // Host IDs represent launch and work locations, never a shared inferred location.
 // Prefer the live registry: stored role metadata can be older than a host rename/OS edit.
 const lookup=id=>hosts.find(host=>host.id===id)
 return {...item,engineHostId,targetHostId,hostId:targetHostId,name:item.name||names[item.engine]+' · '+item.id.slice(0,6),
  transport:item.transport||'pty',engineHost:lookup(engineHostId)||item.engineHost||{id:engineHostId,name:engineHostId},
  targetHost:lookup(targetHostId)||item.targetHost||{id:targetHostId,name:targetHostId}}
}
export function origin(item){
 const host=item.engineHost,local=item.engineHostId==='local'
 return `<span class="agent-origin ${local?'is-local':'is-cloud'}" title="${esc('引擎启动位置：'+host.name)}">${local?osIcon(host):cloudIcon}<span><small>${local?'本地主机':'来自云主机'}</small><strong>${esc(local?(host.os==='macos'?'Mac':host.os==='windows'?'Windows':'Linux'):host.name)}</strong></span></span>`
}
export const statusName=item=>item.status==='starting'?'启动中':item.status==='approval'?'待确认':item.status==='uncertain'||item.status==='review'?'待核对':item.status==='login-required'?'需登录':item.status==='offline'?'离线':item.busy?'执行中':item.error?'异常':item.running?(item.historyState==='pending'?'等待首次会话':item.engineState==='running'&&item.tuiState==='disconnected'?'终端断开':item.transport==='native'?'就绪':'会话运行中'):'已停止'
export const engineMark=engine=>({codex:'Cx',claude:'Cl',cline:'Cn',pi:'Pi',opencode:'OC'}[engine]||'AI')
