// Run every test file. Bundle TypeScript with the production resolver instead of
// relying on Node's strip-types resolver, which requires explicit TS extensions.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const coverage = process.env.MINI_NOTION_COMMAND_COVERAGE;
const files =
  process.argv.length > 2
    ? process.argv.slice(2).map((file) => path.resolve(root, file))
    : fs
        .readdirSync(path.join(root, 'tests'))
        .filter((file) => /\.test\.(ts|cjs)$/.test(file))
        .sort()
        .map((file) => path.join(root, 'tests', file));
const cache = path.join(root, 'node_modules/.cache');
fs.mkdirSync(cache, { recursive: true });
const directory = fs.mkdtempSync(path.join(cache, 'mininotion-tests-'));
try {
  let preload;
  if (coverage) {
    fs.mkdirSync(coverage, {recursive:true});
    preload = path.join(directory, 'coverage-preload.cjs');
    fs.writeFileSync(preload, `
const Module=require('node:module'),fs=require('node:fs');
const load=Module._load;
Module._load=function(request,parent,isMain){
 const value=load.apply(this,arguments);
 if(typeof request!=='string'||!request.endsWith('server.cjs')||typeof value?.startServer!=='function')return value;
 return {...value,startServer:async(...args)=>{
   const server=await value.startServer(...args),original=server.service.request.bind(server.service);
   server.service.request=async(request,...rest)=>{
     const reply=await original(request,...rest);
     fs.appendFileSync(${JSON.stringify(coverage)}+'/'+process.pid+'.jsonl',JSON.stringify({method:request.method,ok:!reply.error,error:reply.error?.code,layer:server.service.folder?'folder-service':'standalone-service'})+'\\n');
     return reply;
   };return server;
 }};
};
`);
  }
  const sources = files.filter((file) => file.endsWith('.ts'));
  if (sources.length)
    await build({
      absWorkingDir: root,
      entryPoints: sources,
      outdir: directory,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      sourcemap: 'inline',
      sourcesContent: false,
      outExtension: { '.js': '.cjs' },
      logLevel: 'warning',
      plugins: coverage ? [{ name: 'test-only-command-ledger', setup(builder) {
        builder.onLoad({ filter: /[/\\]core[/\\]commands\.ts$/ }, async args => {
          const source = fs.readFileSync(args.path, 'utf8').replace('export function executeWorkspaceCommand(', 'function untracedWorkspaceCommand(');
          return { loader: 'ts', contents: source + `
export function executeWorkspaceCommand(...args: Parameters<typeof untracedWorkspaceCommand>) {
  const trace = (ok: boolean, error?: string) => require('node:fs').appendFileSync(${JSON.stringify(coverage)} + '/' + process.pid + '.jsonl', JSON.stringify({method:args[1],ok,error,layer:'core'})+'\\n');
  try { const result=untracedWorkspaceCommand(...args); trace(true); return result; }
  catch(error) { trace(false, (error as any).code); throw error; }
}
` };
        });
      } }] : [],
    });
  const result = spawnSync(
    process.execPath,
    [
      ...(preload ? ['--require',preload] : []),
      '--enable-source-maps',
      '--test',
      '--test-concurrency=4',
      '--test-timeout=30000',
      ...files.map((file) =>
        file.endsWith('.ts') ? path.join(directory, path.basename(file, '.ts') + '.cjs') : file,
      ),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
