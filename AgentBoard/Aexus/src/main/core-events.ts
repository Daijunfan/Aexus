export type CoreEvent={channel:string;payload:any;clientId?:string}
const listeners=new Set<(event:CoreEvent)=>void>()
export function onCoreEvent(listener:(event:CoreEvent)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function emitCoreEvent(event:CoreEvent){for(const listener of listeners)try{listener(event)}catch(error){console.error('Event subscriber failed:',(error as Error).message)}}
