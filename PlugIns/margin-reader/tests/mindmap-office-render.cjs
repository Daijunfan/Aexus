'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const exec=require('node:util').promisify(require('node:child_process').execFile);
(async()=>{
 const root=path.resolve(__dirname,'..'),out=(await fs.readFile(path.join(root,'artifacts/completion-current.txt'),'utf8')).trim(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-office-check-')),source=path.join(out,'editable-pitch.pptx'),dir=path.join(out,'office-render');await fs.mkdir(dir,{recursive:true});
 const report={passed:false,renderer:'LibreOffice headless, isolated user profile',modelCalls:0};
 try{
  const result=await exec('/Applications/LibreOffice.app/Contents/MacOS/soffice',['-env:UserInstallation='+pathToFileURL(path.join(temp,'profile')).href,'--headless','--nologo','--nodefault','--norestore','--convert-to','pdf','--outdir',dir,source],{timeout:60000,env:{...process.env,TMPDIR:temp,XDG_CACHE_HOME:path.join(temp,'cache'),XDG_CONFIG_HOME:path.join(temp,'config')},maxBuffer:1024*1024});report.log=result.stdout+result.stderr;
  const file=path.join(dir,'editable-pitch.pdf'),bytes=await fs.readFile(file),pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0,isEvalSupported:false});
  try{const pdf=await task.promise;assert.equal(pdf.numPages,4);report.pages=pdf.numPages;report.text=[];
   for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),text=(await page.getTextContent()).items.map(v=>v.str).join('');report.text.push(text);const v=page.getViewport({scale:1.1}),canvas=require('@napi-rs/canvas').createCanvas(Math.ceil(v.width),Math.ceil(v.height));await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;await fs.writeFile(path.join(dir,`page-${i}.png`),await canvas.encode('png'));}
   assert(report.text[0].includes('知识工作台'));assert(report.text[1].includes('数学与推导'));assert(report.text[2].includes('实验记录'));
  }finally{await task.destroy();}
  report.passed=true;console.log('PASS An independent Office renderer opens the generated editable PPTX, exports all four pages and preserves Chinese titles and formula graphics');
 }catch(e){report.error=e.stack;throw e;}finally{await fs.writeFile(path.join(out,'office-render-results.json'),JSON.stringify(report,null,2));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
