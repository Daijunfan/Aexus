const STORAGE_KEY='agents-company-client'
const LOCK_PREFIX='aexus-web-client:'

/** sessionStorage is cloned into new windows. A document-held lock distinguishes
 * that clone from a reload, without sharing the selected Engine between windows.
 * Browsers without Web Locks use a fresh document identity and fail closed.
 */
export async function acquireWebClientId():Promise<string>{
 const fresh=()=>crypto.randomUUID()
 const remember=(id:string)=>{try{sessionStorage.setItem(STORAGE_KEY,id)}catch{};return id}
 let saved:string|null=null
 try{saved=sessionStorage.getItem(STORAGE_KEY)}catch{}
 if(!navigator.locks?.request)return remember(fresh())
 const claim=(id:string)=>new Promise<boolean>(resolve=>{
  void navigator.locks.request(LOCK_PREFIX+id,{ifAvailable:true},async lock=>{
   if(!lock){resolve(false);return}
   resolve(true)
   // The browser releases this lock when the owning document is destroyed.
   await new Promise<void>(()=>{})
  }).catch(()=>resolve(false))
 })
 if(saved&&/^[a-f0-9-]{36}$/.test(saved)&&await claim(saved))return remember(saved)
 const id=fresh()
 await claim(id)
 return remember(id)
}
