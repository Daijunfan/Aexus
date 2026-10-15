// Host identity and network identity are independent of virtualization metadata.
export function connectionAddress(host){return String(host.host||'').split('@').at(-1).replace(/^\[|\]$/g,'')}
const ip=value=>typeof value==='string'&&(value.includes(':')?/^[\da-f:.]+(?:%[\w.-]+)?$/i.test(value):/^\d{1,3}(\.\d{1,3}){3}$/.test(value)&&value.split('.').every(n=>Number(n)<=255))
const local=value=>/^(127\.|169\.254\.|0\.0\.0\.0$|::1$|::$|fe[89ab][\da-f]:)/i.test(value)
export function hostAddresses(host){
  const endpoint=connectionAddress(host),info=host.info||{},preferred=new Set((info.routes||[]).map(route=>route.interface))
  const interfaces=[...(info.interfaces||[])].sort((a,b)=>Number(preferred.has(b.name))-Number(preferred.has(a.name)))
  const values=[endpoint,...interfaces.flatMap(n=>(n.addresses||[]).map(a=>a.address)),...(info.networks||[]).map(n=>n.address)]
  const addresses=[...new Set(values.filter(value=>ip(value)&&!local(value)))]
  if(addresses.length)return addresses
  const actual=[...interfaces.flatMap(n=>(n.addresses||[]).map(a=>a.address)),...(info.networks||[]).map(n=>n.address)]
  return [...new Set(actual.filter(value=>ip(value)&&!/^(127\.|0\.0\.0\.0$|::1$|::$)/.test(value)))]
}
export function hostAddress(host){return hostAddresses(host)[0]||'IP 待检测'}
