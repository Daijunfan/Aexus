const esbuild=require('esbuild'), path=require('node:path'), fs=require('node:fs')
const root=path.resolve(__dirname,'..')
const artifacts=path.join(root,'artifacts')
fs.mkdirSync(artifacts,{recursive:true})
esbuild.buildSync({
  stdin:{
    contents:"import * as component from './ui/styled-select.js';window.__styledSelect=component",
    resolveDir:root,sourcefile:'styled-select-test-entry.js'
  },
  bundle:true,format:'iife',platform:'browser',target:'es2022',
  outfile:path.join(artifacts,'styled-select-test.bundle.js')
})
