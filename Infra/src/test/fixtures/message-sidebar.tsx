import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {MessageView} from '../../renderer/src/components/MessageView'
import {MessengerContext} from '../../renderer/src/components/useMessenger'
import {setInterfaceLanguage} from '../../renderer/src/i18n'

setInterfaceLanguage('en')
const avatars=['fate-saber-anime','fate-rin-chibi','codex','marmalade','fate-archer-anime','byte'],titles=['Aster','Rowan','Studio engineer','Mika','Alexandra · Research','Bram']
const cards=Array.from({length:300},(_,i)=>({id:'employee-'+i,title:titles[i%6]+(i>5?' '+i:''),engine:'codex',group:i%2?'Engineering':'Creative studio',managementRole:'employee',avatar:avatars[i%6],createdAt:Date.now()-i*1000,...(i%3===0?{lastReply:{id:'reply-'+i,text:'The first pass is ready for your review.',createdAt:Date.now()-i*1000}}:{})}))
window.fixtureInbox=cards.map((card,i)=>({employeeId:card.id,role:i%2?'user':'assistant',author:{kind:'operator'},text:i%2?'Let’s make the little details feel right.':'The first pass is ready for your review.',updatedAt:card.createdAt}))
const group={id:'studio',name:'Studio journal',members:cards.slice(0,4),memberIds:cards.slice(0,4).map(x=>x.id),createdAt:Date.now(),lastMessage:{text:'A new place for good ideas. ✨',createdAt:Date.now(),authorName:'Aster'},unread:true}
const state={revision:1,messages:{},conversations:{'employee:employee-2':{pinned:true}},drafts:{'employee:employee-4':{text:'A thought for the next review…'},'group:studio':{text:'Sketching our next idea.'}}}
const controller={state,conversations:async()=>true,setLibrary:()=>{},ready:true},app=createRoot(document.getElementById('root'))
function Fixture(){
  const [phase,setPhase]=useState('working'),[selected,setSelected]=useState('employee-0')
  window.sidebarFixture={phase:setPhase,selected:setSelected,unmount:()=>app.unmount(),language:setInterfaceLanguage,preview:kind=>{delete state.drafts['group:studio'];group.lastMessage.author=kind==='operator'?{kind:'operator'}:kind==='agent'?{kind:'agent',employeeId:cards[0].id}:undefined;group.lastMessage.authorName=kind==='operator'?'Operator display name':kind==='agent'?'Aster':'You';setPhase(previous=>previous==='idle'?'working':'idle')}}
  const sessions=cards.map((card,i)=>({id:card.id,cardId:card.id,busy:phase!=='idle',activityPreview:phase==='responding'?{kind:'speech',text:'A real published update'}:{kind:'tool',text:'Actual tool work'},approvals:i===2?[{id:'approval'}]:[]}))
  return <div className="app" style={{height:'100vh'}}><MessengerContext.Provider value={controller}><MessageView store={{sessions:cards,groups:['Creative studio','Engineering']}} sessions={sessions} selectedId={selected} groups={[group]} onGroup={()=>{}} drafts={{}} onOpen={card=>setSelected(card.id)} onNew={()=>{}}><div style={{margin:'auto',textAlign:'center',color:'var(--fg-dim)'}}><h2>Message list · 300 employees</h2><p>Isolated artwork and motion fixture</p></div></MessageView></MessengerContext.Provider></div>
}
app.render(<Fixture/>)
