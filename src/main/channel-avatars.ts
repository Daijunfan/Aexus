import {createHash} from 'node:crypto'
import {CHANNEL_IMAGE_LIMIT,type ChannelSourceAvatarInput} from '../shared/channels'
import {one,run} from './channel-store'

const fail=(message:string,code='INVALID_CHANNEL_REQUEST',status=400)=>Object.assign(Error(message),{code,status})
const imageTypes:Record<string,{extension:string;test:(data:Buffer)=>boolean}>={
 'image/png':{extension:'png',test:data=>data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},
 'image/jpeg':{extension:'jpg',test:data=>data[0]===0xff&&data[1]===0xd8&&data[2]===0xff},
 'image/gif':{extension:'gif',test:data=>['GIF87a','GIF89a'].includes(data.toString('ascii',0,6))},
 'image/webp':{extension:'webp',test:data=>data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'}
}
/** Shared validation for article images and independently retained source identity images. */
export function validatedChannelImage(args:{name:string;mimeType:string;data:string}){
 const name=typeof args.name==='string'?args.name.trim():'',type=Object.hasOwn(imageTypes,args.mimeType)?imageTypes[args.mimeType]:undefined
 if(!name||name.length>255||/[\\/\0\r\n]/.test(name)||!type||typeof args.data!=='string'||args.data.length>Math.ceil(CHANNEL_IMAGE_LIMIT/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(args.data))throw fail('Upload a PNG, JPEG, GIF or WebP image up to 8 MiB')
 const data=Buffer.from(args.data,'base64')
 if(!data.length||data.length>CHANNEL_IMAGE_LIMIT||!type.test(data))throw fail('Image content does not match its declared type')
 return {data,sha256:createHash('sha256').update(data).digest('hex'),extension:type.extension}
}
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
