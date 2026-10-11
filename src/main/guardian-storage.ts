import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {access,lstat,opendir,realpath,stat} from 'node:fs/promises'
import type {GuardianStorageEntry,GuardianStorageScan} from '../shared/guardian'

type Job={result:GuardianStorageScan;entries:Map<string,GuardianStorageEntry>}
const jobs=new Map<string,Job>()
const jobFor=(id:string)=>{const job=jobs.get(id);if(!job)throw Error('Unknown or expired storage scan');return job}
const running=(job:Job)=>job.result.status==='running'
function recordError(job:Job,filename:string,error:unknown,group?:GuardianStorageEntry){
  const result=job.result;result.errorCount++;if(group)group.partial=true
  if(result.errors.length<100)result.errors.push({path:filename,message:(error as Error).message})
  result.updatedAt=Date.now()
}
export function guardianStorageStatus(id:string):GuardianStorageScan{
  const job=jobFor(id),entries=[...job.entries.values()].sort((a,b)=>b.bytes-a.bytes||a.name.localeCompare(b.name)),omitted=entries.slice(200)
  return structuredClone({...job.result,entries:entries.slice(0,200),otherEntries:omitted.length,otherBytes:omitted.reduce((sum,entry)=>sum+entry.bytes,0)})
}
export function guardianStorageCancel(id:string):GuardianStorageScan{
  const job=jobFor(id)
  if(running(job)){job.result.status='cancelled';job.result.finishedAt=job.result.updatedAt=Date.now();job.result.pendingDirectories=0}
  return guardianStorageStatus(id)
}
async function scan(job:Job){
  const result=job.result,stack:{path:string;group?:GuardianStorageEntry}[]=[{path:result.path}]
  while(stack.length&&running(job)){
    const current=stack.pop()!;result.pendingDirectories=stack.length+1
    try{
      // A directory replaced by a link while scanning must not escape the selected tree.
      if(await realpath(current.path)!==current.path)throw Error('Directory changed to a symbolic link; not followed')
      if(!running(job))break
      const directory=await opendir(current.path)
      if(!running(job)){await directory.close();break}
      result.directories++;if(current.group)current.group.directories++
      for await(const entry of directory){
        if(!running(job))break
        const filename=path.join(current.path,entry.name)
        try{
          const info=await lstat(filename)
          if(!running(job))break
          if(info.isSymbolicLink()){result.skippedSymlinks++;continue}
          if(!info.isFile()&&!info.isDirectory()){result.skippedSpecial++;continue}
          let group=current.group
          if(!group){group={name:entry.name,path:filename,kind:info.isDirectory()?'directory':'file',bytes:0,files:0,directories:0,partial:false};job.entries.set(filename,group)}
          if(info.isDirectory())stack.push({path:filename,group})
          else{
            result.files++;result.bytes+=info.size;group.files++;group.bytes+=info.size
            const largest=result.largestFiles
            if(largest.length<40||info.size>largest[largest.length-1].bytes){largest.push({name:entry.name,path:filename,bytes:info.size});largest.sort((a,b)=>b.bytes-a.bytes);if(largest.length>40)largest.pop()}
          }
          result.pendingDirectories=stack.length+1;result.updatedAt=Date.now()
        }catch(error){if(running(job))recordError(job,filename,error,current.group)}
      }
    }catch(error){if(running(job)){recordError(job,current.path,error,current.group);if(current.path===result.path)result.status='failed'}}
  }
  if(running(job))result.status=result.errorCount?'partial':'completed'
  result.finishedAt??=Date.now();result.updatedAt=Date.now();result.pendingDirectories=0
}
export async function guardianStorageStart(args:{path?:unknown;root?:unknown}):Promise<GuardianStorageScan>{
  const presets:Record<string,string>={home:os.homedir(),downloads:path.join(os.homedir(),'Downloads'),documents:path.join(os.homedir(),'Documents')}
  if((args.path===undefined)===(args.root===undefined))throw Error('Choose an explicit local path or one preset: home, downloads, documents')
  const requested=args.root!==undefined?typeof args.root==='string'?presets[args.root]:undefined:args.path
  if(typeof requested!=='string'||!path.isAbsolute(requested))throw Error('Choose an absolute local directory path')
  const directory=await realpath(requested)
  if(!(await stat(directory)).isDirectory())throw Error('Choose a directory to scan')
  await access(directory,constants.R_OK|constants.X_OK)
  if([...jobs.values()].some(running))throw Error('Cancel the running storage scan before starting another')
  while(jobs.size>=4)jobs.delete(jobs.keys().next().value!)
  const now=Date.now(),id=randomUUID(),job:Job={entries:new Map(),result:{id,path:directory,status:'running',startedAt:now,updatedAt:now,finishedAt:null,bytes:0,files:0,directories:0,pendingDirectories:1,entries:[],largestFiles:[],otherBytes:0,otherEntries:0,skippedSymlinks:0,skippedSpecial:0,errorCount:0,errors:[]}}
  jobs.set(id,job);void scan(job)
  return guardianStorageStatus(id)
}
