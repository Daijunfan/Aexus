import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{BackendClient}=require('../dist-cli/client.cjs');
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mininotion-folder-ui-')));
const root=path.join(temp,'files'),native=path.join(temp,'native');fs.mkdirSync(root);
fs.writeFileSync(path.join(root,'standalone.md'),'# Standalone folder\n');
const clients=[];
try{
  for(const folder of [true,false]){
    const client=new BackendClient(folder?{workspace:root}:{directory:native});clients.push(client);
    if(!folder)await client.call('workspace.init',{empty:true});
    const seed=await client.call('page.create',{title:folder?'Folder page':'Native page',color:'white'});
    const env={...process.env,MINI_NOTION_TEST:'1',MINI_NOTION_BACKGROUND_TEST:'1',MINI_NOTION_DATA_DIR:native};
    delete env.ELECTRON_RUN_AS_NODE;delete env.MINI_NOTION_WORKSPACE;delete env.MINI_NOTION_SOCKET;
    const app=await electron.launch({args:['.',...(folder?['--workspace',root]:[])],env});
    try{
      const page=await app.firstWindow();page.setDefaultTimeout(20000);
      await page.locator('.sidebar').waitFor();
      assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
      await expect.poll(async()=>(await client.call('status')).guiClients).toBeGreaterThan(0);
      if(folder){
        const file=(await client.call('page.list')).find(p=>p.sourceFile?.path==='standalone.md');
        await client.call('page.open',{pageId:file.id});
        await expect(page.locator('.folder-markdown')).toContainText('Standalone folder');
        await page.getByRole('button',{name:'编辑文件',exact:true}).click();
        await page.getByRole('textbox',{name:'文件内容'}).fill('# Standalone edited\n');
        await page.getByRole('button',{name:'保存文件',exact:true}).click();
        await expect.poll(()=>fs.readFileSync(path.join(root,'standalone.md'),'utf8')).toBe('# Standalone edited\n');
      }
      await client.call('page.open',{pageId:seed.id});
      await expect(page.getByRole('textbox',{name:'页面标题'})).toHaveValue(seed.title);
      await page.getByRole('textbox',{name:'页面标题'}).fill(seed.title+' GUI');
      await expect.poll(async()=>(await client.call('page.get',{pageId:seed.id})).title).toBe(seed.title+' GUI');
      console.log('PASS standalone '+(folder?'--workspace file renderer':'normal native data mode')+' — invisible window, same backend, edits persisted');
    }finally{await app.close()}
  }
  assert.ok(!JSON.stringify(await clients[1].call('workspace.get')).includes('Standalone folder'));
  console.log('PASS independent folder/native data, no migration and no model calls');
}finally{
  for(const client of clients)if(await client.ping())await client.call('service.stop').catch(()=>{});
  await new Promise(resolve=>setTimeout(resolve,150));fs.rmSync(temp,{recursive:true,force:true});
}
