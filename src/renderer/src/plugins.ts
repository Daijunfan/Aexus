// A plugin flushes its own editor before the host closes its frame/window.
const flushers=new Set<()=>Promise<void>>()
export function onPluginFlush(flush:()=>Promise<void>) {flushers.add(flush);return()=>{flushers.delete(flush)}}
export async function flushPlugins() {await Promise.all([...flushers].map(flush=>flush()))}
