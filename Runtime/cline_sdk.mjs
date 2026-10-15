// Resolve the SDK shipped with the installed native Cline CLI.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const roots=[
 ...String(process.env.PATH||'').split(path.delimiter).flatMap(dir=>{
  try{return [path.dirname(fs.realpathSync(path.join(dir,process.platform==='win32'?'cline.cmd':'cline')))+'/..']}catch{return []}
 }),
 path.join(os.homedir(),'.npm-global/lib/node_modules/cline'),
 path.join(os.homedir(),'.local/lib/node_modules/cline'),
 path.join(os.homedir(),'.local/share/cline-cli/node_modules/cline'),
 path.join(process.env.APPDATA||os.homedir(),'npm/node_modules/cline'),
 '/usr/local/lib/node_modules/cline','/opt/homebrew/lib/node_modules/cline'
];
const moduleFile=roots.flatMap(root=>[
 path.join(root,'node_modules/@cline/core/dist/index.js'),
 path.join(path.dirname(root),'@cline/core/dist/index.js')
]).find(file=>fs.existsSync(file));
if(!moduleFile)throw Error('The installed Cline native SDK is unavailable. Install the official cline npm package on this host.');
export const cliRoot=roots.find(root=>{try{return JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name==='cline'&&fs.existsSync(path.join(root,'bin','cline'))}catch{return false}});
export const sdk=await import(pathToFileURL(moduleFile).href);
