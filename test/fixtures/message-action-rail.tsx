import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Turn,BlockView} from '../../src/renderer/src/chat/Chat'
import {MessageActions} from '../../src/renderer/src/chat/MessageActions'
import {MessageImages} from '../../src/renderer/src/chat/MessageImage'
import {emojiCount} from '../../src/renderer/src/chat/messagePresentation'
import {ChannelNewsCard} from '../../src/renderer/src/components/ChannelNewsCard'
import {MessageLibrary} from '../../src/renderer/src/components/MessageLibrary'
import {MessageWallpaper} from '../../src/renderer/src/chat/MessageWallpaper'
import {MessengerContext} from '../../src/renderer/src/components/useMessenger'
import {EMPTY_MESSENGER} from '../../src/shared/messenger'
import type {ChannelPost} from '../../src/shared/channels'
import type {Item} from '../../src/shared/types'

declare global{interface Window{railFixture:any;railActions:any}}
const longSource=Array.from({length:90},(_,i)=>'Paragraph '+(i+1)+'. **The original message stays intact.** Useful details should remain easy to read, copy, and forward.\n\n').join('')+'```js\nconst original = "$x$ stays code";\n```'
window.railActions={copied:[],forward:[],reply:[]}
const messenger={state:EMPTY_MESSENGER,ready:true,setForward:(value:any)=>window.railActions.forward.push(value),message:async()=>true,setLibrary:()=>{},setReplyTarget:()=>{},setSelection:()=>{}} as any
function App(){
 const [mode,setMode]=useState('private'),[source,setSource]=useState(longSource),[outgoing,setOutgoing]=useState(false),[count,setCount]=useState(2),[media,setMedia]=useState(false),[second,setSecond]=useState<string|null>(null),[revision,setRevision]=useState(0)
 const ids=Array.from({length:count},(_,index)=>['first','second'][index]??'row-'+index),body=(id:string)=>id==='second'&&second!==null?second:source
 const news=(id:string):ChannelPost=>({id,sourceId:'source',externalId:id,channelId:'channel',sourceName:'Original writer',plugin:'x',title:'A thought, with room to read',body:body(id),publishedAt:1700000000000,receivedAt:1700000000000,updatedAt:1700000000000,expiresAt:1900000000000,contentHash:id,saved:false,media:media?[{id:'photo',name:'Original fixture.png',mimeType:'image/png',bytes:120,sha256:'fixture'}]:[]})
 const turn=(id:string):Item=>outgoing||media?{id,role:'user',text:body(id),...(media?{images:['photo.png']}:{})}:{id,role:'assistant',blocks:[{kind:'text',text:body(id)}]}
 window.railFixture={mode:(value:string)=>{setSource(longSource);setOutgoing(false);setMedia(false);setSecond(null);setCount(2);setMode(value);setRevision(value=>value+1)},source,longSource,text:(value:string)=>{setSource(value);setRevision(value=>value+1)},outgoing:setOutgoing,count:setCount,media:setMedia,second:setSecond,libraryItems:ids.map(id=>({conversation:'channel:channel',conversationTitle:'A channel',id,role:'assistant',author:'Original writer',text:body(id),images:[],preferences:{saved:true},news:news(id)}))}
 const controller={...messenger,state:{...EMPTY_MESSENGER,revision},library:{filter:'saved'}}
 return <MessengerContext.Provider value={controller}><div className="rail-fixture" style={{height:'100vh',width:'100%',paddingTop:50,boxSizing:'border-box'}}><div style={{position:'fixed',top:0,height:42,zIndex:10,display:'flex',gap:15,padding:8}}>{['private','group','channel','library'].map(value=><button key={value} onClick={()=>window.railFixture.mode(value)}>{value}</button>)}</div><div className="message-view has-conversation" style={{height:'100%',gridTemplateColumns:'minmax(0,1fr)'}}><div className="message-stage"><MessageWallpaper/>{mode==='library'?<MessageLibrary/>:mode==='channel'?<section className="channel-conversation" style={{display:'flex',flexDirection:'column',width:'100%',minHeight:0}}><div className="channel-feed" data-scroll>{ids.map(id=><ChannelNewsCard key={id} post={news(id)} onAuthor={()=>{}} onChanged={()=>{}} onReply={()=>window.railActions.reply.push(id)}/>)}</div></section>:mode==='group'?<section className="group-conversation"><div className="group-transcript" data-scroll>{ids.map(id=><article key={id} className={outgoing?"group-message from-user":"group-message from-employee"} data-emoji-count={media?undefined:emojiCount(body(id))} data-chat-item={id}><BlockView english block={{kind:'text',text:body(id)}}/>{media&&<MessageImages group="fixture" paths={['photo.png']} messageId={id} caption={body(id)}/>}<MessageActions conversation="group:fixture" id={id} text={body(id)} images={media?1:0} onReply={()=>{}} onEdit={outgoing?()=>{}:undefined}/></article>)}</div></section>:<section className="message-conversation" style={{display:'flex',flexDirection:'column',width:'100%',minHeight:0}}><div className="transcript" data-scroll>{ids.map(id=><Turn key={id} item={turn(id)} messageEmployee="fixture" conversationEmployee="fixture" onReply={()=>{}}/>)}</div></section>}</div></div></div></MessengerContext.Provider>
}
createRoot(document.getElementById('root')!).render(<App/>);
