import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    define: {__AGENTS_PROJECT_ROOT__:process.env.AGENTS_COMPANY_RELEASE==='1'?'undefined':JSON.stringify(resolve(__dirname))},
    // Bundle the ESM Markdown pipeline used for canonical quote validation into Core's CJS output.
    plugins: [externalizeDepsPlugin({exclude:['unified','remark-parse','remark-gfm','remark-rehype']})],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts'), daemon: resolve(__dirname, 'src/main/daemon.ts'), 'asset-index-worker':resolve(__dirname,'src/main/asset-index-worker.ts'), 'message-index-worker':resolve(__dirname,'src/main/message-index-worker.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts'), plugin: resolve(__dirname, 'src/preload/plugin.ts'), web: resolve(__dirname, 'src/preload/web.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
