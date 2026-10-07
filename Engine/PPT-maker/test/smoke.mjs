import {makeDeck,inspectDeck} from '../scene.mjs';
import {renderGenerated} from '../render.mjs';
import {importTemplate,exportNative} from '../template.mjs';
const deck=makeDeck({title:'PPT maker test',slides:[
 {id:'s1',layout:'cover',title:'可编辑演示文稿',subtitle:'图表、表格、模板与协作',body:['仅测试数据'],notes:'演讲者备注'},
 {id:'s2',layout:'cards',title:'三个独立角色',items:[{label:'策划',body:'明确结构与受众'},{label:'设计',body:'选择合适的版式'},{label:'审校',body:'核查内容与布局'}]},
 {id:'s3',layout:'chart',title:'测试数据',chart:{type:'bar',categories:['A','B','C'],series:[{name:'示例',values:[2,4,6]}]},sourceIds:['S1']},
 {id:'s4',layout:'table',title:'原生表格',table:{columns:['项目','状态'],rows:[['文本','可编辑'],['数据','可修改']]}}
]}, {sources:[{id:'S1',name:'测试数据'}]});
console.log(inspectDeck(deck));
const result=await renderGenerated(deck);console.log('Export',result.validation.native);
const imported=await importTemplate(result.bytes);console.log('Import',imported.slides.map(s=>({id:s.id,title:s.title,n:s.elements.length,types:s.elements.map(e=>e.type)})));
const exported=await exportNative(result.bytes,imported,imported);console.log('IDENTICAL',result.bytes.equals(exported.bytes));
