import type {ChatGroupView} from '../../../shared/chat-groups'
import {affectsMembers} from '../../../shared/store-changes'
import {useCatalog} from './useCatalog'
/** One application-owned group catalog, shared by all views. */
export function useChatCatalog(){
 const {value:groups,...state}=useCatalog<ChatGroupView>('chat.list',true,event=>event.channel==='chat:changed'||event.channel==='store:changed'&&affectsMembers(event.payload))
 return {groups,...state}
}
