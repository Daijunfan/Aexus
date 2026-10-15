const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const layout=import('data:text/javascript;base64,'+fs.readFileSync(require.resolve('../ui/board-layout.js')).toString('base64'));
test('board rows use OS defaults and shared heights without spanning columns',async()=>{
 const {boardRows}=await layout,entries=[{host:{id:'w',os:'windows'}},{host:{id:'k',os:'linux',distribution:'kali'}},{host:{id:'u',os:'linux',distribution:'ubuntu'}}];
 const group={cardHeight:350,osHeights:{windows:440,linux:400,kali:500},sizes:{w:{span:2,height:460}}};
 assert.deepEqual(boardRows(entries,group,2).map(r=>r.height),[500,400]);
 assert.deepEqual(boardRows(entries,group,1).map(r=>r.height),[460,500,400]);
 group.sizes.w={span:1,height:600};group.sizes.k={span:1,height:600};
 assert.deepEqual(boardRows(entries,group,2).map(r=>r.height),[600,400]);
 assert.deepEqual(boardRows([entries[2],entries[0],entries[1]],group,2).map(r=>r.height),[600,600]);
 assert.deepEqual(boardRows(entries,group,6).map(r=>r.height),[600]);
});
