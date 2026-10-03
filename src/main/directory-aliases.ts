import fs from 'node:fs'
import path from 'node:path'
import {readSourceText} from './read-cache'

export type DirectoryAlias={from:string;to:string}
export function directoryAliases(root:string):DirectoryAlias[]{
 const file=path.join(root,'.agents-company/directory-renames.json')
 if(!fs.existsSync(file))return []
 const data=JSON.parse(readSourceText(file))
 if(data.version!==1||!Array.isArray(data.aliases))throw Error('Invalid directory migration metadata')
 for(const item of data.aliases)for(const value of [item.from,item.to])if(typeof value!=='string'||path.isAbsolute(value)||value.split('/').some(part=>part==='..'||part==='.agents-company'))throw Error('Directory migration path is outside its workspace')
 return data.aliases
}
export function directoryPath(root:string,value:string){
 const part=path.relative(root,path.resolve(root,value)).split(path.sep).join('/')
 if(part==='..'||part.startsWith('../'))return value
 for(const item of directoryAliases(root).sort((a,b)=>b.from.length-a.from.length))if(part===item.from||part.startsWith(item.from+'/'))return item.to+part.slice(item.from.length)
 return part||'.'
}
export function migrationLink(root:string,value:string){return directoryAliases(root).some(item=>item.from===value.split(path.sep).join('/'))}
