import {ConversationDownload} from './ConversationDownload'
import {useEffect,useState,type ReactNode} from 'react'
import type {ChannelDocument as Document,ChannelFileStatus} from '../../../shared/channels'
import {attachmentSize} from '../../../shared/message-attachments'
import {api} from '../api'
import {translate as uiText} from '../i18n'
import {Icon} from './Icon'
import {ConversationWorkspace} from './ConversationWorkspace'

export function ChannelDocument({postId,channelId,file,onSaved,preview}:{postId:string;channelId:string;file:Document;onSaved:()=>void;preview?:ReactNode}){
 const [status,setStatus]=useState<ChannelFileStatus>({postId,fileId:file.id,state:file.savedPath?'completed':'not-downloaded',bytes:file.savedPath?file.bytes:0,totalBytes:file.bytes,path:file.savedPath}),[error,setError]=useState(''),[open,setOpen]=useState(false)
 const args={postId,fileId:file.id},pending=['queued','running'].includes(status.state)
 useEffect(()=>{let alive=true;void api.call<ChannelFileStatus>('channel.file-status',{postId,fileId:file.id}).then(value=>{if(alive)setStatus(value)}).catch(cause=>{if(alive)setError(cause.message)});return()=>{alive=false}},[postId,file.id])
 useEffect(()=>{
  if(!pending)return
  let alive=true
  const timer=setTimeout(()=>void api.call<ChannelFileStatus>('channel.file-status',args).then(value=>{if(alive){setStatus(value);if(value.state==='completed')onSaved()}}).catch(cause=>{if(alive){setError(cause.message);setStatus(previous=>({...previous,state:'failed'}))}}),250)
  return()=>{alive=false;clearTimeout(timer)}
 },[status])
 const download=async()=>{setError('');try{setStatus(await api.call<ChannelFileStatus>('channel.file-download',args))}catch(cause){setError((cause as Error).message)}}
 const saved=status.state==='completed',extension=file.name.split('.').at(-1)?.toUpperCase()??'FILE'
 return <div className="channel-document" data-document-id={file.id} data-state={status.state}>
  <span className="channel-document-preview">{preview&&(file.thumbnailOrigin!=='generated'||saved)?preview:<svg className="telegram-file-icon" viewBox="0 0 52 64" aria-hidden="true"><path d="M7 1h27l17 17v39a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6V7a6 6 0 0 1 6-6Z" fill={extension==='PDF'?'#ed3b35':'#5b8cc3'}/><path d="M34 1v12a5 5 0 0 0 5 5h12Z" fill={extension==='PDF'?'#bc2926':'#3b679b'}/><text x="26" y="46" textAnchor="middle" fill="white" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif" fontSize="16" fontWeight="500">{extension.toLowerCase().slice(0,4)}</text></svg>}</span>
  <span className="channel-document-info"><strong title={file.name}>{file.name}</strong><small>{attachmentSize(file.bytes).replace(' ','')}</small>{pending&&<progress value={status.bytes} max={file.bytes} aria-label={uiText('Download progress')}/>}<small className={!pending&&!error&&!status.error?'channel-document-status':undefined} role={error||status.error?'alert':'status'}>{error||status.error||(pending?uiText('Downloading to channel…'):saved?uiText('Saved to channel'):uiText('Stored on cloud'))}</small></span>
  <span className="reply-seen-marker" data-channel-read={postId} aria-hidden="true"/><button disabled={pending} aria-label={uiText(saved?'Open channel files':'Download to channel')} title={uiText(saved?'Open channel files':'Download to channel')} onClick={()=>saved?setOpen(true):void download()}><Icon name={saved?'check':pending?'loading':'arrow-down'}/></button>
  <ConversationDownload conversation={'channel:'+channelId} entryId={postId} attachmentId={'document:'+file.id} name={file.name}/>
  {open&&<ConversationWorkspace conversation={'channel:'+channelId} onClose={()=>setOpen(false)}/>}
 </div>
}
