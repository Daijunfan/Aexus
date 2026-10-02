"use strict";
const assert=require('node:assert/strict');
exports.exercise=async({api,get,change,setId,a,b})=>{
 let s=await change('study.card.insert',{cardId:a,relation:'after',title:'Employee inserted sibling',text:'Stable source node'});
 const inserted=s.lastInsertedCard;assert(s.cards.some(c=>c.id===inserted));
 s=await change('study.cards.move',{cardIds:[inserted],parentId:b});assert.equal(s.cards.find(c=>c.id===inserted).parentId,b);
 s=await change('study.map.preferences',{mode:'select',selectionShape:'lasso'});assert.equal(s.map.tools.selectionShape,'lasso');
 let receipt=await api('study.clipboard.set',{setId,expectedRevision:s.revision,cardIds:[inserted],mode:'clone',descendants:false});
 assert((await api('study.clipboard.get')).valid);
 let result=await api('study.clipboard.paste',{setId,expectedRevision:s.revision,clipboardId:receipt.clipboard.id});assert(result.rootIds[0]!==inserted);
 await api('study.clipboard.clear',{clipboardId:receipt.clipboard.id});assert.equal((await api('study.clipboard.get')).clipboard,null);
 s=await get();receipt=await api('study.clipboard.set',{setId,expectedRevision:s.revision,cardIds:[inserted],mode:'cut'});
 const target=await api('study.create',{title:'Employee linked undo target'});
 result=await api('study.clipboard.paste',{setId:target.id,expectedRevision:target.revision,clipboardId:receipt.clipboard.id});assert(result.cardIds.includes(inserted));
 assert(!(await get()).cards.some(c=>c.id===inserted));
 const restored=await api('study.undo',{setId:target.id,expectedRevision:result.set.revision});assert(!restored.cards.some(c=>c.id===inserted));assert((await get()).cards.some(c=>c.id===inserted));
 console.log('PASS Employee adjacent insertion, multi-branch movement, clipboard modes and cross-study linked undo');
};
