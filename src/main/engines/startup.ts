import path from 'node:path'
import {homedir} from 'node:os'
import type {RemoteTarget} from '../../shared/remote'
const starting=new Map<string,Promise<void>>()
/** Serialize only startup handshakes sharing native state, never turns or tool execution. */
export async function acquireCodexStartup(remote?:RemoteTarget,profile?:string){
  const key=remote?JSON.stringify([remote.host,remote.port??22,remote.jump??'',remote.credentialId??'']):profile??process.env.CODEX_HOME??path.join(homedir(),'.codex')
  const previous=starting.get(key)??Promise.resolve()
  let release!:()=>void
  const current=new Promise<void>(resolve=>{release=resolve})
  const tail=previous.then(()=>current)
  starting.set(key,tail)
  await previous
  let done=false
  return ()=>{if(done)return;done=true;release();if(starting.get(key)===tail)starting.delete(key)}
}
