let opener:((url:string)=>Promise<void>)|undefined
export function setExternalOpener(value:(url:string)=>Promise<void>){opener=value}
/** Headless clients receive the validated URL; the desktop optionally opens it. */
export async function openExternalUrl(value:string){
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw new Error('Only HTTP/HTTPS URLs are supported')
  await opener?.(url.href);return {url:url.href,opened:!!opener}
}
