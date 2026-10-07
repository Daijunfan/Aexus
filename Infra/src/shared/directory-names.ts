import pinyin from 'tiny-pinyin'

/** Files retain their original names; generated directory components are portable ASCII. */
export function directoryName(value:string,fallback='folder'):string {
  const roman=value.normalize('NFKD').replace(/\p{M}/gu,'').replace(/\p{Script=Han}+/gu,han=>'-'+pinyin.convertToPinyin(han,'-',true)+'-')
  let name=roman.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/-+/g,'-').replace(/^[-_]+|[-_]+$/g,'').slice(0,72)
  if(!name){let hash=2166136261;for(const ch of value)hash=Math.imul(hash^ch.codePointAt(0)!,16777619);name=fallback+'-'+(hash>>>0).toString(36)}
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name))name=fallback+'-'+name
  return name
}

export const portableDirectory=(name:string)=>/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)

/** Tool-owned ASCII names remain compatible with their documented directory formats. */
export function needsDirectoryName(name:string,filename:string){return !portableDirectory(name)&&!/^[@._][a-zA-Z0-9_.@+-]+$/.test(name)&&!(/(?:^|[/\\])(?:node_modules|\.git|\.venv|vendor)(?:[/\\]|$)/.test(filename)&&/^[\x21-\x7e]+$/.test(name))}
