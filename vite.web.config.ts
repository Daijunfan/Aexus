import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
export default defineConfig({root:resolve(__dirname,'src/renderer'),plugins:[react()],base:'./',build:{outDir:resolve(__dirname,'out/renderer'),emptyOutDir:true},server:{host:'127.0.0.1'}})
