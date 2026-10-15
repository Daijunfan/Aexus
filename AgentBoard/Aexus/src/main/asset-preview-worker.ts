import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {parentPort,workerData} from 'node:worker_threads'
import {createCanvas,loadImage,GlobalFonts,type Canvas,type SKRSContext2D} from '@napi-rs/canvas'
import {parse} from 'parse5'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import {workspacePath} from './files'

// The original Reader cover renderer, owned by Core without its plugin/runtime.
type PreviewInput={workspace:string;filename:string;format:string;expectedVersion:string}
type ArticleNode={tagName?:string;value?:string;children?:ArticleNode[];childNodes?:ArticleNode[];attrs?:{name:string;value:string}[];properties?:Record<string,unknown>}
const markdown=unified().use(remarkParse).use(remarkGfm).use(remarkRehype)
// Canvas loads system fonts, but its generic sans fallback may lack Simplified Han.
const family=['PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Noto Sans SC','Arial Unicode MS','Heiti SC','Heiti TC'].find(name=>GlobalFonts.has(name))
const font=family?`"${family}", sans-serif`:'sans-serif'
const words=new Intl.Segmenter(undefined,{granularity:'word'})
const ignored=new Set(['script','style','nav','footer','iframe','object','embed','form'])
const children=(node:ArticleNode)=>node.children??node.childNodes??[]
const text=(node:ArticleNode):string=>ignored.has(node.tagName??'')?'':node.value??children(node).map(text).join('')
const nodes=(node:ArticleNode):ArticleNode[]=>ignored.has(node.tagName??'')?[]:[node,...children(node).flatMap(nodes)]
const attribute=(node:ArticleNode,name:string)=>String(node.properties?.[name]??node.attrs?.find(value=>value.name===name)?.value??'')
async function imageResult(canvas:Canvas,extra:Record<string,unknown>={}){
  return {kind:'image',mimeType:'image/png',width:canvas.width,height:canvas.height,contentBase64:(await canvas.encode('png')).toString('base64'),...extra}
}
async function pdfCover(bytes:Buffer){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),base=path.dirname(require.resolve('pdfjs-dist/package.json'))
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0,isEvalSupported:false,
    cMapUrl:path.join(base,'cmaps')+path.sep,cMapPacked:true,standardFontDataUrl:path.join(base,'standard_fonts')+path.sep,wasmUrl:path.join(base,'wasm')+path.sep})
  try{
    const pdf=await task.promise,page=await pdf.getPage(1),original=page.getViewport({scale:1})
    const viewport=page.getViewport({scale:Math.min(360/original.width,480/original.height)})
    const canvas=createCanvas(Math.max(1,Math.ceil(viewport.width)),Math.max(1,Math.ceil(viewport.height)))
    await page.render({canvas:null,canvasContext:canvas.getContext('2d') as unknown as CanvasRenderingContext2D,viewport,background:'#ffffff'}).promise
    return imageResult(canvas,{pageCount:pdf.numPages})
  }finally{await task.destroy()}
}
function lines(ctx:SKRSContext2D,value:string,x:number,y:number,width:number,lineHeight:number,maximum:number){
  let line='',row=0
  for(const {segment} of words.segment(value.replace(/\s+/g,' ').slice(0,8000))){
    // Only a single word wider than the entire line needs character wrapping.
    for(const part of ctx.measureText(segment).width>width?[...segment]:[segment]){
      if(ctx.measureText(line+part).width>width&&line.trim()){ctx.fillText(line.trimEnd(),x,y+row++*lineHeight);line='';if(row>=maximum)return y+row*lineHeight}
      line+=line?part:part.trimStart()
    }
  }
  if(line&&row<maximum)ctx.fillText(line,x,y+row++*lineHeight)
  return y+row*lineHeight
}
async function localImage(src:string,args:PreviewInput){
  let source:Buffer|string
  if(/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)){
    if(src.length>12*1024*1024)return null
    source=Buffer.from(src.slice(src.indexOf(',')+1),'base64')
  }else{
    // Parsing never executes HTML. Only existing workspace-local image bytes load.
    if(!src||/^(?:[a-z][a-z0-9+.-]*:|[/\\])/i.test(src))return null
    const relative=path.join(path.dirname(args.filename),decodeURIComponent(src.split(/[?#]/)[0]))
    if(!/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(relative))return null
    const file=workspacePath(args.workspace,relative),stat=await fs.lstat(file)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)return null
    source=file
  }
  const image=await loadImage(source)
  return image.width<32||image.height<32||image.width*image.height>40000000?null:image
}
async function articleCover(bytes:Buffer,args:PreviewInput){
  const source=new TextDecoder().decode(bytes),document:ArticleNode=args.format==='txt'?{tagName:'pre',value:source}:
    ['md','markdown'].includes(args.format)?markdown.runSync(markdown.parse(source)) as ArticleNode:parse(source) as ArticleNode
  const all=nodes(document),title=text(all.find(node=>node.tagName==='h1')??all.find(node=>node.tagName==='title')??{}).trim()||path.basename(args.filename)
  let image=null
  for(const node of all.filter(node=>node.tagName==='img').slice(0,8)){
    try{image=await localImage(attribute(node,'data-src')||attribute(node,'src'),args)}catch{/* Missing or out-of-workspace images stay absent. */}
    if(image)break
  }
  const canvas=createCanvas(360,480),ctx=canvas.getContext('2d')
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,360,480)
  ctx.fillStyle='#1488ec';ctx.fillRect(24,26,32,4)
  ctx.fillStyle='#203048';ctx.font=`bold 24px ${font}`;ctx.textBaseline='top'
  let y=lines(ctx,title,24,46,312,32,3)+15
  if(image){const scale=Math.min(312/image.width,175/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,(360-w)/2,y,w,h);y+=h+18}
  const blocks=all.filter(node=>['p','h2','pre'].includes(node.tagName??'')).map(node=>text(node).trim()).filter(value=>value&&!/^(?:Source:|Saved\s+\d{4})/.test(value))
  const excerpt=(blocks.join(' ')||text(all.find(node=>node.tagName==='body')??document).trim()).slice(0,5000)
  ctx.font=`14px ${font}`;ctx.fillStyle='#667183';lines(ctx,excerpt,24,y,312,21,Math.max(1,Math.floor((455-y)/21)))
  const fade=ctx.createLinearGradient(0,440,0,480);fade.addColorStop(0,'#ffffff00');fade.addColorStop(1,'#ffffffff');ctx.fillStyle=fade;ctx.fillRect(0,440,360,40)
  return imageResult(canvas)
}
async function render(args:PreviewInput){
  const file=workspacePath(args.workspace,args.filename),stat=await fs.lstat(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error('Preview size or file type limit')
  const version=createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`).digest('hex').slice(0,24)
  if(version!==args.expectedVersion)throw Error('Preview source changed before rendering')
  const bytes=await fs.readFile(file)
  if(args.format==='pdf')return pdfCover(bytes)
  if(['png','jpg','jpeg','webp','gif','avif','bmp'].includes(args.format)){
    const image=await loadImage(file),scale=Math.min(360/image.width,480/image.height)
    const canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)))
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return imageResult(canvas)
  }
  return articleCover(bytes,args)
}
void render(workerData).then(result=>parentPort!.postMessage({result}),error=>parentPort!.postMessage({error:{message:error.message}}))
