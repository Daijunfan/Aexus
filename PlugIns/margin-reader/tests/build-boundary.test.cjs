"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {destination}=require('../scripts/build-path.cjs');
test('plugin build rejects source/workspace aliases, unrelated directories and link-based overwrites',t=>{
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mr-build-check-')));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const root=path.join(temp,'source');fs.mkdirSync(root);
 assert.equal(destination(root,path.join(root,'dist-plugin')),path.join(root,'dist-plugin'));
 for(const out of [root,temp,path.join(root,'workspaces'),path.join(root,'ui'),path.join(root,'.margin-reader')])assert.throws(()=>destination(root,out));
 const unrelated=path.join(temp,'documents');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'my-notes.md'),'Private document');assert.throws(()=>destination(root,unrelated));
 const link=path.join(root,'dist-plugin');fs.symlinkSync(unrelated,link);assert.throws(()=>destination(root,link));fs.unlinkSync(link);
 const output=path.join(temp,'build-output');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'agents-company.plugin.json'),JSON.stringify({id:'margin-reader'}));assert.equal(destination(root,output),output);
 fs.symlinkSync(unrelated,path.join(output,'lib'));assert.throws(()=>destination(root,output));assert.equal(fs.readFileSync(path.join(unrelated,'my-notes.md'),'utf8'),'Private document');
});
