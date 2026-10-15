const fs = require('node:fs')
const path = require('node:path')
const {randomUUID,createHash} = require('node:crypto')
const {execFile} = require('node:child_process')
const {promisify} = require('node:util')
const station = require('./station.cjs')

const run = promisify(execFile)
const tasks = new Map()

// Use macOS ditto on Mac and .NET ZipFile on Windows. The latter explicitly
// writes Unicode names in UTF-8 and retains empty folders. No console appears.
async function pack(source, output) {
  if (process.platform === 'darwin') {
    await run('/usr/bin/ditto',
      ['-c','-k','--norsrc','--noextattr','--noacl','--keepParent',source,output],
      {timeout:120000,windowsHide:true})
  } else if (process.platform === 'win32') {
    const quote=value=>"'"+value.replace(/'/g,"''")+"'"
    const code='$ErrorActionPreference="Stop";'+
      'Add-Type -AssemblyName System.IO.Compression.FileSystem;'+
      '[IO.Compression.ZipFile]::CreateFromDirectory('+
      quote(source)+','+quote(output)+
      ',[IO.Compression.CompressionLevel]::Optimal,$true,[Text.Encoding]::UTF8)'
    await run('powershell.exe',
      ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],
      {timeout:120000,windowsHide:true})
  } else {
    throw Error('当前操作系统不支持目录 ZIP 导出')
  }
}

async function archive(id) {
  const data=station.list().items,item=station.get(id)
  if(item.type!=='folder')throw Error('请选择目录')
  const key=id+'-'+createHash('sha256')
    .update(JSON.stringify(data.map(row=>[row.id,row.parent,row.name,row.sha256,row.modifiedAt])))
    .digest('hex').slice(0,16)
  const folder=path.join(station.root,'exports'),output=path.join(folder,key+'.zip')
  fs.mkdirSync(folder,{recursive:true,mode:0o700})
  if(fs.existsSync(output))return output
  if(tasks.has(key))return tasks.get(key)

  const pending=(async()=>{
    const temporary=path.join(folder,'.partial-'+randomUUID()+'.zip')
    try {
      await pack(station.file(id),temporary)
      if(!fs.statSync(temporary).size)throw Error('压缩包为空')
      fs.renameSync(temporary,output)
      return output
    } finally {
      fs.rmSync(temporary,{force:true})
    }
  })()
  tasks.set(key,pending)
  try{return await pending}finally{tasks.delete(key)}
}

module.exports={archive}
