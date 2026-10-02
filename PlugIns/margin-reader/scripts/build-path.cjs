"use strict";
const fs=require('node:fs'),path=require('node:path');
function destination(source,input){
 const root=fs.realpathSync(source),out=path.resolve(input),relative=path.relative(root,out),parts=relative.split(path.sep);
 if(out===root||root.startsWith(out+path.sep))throw Error('Build output cannot overwrite source or its ancestors.');
 if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)&&parts[0]!=='dist-plugin')throw Error('Build output inside the plugin must be dist-plugin/; source and user workspaces are protected.');
 let walk=path.parse(out).root;
 for(const part of out.slice(walk.length).split(path.sep).filter(Boolean)){
  walk=path.join(walk,part);let st;try{st=fs.lstatSync(walk);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(st.isSymbolicLink()||!st.isDirectory())throw Error('Build destination must use real directories, not symbolic links.');
 }
 if(fs.existsSync(out)){
  const entries=fs.readdirSync(out);
  if(entries.length){
   const manifest=path.join(out,'agents-company.plugin.json');let identity;try{identity=JSON.parse(fs.readFileSync(manifest,'utf8'));}catch{throw Error('Refusing to build over an unrelated nonempty directory.');}
   if(identity.id!=='margin-reader')throw Error('Build destination belongs to a different plugin.');
   const check=directory=>{for(const item of fs.readdirSync(directory,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('Existing build output contains a symbolic link.');if(['workspaces','.margin-reader','.agents-company'].includes(item.name))throw Error('Existing output contains user workspace data.');if(item.isDirectory())check(path.join(directory,item.name));}};check(out);
  }
 }
 return out;
}
module.exports={destination};
