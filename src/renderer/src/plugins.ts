// Registered editors flush before host navigation or window close. The name remains compatible with plugin callers.
const flushers=new Set<()=>Promise<void>>()
export function onPluginFlush(flush:()=>Promise<void>) {flushers.add(flush);return()=>{flushers.delete(flush)}}
export async function flushPlugins() {await Promise.all([...flushers].map(flush=>flush()))}
