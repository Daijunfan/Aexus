import {randomUUID} from 'node:crypto'
import {requestContext} from './request-context'
import {downloadInfo,downloadChunk} from './uploads'
import {fileMime} from '../shared/message-attachments'
import {mediaKind,type MediaInfo} from '../shared/media'
import type {FileEndpoint} from './transfers'
const previews=new Map<string,{info:MediaInfo;owner:string;target:FileEndpoint;resolve:()=>FileEndpoint}>(),TTL=8*60*60*1000
const owner=()=>{const context=requestContext();if(context.principal.kind!=='operator')throw Error('Only the user may preview media');return context.clientId??'cli'}
const get=(id:string)=>{const value=previews.get(id);if(!value||value.owner!==owner()||value.info.expiresAt<=Date.now())throw Error('Media preview expired or belongs to another client');if(JSON.stringify(value.resolve())!==JSON.stringify(value.target))throw Error('Media workspace changed; reopen the preview');return value}
function supportedHeader(bytes:Buffer,mime:string){
 if(mime==='audio/wav')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'
 if(mime==='audio/flac')return bytes.toString('ascii',0,4)==='fLaC'
 if(mime==='audio/ogg'||mime==='video/ogg')return bytes.toString('ascii',0,4)==='OggS'
 if(mime==='audio/mpeg')return bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224
 if(mime==='audio/aac')return bytes[0]===255&&(bytes[1]&246)===240
 if(mime==='video/webm'||mime==='audio/webm')return bytes.subarray(0,4).toString('hex')==='1a45dfa3'
 if(['audio/mp4','video/mp4','video/quicktime'].includes(mime))return ['ftyp','moov','wide','mdat'].includes(bytes.toString('ascii',4,8))
 return false
}
export async function openMedia(resolve:()=>FileEndpoint):Promise<MediaInfo>{
 const target=resolve(),client=owner(),mimeType=fileMime(target.path),kind=mediaKind(mimeType)
 if(!kind)throw Error('Choose a supported audio or video file')
 for(const [id,value] of previews)if(value.info.expiresAt<=Date.now())previews.delete(id)
 if([...previews.values()].filter(value=>value.owner===client).length>=64)throw Error('Close an existing media preview before opening another')
 const metadata=await downloadInfo(target)
 if(metadata.bytes>2*1024*1024*1024)throw Error('Media files must be at most 2 GiB')
 const header=await downloadChunk(target,0,metadata.modifiedAt)
 if(!supportedHeader(Buffer.from(header.data,'base64'),mimeType))throw Error('This file does not contain a supported media container')
 const info:MediaInfo={id:randomUUID(),name:target.path.split(/[\\/]/).at(-1)!,kind,mimeType,bytes:metadata.bytes,modifiedAt:metadata.modifiedAt,expiresAt:Date.now()+TTL}
 previews.set(info.id,{info,owner:client,target,resolve});return info
}
export async function mediaInfo(id:string){const value=get(id),now=await downloadInfo(value.target);get(id);if(now.modifiedAt!==value.info.modifiedAt||now.bytes!==value.info.bytes)throw Error('Media file changed; reopen the preview');return value.info}
export async function readMedia(id:string,offset:number){const value=get(id),result=await downloadChunk(value.target,offset,value.info.modifiedAt);get(id);if(result.totalBytes!==value.info.bytes)throw Error('Media file changed; reopen the preview');return result}
export function closeMedia(id:string){const value=previews.get(id);if(!value||value.owner!==owner())throw Error('Unknown media preview');previews.delete(id);return {closed:true}}
export function mediaAvailable(id:string){const value=previews.get(id);return !!value&&value.info.expiresAt>Date.now()}
export function closeMediaClient(client:string){for(const [id,value] of previews)if(value.owner===client)previews.delete(id)}
export function closeAllMedia(){previews.clear()}
