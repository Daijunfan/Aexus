const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const release=require('../src/release.cjs');

test('running backend and packed UI fingerprint exactly the same code',()=>{
 const manifest=release.verify(path.resolve(__dirname,'..'));
 assert.match(manifest.buildId,/^[0-9a-f]{64}$/);
 assert.equal(manifest.version,require('../package.json').version);
 const fromUI=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../dist/ui/release.json'),'utf8'));
 assert.equal(fromUI.buildId,manifest.buildId);
});
test('same version number with modified source, generated bundle or deleted source fails validation',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-fingerprint-'));
 try{
  fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'dist/ui'),{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),'{'+'"version":"2.9.9"}');
  fs.writeFileSync(path.join(root,'cli.cjs'),'// original');
  fs.writeFileSync(path.join(root,'src','sample.cjs'),'module.exports=1');
  fs.writeFileSync(path.join(root,'dist/ui','bundle.js'),'initial-ui-bundle');
  const data=release.create(root);fs.writeFileSync(path.join(root,'release.json'),JSON.stringify(data));
  assert.equal(release.verify(root).buildId,data.buildId);
  fs.writeFileSync(path.join(root,'dist/ui/release.json'),JSON.stringify({version:data.version,buildId:data.buildId}));
  assert.equal(release.verify(root).buildId,data.buildId,'Generated release manifest must never hash itself on macOS or Windows');
  fs.writeFileSync(path.join(root,'dist/ui','bundle.js'),'silently-overwritten-ui');
  assert.throws(()=>release.verify(root),/fingerprint mismatch/);
  fs.writeFileSync(path.join(root,'dist/ui','bundle.js'),'initial-ui-bundle');
  fs.writeFileSync(path.join(root,'src','sample.cjs'),'module.exports=2');
  assert.throws(()=>release.verify(root),/fingerprint mismatch/);
  fs.rmSync(path.join(root,'src','sample.cjs'));
  assert.throws(()=>release.verify(root),/fingerprint mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
