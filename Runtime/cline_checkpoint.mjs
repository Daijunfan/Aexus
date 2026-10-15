// Native Cline checkpoint records, with Git storage on the execution host.
// Snapshot construction follows Cline's stash format, including its third
// parent for untracked files. The installed SDK performs restore validation.
import {execFile as checkpointExec} from 'node:child_process';
import {promisify as checkpointPromisify} from 'node:util';
import * as checkpointFs from 'node:fs/promises';
import checkpointPath from 'node:path';
import {createHash as checkpointHash} from 'node:crypto';
const runGit=checkpointPromisify(checkpointExec);
const git=async(cwd,args,env)=> (await runGit('git',['-C',cwd,...args],{env:env?{...process.env,...env}:process.env,windowsHide:true,maxBuffer:64*1024*1024})).stdout.trim();
const refName=(sessionId,runCount)=>{
 if(!/^[a-zA-Z0-9_-]+$/.test(sessionId)||!Number.isInteger(runCount)||runCount<1)throw Error('Invalid native checkpoint identity');
 return `refs/cline/checkpoints/${sessionId}/${runCount}`;
};
async function snapshot(sdk,cwd,{sessionId,runCount}){
 const reference=refName(sessionId,runCount);
 try{if(await git(cwd,['rev-parse','--is-inside-work-tree'])!=='true')return null}catch{return null}
 let head;try{head=await git(cwd,['rev-parse','HEAD'])}catch{return null}
 const label=`cline checkpoint ${sessionId} run=${runCount}`;
 let stash=await git(cwd,['stash','create',label]);
 const untracked=(await runGit('git',['-C',cwd,'ls-files','--others','--exclude-standard','-z'],{windowsHide:true,maxBuffer:64*1024*1024})).stdout;
 if(untracked){
  const folder=checkpointPath.join(sdk.resolveClineDataDir(),'native-checkpoints',checkpointHash('sha256').update(cwd+'\0'+sessionId).digest('hex'));
  await checkpointFs.mkdir(folder,{recursive:true,mode:0o700});
  try{
  const index=checkpointPath.join(folder,'index'),spec=checkpointPath.join(folder,'paths');
  // Rebuild only this private index; the user's staging area is never touched.
  await checkpointFs.rm(index,{force:true});await checkpointFs.writeFile(spec,untracked,{mode:0o600});
  const environment={GIT_INDEX_FILE:index};
  await git(cwd,['-c','core.splitIndex=false','add','--force','--pathspec-from-file',spec,'--pathspec-file-nul'],environment);
  const tree=await git(cwd,['write-tree'],environment),files=await git(cwd,['commit-tree',tree,'-m','untracked files on cline checkpoint'],environment);
  const workTree=await git(cwd,['rev-parse',stash?`${stash}^{tree}`:'HEAD^{tree}']);
  const parent=stash?await git(cwd,['rev-parse',`${stash}^1`]):head;
  const staged=stash?await git(cwd,['rev-parse',`${stash}^2`]):await git(cwd,['commit-tree',workTree,'-p',head,'-m','index on cline checkpoint']);
  stash=await git(cwd,['commit-tree',workTree,'-p',parent,'-p',staged,'-p',files,'-m',label]);
  }finally{await checkpointFs.rm(folder,{recursive:true,force:true})}
 }
 const result={ref:stash||head,createdAt:Date.now(),runCount,kind:stash?'stash':'commit'};
 await git(cwd,['update-ref',reference,result.ref]);return result;
}
export async function checkpointOperation(sdk,cwd,{operation,...args}){
 if(operation==='create')return snapshot(sdk,cwd,args);
 if(operation==='restore'||operation==='rollback'){
  const checkpoint=args.checkpoint;
  const session={sessionId:args.sessionId,cwd,workspaceRoot:cwd,metadata:{checkpoint:{latest:checkpoint,history:[checkpoint]}}};
  const result=await new sdk.SessionVersioningService().restoreCheckpoint({sessionId:args.sessionId,checkpointRunCount:checkpoint.runCount,cwd,
   restore:{messages:false,workspace:true},getSession:async()=>session,readMessages:async()=>[]});
  if(operation==='rollback')await git(cwd,['read-tree',checkpoint.kind==='stash'?checkpoint.ref+'^2':checkpoint.ref]);
  return {checkpoint:result.checkpoint};
 }
 if(operation==='release'){
  await git(cwd,['update-ref','-d',refName(args.sessionId,args.runCount)]);
  const folder=checkpointPath.join(sdk.resolveClineDataDir(),'native-checkpoints',checkpointHash('sha256').update(cwd+'\0'+args.sessionId).digest('hex'));
  await checkpointFs.rm(folder,{recursive:true,force:true});return true;
 }
 if(operation==='retain'){
  for(const entry of args.history)await git(cwd,['update-ref',refName(args.sessionId,entry.runCount),entry.ref]);
  return true;
 }
 throw Error('Unsupported native checkpoint operation');
}
