// Build a compatibility patch for an already-running 2.8.0 Windows backend.
// The active backend and existing ConPTY sessions stay alive. It adds only the
// unified dropdowns; the full 2.8.1 release is installed after sessions drain.
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild')
const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts/windows-hotfix')
fs.mkdirSync(output,{recursive:true})
const css=fs.readFileSync(path.join(root,'ui/style.css'),'utf8')
const start=css.indexOf('/* CloudHosts unified dropdowns:')
const end=css.indexOf('/* Reserve a separate gutter',start)
if(start<0||end<=start)throw Error('Unified dropdown CSS section missing')
fs.writeFileSync(path.join(output,'styled-select-hotfix.css'),css.slice(start,end))
esbuild.buildSync({
  stdin:{contents:"import {installStyledSelects} from './ui/styled-select.js';installStyledSelects()",resolveDir:root,sourcefile:'styled-select-compatibility-entry.js'},
  bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,
  outfile:path.join(output,'styled-select-hotfix.js')
})
console.log('WINDOWS_HOTFIX_ASSETS_READY='+output)
