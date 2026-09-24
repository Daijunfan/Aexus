import {session,webContents,type WebContents} from 'electron'
import {readStore} from './store'
import {setWebChatCookieSink,setWebChatDesktopDriver} from './webchat'
import {callPlugin} from './plugins/runtime'

const assistants='[data-role="assistant"],[data-testid="assistant-message"],[data-message-author-role="assistant"],[class*="assistant-message"],.ds-markdown,.markdown-body'
const guests=new Map<string,WebContents>()
const storageByEmployee=new Map<string,Array<{origin:string;entries:Array<[string,string]>}>>(),applied=new Set<string>()
const syncTimers=new Map<string,ReturnType<typeof setTimeout>>()
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

export function attachChatterDesktop(){
  setWebChatCookieSink(async(id,cookies,storage)=>{
    storageByEmployee.set(id,storage)
    const jar=session.fromPartition('persist:agents-chatter-'+id).cookies
    for(const cookie of cookies){
      const domain=String(cookie.domain??'').replace(/^\./,''),path=String(cookie.path??'/')
      const hostOnly=String(cookie.name??'').startsWith('__Host-')
      await jar.set({url:`https://${domain}${hostOnly?'/':path}`,name:String(cookie.name),value:String(cookie.value),...(hostOnly?{}:{domain:String(cookie.domain)}),path:hostOnly?'/':path,
        secure:hostOnly||String(cookie.name??'').startsWith('__Secure-')||!!cookie.secure,httpOnly:!!cookie.httpOnly,sameSite:cookie.sameSite==='None'?'no_restriction':cookie.sameSite==='Strict'?'strict':'lax',
        ...(Number(cookie.expires)>0?{expirationDate:Number(cookie.expires)}:{})})
    }
    await jar.flushStore()
  })
  setWebChatDesktopDriver({
    attach(id,contentsId){
      const guest=webContents.fromId(contentsId)
      if(!guest||guest.isDestroyed()||guest.getType()!=='webview'||guest.session!==session.fromPartition('persist:agents-chatter-'+id))return false
      guests.set(id,guest)
      const scheduleSync=()=>{
        clearTimeout(syncTimers.get(id))
        syncTimers.set(id,setTimeout(()=>{void(async()=>{
          if(guest.isDestroyed())return
          const card=readStore().sessions.find(c=>c.id===id);if(!card?.chatProvider)return
          const allowed={doubao:['doubao.com'],deepseek:['deepseek.com'],chatgpt:['chatgpt.com','openai.com']}[card.chatProvider],origin=new URL(guest.getURL()).origin
          if(!allowed.some(domain=>new URL(origin).hostname===domain||new URL(origin).hostname.endsWith('.'+domain)))return
          const cookies=(await guest.session.cookies.get({})).filter(cookie=>allowed.some(domain=>cookie.domain===domain||String(cookie.domain??'').endsWith('.'+domain)))
            .map(cookie=>({name:cookie.name,value:cookie.value,domain:cookie.domain,path:cookie.path,secure:cookie.secure,httpOnly:cookie.httpOnly,expires:cookie.expirationDate??Date.now()/1000+7*86400,sameSite:cookie.sameSite==='no_restriction'?'None':cookie.sameSite==='strict'?'Strict':'Lax'}))
          const entries=await guest.executeJavaScript('Object.entries(localStorage)') as Array<[string,string]>
          await callPlugin('browser',card.cwd,'browser.chat.sync',{provider:card.chatProvider,cookies,storage:[{origin,entries}]})
        })().catch(()=>{})},1800))
      }
      const onCookie=()=>scheduleSync()
      guest.session.cookies.on('changed',onCookie)
      guest.on('did-navigate',scheduleSync).on('did-navigate-in-page',scheduleSync)
      guest.once('destroyed',()=>{if(guests.get(id)===guest)guests.delete(id);storageByEmployee.delete(id);for(const key of applied)if(key.startsWith(id+':'))applied.delete(key);guest.session.cookies.off('changed',onCookie);clearTimeout(syncTimers.get(id));syncTimers.delete(id)})
      const card=readStore().sessions.find(c=>c.id===id),url=guest.getURL(),origin=new URL(url).origin,entries=storageByEmployee.get(id)?.find(item=>item.origin===origin)?.entries
      const key=id+':'+guest.id+':'+origin
      if(card?.chatProvider==='deepseek'&&entries?.length&&!applied.has(key)){
        applied.add(key)
        void guest.executeJavaScript(`((pairs)=>{for(const [name,value] of pairs)localStorage.setItem(name,value)})(${JSON.stringify(entries)})`).then(()=>guest.loadURL('https://chat.deepseek.com/')).catch(()=>{})
      }
      return true
    },
    async send(id,text){
      const guest=guests.get(id),card=readStore().sessions.find(c=>c.id===id)
      if(!guest||guest.isDestroyed()||!card?.chatProvider)return null
      const host=new URL(guest.getURL()).hostname
      if(!({doubao:['www.doubao.com'],deepseek:['chat.deepseek.com'],chatgpt:['chatgpt.com']}[card.chatProvider] as string[]).includes(host)&&!(process.env.AGENTS_COMPANY_CHAT_TEST_URL_DEEPSEEK&&['127.0.0.1','localhost'].includes(host)))return null
      const title=await guest.executeJavaScript('document.title') as string
      if(/just a moment|verify you are human/i.test(title))throw new Error('网页要求真人验证；请在网页页签完成验证后再试')
      const selector=JSON.stringify(assistants)
      const before=await guest.executeJavaScript(`document.querySelectorAll(${selector}).length`) as number
      const focused=await guest.executeJavaScript(`(()=>{const nodes=[...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(node=>node.getClientRects().length);const input=nodes.at(-1);if(!input)return false;input.focus();if(input instanceof HTMLTextAreaElement)input.setSelectionRange(0,input.value.length);else{const range=document.createRange();range.selectNodeContents(input);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)}return true})()`) as boolean
      if(!focused)throw new Error('网页输入框不可用；请检查网页是否需要登录或真人验证')
      await guest.insertText(text)
      await guest.executeJavaScript(`(()=>{const input=document.activeElement;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true,cancelable:true}));input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}))})()`)
      let answer='',stable=0
      for(let step=0;step<300;step++){
        if(guest.isDestroyed())throw new Error('网页会话已关闭')
        const state=await guest.executeJavaScript(`(()=>{const all=document.querySelectorAll(${selector});return {count:all.length,text:all[all.length-1]?.innerText?.trim()||''}})()`) as {count:number;text:string}
        if(state.count>before&&state.text){stable=state.text===answer?stable+1:0;answer=state.text;if(stable>=5)return {text:answer,url:guest.getURL()}}
        await pause(400)
      }
      throw new Error('网页未返回可确认的回复；请检查网页会话')
    }
  })
}
