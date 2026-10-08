import {assertSourceAllowed} from './policy.mjs'
import {prepare,DOCUMENT_LIMITS} from './documents.mjs'
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import {createHash} from 'node:crypto'
import {extractPdfText,isPdf} from './document.mjs'

const blocked=new net.BlockList()
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4')
for(const [address,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]])blocked.addSubnet(address,prefix,'ipv6')
export const publicAddress=address=>!!net.isIP(address)&&!blocked.check(address,net.isIP(address)===6?'ipv6':'ipv4')
export function publicURL(value){
 const url=new URL(value)
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port)||/^(localhost|.*\.localhost|.*\.local)$/i.test(url.hostname))throw Error('仅允许公开 HTTP(S) 来源')
 const literal=url.hostname.replace(/^\[|\]$/g,'');if(net.isIP(literal)&&!publicAddress(literal))throw Error('拒绝私网与本机资料地址')
 url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/i.test(key))url.searchParams.delete(key)
 return url.href
}
export const normalize=value=>String(value).normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim()
const decode=value=>value.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):' '}).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—'}[name]))
export const pageText=html=>normalize(decode(html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]+>/g,' ')))
export const sourceQuote=value=>Array.from(normalize(value).split(' ').slice(0,25).join(' ')).slice(0,180).join('')
/** DNS is validated at the actual socket lookup, including every redirect. */
function retrieve(value,signal,redirects=0,policy={}){
 const url=assertSourceAllowed(publicURL(value),policy)
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted()
  const request=(url.startsWith('https:')?https:http).request(url,{method:'GET',signal,headers:{'user-agent':'Aexus-DeepResearch/1.0 (+source-verification)','accept':'text/html,text/plain,application/json,application/pdf','accept-encoding':'identity'},lookup:(hostname,options,callback)=>{
   dns.lookup(hostname,{all:true},(error,addresses)=>{
    if(error)return callback(error)
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))return callback(Error('资料主机解析到私网地址'))
    if(options?.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family)
   })
  }},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){
    response.resume();if(redirects>=3||!response.headers.location){reject(Error('资料重定向过多'));return}
    resolve(retrieve(new URL(response.headers.location,url).href,signal,redirects+1,policy));return
   }
   if(response.statusCode!==200){response.resume();reject(Error('资料请求返回 HTTP '+response.statusCode));return}
   const mediaType=String(response.headers['content-type']??'').split(';')[0].trim().toLowerCase()
   const html=/^(?:text\/(?:html|plain)|application\/(?:json|xhtml\+xml))$/.test(mediaType)
   const pdf=/^(?:application\/pdf|application\/octet-stream|binary\/octet-stream)$/.test(mediaType)||/\.pdf$/i.test(new URL(url).pathname)
   if(!html&&!pdf){response.resume();reject(Error('暂不能独立核验此格式，请提供 HTML、文本或带文本层的 PDF'));return}
   const limit=pdf?8*1024*1024:4*1024*1024
   let size=0;const chunks=[]
   response.on('data',chunk=>{size+=chunk.length;if(size>limit){request.destroy(Error(pdf?'PDF 超过 8 MiB':'资料页面超过 4 MiB'));return}chunks.push(chunk)})
   response.on('error',reject);response.on('end',()=>{
    const data=Buffer.concat(chunks),asPdf=isPdf(data)
    if(!html&&!asPdf){reject(Error('文件缺少可解析的 PDF 结构'));return}
    resolve({url,body:asPdf?'':data.toString('utf8'),data,mediaType:asPdf?'application/pdf':mediaType,bytes:size})
   })
  })
  const deadline=setTimeout(()=>request.destroy(Error('资料核验超过总时限')),20000);deadline.unref?.();request.once('close',()=>clearTimeout(deadline));
  request.on('error',reject);request.setTimeout(15000,()=>request.destroy(Error('资料核验超时')));request.end()
 })
}
async function parsedSource(fetched,signal){
 if(fetched.text)return fetched
 const raw=fetched.data??fetched.body
 const pdf=isPdf(raw)
 if(!pdf){if(fetched.mediaType==='application/pdf')throw Error('PDF 文件头无效');return fetched}
 const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw)
 if(bytes.length>8*1024*1024)throw Error('PDF 超过 8 MiB')
 let text,document
 if(bytes.length<=DOCUMENT_LIMITS.fileBytes){
  const parsed=await prepare({files:[{name:'source.pdf',encoding:'base64',content:bytes.toString('base64')}]},{signal})
  text=parsed.materials[0].text;document=parsed.materials[0].provenance
 }else{text=await extractPdfText(bytes,{signal})}
 return {...fetched,body:'',data:bytes,mediaType:'application/pdf',text,document}
}
export async function readSource(url,{signal,policy={}}={}){return parsedSource(await retrieve(url,signal,0,policy),signal)}
export async function verifySource(candidate,{signal,read,policy={}}={}){
 const url=assertSourceAllowed(publicURL(candidate.url),policy),fullQuote=normalize(candidate.quote),quote=sourceQuote(fullQuote)
 if(!fullQuote||fullQuote.length>350)throw Error('证据摘录缺失或过长')
 if(quote.length<18)throw Error('证据摘录过短，无法可靠核对')
 const response=await (read?read(url,signal):readSource(url,{signal,policy}))
 assertSourceAllowed(publicURL(response.url),policy)
 const fetched=await parsedSource(response,signal),pdf=fetched.mediaType==='application/pdf'
 const body=fetched.text?normalize(fetched.text):/^(?:text\/plain|application\/json)$/.test(fetched.mediaType??'')?normalize(fetched.body):pageText(fetched.body)
 if(!body.toLocaleLowerCase().includes(fullQuote.toLocaleLowerCase()))throw Error('来源页面未找到所引摘录；该引用不得进入最终报告')
 const title=normalize(decode(pdf?candidate.title:(String(fetched.body).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??candidate.title)))
 return {url,finalUrl:publicURL(fetched.url),title:title.slice(0,300),quote,sourceType:candidate.sourceType==='primary'?'primary':'secondary',format:pdf?'pdf':'web',retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(fetched.data??fetched.body).digest('hex'),bytes:fetched.bytes,verification:'excerpt-found',...(fetched.document?{document:fetched.document,locator:documentLocator(fetched.text,fullQuote)}:{}),...(candidate.publishedAt?{reportedPublishedAt:String(candidate.publishedAt).slice(0,80)}:{})}
}

function documentLocator(text,quote){
 const pages=[...String(text).matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]|$)/g)]
 const page=pages.find(([,number,body])=>normalize(body).toLocaleLowerCase().includes(quote.toLocaleLowerCase()))
 return page?{page:Number(page[1])}:null
}
