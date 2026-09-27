import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {sourceFiles,root} from './source-files.mjs'
const technical=process.argv.includes('--technical'),failures=[],warnings=[]
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const required=['LICENSE','NOTICE','LICENSING.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','README.md','API.md','PERMISSIONS.md','docs/DEPLOYMENT.md','docs/ENGINE_ADAPTERS.md','engine-downloads.json','plugins.lock.json','.github/workflows/ci.yml']
for(const name of required)if(!fs.existsSync(path.join(root,name)))failures.push('Missing release file: '+name)
const lock=JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8'))
for(const item of lock.plugins){
  const directory=path.join(root,'PlugIns',item.directory)
  for(const name of ['package.json','LICENSE'])if(!fs.existsSync(path.join(directory,name)))failures.push('Missing plugin file: '+item.directory+'/'+name)
  if(fs.existsSync(path.join(directory,'.git')))failures.push('Nested plugin Git repository hides source from host checkout: '+item.directory)
  if(JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')).version!==item.version)failures.push('Plugin version differs from lock: '+item.directory)
}
for(const directory of ['',...lock.plugins.map(item=>'PlugIns/'+item.directory)]){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,directory,'package.json'),'utf8'))
  if(manifest.dependencies?.['@anthropic-ai/claude-agent-sdk'])failures.push('Vendor Agent SDK must not be a production dependency: '+(directory||'host'))
}
const upstream=path.join(root,'licenses/upstream/blocknote-source.json')
if(!technical){
  if(!fs.existsSync(upstream))failures.push('Missing matching BlockNote source record')
  else {const record=JSON.parse(fs.readFileSync(upstream,'utf8')),archive=path.join(root,record.archive)
    if(!fs.existsSync(archive)||createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==record.sha256)failures.push('Matching BlockNote source archive is missing or changed')
  }
}
const files=sourceFiles(),findings=[]
for(const file of files){
  if(!/\.(?:ts|tsx|js|cjs|mjs|json|md|yml|yaml|py|ps1|txt)$/.test(file))continue
  const text=fs.readFileSync(file,'utf8'),relative=path.relative(root,file)
  if(/-----BEGIN (?:(?:OPENSSH|RSA|EC|DSA|ENCRYPTED) )?PRIVATE KEY-----/.test(text))findings.push(relative+': private key material')
  if(/\b(?:sk-proj-|sk-ant-api\d+-)[A-Za-z0-9_-]{32,}/.test(text))findings.push(relative+': potential service credential')
}
failures.push(...findings)
for(const file of ['out/main/daemon.js','out/renderer/index.html'])if(!fs.existsSync(path.join(root,file)))warnings.push('Not built yet: '+file)
for(const item of lock.plugins){const marker=path.join(root,'build/plugins',item.directory,'source-location.json');if(fs.existsSync(marker))warnings.push('Development-only source-location marker exists; --release build must remove it: '+item.directory)}
const reviews=JSON.parse(fs.readFileSync(path.join(root,'licenses/release-review.json'),'utf8'))
const pending=reviews.reviews.filter(item=>item.status!=='approved'||!Array.isArray(item.evidence)||item.evidence.length===0)
if(!technical)for(const item of pending)failures.push('Redistribution review pending: '+item.id+' — '+item.required)
const report={version:pkg.version,technicalOnly:technical,filesChecked:files.length,sourceFingerprint:createHash('sha256').update(files.map(file=>path.relative(root,file).split(path.sep).join('/')+'\0'+createHash('sha256').update(fs.readFileSync(file)).digest('hex')).join('\n')).digest('hex'),failures,warnings,redistributionReviews:pending.map(item=>item.id),note:'This bounded source scan is not a full Git-history secret audit, dependency security assessment or legal clearance.'}
console.log(JSON.stringify(report,null,2))
if(failures.length)process.exitCode=1
