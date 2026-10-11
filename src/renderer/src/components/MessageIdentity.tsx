import {useEffect,useRef,useState} from 'react'
import type {PrincipalRef} from '../../../shared/management'
import type {Store} from '../../../shared/types'
import type {MessengerProfile,ProfileImageInput} from '../../../shared/messenger'
import {CHANNEL_IMAGE_LIMIT} from '../../../shared/channels'
import {SELECTABLE_AVATARS,AVATAR_LABELS,type AvatarKind} from '../../../shared/office'
import {api} from '../api'
import {translate as uiText} from '../i18n'
import {useDialogFocus} from '../office/useDialogFocus'
import {EmployeePortrait} from './EmployeePortrait'
import {Icon} from './Icon'
import {useMessenger} from './useMessenger'
import '../styles/message-identity.css'

const images=new Map<string,Promise<string>>()
function profileImage(sha256:string){
 let image=images.get(sha256)
 if(!image){image=api.call<ProfileImageInput>('messenger.profile-image',{sha256}).then(value=>`data:${value.mimeType};base64,${value.data}`);images.set(sha256,image);void image.catch(()=>images.delete(sha256))}
 return image
}
export function UserMessageAvatar({profile,preview}:{profile?:MessengerProfile;preview?:ProfileImageInput}){
 const key=profile?.image?.sha256,[image,setImage]=useState({key:'',src:''}),src=preview?`data:${preview.mimeType};base64,${preview.data}`:image.key===key?image.src:''
 useEffect(()=>{let active=true;if(key)void profileImage(key).then(src=>{if(active)setImage({key,src})}).catch(()=>{});return()=>{active=false}},[key])
 return <span className="message-user-avatar" data-user-avatar={src?'image':profile?.avatar??'default'}>{src?<img src={src} alt=""/>:profile?.avatar?<EmployeePortrait avatar={profile.avatar}/>:<Icon name="person"/>}</span>
}
/** Author identity selects the portrait; the currently open employee never supplies it. */
export function MessageAuthorAvatar({author,authorName,store}:{author:PrincipalRef;authorName:string;store:Store}){
 const messenger=useMessenger(),employee=author.kind==='agent'?store.sessions.find(card=>author.employeeId===card.id):undefined
 return <span className="message-author-avatar" data-author-kind={author.kind} data-author-id={author.kind==='agent'?author.employeeId:undefined} aria-label={author.kind==='operator'?uiText('You'):authorName}>{author.kind==='operator'?<UserMessageAvatar profile={messenger?.state.profile}/>:employee?<EmployeePortrait avatar={employee.avatar??(employee.engine==='codex'?'robot':'cat')} color={employee.color}/>:<span className="message-former-avatar">{Array.from(authorName.trim())[0]||<Icon name="person"/>}</span>}</span>
}
export function MessageProfileEditor({onClose}:{onClose:()=>void}){
 const messenger=useMessenger()!,input=useRef<HTMLInputElement>(null),[draft,setDraft]=useState<AvatarKind|ProfileImageInput|null>(null),[changed,setChanged]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useDialogFocus('.message-profile-editor',true)
 const choose=(value:typeof draft)=>{setDraft(value);setChanged(true);setError('')}
 const upload=async(file?:File)=>{
  if(!file)return;setBusy(true);setError('')
  try{
   if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)||!file.size||file.size>CHANNEL_IMAGE_LIMIT)throw Error('Upload a PNG, JPEG, GIF or WebP image up to 8 MiB')
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read the selected image'));reader.readAsDataURL(file)})
   choose({name:file.name,mimeType:file.type,data})
  }catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
 }
 const save=async()=>{setBusy(true);setError('');try{await api.call('messenger.profile',draft&&typeof draft==='object'?{image:draft}:{avatar:draft});await messenger.refresh();onClose()}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
 const profile=changed?typeof draft==='string'?{avatar:draft}:{}:messenger.state.profile
 return <div className="group-editor-overlay" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onClose()}}}>
  <div className="group-editor-backdrop" onClick={()=>!busy&&onClose()}/>
  <section className="group-editor message-profile-editor" role="dialog" aria-modal="true" aria-label={uiText('Your message profile')}>
   <header><div><span>{uiText('Messages')}</span><h2>{uiText('Your message profile')}</h2></div><button disabled={busy} aria-label={uiText('Close')} onClick={onClose}><Icon name="close"/></button></header>
   <div className="message-profile-preview"><UserMessageAvatar profile={profile} preview={changed&&draft&&typeof draft==='object'?draft:undefined}/><strong>{uiText('You')}</strong><p>{uiText('Your avatar appears beside your group and channel messages.')}</p></div>
   <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" aria-label={uiText('Upload your avatar')} disabled={busy} onChange={event=>{void upload(event.target.files?.[0]);event.target.value=''}}/>
   <div className="message-profile-actions"><button className="primary" disabled={busy} onClick={()=>input.current?.click()}><Icon name="cloud-upload"/>{uiText('Upload your avatar')}</button><button disabled={busy} onClick={()=>choose(null)}>{uiText('Use default image')}</button></div>
   <small className="message-profile-hint">PNG · JPEG · GIF · WebP · {uiText('Up to 8 MiB')}</small>
   <details><summary>{uiText('Or choose a character')}</summary><div className="message-profile-characters">{SELECTABLE_AVATARS.map(avatar=><button key={avatar} disabled={busy} aria-label={uiText(AVATAR_LABELS[avatar])} aria-pressed={profile?.avatar===avatar} title={uiText(AVATAR_LABELS[avatar])} onClick={()=>choose(avatar)}><EmployeePortrait avatar={avatar}/></button>)}</div></details>
   {error&&<p className="group-error" role="alert">{uiText(error)}</p>}
   <footer><button disabled={busy} onClick={onClose}>{uiText('Cancel')}</button><button className="primary" disabled={busy||!changed} onClick={()=>void save()}>{uiText(busy?'Saving…':'Save changes')}</button></footer>
  </section>
 </div>
}
