export const folderCommands: import('./protocol.ts').CommandDefinition[] = [
  {method:'fs.restore',description:'从回收目录恢复文件',mutates:true,options:{path:{type:'string',description:'原相对路径',required:true}}},
  {method:'fs.asset-upload',description:'保存图片或附件，返回稳定资源地址',mutates:true,options:{name:{type:'string',description:'文件名'},path:{type:'string',description:'Workspace 中已有的文件'},contentBase64:{type:'string',description:'附件字节的 Base64'}}},
  {method:'fs.draft-read',description:'读取嵌入式视图的未提交草稿',options:{key:{type:'string',description:'可选的文档草稿标识'}}},
  {method:'fs.draft-write',description:'保存嵌入式视图草稿',mutates:true,options:{key:{type:'string',description:'可选的文档草稿标识'},draft:{type:'json',description:'待提交差异与冲突信息；null 清除'}}},
  { method: 'fs.info', description: '当前文件夹、文件索引与同步错误' },
  { method: 'fs.sync', description: '立即从工作文件夹重新同步页面' },
  { method: 'fs.list', description: '列出工作文件夹中的实际文件', options: { path: {type:'string',description:'相对目录，默认根目录'} } },
  { method: 'fs.read', description: '读取文本文件与内容哈希', options: { path: {type:'string',description:'相对文件路径',required:true} } },
  { method: 'fs.write', description: '写入文本文件，支持乐观并发校验', mutates: true, options: {path:{type:'string',description:'相对文件路径',required:true},content:{type:'string',description:'文件内容',required:true},hash:{type:'string',description:'读取时的哈希，防止覆盖其他修改'}} },
  { method: 'fs.mkdir', description: '创建文件夹', mutates: true, options: {path:{type:'string',description:'相对路径',required:true}} },
  { method: 'fs.remove', description: '把文件移到本工作区的回收目录', mutates: true, options: {path:{type:'string',description:'相对文件路径',required:true}} },
];
