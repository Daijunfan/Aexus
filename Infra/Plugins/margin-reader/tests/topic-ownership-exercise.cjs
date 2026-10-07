'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {expect}=require('./ui-session.cjs');
exports.exercise=async({page,api,pass,output,url})=>{
 await fs.mkdir(output,{recursive:true});let set=await api('study.create',{title:'主题拖放验收'});
 set=await api('study.mindmap.outline.import',{setId:set.id,expectedRevision:set.revision,text:'中心主题\n  待整理\n    保留的子主题\n  目标父主题\n    目标原有子主题\n  不受影响的分支'});
 const ids=Object.fromEntries(set.cards.map(c=>[c.title,c.id])),a=ids['待整理'],b=ids['目标父主题'],child=ids['保留的子主题'];
 const get=async()=>set=await api('study.get',{setId:set.id}),change=async(method,p)=>{await get();set=await api(method,{setId:set.id,expectedRevision:set.revision,...p});await settled();};
 const node=id=>page.locator(`#study-map-world>.mindmap-topic[data-card-id="${id}"]`),view=page.locator('#study-map-viewport');
 const cam=()=>view.evaluate(el=>({x:+el.dataset.cameraX,y:+el.dataset.cameraY,z:+el.dataset.cameraZoom}));
 const settled=async()=>{await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));await expect(page.locator('#study-board')).toHaveAttribute('aria-busy','false');await expect(page.locator('#study-board')).not.toHaveAttribute('data-map-animating','true');};
 await api('study.open',{setId:set.id});await page.goto(url||page.url());await page.locator('body[data-ready=true]').waitFor();
 await page.evaluate(()=>{window.topicNativeDrags=0;document.addEventListener('dragstart',()=>window.topicNativeDrags++);});
 const undo=async()=>{await get();const r=set.revision;await page.click('#study-undo');await expect.poll(async()=>(await get()).revision).toBeGreaterThan(r);await settled();};
 const drop=async(y=.5,mode='hand',cancel=false)=>{
  await change('study.map.preferences',{mode});await page.click('#study-zoom-fit');await settled();
  if(mode==='hand'){await node(a).locator('header strong').click();await expect(node(a)).toHaveClass(/selected/);}
  const before=structuredClone(set.cards),revision=set.revision,c=await cam(),source=await node(a).boundingBox(),destination=await node(b).boundingBox(),stationary=await node(ids['不受影响的分支']).boundingBox();
  await page.mouse.move(source.x+source.width*.5,source.y+source.height*.45);await page.mouse.down();await page.mouse.move(destination.x+destination.width*.5,destination.y+destination.height*y,{steps:14});
  if(mode!=='hierarchy'){
   await expect(node(a)).toHaveAttribute('data-mm-dragging','true');await expect(node(b)).toHaveAttribute('data-mm-drop','child');await expect(page.locator('.mm-drop-status')).toContainText('目标父主题');assert(await page.locator('.mm-drop-status').evaluate(el=>getComputedStyle(el).color===getComputedStyle(document.body).color),'Drop feedback uses the readable theme foreground');
   const moved=await node(a).boundingBox();assert(Math.abs(moved.width-source.width)<.2&&Math.abs(moved.height-source.height)<.2);assert.deepEqual(await cam(),c);assert.deepEqual(await node(ids['不受影响的分支']).boundingBox(),stationary);
   assert.equal((await get()).revision,revision);await page.screenshot({path:path.join(output,'topic-drop-'+mode+'-'+y+'.png')});
  }
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
  if(cancel){await expect(page.locator('[data-mm-dragging]')).toHaveCount(0);assert.deepEqual((await get()).cards,before);return;}
  await expect.poll(async()=>(await get()).cards.find(c=>c.id===a).parentId).toBe(b);await settled();assert.equal(set.cards.find(c=>c.id===child).parentId,a);assert.equal(set.cards.length,before.length);assert.equal(set.cards.find(c=>c.id===b).collapsed,false);
  assert.equal(await page.evaluate(()=>window.topicNativeDrags),0);await expect(page.locator('.mm-drop-status,.mm-drag-overlay')).toHaveCount(0);
  await undo();assert.deepEqual(set.cards,before);
 };
 for(const y of [.1,.5,.9])await drop(y);
 pass('Dropping on the top, center or bottom of a target body always makes that target the parent; dragging moves only the chosen subtree at its original size, with one undo');
 await change('study.mindmap.configure',{patch:{skeleton:'mind-outline'}});await drop(.12,'select');await drop(.5,'hand',true);
 await change('study.card.update',{cardId:b,collapsed:true});await drop(.85);assert(set.cards.find(c=>c.id===b).collapsed);await change('study.card.update',{cardId:b,collapsed:false});
 await drop(.5,'hierarchy');await change('study.map.preferences',{mode:'hand'});
 pass('Outline-style topics, selection mode and the hierarchy tool agree on the same parent direction; collapsed targets expand atomically and cancellation preserves the graph');
 await api('settings.set',{theme:'dark'});await expect(page.locator('body')).toHaveAttribute('data-theme','dark');await drop(.35);await api('settings.set',{theme:'light'});await expect(page.locator('body')).toHaveAttribute('data-theme','light');
 pass('Dark-theme target feedback retains the same readable foreground and actual parent-change/undo behavior');
 await page.click('#study-zoom-fit');await settled();const before=await cam(),vb=await view.boundingBox();await page.mouse.move(vb.x+18,vb.y+18);await page.mouse.down();await page.mouse.move(vb.x+85,vb.y+62,{steps:8});await page.mouse.up();await expect.poll(async()=>(await cam()).x).toBeCloseTo(before.x+67,1);
 pass('Dragging genuine blank space still pans the infinite canvas independently of topic hierarchy');
};
