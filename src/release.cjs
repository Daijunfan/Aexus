// Content-addressed CloudHosts build identity, shared by source, installed
// backend and packaged UI. No credentials, local paths or user data included.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const digest=data=>createHash('sha256').update(data).digest('hex');
const relative=(root,file)=>path.relative(root,file).replaceAll(path.sep,'/');
function sourceFiles(root){
 const collected=[];
 for(const file of ['cli.cjs','schema.json','package.json'])if(fs.existsSync(path.join(root,file)))collected.push(path.join(root,file));
 for(const folder of ['src','Runtime','dist/ui','docs','AgentBoard/Aexus']){
  const directory=path.join(root,folder);if(!fs.existsSync(directory))continue;
  const walk=dir=>{
   for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory()){
      if(['AgentBoard/Aexus/PlugIns','AgentBoard/Aexus/build/plugins'].includes(relative(root,file)))continue;
      if(folder==='AgentBoard/Aexus'&&['node_modules','.git','artifacts','release','.dist','dist','test-results','test','__pycache__','out-tsc'].includes(item.name))continue;
      // The macOS app includes bundled GUI/RDP frameworks while the Windows
      // release ships its own native runtime. Fingerprint only the portable
      // Runtime scripts which exist in BOTH installed backends.
      if(folder!=='Runtime')walk(file);
    }
    else if(item.isFile()&&item.name!=='release.json'&&item.name!=='.DS_Store'&&
      (folder!=='Runtime'||/\.(?:py|ps1|mjs|cjs|txt|json)$/.test(item.name)))collected.push(file);
   }
  };walk(directory);
 }
 return collected.sort((a,b)=>relative(root,a).localeCompare(relative(root,b),'en'));
}
function create(root=path.join(__dirname,'..')){
 const files=Object.fromEntries(sourceFiles(root).map(file=>[relative(root,file),digest(fs.readFileSync(file))]));
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 const buildId=digest(JSON.stringify({version,files}));
 return {version,buildId,algorithm:'sha256',files};
}
function verify(root=path.join(__dirname,'..')){
 const stored=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
 const current=create(root);
 if(stored.version!==current.version||stored.buildId!==current.buildId)
  throw Error('CloudHosts release fingerprint mismatch. Rebuild and install both backend and UI from one source revision.');
 return {version:current.version,buildId:current.buildId,verified:true};
}
module.exports={create,verify};
