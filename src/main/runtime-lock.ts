import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {hostname} from 'node:os'
import {APP_HOME,SOCKET_PATH} from '../shared/protocol'
import {spawnSync} from 'node:child_process'
/** One writer per data directory, acquired before any startup migration. */
export function acquireRuntimeLock(){
  fs.mkdirSync(APP_HOME,{recursive:true,mode:0o700})
  const file=path.join(APP_HOME,'runtime.lock'),nonce=randomUUID()
  for(let retry=0;retry<2;retry++){
    try{
      const fd=fs.openSync(file,'wx',0o600)
      try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:hostname(),nonce}))}finally{fs.closeSync(fd)}
      break
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
      let old:{pid:number;host:string;nonce:string}
      try{old=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('Invalid runtime.lock; inspect the service before removing it')}
      if(old.host!==hostname())throw Error('Data directory is already owned by a different host')
      let alive=true;try{process.kill(old.pid,0)}catch(e){alive=(e as NodeJS.ErrnoException).code!=='ESRCH'}
      if(alive)throw Error('Agents Company already owns this data directory (PID '+old.pid+')')
      if(retry===1)throw Error('Runtime lock changed; retry startup')
      if(JSON.parse(fs.readFileSync(file,'utf8')).nonce!==old.nonce)throw Error('Runtime lock changed')
      fs.unlinkSync(file)
    }
  }
  const release=()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).nonce===nonce)fs.unlinkSync(file)}catch{}}
  // An older desktop may not yet have a lock. Probe its endpoint before migration.
  if(process.platform!=='win32'&&fs.existsSync(SOCKET_PATH)){
    const probe=spawnSync(process.execPath,['-e',`const s=require('node:net').connect(process.argv[1]);s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(2),1000)`,SOCKET_PATH],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:2000,stdio:'ignore'})
    if(probe.status!==1){release();throw Error('An existing service owns or is probing this data directory')}
  }
  process.once('exit',release)
  return ()=>{process.removeListener('exit',release);release()}
}
