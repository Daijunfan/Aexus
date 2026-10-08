/** Bounded PDF text extraction shared by browser uploads and Core source verification.
 * No OCR, remote workers, or trust elevation: unreadable/scanned files fail explicitly.
 */
const MAX_PDF_BYTES=8*1024*1024
const MAX_PDF_PAGES=80
const MAX_PDF_CHARS=800_000
export const isPdf=(data)=>data instanceof Uint8Array&&data.length>=5&&Array.from(data.subarray(0,5),byte=>String.fromCharCode(byte)).join('')==='%PDF-'

export async function extractPdfText(data,{signal,maxChars=MAX_PDF_CHARS}={}){
 const bytes=data instanceof Uint8Array?data:new Uint8Array(data)
 if(bytes.byteLength>MAX_PDF_BYTES)throw Error('PDF 超过 8 MiB，无法安全解析')
 if(!isPdf(bytes))throw Error('文件缺少有效的 PDF 文件头')
 signal?.throwIfAborted()
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
 if(typeof window!=='undefined'){
  // The renderer bundles the worker as a local asset. No third-party CDN or remote script.
  pdfjs.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
 }
 const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true})
 try{
  const document=await loading.promise
  if(document.numPages>MAX_PDF_PAGES)throw Error('PDF 超过 80 页；无法完成全文核验')
  let value=''
  for(let i=1;i<=document.numPages;i++){
   signal?.throwIfAborted()
   const page=await document.getPage(i)
   const content=await page.getTextContent()
   const lines=content.items.map(item=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('')
   value+='\n'+lines
   page.cleanup()
   if(value.length>maxChars)throw Error('PDF 可提取文本过长，超过本次研究允许的字符数')
  }
  const normalized=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()
  if(normalized.length<18)throw Error('PDF 未包含足够的可提取文字；扫描件需要先经过 OCR')
  return normalized
 }catch(error){
  if(error?.name==='PasswordException')throw Error('受密码保护的 PDF 无法核验，请提供无密码版本')
  throw error
 }finally{
  await loading.destroy().catch(()=>{})
 }
}
