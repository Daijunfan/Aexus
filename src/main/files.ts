import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'

export function workspacePath(root:string,value='.',write=false) {
  const file=path.resolve(root,value),part=path.relative(root,file)
  if(part==='..'||part.startsWith('..'+path.sep)||path.isAbsolute(part))throw new Error('文件路径超出工作目录')
  let parent=file;while(!fs.existsSync(parent))parent=path.dirname(parent)
  const real=fs.realpathSync(parent)
  if(real!==root&&!real.startsWith(root+path.sep))throw new Error('软链接指向工作目录外部')
  if(write&&(!part||part.split(path.sep).includes('.agents-company')))throw new Error('不能修改工作目录本身或宿主管理文件')
  return file
}
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex')
export function workspaceFiles(root:string,operation:string,args:Record<string,any>) {
  const file=workspacePath(root,args.path||'.',['write','mkdir','move','trash'].includes(operation))
  if(operation==='list')return {root,path:path.relative(root,file),entries:fs.readdirSync(file,{withFileTypes:true}).filter(e=>args.hidden||!e.name.startsWith('.')).map(e=>{const child=path.join(file,e.name),stat=fs.lstatSync(child);return {name:e.name,path:path.relative(root,child),directory:e.isDirectory(),symlink:e.isSymbolicLink(),bytes:stat.size,modifiedAt:stat.mtimeMs}}).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))}
  if(operation==='read-image'){
    if(fs.statSync(file).size>10*1024*1024)throw new Error('图片不能超过 10 MB')
    const bytes=fs.readFileSync(file),mimeType=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':/^GIF8[79]a$/.test(bytes.subarray(0,6).toString())?'image/gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':undefined
    if(!mimeType)throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片')
    return {path:args.path,mimeType,data:bytes.toString('base64'),bytes:bytes.length,binary:true}
  }
  if(operation==='read') {
    const stat=fs.statSync(file)
    if(!stat.isFile())throw new Error('请选择一个文件')
    if(stat.size>4*1024*1024)return {path:args.path,bytes:stat.size,binary:true}
    const bytes=fs.readFileSync(file)
    return {path:args.path,bytes:bytes.length,hash:hash(bytes),binary:bytes.includes(0),content:bytes.includes(0)?undefined:bytes.toString('utf8')}
  }
  if(operation==='write') {
    if(args.hash&&(!fs.existsSync(file)||hash(fs.readFileSync(file))!==args.hash))throw new Error('文件已被其他操作修改，请重新读取后保存')
    if(args.create&&fs.existsSync(file))throw new Error('同名文件已存在')
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,String(args.content??''));return {path:args.path,saved:true}
  }
  if(operation==='mkdir'){fs.mkdirSync(file,{recursive:false});return {path:args.path,created:true}}
  if(operation==='move') {
    const next=workspacePath(root,String(args.to),true)
    if(fs.existsSync(next))throw new Error('目标路径已存在')
    fs.renameSync(file,next);return {path:args.to}
  }
  if(operation==='trash') {
    const directory=workspacePath(root,'.agents-company/trash'),id=randomUUID()
    fs.mkdirSync(directory,{recursive:true});fs.renameSync(file,path.join(directory,id))
    fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify({path:args.path}));return {id,path:args.path}
  }
  if(operation==='restore') {
    if(!/^[a-f0-9-]+$/.test(args.id))throw new Error('无效回收记录')
    const directory=workspacePath(root,'.agents-company/trash'),info=JSON.parse(fs.readFileSync(path.join(directory,args.id+'.json'),'utf8'))
    const next=workspacePath(root,info.path,true)
    if(fs.existsSync(next))throw new Error('原路径已有文件')
    fs.renameSync(path.join(directory,args.id),next);fs.unlinkSync(path.join(directory,args.id+'.json'));return {path:info.path}
  }
  throw new Error('Unknown file operation')
}
