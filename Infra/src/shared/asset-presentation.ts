import type {AssetNode} from './asset-schema'
export const ASSET_KINDS=['all','folder','document','image','audio','video','code','archive','other'] as const
export function assetFileKind(name:string){
 const ext=name.split('.').at(-1)?.toLowerCase()??''
 if(/^(png|jpe?g|gif|webp|svg|bmp|heic|avif|ico)$/.test(ext))return 'image'
 if(/^(mp3|m4a|wav|ogg|flac|aac|opus)$/.test(ext))return 'audio'
 if(/^(mp4|webm|mov|mkv|avi|m4v)$/.test(ext))return 'video'
 if(/^(zip|gz|tar|7z|rar|bz2|xz)$/.test(ext))return 'archive'
 if(/^(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|css|html|json|yaml|yml|toml|sh|sql)$/.test(ext))return 'code'
 if(/^(md|txt|pdf|docx?|xlsx?|pptx?|csv|epub|rtf|odt|tex|log)$/.test(ext))return 'document'
 return 'other'
}
export const assetNodeId=(asset:string,path:string)=>!path||path==='.'?asset:asset+'|'+encodeURIComponent(path)
export const assetTitle=(node:AssetNode)=>node.label||node.name
export const assetSize=(bytes?:number)=>bytes===undefined?'':bytes<1024?bytes+' B':bytes<1024**2?(bytes/1024).toFixed(1)+' KB':bytes<1024**3?(bytes/1024**2).toFixed(1)+' MB':(bytes/1024**3).toFixed(1)+' GB'
