'use strict';
// Reveal a relocated diagram action through its real overflow menu, never a
// forced click on a hidden element. Business assertions remain in each suite.
async function reveal(page,id){
 const node=page.locator('#'+id);const inMenu=await node.evaluate(el=>Boolean(el.closest('#map-more')));
 if(inMenu&&!await node.isVisible())await page.locator('#map-more>summary').click();return node;
}
exports.clickTool=async(page,id)=>{const node=await reveal(page,id);await node.click();};
exports.selectTool=async(page,id,value)=>{const node=await reveal(page,id);await node.selectOption(value);};
