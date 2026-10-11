import {createHash} from 'node:crypto'
import {CHANNEL_IMAGE_LIMIT} from '../shared/channels'

const imageTypes:Record<string,{extension:string;test:(data:Buffer)=>boolean}>={
 'image/png':{extension:'png',test:data=>data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},
 'image/jpeg':{extension:'jpg',test:data=>data[0]===0xff&&data[1]===0xd8&&data[2]===0xff},
 'image/gif':{extension:'gif',test:data=>['GIF87a','GIF89a'].includes(data.toString('ascii',0,6))},
 'image/webp':{extension:'webp',test:data=>data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'}
}
/** Bounded, signature-checked uploaded images used by channel and personal identities. */
export function validatedImage(args:{name:string;mimeType:string;data:string}){
 const fail=(message:string)=>Object.assign(Error(message),{code:'INVALID_CHANNEL_REQUEST',status:400})
 const name=typeof args.name==='string'?args.name.trim():'',type=Object.hasOwn(imageTypes,args.mimeType)?imageTypes[args.mimeType]:undefined
 if(!name||name.length>255||/[\\/\0\r\n]/.test(name)||!type||typeof args.data!=='string'||args.data.length>Math.ceil(CHANNEL_IMAGE_LIMIT/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(args.data))throw fail('Upload a PNG, JPEG, GIF or WebP image up to 8 MiB')
 const data=Buffer.from(args.data,'base64')
 if(!data.length||data.length>CHANNEL_IMAGE_LIMIT||!type.test(data))throw fail('Image content does not match its declared type')
 return {data,sha256:createHash('sha256').update(data).digest('hex'),extension:type.extension}
}
