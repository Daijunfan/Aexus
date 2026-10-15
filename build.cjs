const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
const {spawnSync}=require('node:child_process');
function buildAexusCore(){
  const packageRoot=path.join(__dirname,'AgentBoard/Aexus');
  const manifest=path.join(packageRoot,'package.json');
  if(!fs.existsSync(manifest))throw Error('Bundled Aexus package source is missing');
  const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));
  if(pkg.name!=='aexus')throw Error('Nested resource package must retain Aexus original name');
  const nodeModules=path.join(packageRoot,'node_modules');
  if(!fs.existsSync(path.join(nodeModules,'esbuild'))){
    // Fresh checkouts restore the exact Aexus lock automatically.
    const installed=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],
      {cwd:packageRoot,stdio:'inherit',env:process.env});
    if(installed.error||installed.status!==0)throw Error('Frozen Aexus npm ci failed: '+(installed.error?.message||installed.status));
  }
  if(process.platform==='darwin'){
    const helpers=path.join(nodeModules,'node-pty/prebuilds');
    if(fs.existsSync(helpers))for(const entry of fs.readdirSync(helpers).filter(x=>/^darwin-/.test(x))){
      const helper=path.join(helpers,entry,'spawn-helper');
      if(fs.existsSync(helper)&&fs.statSync(helper).isFile())fs.chmodSync(helper,fs.statSync(helper).mode|0o111);
    }
  }
  for(const args of [['run','typecheck'],['run','build:server'],['run','build:web']]){
    const outcome=spawnSync('npm',args,{cwd:packageRoot,stdio:'inherit',env:process.env});
    if(outcome.error||outcome.status!==0)throw Error('Frozen Aexus build '+args.join(' ')+' failed: '+(outcome.error?.message||outcome.status));
  }
}

async function build() {
  buildAexusCore();
  const ui = path.join(__dirname, 'dist/ui'); fs.mkdirSync(ui, {recursive: true});
  const version=require('./package.json').version;
  const html=fs.readFileSync(path.join(__dirname,'ui/index.html'),'utf8').replace('<head>','<head><meta name="cloud-hosts-version" content="'+version+'">').replace('./style.css','./style.css?v='+version).replace('./bundle.js','./bundle.js?v='+version);
  fs.writeFileSync(path.join(ui,'index.html'),html);
  fs.copyFileSync(path.join(__dirname,'ui/style.css'),path.join(ui,'style.css'));
  fs.copyFileSync(path.join(__dirname,'ui/collaboration.css'),path.join(ui,'collaboration.css'));
  fs.copyFileSync(path.join(__dirname,'Assets/Aexus.png'),path.join(ui,'aexus.png'));
  fs.cpSync(path.join(__dirname,'ui/os'),path.join(ui,'os'),{recursive:true});
  fs.cpSync(path.join(__dirname,'ui/engines'),path.join(ui,'engines'),{recursive:true});
  const common = {bundle: true, target: 'es2022', minify: true, legalComments: 'linked', plugins:[require('./Engine/xterm-ime.cjs')]};
  await esbuild.build({...common, entryPoints: [path.join(__dirname, 'ui/app.js')], format: 'iife', outfile: path.join(ui, 'bundle.js')});
  for (const [name, symbol] of [['terminal', 'terminalPane'], ['desktop', 'desktopPane'], ['rdp', 'rdpPane'], ['info','infoPane'], ['files', 'filesPane'], ['vnc', 'RFB'], ['agent-board', 'agentBoardPane']]) {
    const outfile = path.join(ui, name + '.bundle.js');
    await esbuild.build({...common, stdin: {contents: `import {${symbol}} from './${name}.js';window.cloudClients[${JSON.stringify(name)}]=${symbol}`, resolveDir: path.join(__dirname, 'ui'), sourcefile: name + '-entry.js'}, format: 'esm', outfile});
    fs.writeFileSync(outfile, `window.cloudClientReady[${JSON.stringify(name)}]=(async()=>{\n` + fs.readFileSync(outfile, 'utf8') + '\n})()');
  }
  for (const [dir, file] of [['@novnc/novnc', 'LICENSE.txt'], ['@xterm/xterm', 'LICENSE'], ['@xterm/addon-fit', 'LICENSE']]) fs.copyFileSync(path.join(__dirname, 'node_modules', dir, file), path.join(ui, dir.split('/').at(-1) + '-LICENSE.txt'));
  for(const name of ['search','web-links','serialize','webgl'])fs.copyFileSync(path.join(__dirname,'node_modules/@xterm/'+(name==='serialize'?'xterm':'addon-'+name)+'/LICENSE'),path.join(ui,'addon-'+name+'-LICENSE.txt'));
  fs.copyFileSync(path.join(__dirname,'Vendor/guacamole/LICENSE'),path.join(ui,'guacamole-LICENSE.txt'));
  fs.copyFileSync(path.join(__dirname,'Vendor/guacamole/NOTICE'),path.join(ui,'guacamole-NOTICE.txt'));
  const manifest=require('./src/release.cjs').create(__dirname);
  fs.writeFileSync(path.join(__dirname,'release.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(ui,'release.json'),JSON.stringify({version:manifest.version,buildId:manifest.buildId})+'\n');
}
build().catch(error => {console.error(error); process.exitCode = 1;});
