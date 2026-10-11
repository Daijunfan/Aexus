"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs'),{pdfFixture}=require('./fixtures.cjs');
(async()=>{
 const f=await create('capture-devices-ui',{launch:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--mute-audio']},context:{permissions:['camera','microphone']}}),{page,api,pass}=f;let error;
 try{
  await f.context.addInitScript(()=>{
   window.__testDeviceStreams=[];window.__testDeviceRequests=[];
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async constraints=>{window.__testDeviceRequests.push(constraints);const stream=await original(constraints);window.__testDeviceStreams.push(stream);return stream;};
  });
  await fs.writeFile(path.join(f.workspace,'notes.pdf'),pdfFixture());let set=await api('study.create',{mapMode:'cards',title:'Device capture fixture'});set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['notes.pdf']});
  const doc=await api('document.open',{path:'notes.pdf',activate:false});await api('study.open',{setId:set.id});
  await page.goto(f.server.url);await page.waitForSelector('body[data-ready=true]');assert.equal(await page.evaluate(()=>window.__testDeviceRequests.length),0);
  await page.click('#study-camera');assert.equal(await page.evaluate(()=>window.__testDeviceRequests.length),0);
  await page.click('#device-start');await expect.poll(()=>page.locator('#device-video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  await page.click('#dialog-cancel');await expect.poll(()=>page.evaluate(()=>window.__testDeviceStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  assert.equal((await api('study.get',{setId:set.id})).cards.length,0);
  pass('Camera is requested only after an explicit button, and cancel closes fake tracks without creating a note');
  await page.locator(`.study-document[data-document-id="${doc.id}"] .study-document-open`).click();await expect(page.locator('#document-path')).toHaveText('notes.pdf');
  await page.click('#study-camera');await page.fill('[name=title]','Camera source note');await page.click('#device-start');await expect.poll(()=>page.locator('#device-video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  await page.click('#device-capture');await expect(page.locator('#device-photo')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.__testDeviceStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();set=await api('study.get',{setId:set.id});const photo=set.cards.find(c=>c.title==='Camera source note');assert(photo.imageAsset&&photo.media.width>0);assert.equal(photo.anchor.documentId,doc.id);
  assert((await api('study.media.get',{setId:set.id,mediaId:photo.mediaId})).contentBase64.length>1000);
  pass('A synthetic camera frame is normalized to a durable PNG and anchored to the document in one public API transaction');
  await page.click('#study-microphone');await page.fill('[name=title]','Recorded class note');await page.click('#device-start');await expect(page.locator('#device-status')).toContainText('正在录音');
  await page.waitForTimeout(700);await page.click('#device-capture');await expect(page.locator('#device-status')).toContainText('录音已停止');await expect.poll(()=>page.locator('#device-audio').evaluate(v=>v.readyState)).toBeGreaterThan(0);assert(await page.locator('#device-audio').evaluate(v=>v.paused));await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  set=await api('study.get',{setId:set.id});const audio=set.cards.find(c=>c.title==='Recorded class note');assert(audio.comments[0].media.kind==='audio');assert(audio.comments[0].media.bytes>100);
  assert.equal(await page.evaluate(()=>window.__testDeviceStreams.some(s=>s.getTracks().some(t=>t.readyState==='live'))),false);
  pass('Synthetic microphone recording saves a bounded playable media comment and leaves no live microphone tracks');
  await page.click('#study-read-aloud');await page.fill('[name=text]','A local speech test.');await page.click('#speech-generate');await expect(page.locator('#speech-status')).toHaveText('已生成；点击播放试听。');
  await expect.poll(()=>page.locator('#speech-preview').evaluate(v=>v.readyState)).toBeGreaterThan(0);assert(await page.locator('#speech-preview').evaluate(v=>v.paused));await page.click('#dialog-cancel');
  pass('Local speech preview decodes a real generated WAV and never starts playback automatically');
  await page.click('#reader-local-dictionary');await page.fill('[name=term]','knowledge');await page.click('#dictionary-lookup');await expect(page.locator('#dictionary-definition')).not.toHaveText('');await page.click('#dialog-cancel');
  assert.equal(await page.evaluate(()=>window.__testDeviceRequests.filter(c=>c.video).length),2);
  await page.screenshot({path:path.join(f.output,'captured-media.png')});
  pass('The installed system dictionary is reachable from the reader; all device tests used Chromium synthetic input only');
 }catch(e){error=e;}finally{await f.finish(error);}
})().catch(e=>{console.error(e);process.exitCode=1;});
