/** Generated-package compatibility checks; never normalize user templates. */
import JSZip from 'jszip';
import {posix} from 'node:path';
import {NS,openPackage,xmlPart,serialize,descendants,children,child,resolvePart,relPart} from './archive.mjs';
const names=zip=>Object.keys(zip.files).filter(name=>!zip.files[name].dir);
const remove=node=>node.parentNode.removeChild(node);
const chartParts=zip=>names(zip).filter(name=>/^ppt\/charts\/chart\d+\.xml$/.test(name));
const workbookParts=zip=>names(zip).filter(name=>/^ppt\/embeddings\/.*\.xlsx$/.test(name));
const worksheets=zip=>names(zip).filter(name=>/^xl\/worksheets\/[^/]+\.xml$/.test(name));
const axes=area=>children(area,'c').filter(n=>['catAx','valAx','dateAx','serAx'].includes(n.localName));
const axisId=node=>child(node,'c','axId')?.getAttribute('val');
const twoDimensional=new Set(['barChart','lineChart','areaChart','scatterChart','radarChart','bubbleChart','stockChart']);

async function pruneAbsentOverrides(zip){
 const doc=await xmlPart(zip,'[Content_Types].xml');let changed=false;
 for(const entry of descendants(doc,'ct','Override')){
  if(!zip.file(entry.getAttribute('PartName').replace(/^\//,''))){remove(entry);changed=true;}
 }
 if(changed)zip.file('[Content_Types].xml',serialize(doc));
 return changed;
}

async function stripUnusedWorkbookTables(zip){
 // Chart formulas use ordinary cells. PptxGenJS 4.0.1 emits an unconnected table
 // with an invalid A1 range. Remove only tables not referenced by a worksheet;
 // preserve cells, shared strings, styles and every connected table unchanged.
 let changed=false;const referenced=new Set();
 for(const sheet of worksheets(zip)){
  const doc=await xmlPart(zip,sheet),rels=await xmlPart(zip,relPart(sheet));
  const ids=new Set(descendants(doc,'s','tablePart').map(n=>n.getAttributeNS(NS.r,'id')));
  let modified=false;
  for(const entry of descendants(rels,'rel','Relationship')){
   if(!entry.getAttribute('Type').endsWith('/table'))continue;
   if(ids.has(entry.getAttribute('Id'))){referenced.add(resolvePart(sheet,entry.getAttribute('Target')));continue;}
   remove(entry);modified=changed=true;
  }
  if(modified)zip.file(relPart(sheet),serialize(rels));
 }
 for(const part of names(zip).filter(name=>/^xl\/tables\/[^/]+\.xml$/.test(name))){
  if(!referenced.has(part)){zip.remove(part);changed=true;}
 }
 return await pruneAbsentOverrides(zip)||changed;
}

export async function normalizeGeneratedPackage(bytes){
 const zip=await openPackage(bytes);let changed=await pruneAbsentOverrides(zip);
 for(const part of chartParts(zip)){
  const doc=await xmlPart(zip,part);let modified=false;
  for(const area of descendants(doc,'c','plotArea')){
   const ids=new Set(axes(area).map(axisId));
   for(const chart of children(area,'c').filter(n=>twoDimensional.has(n.localName))){
    for(const ref of children(chart,'c','axId')){
     if(!ids.has(ref.getAttribute('val'))){remove(ref);modified=changed=true;}
    }
   }
  }
  if(modified)zip.file(part,serialize(doc));
 }
 for(const part of workbookParts(zip)){
  const workbook=await JSZip.loadAsync(await zip.file(part).async('nodebuffer'),{checkCRC32:true});
  if(await stripUnusedWorkbookTables(workbook)){
   zip.file(part,await workbook.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));changed=true;
  }
 }
 return changed?zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}):Buffer.from(bytes);
}

async function auditPackage(zip,prefix,issues){
 const ct=await xmlPart(zip,'[Content_Types].xml');
 if(!ct){issues.push({code:'MISSING_CONTENT_TYPES',part:prefix});return;}
 const defaults=new Map(),overrides=new Map();
 for(const entry of descendants(ct,'ct','Default'))defaults.set(entry.getAttribute('Extension').toLowerCase(),entry.getAttribute('ContentType'));
 for(const entry of descendants(ct,'ct','Override')){
  const name=entry.getAttribute('PartName').replace(/^\//,'');
  if(overrides.has(name))issues.push({code:'DUPLICATE_CONTENT_TYPE',part:prefix+name});
  overrides.set(name,entry.getAttribute('ContentType'));
  if(!zip.file(name))issues.push({code:'DANGLING_CONTENT_TYPE',part:prefix+name});
 }
 for(const part of names(zip)){
  if(part!=='[Content_Types].xml'&&!overrides.has(part)&&!defaults.has(part.split('.').pop().toLowerCase()))issues.push({code:'MISSING_PART_CONTENT_TYPE',part:prefix+part});
  if(!part.endsWith('.rels'))continue;
  const source=part==='_rels/.rels'?'':posix.join(posix.dirname(posix.dirname(part)),posix.basename(part).slice(0,-5));
  const doc=await xmlPart(zip,part),ids=new Set();
  for(const r of descendants(doc,'rel','Relationship')){
   const id=r.getAttribute('Id');
   if(ids.has(id))issues.push({code:'DUPLICATE_RELATIONSHIP_ID',part:prefix+part,id});
   ids.add(id);
   if(r.getAttribute('TargetMode')==='External')continue;
   const target=resolvePart(source,r.getAttribute('Target'));
   if(!zip.file(target))issues.push({code:'MISSING_RELATIONSHIP_TARGET',part:prefix+part,target});
  }
 }
}

export async function auditGeneratedPackage(bytes){
 const zip=await openPackage(bytes),issues=[];await auditPackage(zip,'',issues);
 for(const part of chartParts(zip)){
  const doc=await xmlPart(zip,part);
  for(const area of descendants(doc,'c','plotArea')){
   const nodes=axes(area),ids=new Set(nodes.map(axisId));
   if(ids.size!==nodes.length||ids.has(undefined))issues.push({code:'INVALID_CHART_AXIS_ID',part});
   for(const node of nodes){
    const cross=child(node,'c','crossAx')?.getAttribute('val');
    if(!cross||!ids.has(cross))issues.push({code:'MISSING_CROSS_AXIS',part,id:cross});
   }
   for(const chart of children(area,'c').filter(n=>twoDimensional.has(n.localName))){
    const refs=children(chart,'c','axId').map(n=>n.getAttribute('val'));
    if(refs.length!==2||new Set(refs).size!==2||refs.some(id=>!ids.has(id)))issues.push({code:'INVALID_2D_CHART_AXES',part,refs});
   }
  }
 }
 for(const part of workbookParts(zip)){
  const w=await JSZip.loadAsync(await zip.file(part).async('nodebuffer'),{checkCRC32:true}),prefix=part+'!';
  await auditPackage(w,prefix,issues);
  for(const sheet of worksheets(w)){
   const doc=await xmlPart(w,sheet),rels=await xmlPart(w,relPart(sheet));
   const ids=new Set(descendants(doc,'s','tablePart').map(n=>n.getAttributeNS(NS.r,'id')));
   const tableRels=descendants(rels,'rel','Relationship').filter(r=>r.getAttribute('Type').endsWith('/table'));
   if(tableRels.some(r=>!ids.has(r.getAttribute('Id')))||[...ids].some(id=>!tableRels.some(r=>r.getAttribute('Id')===id)))issues.push({code:'UNCONNECTED_WORKSHEET_TABLE',part:prefix+sheet});
  }
  for(const table of names(w).filter(name=>/^xl\/tables\/[^/]+\.xml$/.test(name))){
   const doc=await xmlPart(w,table),ref=doc.documentElement.getAttribute('ref');
   if(!/^\$?[A-Z]{1,3}\$?[1-9]\d*:\$?[A-Z]{1,3}\$?[1-9]\d*$/.test(ref))issues.push({code:'INVALID_TABLE_RANGE',part:prefix+table,ref});
  }
 }
 return {passed:issues.length===0,issues,scope:'Generated OOXML content types, relationships, 2D chart axes and embedded workbook table links; not a full ECMA schema validator'};
}
