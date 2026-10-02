"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium,expect}=require('../../../node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
exports.expect=expect;
exports.create=async function(name,options={}){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-'+name+'-')),workspace=path.join(temp,'library');
  await fs.mkdir(workspace);const server=await require('../dist-plugin/lib/server.cjs').startServer({workspace});
  const report={passed:false,checks:[],browserErrors:[]};let browser;
  const output=path.join(root,'artifacts/completion-resume-20260929',name);await fs.mkdir(output,{recursive:true});
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/Users/djf/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',...(options.launch||{})});
    const context=await browser.newContext({viewport:{width:1520,height:1000},...(options.context||{})});const page=await context.newPage();
    page.on('pageerror',error=>report.browserErrors.push(error.message));page.setDefaultTimeout(15000);
    return {page,context,server,workspace,temp,output,report,
      api:async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});assert(!r.error,JSON.stringify(r.error));return r.result;},
      pass:text=>{report.checks.push(text);console.log('PASS '+text);},
      finish:async(error)=>{
        if(error){report.error=error.stack;await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
        report.passed=!error&&!report.browserErrors.length;
        await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));await browser.close();await server.close();await fs.rm(temp,{recursive:true,force:true});
        if(error)throw error;assert.deepEqual(report.browserErrors,[]);
      }};
  }catch(error){await browser?.close();await server.close();await fs.rm(temp,{recursive:true,force:true});throw error;}
};
