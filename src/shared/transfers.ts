export type FileLocation={path:string;asset?:string;conversation?:string;shared?:boolean;team?:string;employee?:string;group?:string;channel?:string;local?:boolean}
export type TransferState='queued'|'running'|'completed'|'failed'|'cancelled'
export type TransferJob={id:string;from:FileLocation;to:FileLocation;name:string;state:TransferState;bytes:number;totalBytes:number;files:number;totalFiles:number;createdAt:number;error?:string;destination?:string}
export const FILE_DRAG_TYPE='application/x-agents-company-file'
