import { listChatGroups,getChatGroup,createChatGroup,updateChatGroup,muteChatMember,deleteChatGroup,chatHistory,chatContext,sendChatMessage,editChatMessage,postChatMessage,acknowledgeChat,groupAttachment } from '../chat-groups'
import { getView,setView } from '../presentation'
export async function chatRequest(command:string,a:Record<string,any>){
 const s=(value:unknown)=>String(value)
 switch(command){
    case 'chat.list': return listChatGroups()
    case 'chat.create': return createChatGroup(a)
    case 'chat.update': return updateChatGroup(a)
    case 'chat.delete': {const result=deleteChatGroup(a.id);if(getView().chatId===a.id)setView({kind:'messages'});return result}
    case 'chat.get': return getChatGroup(a.id)
    case 'chat.history': return chatHistory(a)
    case 'chat.context': return chatContext(a)
    case 'chat.file': return groupAttachment(a)
    case 'chat.send': return sendChatMessage(a)
    case 'chat.edit': return editChatMessage(a)
    case 'chat.mute': return muteChatMember(a)
    case 'chat.post': return postChatMessage(a)
    case 'chat.acknowledge': return acknowledgeChat(a)
 default:throw Error('Unknown chat command')
 }
}
