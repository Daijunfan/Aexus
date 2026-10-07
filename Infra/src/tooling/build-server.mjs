import path from 'node:path'
import fs from 'node:fs'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..')
await build({entryPoints:{'asset-index-worker':path.join(root,'Infra/src/main/asset-index-worker.ts'),daemon:path.join(root,'Infra/src/main/daemon.ts'),'message-index-worker':path.join(root,'Infra/src/main/message-index-worker.ts')},outdir:path.join(root,'.aexus/out/main'),bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:'undefined'},logLevel:'info'})
if(!fs.existsSync(path.join(root,'.aexus/out/renderer/index.html')))console.warn('Build the browser UI with npm run build:web before starting the web server.')
