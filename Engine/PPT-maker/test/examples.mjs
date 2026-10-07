import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeDeck,clone,previewHTML} from '../scene.mjs';
import {renderGenerated} from '../render.mjs';
import {importTemplate,exportNative} from '../template.mjs';
import {comparePackages} from '../archive.mjs';
import {outline,content,source} from './fixtures.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'test-artifacts/documents');await fs.mkdir(out,{recursive:true});
const outputs=[],sources=[{id:'S1',name:'明确标注的测试需求',content:'项目协作演示'},{id:'S2',...source}];let original;
for(const style of ['executive','blueprint','editorial','midnight']){
 const deck=makeDeck(content(outline(8)),{style,sources}),result=await renderGenerated(deck),name=style+'.pptx';await fs.writeFile(path.join(out,name),result.bytes);await fs.writeFile(path.join(out,style+'.html'),previewHTML(deck));outputs.push({name,...result.validation,quality:result.quality});if(style==='executive')original=result.bytes;
}
const base=await importTemplate(original,{name:'executive.pptx'}),edited=clone(base);edited.slides[0].elements.find(e=>e.role==='title').text='模板已修订，原生结构保留';edited.slides[0].notes='此页面的备注经过实际OOXML修改。';edited.slides[5].elements.find(e=>e.type==='chart').chart.series[0].values[1]=77;edited.slides[6].elements.find(e=>e.type==='table').rows[1][0]='可修改的文字';const result=await exportNative(original,base,edited);await fs.writeFile(path.join(out,'native-edited.pptx'),result.bytes);await fs.writeFile(path.join(out,'native-edited.html'),previewHTML(edited));outputs.push({name:'native-edited.pptx',...result.validation,preservation:await comparePackages(original,result.bytes)});
const compact=makeDeck(content(outline()),{ratio:'4:3',sources}),r=await renderGenerated(compact);await fs.writeFile(path.join(out,'classic-4x3.pptx'),r.bytes);outputs.push({name:'classic-4x3.pptx',...r.validation});
await fs.writeFile(path.join(out,'validation.json'),JSON.stringify({fixture:true,paidModels:false,outputs},null,2));console.log(JSON.stringify({out,files:outputs.map(o=>o.name)},null,2));
