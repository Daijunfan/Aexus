/** Node worker threads use physical paths; Electron's main-process ASAR loader is not inherited. */
export function workerURL(name){
 if(!['document-worker.mjs','export-worker.mjs'].includes(name))throw Error('Unknown research document worker')
 const url=new URL(name,import.meta.url)
 url.pathname=url.pathname.replace('/app.asar/','/app.asar.unpacked/')
 return url
}
