import Guacamole from '../Vendor/guacamole/client.js'
import {rdpPane} from '../ui/rdp.js'
window.runTerminalInputChecks=async()=>{
 const root=document.querySelector('#root'),sent=[],checks=[];let tunnel,client,mouse;
 root.style.cssText='display:flex;flex-direction:column;width:700px;height:500px';
 const style=document.createElement('style');style.textContent='.rdp-screen{position:relative;flex:1;min-height:300px;overflow:hidden}.rdp-screen>div{position:absolute;left:0;top:0}[hidden]{display:none!important}';document.head.append(style);
 Guacamole.WebSocketTunnel=function(){tunnel=this;this.sendMessage=(...values)=>sent.push(values);this.disconnect=()=>{};this.connect=()=>queueMicrotask(()=>{this.oninstruction('size',['0','640','480']);this.oninstruction('sync',['1'])})};
 const Client=Guacamole.Client,Mouse=Guacamole.Mouse;
 Guacamole.Client=Object.assign(function(t){client=new Client(t);return client},Client);
 Guacamole.Mouse=Object.assign(function(e){mouse=new Mouse(e);return mouse},Mouse);
 const rpc=async method=>method==='hosts.rdp-credentials'?{hasSavedCredential:true}:method==='hosts.rdp-open'?{id:'fixture',wsUrl:'ws://fixture',width:640,height:480}:{};
 const dispose=rdpPane(root,{id:'fixture',name:'Pointer fixture',os:'windows',host:'fixture'},rpc,()=>{},()=>{});
 for(let i=0;i<20;i++)await Promise.resolve();
 const display=client.getDisplay(),element=display.getElement(),layer=display.getCursorLayer().getElement();
 const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;canvas.getContext('2d').fillRect(0,0,10,10);
 display.oncursor(canvas,2,3);
 checks.push({name:'Windows cursor uses native CSS with hotspot',exact:element.style.cursor.includes('url(')&&element.style.cursor.includes('2 3')&&layer.style.visibility==='hidden'});
 tunnel.oninstruction('mouse',['30','40']);
 checks.push({name:'Server cursor updates cannot create a second visible cursor',exact:layer.style.visibility==='hidden'});
 display.scale(.5);const rect=element.getBoundingClientRect();
 const start=sent.length;for(let i=0;i<120;i++)element.dispatchEvent(new MouseEvent('mousemove',{clientX:rect.left+20+i,clientY:rect.top+30,bubbles:true}));
 const moves=sent.slice(start).filter(x=>x[0]==='mouse');
 checks.push({name:'Mouse movement is forwarded immediately without waiting for a display frame',exact:moves.length===120&&moves.at(-1)[1]===278&&moves.at(-1)[2]===60});
 element.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+100,clientY:rect.top+30,bubbles:true}));
 element.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:rect.left+100,clientY:rect.top+30,bubbles:true}));
 checks.push({name:'Button press and release preserve their order',exact:sent.at(-2)[3]===1&&sent.at(-1)[3]===0});
 mouse.setCursor=()=>false;display.oncursor(canvas,2,3);element.dispatchEvent(new MouseEvent('mousemove',{clientX:rect.left+40,clientY:rect.top+35,bubbles:true}));
 checks.push({name:'Unsupported native cursor uses exactly one software cursor',exact:element.style.cursor==='none'&&layer.style.visibility==='visible'&&layer.isConnected&&display.cursorX===80});
 element.dispatchEvent(new MouseEvent('mouseout',{relatedTarget:root,bubbles:true}));
 checks.push({name:'Leaving the desktop hides the fallback cursor',exact:!layer.isConnected});
 canvas.width=0;canvas.height=0;display.oncursor(canvas,0,0);
 checks.push({name:'Windows invisible cursor remains invisible',exact:element.style.cursor==='none'&&layer.style.visibility==='hidden'});
 const viewOnly=root.querySelector('.rdp-view-only'),paste=root.querySelector('.rdp-paste');
 const readonlyStart=sent.length;
 viewOnly.checked=true;viewOnly.dispatchEvent(new Event('change',{bubbles:true}));
 checks.push({name:'View-only mode disables remote keyboard shortcuts and clipboard send',exact:paste.disabled&&root.querySelector('.rdp-cad').disabled});
 paste.click();element.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+100,clientY:rect.top+30,bubbles:true}));
 root.querySelector('.rdp-screen').dispatchEvent(new KeyboardEvent('keydown',{key:'A',code:'KeyA',keyCode:65,which:65,bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,60));
 const remoteWrites=sent.slice(readonlyStart).filter(parts=>['mouse','key','clipboard'].includes(parts[0]));
 checks.push({name:'Read-only mode blocks remote clipboard and mouse/keyboard writes',exact:remoteWrites.length===0});
 viewOnly.checked=false;viewOnly.dispatchEvent(new Event('change',{bubbles:true}));
 const resumed=sent.length;
 element.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.left+110,clientY:rect.top+40,bubbles:true}));
 checks.push({name:'Input forwarding resumes after leaving read-only mode',exact:!paste.disabled&&sent.length>resumed});
 viewOnly.checked=true;viewOnly.dispatchEvent(new Event('change',{bubbles:true}));
 checks.push({name:'Switching to read-only releases a button already held down',exact:sent.at(-1)?.[0]==='mouse'&&sent.at(-1)?.[3]===0});
 dispose();return {passed:checks.every(c=>c.exact),checks};
}
