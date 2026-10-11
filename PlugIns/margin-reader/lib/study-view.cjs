'use strict';
const {assert}=require('./safety.cjs');
const {findDocument,sourceStatus}=require('./documents.cjs');

async function splitDocument(store,state,set){
  const ids=[state.settings.lastDocument,...set.documentIds].filter((id,i,all)=>set.documentIds.includes(id)&&all.indexOf(id)===i);
  for(const id of ids){const doc=state.documents[id];if(!doc||doc.deletedAt)continue;const status=await sourceStatus(store,doc);if(status.st?.isFile())return id;}
  return null;
}
async function setView(store,state,set,p){
  const primary=['map','documents','split'].includes(p.view);
  let documentId=null;
  if(p.documentId!==undefined){
    assert(['documents','split'].includes(p.view),'INVALID_PARAMS','A document may accompany the document or split view only.');
    if(p.documentId!==null){
      assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Choose a document belonging to this study.');
      const doc=findDocument(state,p.documentId),status=await sourceStatus(store,doc);
      assert(status.st?.isFile(),'NOT_FOUND','The original document is unavailable. Choose another document.');
      documentId=doc.id;
    }
  }else if(p.view==='split')documentId=await splitDocument(store,state,set);
  set.view=p.view;
  // Editing a background study's layout must not steal another study's reader.
  if(primary&&state.settings.activeStudySet===set.id)state.settings.lastDocument=documentId;
  if(p.view==='review'&&(!set.reviewSession?.id||set.reviewSession.finished))require('./study-learning.cjs').startSession(state,set,{mode:'scheduled',sort:'due'});
}
module.exports={setView,splitDocument};
