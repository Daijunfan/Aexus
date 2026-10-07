import {decodeBase64,DOCX_MIME} from './document.mjs'
export const ENGINE_ID='profile-improvement'
export async function startProfile(client,input,clientRequestId){
 if(!clientRequestId)throw Error('缺少本次提交标识。')
 return client.invoke('workflow.start',{engineId:ENGINE_ID,input,clientRequestId})
}
export async function readWord(client,jobId,file){
 if(!file||!file.name?.endsWith('.docx')||file.mediaType!==DOCX_MIME)throw Error('交付文件格式不正确。')
 const result=await client.invoke('workflow.file',{id:jobId,name:file.name})
 if(result.encoding!=='base64')throw Error('当前 Infra 不支持二进制 Word 交付，请更新公开 workflow 文件接口。')
 const bytes=decodeBase64(result.content),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')
 if(bytes.length!==file.bytes||hash!==file.sha256||result.sha256!==file.sha256)throw Error('Word 下载完整性校验失败，请重新读取。')
 return bytes
}
