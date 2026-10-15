const fs = require('node:fs'), path = require('node:path');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {randomUUID, createHash} = require('node:crypto');
const registry = require('./registry.cjs'), ssh = require('./ssh.cjs');
const localFiles = require('./local-files.cjs'), agentHosts = require('./agent-hosts.cjs');
const digest = data => createHash('sha256').update(data).digest('hex');
const utf8 = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true});
const root = path.join(registry.home, 'station'), content = path.join(root, 'content'), index = path.join(root, 'index.json');
const jobs = new Map(), chunkSize = 256 * 1024;
const leaf = value => String(value || '').split(/[/\\]/).at(-1);
function validName(value) {
  if (!value || value === '.' || value === '..' || /[/\\\x00-\x1f]/.test(value)) throw Error('文件名不能包含路径分隔符');
  return value;
}
function save(rows) {fs.writeFileSync(index + '.tmp', JSON.stringify(rows, null, 2), {mode: 0o600});fs.renameSync(index + '.tmp', index);}
function unique(rows, parent, filename) {
  const ext = path.extname(filename), base = filename.slice(0, filename.length - ext.length);let value = filename, n = 2;
  while (rows.some(row => row.parent === parent && row.name === value)) value = base + ' (' + n++ + ')' + ext;
  return value;
}
function load() {
  fs.mkdirSync(content, {recursive: true, mode: 0o700});
  if (!fs.existsSync(index)) {
    const rows = [], old = fs.readdirSync(root).filter(id => /^[a-f0-9-]{36}$/.test(id));
    for (const id of old) {
      const item = JSON.parse(fs.readFileSync(path.join(root, id, 'item.json'), 'utf8'));
      item.name = unique(rows, null, item.name);item.parent = null;item.type = 'file';item.modifiedAt = item.createdAt;
      fs.copyFileSync(path.join(root, id, 'files', JSON.parse(fs.readFileSync(path.join(root,id,'item.json'))).name), path.join(content, item.name));rows.push(item);
    }
    save(rows);for (const id of old) fs.rmSync(path.join(root, id), {recursive: true});
  }
  return JSON.parse(fs.readFileSync(index, 'utf8'));
}
function get(id, rows = load()) {const item = rows.find(row => row.id === id);if (!item) throw Error('中转站项目不存在');return item;}
function parentItem(parent, rows) {if (parent && get(parent, rows).type !== 'folder') throw Error('目标必须是文件夹');}
function names(item, rows) {const parts = [item.name];while (item.parent) {item = get(item.parent, rows);parts.unshift(item.name);}return parts;}
function file(id, rows = load()) {return path.join(content, ...names(get(id, rows), rows));}
function ancestor(id, item, rows) {while (item) {if (item.id === id) return true;item = item.parent ? get(item.parent, rows) : null;}return false;}
function busy(id, rows) {
  if ([...jobs.values()].some(job => job.state === 'running' && job.item && (ancestor(id, get(job.item, rows), rows) || ancestor(job.item, get(id, rows), rows)))) throw Error('项目正在传输，请完成或取消后修改');
}
function list() {
  const rows = load();return {items: rows.map(item => ({...item, logicalPath: names(item, rows).join('/'), children: item.type === 'folder' ? rows.filter(row => row.parent === item.id).length : undefined})), jobs: [...jobs.values()].map(({cancelled, ...job}) => job)};
}
function record(filename, type, parent, source) {return {id: randomUUID(), name: validName(filename), type, parent: parent || null, source: source || {kind: 'station', name: '中转站'}, mode: type === 'folder' ? 0o700 : 0o600, bytes: 0, createdAt: Date.now(), modifiedAt: Date.now()};}
function create(filename, type = 'file', parent = null, text = '') {
  const rows = load();parentItem(parent, rows);validName(filename);if (!['file','folder'].includes(type)) throw Error('项目类型必须是文件或文件夹');
  if (rows.some(row => row.parent === parent && row.name === filename)) throw Error('同名项目已存在');
  const item = record(filename, type, parent), target = path.join(parent ? file(parent, rows) : content, filename);
  if (type === 'folder') fs.mkdirSync(target);else {fs.writeFileSync(target, text, {flag: 'wx', mode: 0o600});item.bytes = Buffer.byteLength(text);item.sha256 = createHash('sha256').update(text).digest('hex');}
  rows.push(item);save(rows);return item;
}
function update(id, patch) {
  const rows = load(), item = get(id, rows);busy(id, rows);
  const parent = patch.parent === undefined ? item.parent : patch.parent || null, filename = validName(patch.name || item.name);
  parentItem(parent, rows);if (parent && ancestor(id, get(parent, rows), rows)) throw Error('不能把文件夹放到自己或子文件夹中');
  if (rows.some(row => row.id !== id && row.parent === parent && row.name === filename)) throw Error('目标已有同名项目');
  const before = file(id, rows), after = path.join(parent ? file(parent, rows) : content, filename);
  if (before !== after) fs.renameSync(before, after);
  item.name = filename;item.parent = parent;item.modifiedAt = Date.now();save(rows);return item;
}
function read(id) {
  const item = get(id);if (item.type !== 'file') throw Error('请选择文件');
  const target = file(id);
  if (fs.statSync(target).size > 1024 * 1024) throw Error('请选择 1 MB 以内的文本文件');
  const data = fs.readFileSync(target);
  if (data.includes(0)) throw Error('此文件不是文本文件，原文件未修改');
  let text;try {text = utf8.decode(data);} catch {throw Error('此文件不是有效 UTF-8 文本，无法无损编辑；原文件未修改，请下载后使用对应编码打开。');}
  const sha256 = digest(data);
  return {item:{...item,bytes:data.length,sha256}, text, sha256};
}
function write(id, text, expectedHash, force = false) {
  const rows = load(), item = get(id, rows);busy(id, rows);
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw Error('文本须为 1 MB 以内的字符串');
  const current = read(id);
  if (!force && typeof expectedHash !== 'string') throw Error('保存需要读取时的 expectedHash；CLI 请使用 --expected-hash，明确覆盖时使用 --force。');
  if (!force && current.sha256 !== expectedHash) throw Error('文件已被其他窗口或进程修改；本次内容未保存，请保留编辑内容并重新读取。');
  const target = file(id, rows), temporary = target + '.save-' + randomUUID();
  try {
    const fd = fs.openSync(temporary, 'wx', fs.statSync(target).mode & 0o777);
    try {fs.writeFileSync(fd, text);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(temporary, target);
  } finally {fs.rmSync(temporary,{force:true});}
  item.bytes = Buffer.byteLength(text);item.sha256 = digest(text);item.modifiedAt = Date.now();save(rows);return item;
}
function remove(id) {
  const rows = load();get(id, rows);busy(id, rows);fs.rmSync(file(id, rows), {recursive: true});save(rows.filter(item => !ancestor(id, item, rows)));return {removed: true, id};
}
function exportFile(id, destination) {
  const item = get(id);if (fs.existsSync(destination) && fs.statSync(destination).isDirectory()) destination = path.join(destination, item.name);
  if (fs.existsSync(destination)) throw Error('目标已存在，未覆盖');
  fs.cpSync(file(id), destination, {recursive: item.type === 'folder', errorOnExist: true, force: false});return {path: destination, bytes: item.bytes};
}
async function copyStream(stream, target, {progress = () => {}, expectedHash} = {}) {
  let bytes = 0;const hash = createHash('sha256');
  await pipeline(stream, new Transform({transform(data, _encoding, callback) {bytes += data.length;hash.update(data);progress(data.length);callback(null,data);}}), fs.createWriteStream(target, {flags: 'wx', mode: 0o600}));
  const sha256 = hash.digest('hex');if (expectedHash && sha256 !== expectedHash) throw Error('文件校验失败，未保留不完整副本');return {bytes, sha256};
}
function commit(partial, records, parent) {
  const rows = load();parentItem(parent, rows);const item = records[0];item.parent = parent || null;item.name = unique(rows, item.parent, item.name);
  fs.renameSync(partial, path.join(parent ? file(parent, rows) : content, item.name));save([...rows,...records]);return item;
}
async function ingest(stream, filename, source, options = {}) {
  load();filename = validName(leaf(filename));const partial = path.join(root, '.partial-' + randomUUID());
  let transferred = 0;try {const values = await copyStream(stream, partial, {expectedHash: options.expectedHash, progress: count => {transferred += count;options.progress?.(transferred, options.total);}});const item = {...record(filename, 'file', null, source), ...values, mode: options.mode || 0o600};return commit(partial,[item],options.parent);} catch (error) {fs.rmSync(partial,{force:true});throw error;}
}
async function importFile(localPath, parent = null) {
  const info = fs.lstatSync(localPath);if (info.isSymbolicLink()) throw Error('请选择普通文件或文件夹');
  if (!info.isDirectory()) return ingest(fs.createReadStream(localPath), path.basename(localPath), {kind:'mac',name:'Mac'}, {parent, mode:info.mode & 0o777});
  load();const partial = path.join(root, '.partial-' + randomUUID()), records = [];
  async function walk(source, target, parentId) {
    const stat = fs.lstatSync(source);if (stat.isSymbolicLink()) throw Error('文件夹中包含符号链接，请选择普通文件夹');
    const item = record(path.basename(source), stat.isDirectory() ? 'folder' : 'file', parentId, {kind:'mac',name:'Mac'});records.push(item);
    if (stat.isDirectory()) {fs.mkdirSync(target);for (const child of fs.readdirSync(source)) await walk(path.join(source, child), path.join(target, child),item.id);}
    else Object.assign(item,await copyStream(fs.createReadStream(source),target),{mode:stat.mode & 0o777});
  }
  try {await walk(localPath,partial,null);return commit(partial,records,parent);}catch(error){fs.rmSync(partial,{recursive:true,force:true});throw error;}
}
function startJob(kind, hostValue, filename, action, item, metadata = {}) {
  const host = agentHosts.get(hostValue), job = {id:randomUUID(),kind,host:host.id,hostName:host.name,name:filename,item,state:'running',bytes:0,total:0,createdAt:Date.now(),...metadata};jobs.set(job.id,job);
  void action(job,host).then(result=>{job.state='done';job.result=result;job.finishedAt=Date.now();},error=>{job.state=job.cancelled?'cancelled':'failed';job.error=error.message;job.finishedAt=Date.now();});return {...job};
}
function checkCancelled(job) {if(job.cancelled)throw Error('传输已取消');}
async function worker(host, directory) {
  if(host.id==='local')return {call:(operation,args)=>localFiles.files(operation,args,directory||host.defaultDirectory),close(){}};
  const client=new ssh.Workspace(host.id,directory);try{await client.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'cloud-hosts-station',version:'2'}});return client;}catch(error){client.close();throw error;}}
function fetchFile(host, directory, remotePath, parent = null) {
  return startJob('fetch',host,leaf(remotePath),async(job,h)=>{
    const client=await worker(h,directory),call=(operation,args)=>client.call('workspace',{operation,args}),partial=path.join(root,'.partial-'+randomUUID()),records=[];load();
    async function* chunks(remote,info){for(let offset=0;offset<info.bytes;offset+=chunkSize){checkCancelled(job);const r=await call('copy-read',{path:remote,offset,length:Math.min(chunkSize,info.bytes-offset)});if(!r.bytes)throw Error('远端文件发生变化');yield Buffer.from(r.data,'base64');}checkCancelled(job);const after=await call('copy-info',{path:remote});if(after.bytes!==info.bytes||after.modifiedAt!==info.modifiedAt)throw Error('远端文件发生变化，请重试');}
    async function walk(remote,target,parentId) {
      checkCancelled(job);const info=await call('copy-info',{path:remote,hash:true});if(!info.exists||info.symlink)throw Error('请选择普通文件或文件夹');
      const item=record(leaf(remote),'directory' in info&&info.directory?'folder':'file',parentId,{kind:'host',id:h.id,name:h.name});records.push(item);
      if(info.directory){
        fs.mkdirSync(target);
        // Transfer enumeration is independent of the UI's hidden-file preference.
        const manifest = entries => JSON.stringify(entries.map(e=>[e.path,e.directory,e.symlink]).sort((a,b)=>a[0].localeCompare(b[0])));
        const listing=await call('list',{path:remote,hidden:true});
        for(const entry of listing.entries)await walk(entry.path,path.join(target,entry.name),item.id);
        const after=await call('list',{path:remote,hidden:true});
        if(manifest(listing.entries)!==manifest(after.entries))throw Error('源目录在传输期间发生变化，请重试；未保留不完整副本');
      }
      else{job.total+=info.bytes;Object.assign(item,await copyStream(Readable.from(chunks(remote,info)),target,{expectedHash:info.sha256,progress:count=>{job.bytes+=count;}}),{mode:info.mode});}
    }
    try {await walk(remotePath,partial,null);checkCancelled(job);return commit(partial,records,parent);}catch(error){fs.rmSync(partial,{recursive:true,force:true});throw error;}finally{client.close();}
  });
}
function sendFile(itemId,host,directory,filename) {
  const rows=load(),item=get(itemId,rows),destination=validName(filename||item.name),entries=rows.filter(row=>ancestor(itemId,row,rows));
  return startJob('send',host,destination,async(job,h)=>{
    const client=await worker(h,directory),temporary='.cloud-hosts-transfer-'+randomUUID(),call=(operation,args)=>client.call('workspace',{operation,args});job.total=entries.reduce((sum,row)=>sum+(row.type==='file'?row.bytes:0),0);
    try {
      if((await call('copy-info',{path:destination})).exists)throw Error('目标已有同名项目，未覆盖；请选择其他目录或改名发送');
      if(item.type==='folder')await call('copy-mkdir',{path:temporary});
      for(const row of entries){checkCancelled(job);const relative=path.relative(file(itemId,rows),file(row.id,rows)).split(path.sep).join('/'),remote=temporary+(relative?'/'+relative:'');
        if(row.type==='folder'){if(relative)await call('copy-mkdir',{path:remote});continue;}
        let offset=0;const stream=fs.createReadStream(file(row.id,rows),{highWaterMark:chunkSize});
        try {for await(const data of stream){checkCancelled(job);await call('copy-write',{path:remote,offset,data:data.toString('base64'),final:offset+data.length===row.bytes,mode:row.mode});offset+=data.length;job.bytes+=data.length;}}finally{stream.destroy();}
        if(!row.bytes)await call('copy-write',{path:remote,offset:0,data:'',final:true,mode:row.mode});
        const verified=await call('copy-info',{path:remote,hash:true});if(verified.sha256!==row.sha256)throw Error('远端文件校验失败');
      }
      checkCancelled(job);return {...await call('copy-commit',{path:temporary,to:destination}),host:h.id,directory,bytes:job.total,sha256:item.sha256};
    }finally{try{await call('copy-remove',{path:temporary});}catch{}client.close();}
  },itemId);
}
// A File Board drag always COPIES. The controller streams bounded binary
// chunks between two authenticated host workers; no file is left in the station
// and the source is never deleted. Source manifests include hidden files and
// empty folders independently of the File Board eye setting.
function copyBetweenHosts({sourceHost,sourceDirectory,path:sourcePath,host:targetHost,directory:targetDirectory,to}) {
  const source=agentHosts.get(sourceHost),target=agentHosts.get(targetHost);
  const sourceName=source.os==='windows'?leaf(sourcePath):String(sourcePath||'').split('/').at(-1);
  const targetPathValue=to===undefined ? sourceName : to;
  const relative=(value,label,os)=>{
    if(typeof value!=='string'||!value||value.length>4096||/[\x00-\x1f]/.test(value)||value.startsWith('/')||(os==='windows'&&value.startsWith('\\')))throw Error('Invalid '+label+' relative path');
    const segments=(os==='windows'?value.replaceAll('\\','/'):value).split('/');
    if(segments.some(segment=>!segment||segment==='.'||segment==='..'))throw Error('Unsafe '+label+' relative path');
    if(os==='windows'&&segments.some(segment=>/[<>:"|?*]/.test(segment)||/[. ]$/.test(segment)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)))throw Error('Invalid Windows filename in '+label+' path');
    return segments.join('/');
  };
  const from=relative(sourcePath,'source',source.os),destination=relative(targetPathValue,'destination',target.os);
  const sourceDir=sourceDirectory||source.defaultDirectory,targetDir=targetDirectory||target.defaultDirectory;
  const paths=source.os==='windows'?path.win32:path.posix;
  const targetPaths=target.os==='windows'?path.win32:path.posix;
  if(typeof sourceDir!=='string'||!paths.isAbsolute(sourceDir)||typeof targetDir!=='string'||!targetPaths.isAbsolute(targetDir))
    throw Error('Both source and destination require absolute working directories');
  if(source.id===target.id){
    const src=paths.resolve(sourceDir,from),dest=paths.resolve(targetDir,destination);
    if(source.os==='windows'?dest.toLowerCase()===src.toLowerCase():dest===src)throw Error('Source and destination are the same file or folder');
    const inside=paths.relative(src,dest);
    if(inside&&inside!=='..'&&!inside.startsWith('..'+paths.sep)&&!paths.isAbsolute(inside))
      throw Error('Cannot copy a directory into itself or its descendants');
    // When the destination root is inside the source folder, staging there
    // could recursively ingest its own transfer data. Reject it up front.
    const destinationRoot=paths.resolve(targetDir),relativeRoot=paths.relative(src,destinationRoot);
    if(relativeRoot===''||(relativeRoot!=='..'&&!relativeRoot.startsWith('..'+paths.sep)&&!paths.isAbsolute(relativeRoot)))
      throw Error('Cannot copy a directory into itself or its descendants');
  }
  const parent=destination.includes('/')?destination.slice(0,destination.lastIndexOf('/')):'.';
  return startJob('copy',target.id,sourceName,async(job,targetHostRecord)=>{
    let srcClient,dstClient;
    const temporary='.cloud-hosts-transfer-'+randomUUID();
    job.files=0;job.folders=0;
    try{
      srcClient=await worker(source,sourceDir);
      dstClient=await worker(targetHostRecord,targetDir);
      const read=(operation,args)=>srcClient.call('workspace',{operation,args});
      const write=(operation,args)=>dstClient.call('workspace',{operation,args});
      const folder=await write('copy-info',{path:parent});
      if(!folder.exists||!folder.directory||folder.symlink)throw Error('Destination must be an existing ordinary folder');
      if((await write('copy-info',{path:destination})).exists)throw Error('Destination already exists; rename the copy instead of overwriting');
      const manifest=entries=>JSON.stringify(entries.map(e=>[e.path,e.name,e.directory,e.symlink,e.bytes,e.modifiedAt]).sort((a,b)=>a[0].localeCompare(b[0])));
      async function traverse(remote,staging){
        checkCancelled(job);
        const info=await read('copy-info',{path:remote,hash:true});
        if(!info.exists||info.symlink||(!info.directory&&!info.regular))throw Error('Cannot copy symbolic links or non-regular files');
        if(info.directory){
          job.folders++;
          await write('copy-mkdir',{path:staging});
          const before=await read('list',{path:remote,hidden:true});
          for(const entry of before.entries){
            checkCancelled(job);
            await traverse(remote+'/'+entry.name,staging+'/'+entry.name);
          }
          const after=await read('list',{path:remote,hidden:true});
          if(manifest(before.entries)!==manifest(after.entries))throw Error('Source directory changed during transfer; no destination was committed');
          return;
        }
        job.files++;job.total+=info.bytes;
        let offset=0;
        while(offset<info.bytes){
          checkCancelled(job);
          const part=await read('copy-read',{path:remote,offset,length:Math.min(chunkSize,info.bytes-offset)});
          const data=Buffer.from(part.data||'','base64');
          if(!data.length||data.length!==part.bytes||data.length>chunkSize)throw Error('Source returned an incomplete transfer chunk');
          await write('copy-write',{path:staging,offset,data:part.data,final:offset+part.bytes===info.bytes,mode:info.mode});
          offset+=part.bytes;job.bytes+=part.bytes;
        }
        if(info.bytes===0)await write('copy-write',{path:staging,offset:0,data:'',final:true,mode:info.mode});
        const unchanged=await read('copy-info',{path:remote,hash:true});
        if(!unchanged.exists||unchanged.sha256!==info.sha256||unchanged.bytes!==info.bytes||unchanged.modifiedAt!==info.modifiedAt)
          throw Error('Source file changed during transfer; no destination was committed');
        const transferred=await write('copy-info',{path:staging,hash:true});
        if(transferred.sha256!==info.sha256||transferred.bytes!==info.bytes)
          throw Error('Transfer checksum mismatch; incomplete destination discarded');
      }
      await traverse(from,temporary);
      checkCancelled(job);
      if((await write('copy-info',{path:destination})).exists)throw Error('Destination already exists; no files overwritten');
      const result=await write('copy-commit',{path:temporary,to:destination});
      return {...result,sourceHost:source.id,host:targetHostRecord.id,sourcePath:from,bytes:job.bytes,files:job.files,folders:job.folders};
    }finally{
      if(dstClient){try{await dstClient.call('workspace',{operation:'copy-remove',args:{path:temporary}})}catch{}dstClient.close()}
      srcClient?.close();
    }
  },undefined,{
    source:{hostId:source.id,hostName:source.name,directory:sourceDir,path:from},
    destination:{hostId:target.id,hostName:target.name,directory:targetDir,path:destination}
  });
}
function cancel(id){const job=jobs.get(id);if(!job)throw Error('传输不存在');job.cancelled=true;return {cancelling:job.state==='running'};}
module.exports={root,list,get,file,create,update,read,write,ingest,importFile,remove,exportFile,fetchFile,sendFile,copyBetweenHosts,cancel};
