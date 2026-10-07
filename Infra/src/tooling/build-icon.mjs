import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import sharp from 'sharp'
const root=path.resolve(import.meta.dirname,'../../..'),source=path.join(root,'Infra/src/resources/app_icon.png'),directory=path.join(root,'Infra/src/resources'),set=path.join(directory,'AgentsCompany.iconset')
fs.mkdirSync(directory,{recursive:true})
await sharp(source).resize(1024,1024).png().toFile(path.join(directory,'icon.png'))
// ICO containers can carry PNG frames; one 256-pixel frame covers modern Windows.
const png=await sharp(source).resize(256,256).png().toBuffer(),header=Buffer.alloc(22)
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18)
fs.writeFileSync(path.join(directory,'icon.ico'),Buffer.concat([header,png]))
if(process.platform==='darwin'){
  fs.mkdirSync(set,{recursive:true})
  for(const size of [16,32,128,256,512])for(const scale of [1,2])await sharp(source).resize(size*scale,size*scale).png().toFile(path.join(set,`icon_${size}x${size}${scale===2?'@2x':''}.png`))
  execFileSync('iconutil',['-c','icns',set,'-o',path.join(directory,'icon.icns')])
}
console.log('Platform icons are ready; artwork unchanged.')
