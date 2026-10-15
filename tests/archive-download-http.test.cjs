const {test}=require('node:test')
const assert=require('node:assert/strict')
const {spawn,execFileSync}=require('node:child_process')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const cli=process.env.CLOUD_HOSTS_TEST_CLI || path.join(__dirname,'../cli.cjs')

test('isolated HTTP directory download returns a complete UTF-8 ZIP',async()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-hosts-http-zip-'))
  const server=spawn(process.execPath,[cli,'serve'],{
    env:{...process.env,CLOUD_HOSTS_HOME:home},
    windowsHide:true,stdio:['ignore','pipe','pipe']
  })
  let error='',buffer=''
  server.stderr.on('data',data=>{error=(error+data.toString()).slice(-1500)})
  let finish
  const ready=new Promise((resolve,reject)=>{
    finish={resolve,reject}
    server.stdout.on('data',chunk=>{
      buffer+=chunk.toString()
      const lines=buffer.split('\n')
      buffer=lines.pop()
      for(const line of lines){
        try{const value=JSON.parse(line);if(value.ready&&value.url)resolve(value)}catch{}
      }
    })
    server.once('error',reject)
    server.once('exit',code=>reject(Error('HTTP test server exited ('+code+'): '+error)))
  })
  const timer=setTimeout(()=>finish.reject(Error('HTTP test server did not start: '+error)),14000)
  try{
    const state=await ready
    const rpc=async(method,params)=>{
      const response=await fetch(state.url+'rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
      })
      assert.equal(response.status,200)
      const value=await response.json()
      if(value.error)throw Error(value.error.message)
      return value.result
    }
    const root=await rpc('station.create',{name:"文档 '报价'",type:'folder'})
    const nested=await rpc('station.create',{name:'二级',type:'folder',parent:root.id})
    await rpc('station.create',{name:'空文件夹',type:'folder',parent:root.id})
    await rpc('station.create',{name:'测试.txt',type:'file',parent:nested.id,text:'HTTP ZIP 下载已修复'})
    const response=await fetch(state.url+'station/download/'+root.id)
    assert.equal(response.status,200)
    assert.equal(response.headers.get('content-type'),'application/zip')
    assert.match(response.headers.get('content-disposition'),/\.zip/)
    const zip=path.join(home,'downloaded.zip')
    fs.writeFileSync(zip,Buffer.from(await response.arrayBuffer()))
    assert.ok(fs.statSync(zip).size>120)
    const out=path.join(home,'out')
    fs.mkdirSync(out)
    if(process.platform==='darwin')execFileSync('/usr/bin/ditto',['-x','-k',zip,out])
    else execFileSync('python',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',zip,out])
    assert.equal(fs.readFileSync(path.join(out,"文档 '报价'",'二级','测试.txt'),'utf8'),'HTTP ZIP 下载已修复')
    assert.deepEqual(fs.readdirSync(path.join(out,"文档 '报价'",'空文件夹')),[])
  }finally{
    clearTimeout(timer)
    server.kill()
    await new Promise(resolve=>{if(server.exitCode!==null||server.signalCode){resolve();return}server.once('exit',resolve);setTimeout(resolve,4500)})
    fs.rmSync(home,{recursive:true,force:true})
  }
})
