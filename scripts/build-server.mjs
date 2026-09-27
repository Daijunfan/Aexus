import path from 'node:path'
import fs from 'node:fs'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..')
await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:path.join(root,'out/main/daemon.js'),bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:'undefined'},logLevel:'info'})
if(!fs.existsSync(path.join(root,'out/renderer/index.html')))console.warn('Build the browser UI with npm run build:web before starting the web server.')
