import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    define: {__AGENTS_PROJECT_ROOT__:process.env.AGENTS_COMPANY_RELEASE==='1'?'undefined':JSON.stringify(resolve(__dirname))},
    // Bundle the ESM Markdown pipeline used for canonical quote validation into Core's CJS output.
    plugins: [externalizeDepsPlugin({exclude:['unified','remark-parse','remark-gfm','remark-rehype']})],
    build: {
      outDir: resolve(__dirname, '.aexus/out/main'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'Infra/src/main/index.ts'), daemon: resolve(__dirname, 'Infra/src/main/daemon.ts'), 'asset-index-worker':resolve(__dirname,'Infra/src/main/asset-index-worker.ts'), 'message-index-worker':resolve(__dirname,'Infra/src/main/message-index-worker.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, '.aexus/out/preload'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'Infra/src/preload/index.ts'), plugin: resolve(__dirname, 'Infra/src/preload/plugin.ts'), web: resolve(__dirname, 'Infra/src/preload/web.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'Infra/src/renderer'),
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, '.aexus/out/renderer'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'Infra/src/renderer/index.html') }
      }
    }
  }
})
