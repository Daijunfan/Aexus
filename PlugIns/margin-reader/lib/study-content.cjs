'use strict';
const M=require('./study-model.cjs');
const {assert}=require('./safety.cjs');
const Links=require('./study-links.cjs');
const Media=require('./study-media.cjs');
const {findDocument,parsedDocument}=require('./documents.cjs');
const {validateLocator}=require('./outline.cjs');
const writes=new Set(['study.comment.add','study.comment.update','study.comment.move','study.media.import','study.media.transform','study.links.settings','study.link.update']);
const reads=new Set(['study.dictionary.lookup','study.dictionary.match','study.links.list','study.catalog','study.card.backlinks','study.comment.list','study.media.get','link.create','link.resolve']);
async function resolve(store,state,p){
  const target=Links.parseUri(p.uri);
  if(target.kind==='card'){const {set,card,redirected}=require('./card-location.cjs').locate(state,target.setId,target.cardId);return {...target,setId:set.id,cardId:card.id,title:card.title,setTitle:set.title,...(redirected?{redirectedFrom:{setId:target.setId,cardId:target.cardId}}:{})};}
  if(target.kind==='study'){const set=M.findSet(state,target.setId);return {...target,title:set.title};}
  const doc=findDocument(state,target.id),locator=validateLocator(Object.keys(target.locator).length?target.locator:doc.position,await parsedDocument(store,doc));
  return {...target,locator,title:doc.title,path:doc.path};
}
async function read(store,method,p){
  if(method==='study.dictionary.match')return require('./study-dictionary.cjs').match(store,p);
  if(method==='study.dictionary.lookup')return require('./study-dictionary.cjs').lookup(store,p);
  const state=await store.load();
  if(method==='study.catalog')return Links.catalog(state,p);
  if(method==='study.links.list')return Links.associations(state,p);
  if(method==='study.card.backlinks')return Links.backlinks(state,p);
  if(method==='study.comment.list'){const set=M.findSet(state,p.setId),card=M.card(set,p.cardId);return {revision:set.revision,comments:(card.comments||[]).filter(c=>(p.includeDeleted||!c.deletedAt)&&(!p.reviewSide||['both',p.reviewSide].includes(c.reviewSide||'back'))).map(c=>({...c,media:c.mediaId?{...Media.mediaInfo(set,c.mediaId),asset:Media.asset(set.id,Media.mediaInfo(set,c.mediaId))}:null}))};}
  if(method==='study.media.get'){const result=await Media.readMedia(store,p.setId,p.mediaId);return {...result.metadata,contentBase64:result.bytes.toString('base64')};}
  if(method==='link.resolve')return resolve(store,state,p);
  if(method==='link.create'){
    if(p.kind==='card'){const set=M.findSet(state,p.setId),card=M.card(set,p.id);return {uri:Links.cardUri(set.id,card.id)};}
    if(p.kind==='study'){const set=M.findSet(state,p.id);return {uri:`margin-reader://study/${set.id}`};}
    const doc=findDocument(state,p.id),locator=validateLocator(p.locator||doc.position,await parsedDocument(store,doc));
    return {uri:`margin-reader://document/${doc.id}?${new URLSearchParams(locator).toString()}`};
  }
}
async function open(store,p){
  const state=await store.load(),target=await resolve(store,state,p);
  if(target.kind==='card')return require('./study-navigation.cjs').activate(store,{setId:target.setId,cardId:target.cardId,force:true});
  return store.transaction(async fresh=>{
    if(target.kind==='study'){M.findSet(fresh,target.setId);fresh.settings.activeStudySet=target.setId;fresh.settings.lastDocument=null;}
    else{const doc=findDocument(fresh,target.id);doc.position=validateLocator(target.locator,await parsedDocument(store,doc));fresh.settings.activeStudySet=null;fresh.settings.lastDocument=doc.id;fresh.settings.openDocuments=[...new Set([...(fresh.settings.openDocuments||[]),doc.id])].slice(-20);}
    return {...target,opened:true};
  });
}
async function request(media,state,set,method,p,prepared,rollback){
  if(method.startsWith('study.comment.'))return Media.comments(set,method,p);
  if(method==='study.media.import')return media.apply(state,set,p,prepared,rollback);
  if(method==='study.media.transform')return media.transform(state,set,p,rollback);
  if(method==='study.links.settings'){
    if(p.dictionarySetIds){assert(p.dictionarySetIds.length<=1000&&p.dictionarySetIds.every(id=>typeof id==='string'),'INVALID_PARAMS','Choose at most 1000 dictionaries.');p.dictionarySetIds.forEach(id=>M.findSet(state,id));}
    if(p.sources!==undefined&&p.sources!==null)require('./study-dictionary.cjs').validateSources(p.sources,state);
    const {setId,expectedRevision,...settings}=p;assert(Object.keys(settings).length,'INVALID_PARAMS','Supply a dictionary setting.');set.linkSettings={...set.linkSettings,...settings};if(p.sources===null)delete set.linkSettings.sources;return;
  }
  if(method==='study.link.update'){
    const link=set.links?.find(l=>l.id===p.linkId);assert(link,'NOT_FOUND','Link not found.');
    assert(p.label!==undefined||p.bidirectional!==undefined||p.curve!==undefined,'INVALID_PARAMS','Supply a link property.');
    if(p.label!==undefined){assert(p.label.length<=200,'INVALID_PARAMS','Link label exceeds 200 characters.');link.label=p.label;}
    if(p.bidirectional!==undefined)link.bidirectional=p.bidirectional;
    if(p.curve!==undefined){validateCurve(p.curve);link.curve=p.curve;}
  }
}
function validateCurve(curve){assert(Array.isArray(curve)&&curve.length<=64&&curve.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>Number.isFinite(n)&&n>=0&&n<=100000)),'INVALID_PARAMS','A drawn link uses at most 64 bounded world-coordinate pairs.');}
module.exports={writes,reads,read,open,request,validateCurve};
