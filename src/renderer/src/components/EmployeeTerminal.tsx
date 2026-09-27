import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {PanelDivider} from './PanelDivider'
import {Icon} from './Icon'
import {api} from '../api'
import '@xterm/xterm/css/xterm.css'
type Tab={id:string;employee:string;cwd:string;host?:string;running:boolean;exitCode?:number}
export function EmployeeTerminal({employee,terminalHeight=220}:{employee:string;terminalHeight?:number}){
  const [heightDraft,setHeightDraft]=useState<number>()
  useEffect(()=>setHeightDraft(undefined),[terminalHeight])
  const [tabs,setTabs]=useState<Tab[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('')
  const container=useRef<HTMLDivElement>(null),opening=useRef<Promise<Tab>|null>(null)
  const refresh=()=>api.call<Tab[]>('terminal.list',{employee}).then(setTabs)
  const create=async()=>{try{setError('');const tab=await api.call<Tab>('terminal.open',{employee});await refresh();setSelected(tab.id)}catch(e){setError((e as Error).message)}}
  useEffect(()=>{let active=true;void (async()=>{try{let list=await api.call<Tab[]>('terminal.list',{employee});if(!list.length){opening.current??=api.call<Tab>('terminal.open',{employee});list=[await opening.current]}if(active){setTabs(list);setSelected(list[0].id)}}catch(e){if(active)setError((e as Error).message)}})();return()=>{active=false}},[employee])
  useEffect(()=>{
    if(!selected||!container.current)return
    let disposed=false,cursor=0,pending=false,again=false
    const term=new Terminal({cursorBlink:true,cursorStyle:'bar',cursorWidth:3,cursorInactiveStyle:'bar',fontFamily:'Menlo, Monaco, monospace',fontSize:14,scrollback:3000,theme:{background:'#10141d',foreground:'#e1e7f0',cursor:'#a9c1ff'}}),fit=new FitAddon()
    term.loadAddon(fit);term.open(container.current)
    const read=async()=>{if(pending){again=true;return}pending=true;try{const value=await api.call<Tab&{output:string;cursor:number;reset:boolean}>('terminal.read',{id:selected,cursor});if(!disposed){if(value.reset)term.clear();if(value.output)term.write(value.output);cursor=value.cursor;setTabs(previous=>previous.map(t=>t.id===selected?{...t,running:value.running,exitCode:value.exitCode}:t))}}catch(e){if(!disposed)setError((e as Error).message)}finally{pending=false;if(again&&!disposed){again=false;void read()}}}
    const off=api.onEvent(event=>{if(event.channel.startsWith('terminal:')&&event.payload.id===selected){if(event.payload.closed)void api.call<Tab[]>('terminal.list',{employee}).then(next=>{if(!disposed){setTabs(next);setSelected(next[0]?.id??'')}});else void read()}})
    const input=term.onData(data=>void api.call('terminal.input',{id:selected,data}).catch(e=>setError(e.message)))
    const dimensions=term.onResize(({cols,rows})=>void api.call('terminal.resize',{id:selected,cols,rows}).catch(e=>!disposed&&setError(e.message)))
    const observer=new ResizeObserver(()=>{if(!disposed)fit.fit()});observer.observe(container.current);fit.fit();void read()
    const timer=setInterval(()=>void read(),1500)
    return()=>{disposed=true;clearInterval(timer);off();observer.disconnect();input.dispose();dimensions.dispose();term.dispose()}
  },[selected])
  const active=tabs.find(t=>t.id===selected)
  return <section className="employee-terminal" aria-label="员工终端" style={{'--terminal-height':`${heightDraft??terminalHeight}px`} as CSSProperties}><PanelDivider axis="y" value={heightDraft??terminalHeight} min={120} max={600} label="调整终端高度" onDraft={setHeightDraft} onCommit={value=>api.call('settings.set',{terminalHeight:value})}/><header><strong>终端</strong><nav>{tabs.map((tab,i)=><button key={tab.id} className={tab.id===selected?'active':''} onClick={()=>setSelected(tab.id)}>{tab.host?'SSH':'Shell'} {i+1}{!tab.running?' · 已退出':''}</button>)}</nav><button className="terminal-action" title="新建终端" onClick={()=>void create()} aria-label="新建终端"><Icon name="add"/></button><button className="terminal-action" title="删除当前终端" disabled={!selected} aria-label="关闭当前终端" onClick={async()=>{try{await api.call('terminal.close',{id:selected});const next=await api.call<Tab[]>('terminal.list',{employee});setTabs(next);setSelected(next[0]?.id??'')}catch(e){setError((e as Error).message)}}}><Icon name="trash"/></button></header><div className="terminal-location" title={active?.cwd}>{active?.host?`${active.host} · `:''}{active?.cwd??'新建终端后从员工工作目录开始'}</div>{error&&<div className="terminal-error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}<div className="terminal-screen" ref={container}/>{!selected&&<button className="terminal-empty" onClick={()=>void create()}>在员工工作目录新建终端</button>}</section>
}
