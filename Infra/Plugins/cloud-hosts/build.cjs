const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild')
const args=process.argv.slice(2),at=args.indexOf('--out'),out=path.resolve(at<0?path.join(__dirname,'dist-plugin'):args[at+1])
async function build(){
 fs.mkdirSync(out,{recursive:true})
 for(const name of ['agents-company.plugin.json','schema.json','runtime.cjs','cli.cjs','API.md','LICENSE','ui'])fs.cpSync(path.join(__dirname,name),path.join(out,name),{recursive:true})
 const ui=path.join(out,'ui'),common={bundle:true,target:'es2022',minify:true,legalComments:'linked'}
 await esbuild.build({...common,entryPoints:[path.join(__dirname,'ui/app.js')],format:'iife',outfile:path.join(ui,'bundle.js')})
 for(const [name,symbol] of [['terminal','terminalPane'],['desktop','desktopPane'],['vnc','RFB']]){
  const outfile=path.join(ui,name+'.bundle.js')
  await esbuild.build({...common,stdin:{contents:`import {${symbol}} from './${name}.js';window.cloudClients.${name}=${symbol}`,resolveDir:path.join(__dirname,'ui')},format:'esm',outfile})
  fs.writeFileSync(outfile,`window.cloudClientReady.${name}=(async()=>{\n`+fs.readFileSync(outfile,'utf8')+'\n})()')
 }
 for(const stale of ['bundle.css','bundle.css.LEGAL.txt','workbench.js'])fs.rmSync(path.join(ui,stale),{force:true})
 const licenses=path.join(out,'licenses');fs.mkdirSync(licenses,{recursive:true})
 for(const [name,file] of [['@novnc/novnc','LICENSE.txt'],['@xterm/xterm','LICENSE'],['@xterm/addon-fit','LICENSE']])fs.copyFileSync(path.join(__dirname,'node_modules',name,file),path.join(licenses,name.replaceAll('/','-')+'.txt'))
}
build().catch(error=>{console.error(error);process.exitCode=1})
