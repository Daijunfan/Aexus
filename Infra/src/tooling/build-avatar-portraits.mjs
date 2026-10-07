// Dedicated, quiet portraits. Never crop a moving greeting/sleep animation in the inbox.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {SPRITE_REST_FRAMES,FATE_AVATARS} from '../shared/office.ts'
const root=path.resolve(import.meta.dirname,'../renderer/src/assets/pets'),out=path.join(root,'portraits')
fs.mkdirSync(out,{recursive:true})
const report=[]
for(const id of [...Object.keys(SPRITE_REST_FRAMES),...FATE_AVATARS]){
  const fate=id.startsWith('fate-'),source=path.join(root,fate?'fate':'',id+'.webp')
  const meta=await sharp(source).metadata(),width=fate?meta.width/8:192,height=fate?meta.height:208
  const {data,info}=await sharp(source).extract({left:0,top:0,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  let x0=width,y0=height,x1=-1,y1=-1
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>48){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  if(x1<x0)throw Error('Empty portrait frame: '+id)
  // People: head and shoulders, retaining hair/accessories. Creatures: complete silhouette.
  const fraction=id.endsWith('-anime') ? .30 : id.endsWith('-chibi') ? .62 : 1
  const top=y0,bottom=Math.min(height,y0+Math.ceil((y1-y0+1)*fraction))
  let left=width,right=-1
  for(let y=top;y<bottom;y++)for(let x=x0;x<=x1;x++)if(data[(y*width+x)*4+3]>48){left=Math.min(left,x);right=Math.max(right,x)}
  const crop={left:Math.max(0,left-3),top:Math.max(0,top-3),width:Math.min(width,right+4)-Math.max(0,left-3),height:Math.min(height,bottom+3)-Math.max(0,top-3)}
  const image=await sharp(data,{raw:info}).extract(crop).resize(224,224,{fit:'contain',position:'top',background:'#00000000'}).extend({top:16,bottom:16,left:16,right:16,background:'#00000000'}).webp({lossless:true}).toBuffer()
  fs.writeFileSync(path.join(out,id+'.webp'),image)
  report.push({id,crop,width:256,height:256,bytes:image.length})
}
// Legacy Clawd stays renderable for saved identities; it is not reintroduced into the picker.
await sharp(path.join(root,'clawd.svg')).resize(220,220,{fit:'contain',background:'#00000000'}).extend({top:18,bottom:18,left:18,right:18,background:'#00000000'}).webp({lossless:true}).toFile(path.join(out,'clawd.webp'))
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n')
console.log('Built '+(report.length+1)+' static portraits; source animations unchanged')
