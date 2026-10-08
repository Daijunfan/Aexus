/** Shared by the UI, CLI and runtime. No provider credentials or host-local paths. */
export const DEPTHS=Object.freeze({
 standard:{label:'标准研究',minSources:4,minDomains:2,minFindings:3,repairRounds:2,taskMinutes:12},
 deep:{label:'深入研究',minSources:8,minDomains:3,minFindings:6,repairRounds:3,taskMinutes:18},
 exhaustive:{label:'广泛研究',minSources:12,minDomains:4,minFindings:8,repairRounds:4,taskMinutes:24}
})
export function depthConfig(value='standard'){
 if(typeof value!=='string'||!Object.hasOwn(DEPTHS,value))throw Error('请选择有效的研究深度')
 return DEPTHS[value]
}
const array=(value,label,max)=>{if(!Array.isArray(value)||value.length>max)throw Error(label+' 数量无效');return value}
function domain(value){
 if(typeof value!=='string'||value.length>253)throw Error('来源域名无效')
 const host=value.trim().toLowerCase().replace(/^\*\./,'').replace(/\.$/,'')
 if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)||/(^|\.)(localhost|local|internal)$/.test(host))throw Error('请填写公开网站域名，不含路径、端口或凭据：'+value)
 return host
}
export function sourcePolicy(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['allowedDomains','preferredDomains','excludedDomains','seedUrls'].includes(k)))throw Error('来源范围格式无效')
 const result={}
 for(const name of ['allowedDomains','preferredDomains','excludedDomains'])result[name]=[...new Set(array(input[name]??[],name,20).map(domain))]
 result.seedUrls=[...new Set(array(input.seedUrls??[],'起始来源',12).map(value=>{
  if(typeof value!=='string'||value.length>2000)throw Error('起始链接无效')
  const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('起始来源必须是公开网页');u.hash='';return u.href
 }))]
 for(const url of result.seedUrls)assertSourceAllowed(url,result)
 return result
}
const matches=(host,rule)=>host===rule||host.endsWith('.'+rule)
export function assertSourceAllowed(value,policy={}){
 const host=new URL(value).hostname.toLowerCase().replace(/\.$/,'')
 if((policy.excludedDomains??[]).some(rule=>matches(host,rule)))throw Error('来源被排除：'+host)
 if(policy.allowedDomains?.length&&!policy.allowedDomains.some(rule=>matches(host,rule)))throw Error('来源不在允许的网站范围：'+host)
 return value
}
export function materials(input=[]){
 let total=0
 return array(input,'参考材料',6).map(item=>{
  if(!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>160||typeof item.text!=='string'||!item.text.trim()||item.text.length>80000)throw Error('参考材料需要文件名和正文，单份最多 80,000 字符')
  if(!/\.(txt|md|csv|json)$/i.test(item.name)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(item.text))throw Error('仅支持 UTF-8 TXT、Markdown、CSV、JSON 文本材料')
  total+=item.text.length;if(total>200000)throw Error('参考材料总计不能超过 200,000 字符')
  return {name:item.name.trim().replace(/[\\/]/g,'_'),text:item.text}
 })
}
