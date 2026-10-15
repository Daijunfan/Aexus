const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {execFileSync}=require('node:child_process')

// Station files in this fixture stay in an isolated directory, not user data.
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-hosts-zip-'))
process.env.CLOUD_HOSTS_HOME=home
const station=require('../src/station.cjs')
const {archive}=require('../src/archives.cjs')

test('folder ZIP preserves Chinese filenames, nested files, empty directories, and siblings',async()=>{
  const parent=station.create('项目 中文','folder')
  const nested=station.create('嵌套','folder',parent.id)
  station.create('空目录','folder',parent.id)
  station.create('说明.txt','file',nested.id,'Unicode 目录下载 OK')
  station.create('根文件.txt','file',parent.id,'root content')
  const quoted=station.create("版本 'v1'",'folder',parent.id)
  station.create("it's working.txt",'file',quoted.id,'quoted paths')
  const zip=await archive(parent.id)
  assert.equal(fs.existsSync(zip),true)
  const unpack=path.join(home,'unpacked')
  fs.mkdirSync(unpack)
  // macOS ditto archives are decoded by ditto; Windows bsdtar ZIPs use UTF-8.
  if(process.platform==='darwin')execFileSync('/usr/bin/ditto',['-x','-k',zip,unpack])
  else execFileSync('python',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',zip,unpack])
  assert.equal(fs.readFileSync(path.join(unpack,'项目 中文','嵌套','说明.txt'),'utf8'),'Unicode 目录下载 OK')
  assert.equal(fs.readdirSync(path.join(unpack,'项目 中文','空目录')).length,0)
  assert.equal(fs.readFileSync(path.join(unpack,'项目 中文','根文件.txt'),'utf8'),'root content')
  assert.equal(fs.readFileSync(path.join(unpack,'项目 中文',"版本 'v1'","it's working.txt"),'utf8'),'quoted paths')
  assert.equal(await archive(parent.id),zip,'unchanged ZIP uses cache')
  const updated=station.list().items.find(item=>item.name==='说明.txt').id;station.write(updated,'updated content',station.read(updated).sha256)
  const newer=await archive(parent.id)
  assert.notEqual(newer,zip,'changed content invalidates cached ZIP')
  assert.equal(await archive(parent.id),newer)
})

test('two overlapping folder downloads share one completed ZIP without temporary leftovers',async()=>{
  const id=station.create('并行目录','folder').id
  station.create('a.txt','file',id,'a')
  const outputs=await Promise.all([archive(id),archive(id),archive(id)])
  assert.equal(new Set(outputs).size,1)
  assert.equal(fs.readdirSync(path.join(home,'station','exports')).filter(x=>x.startsWith('.partial-')).length,0)
})

test('single files are not treated as folder archives',async()=>{
  const id=station.create('one.txt','file',null,'one').id
  await assert.rejects(archive(id),/目录/)
})
