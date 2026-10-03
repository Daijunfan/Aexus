import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {APP_HOME} from '../../shared/protocol'
import {authenticate} from '../agent-access'
import type {RequestContext} from '../../shared/management'

export type WebSession={id:string;digest:string;csrf:string;expires:number}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
export function createWebAuth(secure:boolean){
  const sessions=new Map<string,WebSession>(),attempts=new Map<string,{count:number;until:number}>()
  const cookieName='agents_company_session',ttl=8*3600*1000
  const controlDigest=()=>digest(fs.readFileSync(path.join(APP_HOME,'control.token'),'utf8').trim())
  function valid(session:WebSession){try{return sessions.get(session.id)===session&&session.expires>Date.now()&&session.digest===controlDigest()}catch{return false}}
  function session(req:IncomingMessage){
    const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
    const value=raw?sessions.get(raw):undefined
    if(!value||!valid(value))throw Object.assign(Error('请登录 Anexus'),{code:'UNAUTHENTICATED',status:401})
    return value
  }
  function cookie(res:ServerResponse,value:string,maxAge:number){res.setHeader('set-cookie',`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`)}
  function login(req:IncomingMessage,res:ServerResponse,token:unknown){
    const ip=req.socket.remoteAddress??'unknown',now=Date.now(),prior=attempts.get(ip)
    if(prior&&prior.until>now&&prior.count>=10)throw Object.assign(Error('Too many login attempts; retry in one minute'),{status:429})
    attempts.set(ip,{count:prior&&prior.until>now?prior.count+1:1,until:now+60000})
    for(const [key,value] of attempts)if(value.until<now)attempts.delete(key)
    if(typeof token!=='string'||token.length>512)throw Object.assign(Error('Invalid access token'),{status:401})
    const actual=Buffer.from(digest(token.trim()),'hex'),expected=Buffer.from(controlDigest(),'hex')
    if(!timingSafeEqual(actual,expected))throw Object.assign(Error('Invalid access token'),{status:401})
    for(const [key,value] of sessions)if(!valid(value))sessions.delete(key)
    if(sessions.size>=128)throw Object.assign(Error('Too many active browser sessions'),{status:429})
    const value={id:randomBytes(32).toString('hex'),digest:expected.toString('hex'),csrf:randomBytes(24).toString('hex'),expires:now+ttl}
    sessions.set(value.id,value);attempts.delete(ip);cookie(res,value.id,ttl/1000)
    return {csrf:value.csrf,expires:value.expires}
  }
  function context(req:IncomingMessage,requestId:string):{context:RequestContext;session?:WebSession}{
    const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
    if(bearer){
      const caller=authenticate(bearer),client=req.headers['x-agents-client']
      if(client&&caller.principal.kind!=='operator')throw Object.assign(Error('Only the user can target a browser client'),{status:403})
      if(client&&!/^[a-zA-Z0-9_-]{8,100}$/.test(String(client)))throw Object.assign(Error('Invalid browser client'),{status:400})
      return {context:{...caller,requestId,...(client?{clientId:String(client).startsWith('web-')?String(client):'web-'+client}:{})}}
    }
    const value=session(req)
    if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers['x-agents-csrf']!==value.csrf)throw Object.assign(Error('Invalid CSRF token'),{status:403})
    const client=String(req.headers['x-agents-client']??'')
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(client))throw Object.assign(Error('Invalid browser client ID'),{status:400})
    return {context:{principal:{kind:'operator'},requestId,clientId:'web-'+client},session:value}
  }
  function logout(req:IncomingMessage,res:ServerResponse){const value=session(req);sessions.delete(value.id);cookie(res,'',0);return value.id}
  return {session,context,login,logout,valid,clear:()=>sessions.clear()}
}
