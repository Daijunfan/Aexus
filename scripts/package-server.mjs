import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {create as tar} from 'tar'
import spawn from 'cross-spawn'
import {root} from './source-files.mjs'

const development=process.argv.includes('--development'),skipBuild=process.argv.includes('--skip-build')
for(const arg of process.argv.slice(2))if(!['--development','--skip-build'].includes(arg))throw Error('Unknown option: '+arg)
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const name=`Agents-Company-${pkg.version}-server-${process.platform}-${process.arch}${development?'-candidate':''}`
const output=path.join(root,'release'),stage=path.join(root,'.dist',name)
function run(command,args,cwd=root){
  const result=spawn.sync(command,args,{cwd,stdio:'inherit',env:process.env})
  if(result.error)throw result.error
  if(result.status!==0)throw Error(`${command} ${args.join(' ')} failed (${result.status})`)
}
function copy(relative){
  const source=path.join(root,relative),target=path.join(stage,relative)
  if(!fs.existsSync(source))throw Error('Required server resource is missing: '+relative)
  fs.mkdirSync(path.dirname(target),{recursive:true})
  fs.cpSync(source,target,{recursive:true,filter:file=>{
    const name=path.basename(file)
    if(['.git','.tunnel','.agents-company','workspaces','__pycache__','.DS_Store','artifacts','test-results'].includes(name)||name.startsWith('._')||name.startsWith('.env'))return false
    if(relative==='Modules/Tunnel'&&path.dirname(file)===path.join(source,'profiles')&&fs.statSync(file).isFile())return name.endsWith('.example.json')
    return true
  }})
}
run(process.execPath,['scripts/release-check.mjs',...(development?['--technical']:[])])
if(skipBuild&&/require\(["']\.\/chunks\//.test(fs.readFileSync(path.join(root,'out/main/daemon.js'),'utf8')))throw Error('--skip-build requires the standalone Node build; run build:server first, not only the Electron build')
if(!skipBuild){
  run(process.execPath,['scripts/build-plugins.mjs','--release'])
  run(process.execPath,['scripts/build-server.mjs'])
  run('npx',['--no-install','vite','build','--config','vite.web.config.ts'])
}
const plugins=JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8')).plugins
const approvedResources=['out/main/daemon.js','out/renderer/index.html'];for(const file of approvedResources)if(!fs.existsSync(path.join(root,file)))throw Error('Missing standalone server build: '+file)
for(const plugin of plugins){
  const directory=path.join(root,'build/plugins',plugin.directory)
  if(fs.existsSync(path.join(directory,'source-location.json')))throw Error('Server distribution requires portable plugins; run build:plugins:release first')
  if(!fs.existsSync(path.join(directory,'agents-company.plugin.json')))throw Error('Required built plugin is missing: '+plugin.directory)
}
fs.mkdirSync(output,{recursive:true})
fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true})
for(const relative of ['out/main/daemon.js','out/renderer','bin','build/plugins','Modules/Tunnel','docs','licenses',
  'README.md','API.md','PERMISSIONS.md','ARCHITECTURE.md','ENGINE_CAPABILITIES.md','PLAN.md','SCHEDULER.md','PLUGIN_SPEC.md','CHANGELOG.md',
  'SECURITY.md','LICENSING.md','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','engine-downloads.json','plugins.lock.json','package-lock.json'])copy(relative)
// Keep the exact dependency manifest/lock; only scripts and the runtime entry differ.
// Dependencies are installed on the target OS/architecture, never copied from the developer's node_modules.
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({...pkg,private:true,main:'out/main/daemon.js',
  scripts:{start:'node bin/agents serve --web',serve:'node bin/agents serve',token:'node bin/agents web token'}},null,2)+'\n')
run('npm',['ci','--omit=dev','--no-audit','--no-fund'],stage)
if(process.platform==='win32'){
  const check=spawn.sync(process.execPath,['-e',"require('node-pty')"],{cwd:stage,stdio:'inherit'})
  if(check.status!==0)throw Error('Windows server package requires a working node-pty / ConPTY binary')
}
fs.writeFileSync(path.join(stage,'RUN_SERVER.txt'),[
  `Agents Company ${pkg.version} — ${process.platform}/${process.arch}`,
  'Requires a supported Node runtime (see package.json). This archive does not bundle Node.',
  'Start: node bin/agents serve --web --port 5151',
  'In another terminal: node bin/agents web token',
  'Open http://127.0.0.1:5151; use HTTPS or SSH forwarding for another computer.',
  'All three plugins are included. Workspaces default to the configured Core data directory.',
  'No credentials, browser profiles, running tasks or user workspaces are included.',
  development?'PRIVATE CANDIDATE: redistribution reviews remain pending; do not publish.':'See LICENSING.md for the distribution licenses.',
  'Complete matching sources: use the source archive produced from the same checkout.'
].join('\n')+'\n')
const review=JSON.parse(fs.readFileSync(path.join(root,'licenses/release-review.json'),'utf8'))
fs.writeFileSync(path.join(stage,'DISTRIBUTION.json'),JSON.stringify({version:pkg.version,platform:process.platform,arch:process.arch,
  candidate:development,plugins,pendingReviews:review.reviews.filter(r=>r.status!=='approved').map(r=>r.id)},null,2)+'\n')
const archive=path.join(output,name+'.tar.gz')
await tar({cwd:path.dirname(stage),file:archive,gzip:true,portable:true},[name])
const hash=createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk)
const sha256=hash.digest('hex');fs.writeFileSync(archive+'.sha256',sha256+'  '+path.basename(archive)+'\n')
console.log(JSON.stringify({archive,sha256,bytes:fs.statSync(archive).size,plugins:plugins.map(p=>p.directory),candidate:development},null,2))
