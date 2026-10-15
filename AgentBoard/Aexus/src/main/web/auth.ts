import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {APP_HOME} from '../../shared/protocol'
import {authenticate} from '../agent-access'
import type {RequestContext} from '../../shared/management'

export type WebSession={id:string;digest:string;csrf:string;expires:number;clientId:string}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const invalidClient=()=>Object.assign(Error('Invalid browser client ID'),{status:400})
const unauthenticated=()=>Object.assign(Error('请登录 Avalon'),{code:'UNAUTHENTICATED',status:401})
export const browserClientId=(value:unknown):string|undefined=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(value)?value:undefined
/** A session established by a caller that named no browser client (CLI, script, or an older client). */
export const UNBOUND_CLIENT=''
/**
 * Several browser windows and several localhost Core instances share one cookie
 * jar, and cookies ignore the port. One shared cookie name therefore let a
 * window (or another instance) overwrite a session that another window kept
 * using, so a request was matched against a session its CSRF token did not
 * belong to. A named client now gets its own cookie for this instance, and a
 * request can only select the session of the client it claims to be. Sessions
 * that a caller never bound to a client stay in the legacy shared cookie, so
 * non-browser callers keep working; every browser path binds its client.
 */
export function createWebAuth(secure:boolean,instanceTag:()=>string){
  const sessions=new Map<string,WebSession>(),attempts=new Map<string,{count:number;until:number}>()
  const legacyCookie='agents_company_session',ttl=8*3600*1000
  const controlDigest=()=>digest(fs.readFileSync(path.join(APP_HOME,'control.token'),'utf8').trim())
  const attribute=(maxAge:number)=>`; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`
  const cookieName=(clientId:string)=>clientId?`${legacyCookie}_${instanceTag()}_${digest(clientId).slice(0,12)}`:legacyCookie
  function valid(session:WebSession){try{return sessions.get(session.id)===session&&session.expires>Date.now()&&session.digest===controlDigest()}catch{return false}}
  function requireClient(value:unknown){const client=browserClientId(value);if(!client)throw invalidClient();return client}
  const sent=(req:IncomingMessage,name:string)=>{
    const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)
    return raw?sessions.get(raw):undefined
  }
  function session(req:IncomingMessage,clientId?:string){
    const value=clientId?sent(req,cookieName(clientId)):undefined
    if(value){
      if(!valid(value))throw unauthenticated()
      if(value.clientId!==clientId)throw Object.assign(Error('Hosted client ID mismatch'),{status:403,code:'HOSTED_CLIENT_MISMATCH'})
      return value
    }
    // An unbound session is never another client's session, so presenting its
    // cookie is the same identification the legacy single-cookie protocol made.
    const shared=sent(req,legacyCookie)
    if(shared&&shared.clientId===UNBOUND_CLIENT&&valid(shared))return shared
    throw unauthenticated()
  }
  function cookie(res:ServerResponse,clientId:string,value:string,maxAge:number){
    const name=cookieName(clientId)
    const cookies=[`${name}=${value}${attribute(maxAge)}`]
    // Retire the shared name once a client is identified, so a cookie left by
    // an older build can never be selected alongside a bound session.
    if(name!==legacyCookie)cookies.push(`${legacyCookie}=${attribute(0)}`)
    res.setHeader('set-cookie',cookies)
  }
  function establish(res:ServerResponse,clientId:string){
    for(const [key,value] of sessions)if(!valid(value))sessions.delete(key)
    // Re-authorizing the same browser client (host ticket, or signing in again)
    // reuses its live session. Minting a second one used to rotate the cookie
    // underneath an already-mounted client, so every request holding the
    // previous CSRF token failed. The shared namespace is never reused, because
    // it carries no client identity that could own a second session.
    const existing=clientId?[...sessions.values()].find(value=>value.clientId===clientId):undefined
    if(existing){existing.expires=Date.now()+ttl;cookie(res,clientId,existing.id,ttl/1000);return {csrf:existing.csrf,expires:existing.expires,clientId}}
    if(sessions.size>=128)throw Object.assign(Error('Too many active browser sessions'),{status:429})
    const value:WebSession={id:randomBytes(32).toString('hex'),digest:controlDigest(),csrf:randomBytes(24).toString('hex'),expires:Date.now()+ttl,clientId}
    sessions.set(value.id,value);cookie(res,clientId,value.id,ttl/1000)
    return {csrf:value.csrf,expires:value.expires,clientId}
  }
  function login(req:IncomingMessage,res:ServerResponse,token:unknown,clientId:string|undefined){
    // A caller that names no client shares the legacy namespace; one that names
    // one must name a valid one.
    const client=clientId===undefined?UNBOUND_CLIENT:requireClient(clientId)
    const ip=req.socket.remoteAddress??'unknown',now=Date.now(),prior=attempts.get(ip)
    if(prior&&prior.until>now&&prior.count>=10)throw Object.assign(Error('Too many login attempts; retry in one minute'),{status:429})
    attempts.set(ip,{count:prior&&prior.until>now?prior.count+1:1,until:now+60000})
    for(const [key,value] of attempts)if(value.until<now)attempts.delete(key)
    if(typeof token!=='string'||token.length>512)throw Object.assign(Error('Invalid access token'),{status:401})
    const actual=Buffer.from(digest(token.trim()),'hex'),expected=Buffer.from(controlDigest(),'hex')
    if(!timingSafeEqual(actual,expected))throw Object.assign(Error('Invalid access token'),{status:401})
    attempts.delete(ip)
    return establish(res,client)
  }
  function hostedLogin(res:ServerResponse,clientId:unknown){
    return establish(res,requireClient(clientId))
  }
  function context(req:IncomingMessage,requestId:string):{context:RequestContext;session?:WebSession}{
    const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
    if(bearer){
      const caller=authenticate(bearer),client=req.headers['x-agents-client']
      if(client&&caller.principal.kind!=='operator')throw Object.assign(Error('Only the user can target a browser client'),{status:403})
      if(client&&!browserClientId(client))throw Object.assign(Error('Invalid browser client'),{status:400})
      return {context:{...caller,requestId,...(client?{clientId:String(client).startsWith('web-')?String(client):'web-'+client}:{})}}
    }
    const client=requireClient(req.headers['x-agents-client'])
    const value=session(req,client)
    if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers['x-agents-csrf']!==value.csrf)throw Object.assign(Error('Invalid CSRF token'),{status:403})
    return {context:{principal:{kind:'operator'},requestId,clientId:'web-'+client},session:value}
  }
  function logout(req:IncomingMessage,res:ServerResponse,clientId:string|undefined){
    const client=clientId===undefined?UNBOUND_CLIENT:requireClient(clientId)
    const value=session(req,client)
    sessions.delete(value.id);cookie(res,client,'',0)
    return value.id
  }
  function requestClient(req:IncomingMessage){return browserClientId(req.headers['x-agents-client'])}
  return {session,context,login,hostedLogin,logout,valid,requireClient,requestClient,clear:()=>sessions.clear()}
}
