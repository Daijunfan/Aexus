import {spawn, type ChildProcess} from 'node:child_process'
import os from 'node:os'
import {applicationVersion} from './resources'
export const hostOS=()=>process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux'
export const runtimeInfo=()=>({version:applicationVersion(),os:hostOS(),arch:process.arch,hostname:os.hostname(),node:process.versions.node,desktop:!!process.versions.electron,strictIsolation:process.platform==='darwin',apiVersion:1,features:{terminal:true,plugins:true,engineInstall:true,nativeScreenshot:!!process.versions.electron,localFilePaths:!!process.versions.electron}})
/** Terminate only the process tree owned by this handle, never engines by image name. */
export function terminateTree(child:ChildProcess,force=false){
  if(!child.pid)return
  if(process.platform==='win32'){
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T',...(force?['/F']:[])],{stdio:'ignore',windowsHide:true})
    killer.on('error',()=>child.kill())
    return
  }
  try{process.kill(-child.pid,force?'SIGKILL':'SIGTERM')}catch{try{child.kill(force?'SIGKILL':'SIGTERM')}catch{}}
}
export function windowsLauncher(executable:string,script:string,args:string[]=[]){
  const quote=(value:string)=>'"'+value.replaceAll('%','%%').replaceAll('"','')+'"'
  return '@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n'+[executable,script,...args].map(quote).join(' ')+' %*\r\n'
}
