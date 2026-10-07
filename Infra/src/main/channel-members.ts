import {one,run} from './channel-store'
import {readStore} from './store'

/** A missing membership row is a legacy channel: its existing publishers remain Admins. */
export function channelOffices(id:string){
 const channel=one('SELECT admin_ids FROM channels WHERE id=?',id)
 if(!channel)throw Error('Unknown news channel')
 const saved=one('SELECT owner_id,member_ids FROM channel_membership WHERE channel_id=?',id)
 const existing=new Set(readStore().sessions.filter(card=>!card.deleting).map(card=>card.id))
 const adminIds=(JSON.parse(channel.admin_ids) as string[]).filter(id=>existing.has(id))
 const memberIds=[...new Set<string>([...(saved?JSON.parse(saved.member_ids):[]),...adminIds])].filter(id=>existing.has(id))
 const ownerId=saved?.owner_id&&memberIds.includes(saved.owner_id)?String(saved.owner_id):null
 return {memberIds,adminIds:[...new Set([...adminIds,...(ownerId?[ownerId]:[])])],ownerId}
}
export const channelMemberIds=(id:string)=>channelOffices(id).memberIds
export function saveChannelOffices(id:string,value:{memberIds:string[];adminIds:string[];ownerId:string|null}){
 run('INSERT INTO channel_membership VALUES(?,?,?) ON CONFLICT(channel_id) DO UPDATE SET owner_id=excluded.owner_id,member_ids=excluded.member_ids',id,value.ownerId,JSON.stringify(value.memberIds))
 run('UPDATE channels SET admin_ids=? WHERE id=?',JSON.stringify(value.adminIds.filter(id=>value.memberIds.includes(id))),id)
}
