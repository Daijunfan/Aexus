import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'build/icon-source.png'),set=path.join(root,'build/AgentsCompany.iconset')
fs.mkdirSync(set,{recursive:true})
for(const size of [16,32,128,256,512])for(const scale of [1,2])execFileSync('sips',['-z',String(size*scale),String(size*scale),source,'--out',path.join(set,`icon_${size}x${size}${scale===2?'@2x':''}.png`)],{stdio:'ignore'})
execFileSync('iconutil',['-c','icns',set,'-o',path.join(root,'build/icon.icns')])
execFileSync('sips',['-z','1024','1024',source,'--out',path.join(root,'build/icon.png')],{stdio:'ignore'})
console.log('Built build/icon.icns and build/icon.png from the generated source; no image API call.')
