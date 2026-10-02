"use strict";
const {assert}=require('./safety.cjs');
// A move keeps card IDs and old note URIs valid. Redirects are owned by the
// same workspace state and never load a database above/outside that workspace.
function locate(state,setId,cardId){
 const seen=new Set();let redirected=false;
 for(;;){
  const key=setId+'/'+cardId;assert(!seen.has(key)&&seen.size<32,'INVALID_REFERENCE','Card relocation contains a cycle or exceeds 32 hops.');seen.add(key);
  const set=typeof setId==='string'&&Object.hasOwn(state.studySets,setId)?state.studySets[setId]:null;
  const card=set&&!set.deletedAt&&set.cards.find(c=>c.id===cardId);if(card)return {set,card,redirected};
  const next=set?.cardRedirects&&Object.hasOwn(set.cardRedirects,cardId)?set.cardRedirects[cardId]:null;
  assert(next&&typeof next.setId==='string'&&typeof next.cardId==='string','NOT_FOUND','Card is unavailable or was removed.');
  setId=next.setId;cardId=next.cardId;redirected=true;
 }
}
module.exports={locate};
