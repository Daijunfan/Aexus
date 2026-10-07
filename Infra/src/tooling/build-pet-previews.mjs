// Lossless picker strips: sleep plus all five greeting frames, at original resolution.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import './build-avatar-portraits.mjs'
import {SPRITE_REST_FRAMES,FATE_AVATARS} from '../shared/office.ts'
const root=path.resolve(import.meta.dirname,'../renderer/src/assets/pets')
fs.mkdirSync(path.join(root,'previews'),{recursive:true})
let before=0,after=0,pixelsBefore=0
for(const [name,[row,column]] of Object.entries(SPRITE_REST_FRAMES)){
  const source=path.join(root,name+'.webp'),target=path.join(root,'previews',name+'.webp')
  const metadata=await sharp(source).metadata();pixelsBefore+=metadata.width*metadata.height
  const frames=[[row,column],...[0,1,2,3,4].map(column=>[4,column])],strip=Buffer.alloc(1152*208*4)
  for(const [index,[row,column]] of frames.entries()){
    const pixels=await sharp(source).extract({left:column*192,top:row*208,width:192,height:208}).ensureAlpha().raw().toBuffer()
    // Copy bytes directly; compositing would round translucent edge colors.
    for(let y=0;y<208;y++)pixels.copy(strip,(y*1152+index*192)*4,y*192*4,(y+1)*192*4)
  }
  await sharp(strip,{raw:{width:1152,height:208,channels:4}}).webp({lossless:true}).toFile(target)
  before+=fs.statSync(source).size;after+=fs.statSync(target).size
}
console.log(JSON.stringify({characters:Object.keys(SPRITE_REST_FRAMES).length,sourceBytes:before,previewBytes:after,sourceDecodedBytes:pixelsBefore*4,previewDecodedBytes:Object.keys(SPRITE_REST_FRAMES).length*1152*208*4}))

// Fate uses eight authored frames in a single normalized strip.
fs.mkdirSync(path.join(root,'fate','previews'),{recursive:true})
for(const id of FATE_AVATARS)await sharp(path.join(root,'fate',id+'.webp')).resize(1536,208).webp({lossless:true}).toFile(path.join(root,'fate','previews',id+'.webp'))
