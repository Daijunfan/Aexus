/** Rendered geometry -> CSS pixels; page zoom and the optional file drawer are respected. */
export function toolbarOffset({windowCenter,baseCenter,navWidth,left,right,scale=1}){
 if(![windowCenter,baseCenter,navWidth,left,right,scale].every(Number.isFinite)||scale<=0||navWidth<0)return {offset:0,constrained:true}
 const lower=left+navWidth/2,upper=right-navWidth/2
 if(lower>upper)return {offset:0,constrained:true}
 const center=Math.max(lower,Math.min(upper,windowCenter))
 return {offset:Math.round((center-baseCenter)/scale*1000)/1000,constrained:Math.abs(center-windowCenter)>.5}
}
export function centerCompanyToolbar(toolbar){
 const root=toolbar.closest('.aexus-home'),nav=toolbar.querySelector(':scope > .company-navigation');if(!root||!nav)return
 const bounds=toolbar.getBoundingClientRect(),rootBounds=root.getBoundingClientRect(),navigation=nav.getBoundingClientRect(),styles=getComputedStyle(toolbar)
 const scale=toolbar.offsetWidth?bounds.width/toolbar.offsetWidth:1
 if(!bounds.width||!navigation.width)return
 const previous=Number.parseFloat(nav.style.getPropertyValue('--company-center-offset'))||0
 const left=bounds.left+(Number.parseFloat(styles.paddingLeft)||0)*scale
 let right=bounds.right-(Number.parseFloat(styles.paddingRight)||0)*scale
 const actions=toolbar.querySelector(':scope > .company-actions')?.getBoundingClientRect()
 if(actions?.width&&actions.top<navigation.bottom&&actions.bottom>navigation.top)right=Math.min(right,actions.left-(Number.parseFloat(styles.columnGap)||0)*scale)
 const result=toolbarOffset({windowCenter:rootBounds.left+rootBounds.width/2,baseCenter:navigation.left+navigation.width/2-previous*scale,navWidth:navigation.width,left,right,scale})
 nav.style.setProperty('--company-center-offset',result.offset+'px');toolbar.dataset.navigationAlignment=result.constrained?'available-space':'window';return result
}
