import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {MessageView} from '../../src/renderer/src/components/MessageView'
import {ChannelConversation} from '../../src/renderer/src/components/ChannelConversation'
import {MessengerContext,useMessengerState} from '../../src/renderer/src/components/useMessenger'
import {useChannelCatalog} from '../../src/renderer/src/components/useChannels'
import {setInterfaceLanguage} from '../../src/renderer/src/i18n'

setInterfaceLanguage('en')
const employee={id:'aster',title:'Aster',engine:'codex',group:'Studio',managementRole:'employee',createdAt:Date.now()-99999,avatar:'marmalade'}
const group={id:'studio',name:'Studio journal',members:[employee],memberIds:['aster'],createdAt:Date.now()-5000,unread:false}
function Fixture(){
 const messenger=useMessengerState(true),catalog=useChannelCatalog(true),[selected,setSelected]=useState('design'),[employeeId,setEmployee]=useState<string|undefined>(),[groupId,setGroup]=useState<string|undefined>()
 window.channelFixture={language:setInterfaceLanguage,jump:messenger.setJump,select:(id:string)=>{setSelected(id);setEmployee(undefined);setGroup(undefined)}}
 const channel=catalog.channels.find(value=>value.id===selected)
 return <div className="app in-messages" style={{height:'100vh',isolation:'isolate'}}><div data-fixture-header style={{position:'absolute',top:0,left:0,width:'100%',height:64,zIndex:100,pointerEvents:'none'}}/><MessengerContext.Provider value={messenger}><MessageView store={{sessions:[employee],groups:['Studio']}} sessions={[]} selectedId={employeeId} groupId={groupId} groups={[group]} channels={catalog.channels} channelId={selected} onChannel={id=>{setSelected(id);setEmployee(undefined);setGroup(undefined)}} onGroup={id=>{setGroup(id);setEmployee(undefined);setSelected('')}} drafts={{}} onOpen={card=>{setEmployee(card.id);setGroup(undefined);setSelected('')}} onNew={()=>{}}>{channel?<ChannelConversation key={channel.id} channel={channel} store={{sessions:[employee],groups:['Studio']}} onBack={()=>setSelected('')}/>:undefined}</MessageView></MessengerContext.Provider></div>
}
createRoot(document.getElementById('root')).render(<Fixture/> )
