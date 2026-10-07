import {type ChannelSourceAvatarInput} from '../shared/channels'
import {validatedImage as validatedChannelImage} from './image-input'
export {validatedChannelImage}
import {one,run} from './channel-store'

const fail=(message:string,code='INVALID_CHANNEL_REQUEST',status=400)=>Object.assign(Error(message),{code,status})
/** Authorization and source capability checks belong to the channel dispatcher. */
export function putSourceAvatar(args:ChannelSourceAvatarInput):{sourceId:string;sha256:string}{
 const image=validatedChannelImage(args),previous=sourceAvatar(args.sourceId)
 if(previous?.sha256!==image.sha256)run('INSERT INTO source_avatars(source_id,name,mime_type,data,sha256,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,data=excluded.data,sha256=excluded.sha256,updated_at=excluded.updated_at',args.sourceId,args.name.trim(),args.mimeType,image.data,image.sha256,Date.now())
 return {sourceId:args.sourceId,sha256:image.sha256}
}
export function sourceAvatar(sourceId:string):{sha256:string;name:string;mimeType:string;bytes:number}|undefined{
 const row=one('SELECT sha256,name,mime_type,length(data) AS bytes FROM source_avatars WHERE source_id=?',sourceId)
 return row?{sha256:row.sha256,name:row.name,mimeType:row.mime_type,bytes:row.bytes}:undefined
}
export function readSourceAvatar(sourceId:string):{data:string;mimeType:string;name:string}{
 const row=one('SELECT data,mime_type,name FROM source_avatars WHERE source_id=?',sourceId)
 if(!row)throw fail('Source avatar is unavailable','SOURCE_AVATAR_NOT_FOUND',404)
 return {data:Buffer.from(row.data).toString('base64'),mimeType:row.mime_type,name:row.name}
}
