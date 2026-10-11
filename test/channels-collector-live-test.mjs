// Opt-in: read three existing remote news records and exercise the real publisher against a disposable Core.
// No collector is started and the remote database/configuration/publication marks are not changed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
if(!process.argv.includes('--confirm-live'))throw Error('This remote read/publication probe requires --confirm-live')
// The private probe configuration identifies an authorized host and three existing records.
// {host,project,probeScript,recordIds:[telegramId,xId,youtubeId],remotePort?:15152}
const configFile=process.env.AGENTS_COMPANY_COLLECTOR_PROBE
if(!configFile)throw Error('Set AGENTS_COMPANY_COLLECTOR_PROBE to the private JSON probe configuration')
const {host,project,probeScript,recordIds,remotePort=15152}=JSON.parse(fs.readFileSync(configFile,'utf8'))
assert.ok(host&&project&&probeScript&&Array.isArray(recordIds)&&recordIds.length===3,'Probe host, project, script and three record IDs are required')
assert.ok(Number.isInteger(remotePort)&&remotePort>1024&&remotePort<=65535,'Valid remote probe port required')
const quote=value=>"'"+String(value).replaceAll("'","'\"'\"'")+"'"
const sshOptions=['-T','-o','BatchMode=yes','-o','ControlMaster=no','-o','ControlPath=none','-o','ConnectTimeout=10']
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-news-live-'))),entry=path.join(temp,'daemon.cjs'),exec=promisify(execFile)
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f,tunnel,tunnelEnded
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry);const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const targets=JSON.parse((await exec('ssh',[...sshOptions,host,'cd '+quote(project)+' && .venv/bin/python tools/export_agents_targets.py'],{maxBuffer:1024*1024})).stdout).targets
 for(const target of targets)await rpc('channel.source-add',target)
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));await rpc('channel.settings',{patch:{enabled:true,port}})
 const credential=await rpc('channel.collector-add',{name:'Disposable cross-host probe'})
 let tunnelError='';tunnel=spawn('ssh',['-N',...sshOptions,'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=20','-R','127.0.0.1:'+remotePort+':127.0.0.1:'+port,host],{stdio:['ignore','ignore','pipe']});tunnelEnded=new Promise(resolve=>tunnel.once('exit',resolve));tunnel.stderr.on('data',value=>tunnelError=(tunnelError+value).slice(-2000))
 await f.until(async()=>{if(tunnel.exitCode!==null)throw Error('Probe tunnel exited: '+tunnelError);try{await exec('ssh',[...sshOptions,host,'python3 -c '+quote('import socket; s=socket.create_connection(("127.0.0.1",'+remotePort+'),1); s.close()')],{timeout:5000});return true}catch{return false}},'remote loopback tunnel')
 const input={endpoint:'http://127.0.0.1:'+remotePort,token:credential.token,recordIds}
 const remote=await new Promise((resolve,reject)=>{const child=spawn('ssh',[...sshOptions,host,quote(project+'/.venv/bin/python')+' '+quote(probeScript)],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr=(stderr+value).slice(-2000));child.on('error',reject);const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Remote publisher probe timed out'))},90000);child.once('exit',code=>{clearTimeout(timeout);if(code!==0){reject(Error('Remote publisher probe failed ('+code+'): '+stdout));return}try{resolve(JSON.parse(stdout))}catch{reject(Error('Remote probe did not return its structured report'))}});child.stdin.end(JSON.stringify(input))})
 const news=await rpc('channel.posts',{limit:100});assert.equal(news.posts.length,3);assert.deepEqual(new Set(news.posts.map(post=>post.plugin)),new Set(['telegram','x','youtube']))
 let images=0,avatars=0
 for(const post of news.posts){assert.ok(post.title||post.body);for(const media of post.media){const image=await rpc('channel.image',{channelId:post.channelId,postId:post.id,mediaId:media.id});assert.ok(Buffer.from(image.data,'base64').length);images++}if(post.avatarMediaId){assert.ok((await rpc('channel.image',{channelId:post.channelId,postId:post.id,mediaId:post.avatarMediaId})).data);avatars++}}
 assert.ok(images>=3);assert.ok(avatars>=1)
 const output=path.join(root,'artifacts/channels');fs.mkdirSync(output,{recursive:true});const report={passed:true,checkedAt:new Date().toISOString(),source:'actual existing Newsroom records and production publisher',destination:'disposable local Core through a temporary SSH reverse forward',subscriptionsImported:targets.length,received:news.posts.map(post=>({platform:post.plugin,externalId:post.externalId,postId:post.id,characters:post.body.length,images:post.media.length,avatar:!!post.avatarMediaId})),imagesVerified:images,avatarsVerified:avatars,remote,realServiceChanged:false,publicSocialPosts:false}
 fs.writeFileSync(path.join(output,'cross-host-verification.json'),JSON.stringify(report,null,2));console.log('PASS live SSH publisher: '+targets.length+' imported public subscriptions, 3 actual platform records, '+images+' local images and '+avatars+' local avatar; original service and marks unchanged')
}finally{if(tunnel&&tunnel.exitCode===null){tunnel.kill('SIGTERM');await tunnelEnded};await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
