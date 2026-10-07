import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Turn} from '../../renderer/src/chat/Chat'
import {MessageReceipt} from '../../renderer/src/chat/MessageReceipt'
import {MessengerContext} from '../../renderer/src/components/useMessenger'
import {setInterfaceLanguage,translate as uiText} from '../../renderer/src/i18n'

setInterfaceLanguage('en')
const at=1700000000000,names={aster:'Aster',rowan:'Rowan · Infrastructure',mika:'Mika',extra:'A member added later'}
const initial=[{employeeId:'aster',status:'running',deliveredAt:at+1000,readAt:at+2000},{employeeId:'rowan',status:'failed',deliveredAt:at+1200,error:'The workspace is unavailable.'},{employeeId:'former',status:'completed'},{employeeId:'mika',status:'interrupted',mode:'awareness'}]
const controller={state:{messages:{},conversations:{},drafts:{}},ready:true},app=createRoot(document.getElementById('root'))
function Fixture(){
  const [outbound,setOutbound]=useState({taskId:'real-task'}),[deliveries,setDeliveries]=useState(initial)
  window.receiptFixture={delivered:()=>setOutbound({taskId:'real-task',deliveredAt:at+3000}),read:()=>setOutbound({taskId:'real-task',deliveredAt:at+3000,readAt:at+4000}),readAll:()=>setDeliveries(previous=>previous.map(item=>({...item,deliveredAt:item.deliveredAt??at+5000,readAt:item.readAt??at+6000}))),many:()=>setDeliveries(Array.from({length:200},(_,i)=>({employeeId:'bulk-'+i,status:'queued'}))),language:setInterfaceLanguage,unmount:()=>app.unmount()}
  return <div className="app"><div className="message-view has-conversation" style={{display:'block',height:'100vh'}}><MessengerContext.Provider value={controller}><div className="message-stage" style={{height:'100%'}}><div className="message-conversation"><div className="transcript" style={{overflow:'auto'}}>
    <section data-case="legacy"><Turn messageEmployee="native" item={{role:'user',id:'legacy',text:'An older message with no receipt metadata.'}} timestamp={at}/><Turn messageEmployee="native" item={{role:'assistant',id:'answer',blocks:[{kind:'text',text:'A nearby answer does not establish a receipt for an older input.'}]}} timestamp={at+1000}/></section>
    <section data-case="private"><Turn messageEmployee="native" item={{role:'user',id:'current',text:'This input has an explicitly correlated task receipt.',outbound}} timestamp={at+2000}/></section>
    <article className="group-message from-user" data-case="group"><div className="markdown">A broadcast message keeps its frozen recipients.</div><div className="message-time message-time-with-receipt"><time>22:13</time><MessageReceipt deliveries={deliveries} memberName={id=>names[id]??uiText('Former member')} onOpenRecipient={id=>window.openedRecipients.push(id)} canOpenRecipient={id=>id!=='former'&&id!=='mika'}/></div></article>
    <article className="group-message from-employee" data-case="awareness"><div className="group-message-heading"><strong>Aster</strong></div><div className="markdown">Aster’s shared reply reaches the other members without echoing back to its author.</div><div className="message-time message-time-with-receipt"><MessageReceipt deliveries={[{employeeId:'rowan',mode:'awareness',status:'completed',deliveredAt:at+1200},{employeeId:'mika',mode:'awareness',status:'completed',deliveredAt:at+1000,readAt:at+2000}]} memberName={id=>names[id]??uiText('Former member')}/></div></article>
    <article className="group-message from-employee" data-case="self-only"><div className="markdown">An author with no other recipients has no invented receipt.</div><MessageReceipt deliveries={[]}/></article>
    <article className="group-message from-user" data-case="partial"><div className="markdown">A separate delivery-only milestone.</div><div className="message-time message-time-with-receipt"><MessageReceipt deliveries={[initial[1],initial[3]]} memberName={id=>names[id]??uiText('Former member')}/></div></article>
  </div></div></div></MessengerContext.Provider></div></div>
}
app.render(<Fixture/>)
