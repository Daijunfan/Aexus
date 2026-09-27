import {EngineSettings} from './EngineSettings'
import licenseText from '../../../../LICENSE?raw'
import {useState} from 'react'
import {ModelSelect} from './ModelSelect'
import {DEFAULT_PREFERENCES,THEMES,THEME_LABELS,type Preferences} from '../../../shared/preferences'
export function SettingsPanel({value,onSave,onClose}:{value:Preferences;onSave:(value:Preferences)=>Promise<unknown>;onClose:()=>void}) {
  const [draft,setDraft]=useState(value),[saving,setSaving]=useState(false)
  return <div className="office-panel-wrap" onKeyDown={e=>{if(e.key==='Escape')onClose()}}>
    <div className="panel-backdrop" onClick={onClose}/>
    <section className="office-panel preferences-panel" role="dialog" aria-modal="true" aria-label="应用设置">
      <header className="panel-header"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>你的工作环境</h2></div><button className="panel-close" aria-label="关闭设置" onClick={onClose}>×</button></header>
      <form onSubmit={async e=>{e.preventDefault();setSaving(true);try{if(await onSave(draft))onClose()}finally{setSaving(false)}}}>
<div className="field-heading">新员工执行权限</div><label>默认权限<select value={draft.defaultPermissionMode} onChange={e=>setDraft({...draft,defaultPermissionMode:e.target.value as Preferences['defaultPermissionMode']})}><option value="default">Ask · 需要时审批</option><option value="acceptEdits">Workspace write · 允许工作区编辑</option><option value="bypassPermissions">Full access · 信任引擎所在系统账号</option></select><small>Full access 保留完整功能，但不构成操作系统隔离。已有员工权限不会因升级自动提高。</small></label>
        <div className="field-heading">新员工默认模型</div>
        <ModelSelect preference engine="codex" label="Codex 默认模型" value={draft.defaultCodexModel} onChange={value=>setDraft({...draft,defaultCodexModel:value})}/>
        <ModelSelect preference engine="claude" label="Claude Agent 默认模型" value={draft.defaultClaudeModel} onChange={value=>setDraft({...draft,defaultClaudeModel:value})}/>
        <small>仅用于之后创建的员工；创建时仍可单独选择。初始化也使用所选模型。</small>
        <div className="field-heading">背景与界面</div><div className="theme-presets">{THEMES.map(theme=><button type="button" key={theme} data-theme-option={theme} aria-pressed={draft.theme===theme} onClick={()=>setDraft({...draft,theme})}><i className={`theme-sample sample-${theme}`}/><span>{THEME_LABELS[theme]}</span>{draft.theme===theme&&<b>✓</b>}</button>)}</div>
        <label>页面大小 <output>{Math.round(draft.pageZoom*100)}%</output><input aria-label="页面大小" type="range" min="0.75" max="1.5" step="0.05" value={draft.pageZoom} onChange={e=>setDraft({...draft,pageZoom:+e.target.value})}/><small>⌘ + 放大，⌘ − 缩小，⌘ 0 恢复。包含文字、按钮和终端。</small></label>
        <label>双指 / 滚轮缩放灵敏度 <output>{draft.zoomSensitivity.toFixed(2)}×</output><input aria-label="缩放灵敏度" name="zoomSensitivity" type="range" min="0.25" max="8" step="0.25" value={draft.zoomSensitivity} onChange={e=>setDraft({...draft,zoomSensitivity:+e.target.value})}/><small>双指捏合，或按住 ⌘ / Ctrl 滚动。数值越大，缩放越快。</small></label>
        <label>双指 / 滚轮平移灵敏度 <output>{draft.panSensitivity.toFixed(2)}×</output><input aria-label="平移灵敏度" name="panSensitivity" type="range" min="0.25" max="4" step="0.25" value={draft.panSensitivity} onChange={e=>setDraft({...draft,panSensitivity:+e.target.value})}/><small>只影响滚动平移，拖动 Team 仍准确跟随指针。</small></label>
        <label className="snap-setting"><span><input type="checkbox" name="snapEmployees" checked={draft.snapEmployees} onChange={e=>setDraft({...draft,snapEmployees:e.target.checked})}/> 员工位置磁吸</span><small>靠近标准工位或其他员工的行列时轻轻对齐。按住 Option / Alt 可临时关闭。</small></label>
        <div className="form-footer"><button type="button" className="btn" onClick={()=>setDraft(DEFAULT_PREFERENCES)}>恢复默认</button><button className="btn primary save-settings" disabled={saving}>{saving?'保存中…':'应用设置'}</button></div>
      </form>
      <EngineSettings/>
      <section className="settings-section"><h3>开源许可</h3><p>Agents Company 完整发行版采用 GNU GPL v3，可按许可修改和再分发，不提供担保。角色素材及第三方组件保留各自声明；Coding Agent 运行程序由你单独安装并遵守其许可。</p><details><summary>阅读 GNU GPL v3</summary><pre style={{maxHeight:260,overflow:'auto',whiteSpace:'pre-wrap',fontSize:11}}>{licenseText}</pre></details></section>
    </section>
  </div>
}
