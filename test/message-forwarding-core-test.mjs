import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
try{
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio')
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'A concise design decision, with its original context.')
 await f.cli('session','send','--employee',a.id,'--text','Explain the decision');await f.until(async()=>!(await f.status(a.id)).busy,'source reply')
 const source=(await f.cli('session','transcript',a.id)).items.find(item=>item.role==='assistant'),messages=[{conversation:'employee:'+a.id,id:source.id}],to='employee:'+b.id
 const result=await rpc('messenger.forward',{messages,to,comment:'Please review this.',clientMessageId:'fixture-forward-1'});assert.equal(result.status,'queued')
 await f.until(async()=>!(await f.status(b.id)).busy,'forwarded reply')
 const before=(await f.cli('session','transcript',b.id)).items;assert.ok(before.some(item=>item.role==='user'&&item.text.includes('Please review this.')&&item.text.includes('Forwarded from Aster')))
 assert.deepEqual(await rpc('messenger.forward',{messages,to,comment:'Please review this.',clientMessageId:'fixture-forward-1'}),result)
 assert.deepEqual((await f.cli('session','transcript',b.id)).items,before,'retry does not repeat inference')
 assert.equal((await f.request(null,'messenger.forward',{messages,to,comment:'Changed',clientMessageId:'fixture-forward-1'})).ok,false)
 const group=await f.cli('chat','create','--name','Design circle','--members',JSON.stringify([a.id,b.id]))
 const posted=await f.cli('messenger','forward','--messages',JSON.stringify(messages),'--to','group:'+group.id,'--client-message-id','fixture-group-forward');assert.equal(posted.status,'posted');const shared=await f.cli('chat','history',group.id);assert.equal(shared.messages.length,1);assert.deepEqual(shared.messages[0].mentions,[]);assert.equal(shared.messages[0].broadcast,true);assert.deepEqual(shared.messages[0].deliveries.map(delivery=>delivery.employeeId),[a.id,b.id]);await f.until(async()=>{const sent=(await f.cli('chat','history',group.id)).messages[0];return sent.deliveries.every(delivery=>delivery.status==='completed'&&delivery.readAt)},'forward broadcast acknowledged');assert.equal((await f.cli('chat','history',group.id)).messages.length,1,'silent broadcast acknowledgment adds no group reply');assert.deepEqual(await f.cli('messenger','forward','--messages',JSON.stringify(messages),'--to','group:'+group.id,'--client-message-id','fixture-group-forward'),posted)
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),sourcePath='.agents-attachments/source.png'
 await rpc('workspace.write',{employee:a.id,path:sourcePath,contentBase64:png.toString('base64'),create:true})
 await f.cli('session','send','--employee',a.id,'--text','PHOTO_FORWARD','--images',JSON.stringify([sourcePath]));await f.until(async()=>!(await f.status(a.id)).busy,'photo source')
 const image=(await f.cli('session','transcript',a.id)).items.find(item=>item.role==='user'&&item.text==='PHOTO_FORWARD'),imageRefs=[{conversation:'employee:'+a.id,id:image.id}]
 await rpc('messenger.forward',{messages:imageRefs,to,clientMessageId:'fixture-photo-forward'})
 await f.until(async()=>{const items=(await f.cli('session','transcript',b.id)).items;return items.some(item=>item.role==='user'&&item.text.includes('PHOTO_FORWARD'))&&!(await f.status(b.id)).busy},'copied photo')
 const photo=(await f.cli('session','transcript',b.id)).items.find(item=>item.role==='user'&&item.text.includes('PHOTO_FORWARD'));assert.equal(photo.images.length,1);assert.match(photo.images[0],/^\.agents-attachments\/[a-f0-9-]+\/source\.png$/);assert.deepEqual(fs.readFileSync(path.join(b.cwd,photo.images[0])),png)
 const groupBefore=(await f.cli('chat','history',group.id)).messages.length;assert.equal((await f.request(null,'messenger.forward',{messages:imageRefs,to:'group:'+group.id,clientMessageId:'fixture-group-photo'})).ok,true);assert.equal((await f.cli('chat','history',group.id)).messages.length,groupBefore+1)
 await rpc('messenger.forward',{messages:imageRefs,to:'group:'+group.id,textOnly:true,clientMessageId:'fixture-group-text-only'});assert.equal((await f.cli('chat','history',group.id)).messages.length,groupBefore+2)
 await f.until(async()=>(await f.cli('chat','history',group.id)).messages.every(message=>message.deliveries.every(delivery=>delivery.status==='completed'&&delivery.readAt)),'all forwarded broadcasts finish');await f.stop();await f.start();assert.deepEqual(await rpc('messenger.forward',{messages,to,comment:'Please review this.',clientMessageId:'fixture-forward-1'}),result)
 const token=await f.token(a.id);assert.equal((await f.request(token,'messenger.forward',{messages,to,clientMessageId:'forbidden'})).ok,false)
 assert.equal((await f.request(null,'messenger.forward',{messages:[{conversation:'employee:'+a.id,id:'missing'}],to,clientMessageId:'missing'})).ok,false)
 // An interrupted acceptance is never replayed on the assumption it failed.
 const journal=path.join(f.env.AGENTS_COMPANY_HOME,'message-forwards.json'),records=JSON.parse(fs.readFileSync(journal));records['forward:fixture-forward-1'].status='preparing';delete records['forward:fixture-forward-1'].result;delete records['forward:fixture-forward-1'].stage;delete records['forward:fixture-forward-1'].downstreamKey;fs.writeFileSync(journal,JSON.stringify(records));const uncertain=await f.request(null,'messenger.forward',{messages,to,comment:'Please review this.',clientMessageId:'fixture-forward-1',retry:true});assert.equal(uncertain.ok,false);assert.match(uncertain.error,/uncertain/)
 assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS message forwarding: canonical public content, explicit destination and note, existing employee queue, group broadcast with frozen recipients and silent acknowledgments, durable deduplication across restart, mismatched-key rejection, operator-only access, unknown-source rejection, no replay of uncertain acceptance; fixtures only')
}finally{await f.close()}
