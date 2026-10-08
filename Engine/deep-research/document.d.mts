export function isPdf(data:unknown):boolean
export function extractPdfText(data:ArrayBuffer|Uint8Array,options?:{signal?:AbortSignal;maxChars?:number}):Promise<string>
