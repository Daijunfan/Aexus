'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('tool discovery has stable IDs, literal search and explicit context requirements',async()=>{
 const {TOOLS,TOOL_GROUPS,toolMatches,scopeReason}=await import('../ui/tool-catalog.mjs');
 assert.equal(new Set(TOOLS.map(t=>t.id)).size,TOOLS.length);assert(TOOLS.length>=35);
 for(const tool of TOOLS){assert(TOOL_GROUPS[tool.group]);assert(tool.title&&tool.description&&tool.keywords);assert(['always','study','card','document','pdf'].includes(tool.scope));}
 const theme=TOOLS.find(t=>t.id==='ui-appearance');assert(toolMatches(theme,'ＴＨＥＭＥ','appearance'));assert(toolMatches(theme,'主题 配色'));assert(!toolMatches(theme,'[.*]'));assert(!toolMatches(theme,'配色','ink'));
 assert.equal(scopeReason('card',{}),'先选择卡片');assert.equal(scopeReason('pdf',{document:true,kind:'flow'}),'先打开 PDF 文档');assert.equal(scopeReason('card',{study:true,card:true}),'');
});
