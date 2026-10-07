import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sdkTypes = fs.readFileSync(path.join(path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk')), 'sdk.d.ts'), 'utf8');
const controlTypes = sdkTypes.match(/declare type SDKControlRequestInner = ([^;]+);/)[1].split('|').map((name) => name.trim());
const callbacks = new Set(['can_use_tool', 'hook_callback', 'mcp_message', 'elicitation', 'request_user_dialog']);
const nativeControls = controlTypes.flatMap((name) => {
  const definition = sdkTypes.match(new RegExp(`(?:export )?declare type ${name} = ([\\s\\S]*?)\\r?\\n};`))[1];
  const subtype = definition.match(/subtype:\s*'([^']+)'/)[1];
  return callbacks.has(subtype) ? [] : [{ name: subtype, description: 'Claude Code 原生控制协议', params: { typescript: definition + '\n}' } }];
});
fs.mkdirSync('dist-cli', { recursive: true });
fs.writeFileSync('dist-cli/claude-protocol.json', JSON.stringify(nativeControls, null, 2));

await build({
  entryPoints: { server: 'src/backend/server.ts', client: 'src/backend/client.ts', cli: 'src/cli/main.ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outdir: 'dist-cli',
  outExtension: { '.js': '.cjs' },
  external: ['proper-lockfile', 'jszip', 'electron', '@anthropic-ai/claude-agent-sdk'],
  logLevel: 'warning',
});
await build({
  entryPoints: ['src/backend/converter.ts'],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: 'dist-cli/converter.mjs',
  logLevel: 'warning',
});
fs.mkdirSync('build/cli', { recursive: true });
fs.writeFileSync(
  'build/cli/mininotion',
  '#!/bin/sh\nscript_path="$0"\nwhile [ -L "$script_path" ]; do\n  link_dir=$(cd -P "$(dirname "$script_path")" && pwd)\n  link_target=$(readlink "$script_path")\n  case "$link_target" in /*) script_path="$link_target" ;; *) script_path="$link_dir/$link_target" ;; esac\ndone\nresources_dir=$(cd -P "$(dirname "$script_path")/.." && pwd)\nexec env ELECTRON_RUN_AS_NODE=1 "$resources_dir/../MacOS/Mini Notion" "$resources_dir/app.asar/dist-cli/cli.cjs" "$@"\n',
  { mode: 0o755 },
);
console.log('本地服务、CLI 和命令启动器已构建。');
