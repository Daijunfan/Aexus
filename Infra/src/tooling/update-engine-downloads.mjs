// Explicit maintainer operation. Runtime installation uses this committed checksum manifest.
import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../../..'),entries=[]
const platforms=[['darwin','arm64','aarch64-apple-darwin'],['darwin','x64','x86_64-apple-darwin'],['linux','x64','x86_64-unknown-linux-musl'],['linux','arm64','aarch64-unknown-linux-musl'],['win32','x64','x86_64-pc-windows-msvc'],['win32','arm64','aarch64-pc-windows-msvc']]
for(const [platform,arch,triple] of platforms){
  for(const engine of ['codex','claude','cline','pi']){
    const name=engine==='codex'?'@openai/codex':engine==='cline'?`@cline/cli-${platform==='win32'?'windows':platform}-${arch}`:engine==='pi'?'@earendil-works/pi-coding-agent':`@anthropic-ai/claude-agent-sdk-${platform}-${arch}`
    const version=engine==='codex'?`0.156.1-${platform}-${arch}`:engine==='cline'?'3.0.65':engine==='pi'?'0.87.1':'0.3.272'
    const response=await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
    if(!response.ok)throw Error('Cannot verify '+name+'@'+version)
    const metadata=await response.json(),url=new URL(metadata.dist.tarball)
    if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org'||!/^sha512-[A-Za-z0-9+/]+=*$/.test(metadata.dist.integrity))throw Error('Missing pinned HTTPS / SHA-512 package metadata')
    entries.push({engine,platform,arch,package:name,version,url:url.href,integrity:metadata.dist.integrity,...(engine==='pi'?{runtime:'node'}:{}),executable:engine==='pi'?'dist/bundle/cli.js':engine==='cline'?`Infra/src/cli/${platform==='win32'?'cline.exe':'cline'}`:engine==='codex'?`vendor/${triple}/bin/${platform==='win32'?'codex.exe':'codex'}`:platform==='win32'?'claude.exe':'claude'})
  }
}
for(const arch of ['x64','arm64']){
  const name=`@anthropic-ai/claude-agent-sdk-linux-${arch}-musl`,version='0.3.272',response=await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`)
  if(!response.ok)throw Error('Cannot verify '+name)
  const metadata=await response.json();if(!metadata.dist?.integrity?.startsWith('sha512-')||new URL(metadata.dist.tarball).hostname!=='registry.npmjs.org')throw Error('Invalid package metadata')
  entries.push({engine:'claude',platform:'linux',arch,libc:'musl',package:name,version,url:metadata.dist.tarball,integrity:metadata.dist.integrity,executable:'claude'})
}
const file=path.join(root,'Infra/src/resources/engine-downloads.json')
const sdkPackage='@anthropic-ai/claude-agent-sdk',sdkVersion='0.3.272'
const sdkResponse=await fetch(`https://registry.npmjs.org/${encodeURIComponent(sdkPackage)}/${sdkVersion}`)
if(!sdkResponse.ok)throw Error('Cannot verify Claude Agent SDK controller')
const sdk=await sdkResponse.json()
if(new URL(sdk.dist.tarball).hostname!=='registry.npmjs.org'||!sdk.dist.integrity.startsWith('sha512-'))throw Error('Invalid SDK package metadata')
const claudeSdk={package:sdkPackage,version:sdkVersion,url:sdk.dist.tarball,integrity:sdk.dist.integrity,executable:'sdk.mjs'}
fs.writeFileSync(file,JSON.stringify({schemaVersion:1,entries,claudeSdk},null,2)+'\n')
console.log('Pinned '+entries.length+' official native engine downloads. Review the diff before committing.')
