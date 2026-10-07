import {useEffect,useRef,useState} from 'react'
import type {ChannelCollector,ChannelConnection,ChannelView} from '../../../shared/channels'
import {api} from '../api'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {useMessageCopy} from '../chat/MessageActionRail'
import {ChannelPlans} from './ChannelPlans'
import {Icon} from './Icon'
import type {ChannelEditorRun} from './ChannelEngineEditor'

export function ChannelConnectionPanel({channel,token,busy,run,onCredential,onChanged}:{channel:ChannelView;token:string;busy:boolean;run:ChannelEditorRun;onCredential:(token:string)=>void;onChanged:(channel:ChannelView)=>void}){
 useI18n()
 const [connection,setConnection]=useState<ChannelConnection|null>(null),[error,setError]=useState(''),[reveal,setReveal]=useState(false),[rotating,setRotating]=useState(false),sequence=useRef(0)
 const refresh=async()=>{const version=++sequence.current;try{const value=await api.call<ChannelConnection>('channel.connection',{id:channel.id});if(version===sequence.current){setConnection(value);setError('')}}catch(cause){if(version===sequence.current)setError((cause as Error).message)}}
 useEffect(()=>{void refresh();return()=>{sequence.current++}},[channel.id,channel.revision])
 const config=JSON.stringify({endpoint:connection?.endpoint,token:token||'<collector-token>',sources:connection?.sources,request:{cmd:'channel.collector-config',args:{}}},null,2),copy=useMessageCopy(config)
 const rotate=()=>run(async()=>{const issued=await api.call<{collector:ChannelCollector;token:string}>('channel.collector-add',{name:channel.name+' process',channelId:channel.id});onCredential(issued.token);setRotating(false);const latest=(await api.call<ChannelView[]>('channel.list')).find(value=>value.id===channel.id);if(latest)onChanged(latest);await refresh()})
 if(error)return <p className="channel-inline-error" role="alert">{uiText(error)} <button type="button" disabled={busy} onClick={()=>void run(refresh)}>{uiText('Retry')}</button></p>
 if(!connection)return <p role="status">{uiText('Loading connection…')}</p>
 const internal=connection.engine.kind==='employees',status={internal:'Ready for employee publishing',unconfigured:'Connection not configured',waiting:'Waiting for the first authenticated request',seen:'Authenticated request received',revoked:'Credential revoked'}[connection.status]
 return <div className="channel-connection-panel">
  <header><Icon name={internal?'organization':'plug'}/><strong>{uiText(internal?'Publishing tasks':'Process connection')}</strong><button type="button" disabled={busy} aria-label={uiText('Refresh connection status')} onClick={()=>void run(refresh)}><Icon name="refresh"/></button></header>
  <p className="channel-connection-status" role="status" data-status={connection.status}>{uiText(status)}</p>
  {internal?<><p>{uiText('Selected employees can publish directly from their existing tasks. Ordinary private replies are not automatically published.')}</p><code>channel.publish {'{'} channelId: {JSON.stringify(channel.id)}, externalId, publishedAt, title, body {'}'}</code><ChannelPlans channel={channel} busy={busy}/></>:<>
   <dl><dt>{uiText('Core receiver URL')}</dt><dd><code>{connection.endpoint}</code></dd>{connection.engine.kind==='external'&&connection.engine.host&&<><dt>{uiText('Process IP or hostname')}</dt><dd>{connection.engine.host}</dd></>}{connection.lastSeenAt&&<><dt>{uiText('Last authenticated request')}</dt><dd>{new Date(connection.lastSeenAt).toLocaleString(interfaceLocale())}</dd></>}<dt>{uiText('Local collector listener')}</dt><dd>{uiText(connection.listener.enabled?'Enabled':'Disabled')} · 127.0.0.1:{connection.listener.port}</dd><dt>{uiText('Publication sources')}</dt><dd>{connection.sources.map(source=><span key={source.sourceId}><strong>{source.name}</strong><code>{source.sourceId}</code></span>)}</dd></dl>
   {token&&<div className="channel-token"><label>{uiText('Save this token now · shown only once')}<input aria-label={uiText('Collector token')} type={reveal?'text':'password'} readOnly autoComplete="off" value={token}/></label><button type="button" onClick={()=>setReveal(value=>!value)}>{uiText(reveal?'Hide token':'Show token')}</button></div>}
   <p>{uiText('Send POST requests with Bearer authentication and JSON {cmd, args}. A saved IP is deployment information, not proof of a live connection.')}</p>
   <div className="channel-connection-actions"><button type="button" disabled={busy} onClick={()=>void copy.copy()}><Icon name="copy"/>{uiText(copy.status||'Copy connection parameters')}</button>{!connection.listener.enabled&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{await api.call('channel.settings',{patch:{enabled:true}});await refresh()})}>{uiText('Enable local collector listener')}</button>}<button type="button" disabled={busy} onClick={()=>setRotating(true)}>{uiText('Replace channel credential')}</button></div>
   {rotating&&<div className="channel-credential-confirm"><p>{uiText('The old process credential will stop publishing to this channel. Other channels and saved articles are unchanged.')}</p><button type="button" disabled={busy} onClick={()=>setRotating(false)}>{uiText('Cancel')}</button><button type="button" disabled={busy} onClick={()=>void rotate()}>{uiText('Create replacement credential')}</button></div>}
  </>}
 </div>
}
