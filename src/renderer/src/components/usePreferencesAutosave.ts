import {useCallback,useEffect,useRef,useState} from 'react'
import {PRESENTATION_VIEWS,type PreferencesPatch} from '../../../shared/preferences'
import {onPluginFlush} from '../plugins'

function mergePatch(previous:PreferencesPatch,next:PreferencesPatch):PreferencesPatch{
 const patch={...previous,...next}
 if(next.viewAppearance){
  patch.viewAppearance={...previous.viewAppearance}
  for(const view of PRESENTATION_VIEWS)if(next.viewAppearance[view])patch.viewAppearance[view]={...previous.viewAppearance?.[view],...next.viewAppearance[view]}
 }
 return patch
}

/** A late acknowledgement must not remove a newer local choice. */
function acknowledge(changes:PreferencesPatch,sent:PreferencesPatch):PreferencesPatch{
 const {viewAppearance,...shared}=changes
 const patch:PreferencesPatch=Object.fromEntries(Object.entries(shared).filter(([key,next])=>next!==sent[key as keyof PreferencesPatch]))
 for(const view of PRESENTATION_VIEWS){
  const fields=viewAppearance?.[view]
  if(!fields)continue
  const changed=Object.fromEntries(Object.entries(fields).filter(([key,next])=>next!==sent.viewAppearance?.[view]?.[key as 'theme'|'themeColor']))
  if(Object.keys(changed).length)(patch.viewAppearance??={})[view]=changed
 }
 return patch
}

/** Serialize small preference patches; drag input is coalesced and flushed when the panel closes. */
export function usePreferencesAutosave(onSave:(patch:PreferencesPatch)=>Promise<unknown>){
 const [changes,setChanges]=useState<PreferencesPatch>({}),[status,setStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle'),[error,setError]=useState('')
 const save=useRef(onSave),pending=useRef<PreferencesPatch>({}),running=useRef<Promise<boolean>|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),mounted=useRef(true)
 save.current=onSave
 const flush=useCallback(()=>{
  if(running.current)return running.current
  if(!Object.keys(pending.current).length)return Promise.resolve(true)
  running.current=Promise.resolve().then(async()=>{
   if(mounted.current){setStatus('saving');setError('')}
   while(Object.keys(pending.current).length&&!timer.current){
    const batch=pending.current;pending.current={}
    try{
     if(!await save.current(batch))throw Error('Settings could not be saved. Your changes are still here.')
     if(mounted.current)setChanges(previous=>acknowledge(previous,batch))
    }
    catch(cause){
     pending.current=mergePatch(batch,pending.current)
     clearTimeout(timer.current);timer.current=undefined
     if(mounted.current){setStatus('error');setError((cause as Error).message)}
     return false
    }
   }
   if(mounted.current&&!Object.keys(pending.current).length)setStatus('saved')
   return true
  }).finally(()=>{running.current=undefined})
  return running.current
 },[])
 const finish=useCallback(async()=>{
  do{clearTimeout(timer.current);timer.current=undefined;if(!await flush())return false}while(Object.keys(pending.current).length)
  return true
 },[flush])
 const update=(patch:PreferencesPatch,delay=0)=>{
  setChanges(previous=>mergePatch(previous,patch));pending.current=mergePatch(pending.current,patch)
  setStatus('saving');setError('');clearTimeout(timer.current);timer.current=undefined
  if(delay)timer.current=setTimeout(()=>{timer.current=undefined;void flush()},delay)
  else void flush()
 }
 const retry=()=>{clearTimeout(timer.current);timer.current=undefined;void flush()}
 useEffect(()=>onPluginFlush(async()=>{if(!await finish())throw Error('Settings could not be saved. Your changes are still here.')}),[finish])
 useEffect(()=>{
  mounted.current=true
  return()=>{mounted.current=false;const delayed=timer.current!==undefined;clearTimeout(timer.current);timer.current=undefined;if(delayed)void flush()}
 },[flush])
 return {changes,update,status,error,retry,flush:finish}
}
