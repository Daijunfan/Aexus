export type MediaInfo={id:string;name:string;kind:'audio'|'video';mimeType:string;bytes:number;modifiedAt:number;expiresAt:number}
export function mediaKind(mimeType:string):'audio'|'video'|null{return mimeType.startsWith('audio/')?'audio':mimeType.startsWith('video/')?'video':null}
