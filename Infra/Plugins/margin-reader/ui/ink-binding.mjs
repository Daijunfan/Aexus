export function bindingSettings(value={}){return {autoBind:true,autoSelect:true,doubleTapFocus:false,hideFocusInk:false,...value};}
export function mapInkTarget({focusId,selectedCardId,hitCardId,settings={}}){
 const p=bindingSettings(settings);if(focusId)return {cardId:focusId,selectedCardId:focusId,focusBound:true,binding:'focus'};
 if(p.autoBind&&hitCardId&&(p.autoSelect||hitCardId===selectedCardId))return {cardId:hitCardId,selectedCardId:p.autoSelect?hitCardId:selectedCardId,focusBound:false,binding:'automatic'};
 return {cardId:null,selectedCardId:selectedCardId||null,focusBound:false,binding:'none'};
}
// Hiding map handwriting is distinct from the existing global hidden flag.
export function mapInkVisibility(stroke,cardId,{focusId,selectedCardId,hideFocusInk=false}={}){
 if(stroke.hidden||stroke.reviewSide==='front')return 0;
 if(!cardId)return focusId?0:1;
 if(!(stroke.mapHidden??(stroke.focusBound&&hideFocusInk))||focusId===cardId)return 1;
 return selectedCardId===cardId ? .3 : 0;
}

export function extendInkLayout(set,layout,selectedCardId){
 let width=layout.width,height=layout.height;const visible=s=>!s.hidden&&(set.layers||[{id:'default',visible:true}]).some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt),options={focusId:set.map?.focusId,selectedCardId,hideFocusInk:bindingSettings(set.inkBinding).hideFocusInk};
 const include=(s,box)=>{const pad=s.width*(box?.width||1)/2+30;for(const p of s.points){width=Math.max(width,(box?box.x+p[0]*box.width:p[0])+pad);height=Math.max(height,(box?box.y+p[1]*box.height:p[1])+pad);}};
 for(const s of set.canvasInk||[])if(visible(s)&&mapInkVisibility(s,null,options))include(s);
 for(const c of set.cards){const box=layout.positions.get(c.id);if(!box)continue;for(const s of c.ink||[])if(!s.imageBound&&visible(s)&&mapInkVisibility(s,c.id,options))include(s,box);}
 return {...layout,width,height};
}
