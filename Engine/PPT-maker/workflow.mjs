/** UI/CLI revision preparation through public Contract reads. No nested workflow calls in the runtime. */
import {clone,validateDeck} from './scene.mjs';
export async function prepareRevision(client,id,{brief='',deck}={}){
 const parent=await client.invoke('workflow.get',{id});
 if(parent.engineId!=='PPT-maker'||parent.status!=='completed'||!parent.summary?.deck)throw Error('请选择已完成的PPT-maker文稿创建修订');
 validateDeck(parent.summary.deck);
 const snapshot={deck:clone(parent.summary.deck),revision:parent.revision};
 if(snapshot.deck.kind==='native'){
  const metadata=parent.files.find(f=>f.name.endsWith('.pptx'));if(!metadata)throw Error('父版本缺少已交付PPTX');
  const f=await client.invoke('workflow.file',{id:parent.id,name:metadata.name});
  if(f.encoding!=='base64')throw Error('父版本PPTX未使用二进制交付协议');
  snapshot.file={name:f.name,content:f.content,sha256:f.sha256,bytes:f.bytes};
 }
 const input={parentId:parent.id,parentSnapshot:snapshot,...(brief?{brief}:{}),...(deck?{deck}:{}),engines:parent.summary.workers?.length?[...new Set(parent.summary.workers.map(w=>w.engine))].map(engine=>({engine})):undefined};
 if(!input.engines)delete input.engines;
 if(new TextEncoder().encode(JSON.stringify(input)).length>7.8*1024*1024)throw Error('当前文稿超过内联修订请求容量。请先下载PPTX，并压缩模板图片后重新导入；原版本保持不变。');
 return input;
}
