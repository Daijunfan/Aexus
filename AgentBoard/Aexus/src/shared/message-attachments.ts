export type MessageAttachment={path:string;name:string;bytes:number;mimeType:string;kind:'image'|'file'}
export const MAX_MESSAGE_ATTACHMENTS=16
export function attachmentPaths(value:unknown):string[]{
  if(value===undefined)return []
  if(!Array.isArray(value)||value.length>MAX_MESSAGE_ATTACHMENTS||value.some(path=>typeof path!=='string'||!path))throw Error('Choose at most 16 attachment paths')
  return [...new Set(value)]
}
export function fileMime(name:string){
  const extension=name.split('.').at(-1)?.toLowerCase()??''
  return ({pdf:'application/pdf',txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json',zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',ogv:'video/ogg',flac:'audio/flac',aac:'audio/aac',weba:'audio/webm',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'} as Record<string,string>)[extension]??'application/octet-stream'
}
export function attachmentInfo(path:string,info:{exists?:boolean;directory?:boolean;regular?:boolean;symlink?:boolean;bytes?:number},kind:'image'|'file'='file',mimeType?:string):MessageAttachment{
  if(!info.exists||info.directory||info.symlink||info.regular===false||!Number.isSafeInteger(info.bytes)||info.bytes!<0||info.bytes!>2*1024*1024*1024)throw Error('Choose a regular attachment file up to 2 GiB')
  const name=path.split(/[\\/]/).at(-1)!
  return {path,name,bytes:info.bytes!,kind,mimeType:mimeType??fileMime(name)}
}
export function attachmentSize(bytes:number){if(bytes<1024)return bytes+' B';if(bytes<1024*1024)return (bytes/1024).toFixed(bytes<10240?1:0)+' KB';if(bytes<1024*1024*1024)return (bytes/1024/1024).toFixed(1)+' MB';return (bytes/1024/1024/1024).toFixed(2)+' GB'}
