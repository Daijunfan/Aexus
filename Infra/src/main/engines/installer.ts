import fs from 'node:fs'
import spawn from 'cross-spawn'
import {resolveBinary,childEnv} from '../exec'
import {terminateTree} from '../platform'
import path from 'node:path'
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {x as unpack} from 'tar'
import {APP_HOME} from '../../shared/protocol'
import {isEngine,type EngineId} from '../../shared/engines'
import {applicationRoot} from '../resources'
import {setManagedEngine} from './configuration'
import {invalidateEngine} from './registry'
import {emitCoreEvent} from '../core-events'
import {exposeClaudeSdk} from './claude-sdk'

type Recipe={runtime?:'node';engine:EngineId;platform:string;arch:string;libc?:string;package:string;version:string;url:string;integrity:string;executable:string}
type PackageRecipe=Pick<Recipe,'package'|'version'|'url'|'integrity'|'executable'>
export type InstallJob={id:string;engine:EngineId;state:'running'|'succeeded'|'failed'|'cancelled';startedAt:number;finishedAt?:number;log:string;error?:string;path?:string;downloadedBytes:number}
const jobs=new Map<string,{job:InstallJob;controller:AbortController;done:Promise<void>}>()
function recipe(engine:EngineId):Recipe&{sdk?:PackageRecipe}{
  if(!isEngine(engine))throw Error('Unsupported engine')
  const manifest=JSON.parse(fs.readFileSync(path.join(applicationRoot(),'Infra/src/resources/engine-downloads.json'),'utf8')) as {schemaVersion:number;entries:Recipe[];claudeSdk:PackageRecipe}
  if(manifest.schemaVersion!==1)throw Error('Unknown engine download manifest')
  const musl=process.platform==='linux'&&!(process.report.getReport() as any).header?.glibcVersionRuntime
  const candidates=manifest.entries.filter(item=>item.engine===engine&&item.platform===process.platform&&item.arch===process.arch)
  const found=musl&&engine==='claude'?candidates.find(item=>item.libc==='musl'):candidates.find(item=>!item.libc)
  if(!found)throw Error(`No verified native ${engine} download for ${process.platform}/${process.arch}. Configure an existing executable instead.`)
  validatePackage(found)
  if(engine==='claude'){validatePackage(manifest.claudeSdk);return {...found,sdk:manifest.claudeSdk}}
  return found
}
function validatePackage(found:PackageRecipe){
  const url=new URL(found.url)
  if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||url.username||url.password||!/^sha512-[A-Za-z0-9+/]+=*$/.test(found.integrity))throw Error('Invalid official download manifest')
  if(path.isAbsolute(found.executable)||found.executable.split(/[\\/]/).includes('..'))throw Error('Invalid engine executable path')
}

export function engineInstallPlan(engine:EngineId){const plan=recipe(engine);return {...plan,target:'Core host',directory:path.join(APP_HOME,'engines',engine),requires:plan.runtime==='node'?['Node.js >=22.19 and npm on the Core host']:[],changesGlobalPath:false,runsPackageScripts:false,verification:'Committed SHA-512',nativeDownload:plan.runtime!=='node'}}
export function installEngine(engine:EngineId,confirmed:boolean){
  const plan=recipe(engine)
  if(confirmed!==true)throw Error('Review engine.install-plan and explicitly confirm installation')
  const active=[...jobs.values()].find(value=>value.job.engine===engine&&value.job.state==='running');if(active)return {...active.job}
  if([...jobs.values()].some(value=>value.job.state==='running'))throw Error('Another Coding Agent installation is running; wait for it to finish')
  const id=randomUUID(),directory=path.join(APP_HOME,'engines',engine,plan.version+'-'+id),controller=new AbortController()
  const job:InstallJob={id,engine,state:'running',startedAt:Date.now(),log:'下载官方原生程序；不需要额外安装 Node/npm，不修改全局 PATH。\n',downloadedBytes:0}
  const entry={job,controller,done:Promise.resolve()};jobs.set(id,entry)
  const changed=()=>emitCoreEvent({channel:'engine:install',payload:{...job}})
  entry.done=(async()=>{
    const timer=setTimeout(()=>controller.abort(Error('安装超过 5 分钟，已停止')),300000)
    try{
      const executable=await downloadPackage(plan,directory,controller,job,changed)
      if(plan.runtime==='node')await installNodeDependencies(directory,controller,job,changed)
      const sdkPath=plan.sdk?await downloadPackage(plan.sdk,path.join(directory,'sdk'),controller,job,changed):undefined
      controller.signal.throwIfAborted();setManagedEngine(engine,executable,sdkPath);invalidateEngine(engine);exposeClaudeSdk()
      job.path=executable;job.state='succeeded';job.log+='安装完成。已有任务不重启；新建或重新打开会话时使用新程序。\n'
    }catch(error){
      job.state=controller.signal.aborted&&controller.signal.reason?.message==='安装已取消'?'cancelled':'failed'
      job.error=String((controller.signal.aborted?controller.signal.reason:error)?.message??error)
      try{fs.rmSync(directory,{recursive:true,force:true})}catch{}
    }finally{clearTimeout(timer);job.finishedAt=Date.now();changed()}
  })()
  changed();for(const [key,value] of jobs)if(jobs.size>32&&value.job.state!=='running')jobs.delete(key)
  return {...job}
}

async function downloadPackage(plan:PackageRecipe,directory:string,controller:AbortController,job:InstallJob,changed:()=>void){
  const archive=directory+'.tgz'
  try{
      fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700})
      const response=await fetch(plan.url,{signal:controller.signal,redirect:'error'})
      if(!response.ok||!response.body)throw Error('官方下载失败：HTTP '+response.status)
      const length=Number(response.headers.get('content-length')??0)
      if(length>400*1024*1024)throw Error('Engine archive exceeds the download size limit')
      const digest=createHash('sha512');let progressAt=0
      const monitor=new Transform({transform(chunk,_encoding,callback){
        job.downloadedBytes+=chunk.length
        if(job.downloadedBytes>400*1024*1024){callback(Error('Engine archive exceeds the download size limit'));return}
        digest.update(chunk)
        if(Date.now()-progressAt>300){progressAt=Date.now();changed()}
        callback(null,chunk)
      }})
      await pipeline(Readable.fromWeb(response.body as any),monitor,fs.createWriteStream(archive,{flags:'wx',mode:0o600}),{signal:controller.signal})
      const actual=digest.digest(),expected=Buffer.from(plan.integrity.slice('sha512-'.length),'base64')
      if(expected.length!==actual.length||!timingSafeEqual(actual,expected))throw Error('Checksum mismatch; the downloaded engine was not installed')
      job.log+='SHA-512 校验通过。解压并检查原生程序…\n';changed()
      controller.signal.throwIfAborted();fs.mkdirSync(directory,{recursive:false,mode:0o700})
      await unpack({file:archive,cwd:directory,strip:1,strict:true,preservePaths:false,noMtime:true,
        filter(name,entry){
          controller.signal.throwIfAborted()
          if(name.includes('\\')||path.posix.isAbsolute(name)||name.split('/').includes('..')||!/^package(?:\/|$)/.test(name))throw Error('Unsafe path in engine archive')
          if(!['File','Directory','OldFile','ContiguousFile'].includes('type' in entry?entry.type:''))throw Error('Engine archives cannot contain filesystem links or device files')
          return true
        }})
      controller.signal.throwIfAborted()
      const metadata=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'))
      if(metadata.name!==plan.package||metadata.version!==plan.version)throw Error('Downloaded engine identity differs from the approved recipe')
      const executable=path.join(directory,plan.executable),actualPath=fs.realpathSync(executable)
      if(!actualPath.startsWith(fs.realpathSync(directory)+path.sep)||!fs.statSync(actualPath).isFile())throw Error('Invalid native engine executable')
      if(process.platform!=='win32')fs.chmodSync(executable,0o755)
    return executable
  }finally{fs.rmSync(archive,{force:true})}
}
export function installationStatus(id:string){const value=jobs.get(id);if(!value)throw Error('Unknown installation');return {...value.job}}
export async function cancelInstallation(id:string){const value=jobs.get(id);if(!value)throw Error('Unknown installation');if(value.job.state==='running'){value.controller.abort(Error('安装已取消'));await value.done};return {...value.job}}
export async function closeInstallations(){await Promise.all([...jobs.keys()].map(cancelInstallation))}

/** Pi publishes a shrinkwrap; install its pinned dependencies without lifecycle scripts. */
async function installNodeDependencies(directory:string,controller:AbortController,job:InstallJob,changed:()=>void){
  if(!fs.existsSync(path.join(directory,'npm-shrinkwrap.json')))throw Error('Pi package is missing its pinned dependency manifest')
  // Published Pi shrinkwrap locks runtime dependencies; source-only dev tools are not included.
  const metadataPath=path.join(directory,'package.json'),metadata=JSON.parse(fs.readFileSync(metadataPath,'utf8'))
  delete metadata.devDependencies;fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n')
  const npm=resolveBinary('npm');if(npm==='npm')throw Error('Pi requires Node.js >=22.19 and npm on the Core host')
  controller.signal.throwIfAborted()
  job.log+='安装 Pi 锁定的依赖（禁用安装脚本）…\n';changed()
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(npm,['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--registry','https://registry.npmjs.org'],{cwd:directory,env:childEnv(),stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'})
    let output='';const cancel=()=>terminateTree(child,true);controller.signal.addEventListener('abort',cancel,{once:true})
    const collect=(data:Buffer)=>{output=(output+String(data)).slice(-8192)};child.stdout?.on('data',collect);child.stderr?.on('data',collect)
    child.once('error',error=>{controller.signal.removeEventListener('abort',cancel);reject(error)})
    child.once('close',code=>{controller.signal.removeEventListener('abort',cancel);code===0?resolve():reject(Error('Pi dependency installation failed: '+output))})
  })
}
