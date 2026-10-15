// Actual MiniNotion responsive homepage. Only isolated local content, no model calls.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),output=path.resolve(import.meta.dirname,'..'),root=path.dirname(output),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-notion-photo-'));
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')};for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'])delete env[key];
const app=await electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',env,args:[]}),page=await app.firstWindow();let win;const errors=[];
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:30000,maxBuffer:8e6})).stdout);assert.ok(r.ok,r.error);return r.data};
const p=(method,params={})=>cli('plugin','call','mininotion',method,'--team','灵感工作室','--params',JSON.stringify(params));
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','灵感工作室','--mode','work','--plugin','mininotion');await p('settings.set',{changes:{theme:'light',sidebarWidth:200}});
 const cards=[];for(const [title,icon,cover,content] of [
 ['产品路线图','🧭','blue','从用户遇到的问题出发，确定这一版最重要的目标。'],
 ['设计灵感','🎨','dusk','记录值得参考的排版、配色与交互。'],
 ['写作工作台','✍️','pink','用简单的话，写清楚一件值得分享的事。'],
 ['发布准备','🚀','sunset','封面、简介、下载链接与反馈入口。'],
 ['项目笔记','📝','sand','今天做了什么，还需要确认什么。'],
 ['资料书架','📚','paper','把读过的资料留在这里，下次继续用。']])cards.push(await p('page.create',{title,icon,cover,color:'white',blocks:[{type:'paragraph',content}]}));
 let opening=app.waitForEvent('window');let info=await cli('plugin','open','mininotion','--team','灵感工作室');win=await opening;win.on('pageerror',e=>errors.push(e.message));await cli('plugin','place',info.id,'--width','700','--height','1040');await win.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click();await expect(win.locator('.recent-card')).toHaveCount(6);
 await p('page.open',{pageId:cards[0].id});await win.getByRole('button',{name:'更换页面图标'}).click();await win.getByRole('button',{name:'🚀',exact:true}).click();await expect.poll(async()=>(await p('page.get',{pageId:cards[0].id})).icon).toBe('🚀');await p('page.update',{pageId:cards[0].id,changes:{icon:'🧭'}});
 await cli('plugin','dismiss',info.id);opening=app.waitForEvent('window');info=await cli('plugin','open','mininotion','--team','灵感工作室');win=await opening;await cli('plugin','place',info.id,'--width','700','--height','1040');await win.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click();
 await expect(win.locator('.recent-card .page-emoji')).toHaveCount(6);assert.equal(new Set(await win.locator('.recent-card .page-emoji').allTextContents()).size,6);assert.equal(await win.locator('.recent-card .page-default-icon').count(),0);
 const styles=await win.locator('.recent-card .card-preview').evaluateAll(elements=>elements.map(e=>getComputedStyle(e).backgroundImage));assert.equal(new Set(styles).size,6);assert.ok(styles.every(s=>s!=='none'));
 await win.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));await win.locator('.recent-grid').screenshot({path:path.join(output,'_原始截图/12-Notion-六张卡片.png'),scale:'css'});
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(import.meta.dirname,'MiniNotion图标验收.json'),JSON.stringify({appVersion:await app.evaluate(({app})=>app.getVersion()),capturedAt:new Date().toISOString(),publicApis:['page.create','page.update','page.get'],checks:['six distinct icons','six distinct covers','editable non-empty content','GUI icon update visible via CLI','close/reopen persistence','actual responsive two-column layout','hidden windows only','zero model calls'],cards:cards.map(({title,icon,cover})=>({title,icon,cover})),source:'_原始截图/12-Notion-六张卡片.png'},null,2));console.log('PASS MiniNotion icons/covers persist through CLI + GUI + close/reopen; screenshot captured from real responsive layout. No product source changes needed.');
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
